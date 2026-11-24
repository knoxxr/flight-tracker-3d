import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { AIRPORTS } from './airports.js';
import { LiveAdsbClient } from './opensky.js';
import { AircraftEnrichmentService } from './enrichment.js';
import { OceanicEstimator } from './oceanic-estimator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const COMPRESSIBLE_EXTS = new Set(['.html', '.css', '.js', '.json', '.svg']);

function loadDotEnv(envPath) {
  try {
    if (!fs.existsSync(envPath)) return;
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch {
    // Ignore optional .env errors
  }
}

loadDotEnv(path.resolve(__dirname, '../.env'));

function clientAcceptsGzip(req) {
  const enc = String(req?.headers?.['accept-encoding'] || '');
  return /\bgzip\b/i.test(enc);
}

function getClientIp(req) {
  const xff = req?.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return req?.socket?.remoteAddress || 'unknown';
}

/**
 * Lightweight in-memory fixed-window per-IP rate limiter (zero external dependencies).
 */
export function createIpRateLimiter({ windowMs = 60_000, max = 60 } = {}) {
  const buckets = new Map();
  let lastPrune = Date.now();

  return function check(ip, nowMs = Date.now()) {
    if (nowMs - lastPrune > windowMs * 2) {
      for (const [k, v] of buckets.entries()) {
        if (nowMs - v.start >= windowMs) buckets.delete(k);
      }
      lastPrune = nowMs;
    }

    let b = buckets.get(ip);
    if (!b || nowMs - b.start >= windowMs) {
      b = { start: nowMs, count: 1 };
      buckets.set(ip, b);
      return { allowed: true, remaining: Math.max(0, max - 1) };
    }
    b.count++;
    if (b.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((windowMs - (nowMs - b.start)) / 1000));
      return { allowed: false, remaining: 0, retryAfterSec };
    }
    return { allowed: true, remaining: Math.max(0, max - b.count) };
  };
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export function parseMetarResponse(entry, icaoFallback = '') {
  if (!entry || typeof entry !== 'object') return null;
  const wdir = entry.wdir === 'VRB' ? 'VRB' : (Number.isFinite(Number(entry.wdir)) ? Number(entry.wdir) : null);
  const wspd = Number.isFinite(Number(entry.wspd)) ? Number(entry.wspd) : null;
  const wgst = Number.isFinite(Number(entry.wgst)) ? Number(entry.wgst) : null;
  const tempC = Number.isFinite(Number(entry.temp)) ? Number(entry.temp) : null;
  const dewpC = Number.isFinite(Number(entry.dewp)) ? Number(entry.dewp) : null;
  const altimHpa = Number.isFinite(Number(entry.altim)) ? Math.round(Number(entry.altim)) : null;
  const visib = entry.visib != null ? String(entry.visib) : null;
  const fltCat = entry.fltCat ? String(entry.fltCat).toUpperCase() : null;
  const clouds = Array.isArray(entry.clouds)
    ? entry.clouds.map((c) => `${c.cover || ''}${c.base != null ? ` ${c.base}ft` : ''}`.trim()).filter(Boolean)
    : [];
  return {
    icao: String(entry.icaoId || icaoFallback).toUpperCase(),
    name: entry.name || null,
    obsTime: entry.reportTime || (entry.obsTime ? new Date(entry.obsTime * 1000).toISOString() : null),
    tempC,
    dewpC,
    wdir,
    wspd,
    wgst,
    visib,
    altimHpa,
    fltCat,
    clouds,
    rawOb: entry.rawOb || ''
  };
}

function sendJson(req, res, status, payload, extraHeaders = {}) {
  const jsonBuf = Buffer.from(JSON.stringify(payload), 'utf8');
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    Vary: 'Accept-Encoding',
    ...CORS_HEADERS,
    ...extraHeaders
  };

  if (jsonBuf.length >= 1024 && clientAcceptsGzip(req)) {
    const gz = zlib.gzipSync(jsonBuf, { level: 6 });
    headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = gz.length;
    res.writeHead(status, headers);
    res.end(gz);
    return;
  }

  headers['Content-Length'] = jsonBuf.length;
  res.writeHead(status, headers);
  res.end(jsonBuf);
}

function sendPreEncoded(req, res, status, entry) {
  const useGzip = entry.gzipBuf && clientAcceptsGzip(req);
  const body = useGzip ? entry.gzipBuf : entry.jsonBuf;
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=2',
    Vary: 'Accept-Encoding',
    ...CORS_HEADERS,
    'Content-Length': body.length
  };
  if (useGzip) headers['Content-Encoding'] = 'gzip';
  res.writeHead(status, headers);
  res.end(body);
}

function filterFlights(flights, searchQuery) {
  if (!searchQuery) return flights;
  const q = searchQuery.trim().toLowerCase();
  if (!q) return flights;
  return flights.filter((f) =>
    (f.callsign && f.callsign.toLowerCase().includes(q)) ||
    (f.iataFlight && f.iataFlight.toLowerCase().includes(q)) ||
    (f.airlineName && f.airlineName.toLowerCase().includes(q)) ||
    (f.origin && f.origin.toLowerCase().includes(q)) ||
    (f.destination && f.destination.toLowerCase().includes(q)) ||
    (f.icao24 && f.icao24.toLowerCase().includes(q)) ||
    (f.registration && f.registration.toLowerCase().includes(q)) ||
    (f.aircraftType && f.aircraftType.toLowerCase().includes(q)) ||
    (f.originCountry && f.originCountry.toLowerCase().includes(q)) ||
    (f.squawk && f.squawk.toLowerCase().includes(q))
  );
}

export function createAppServer(options = {}) {
  const adsbClient = options.adsbClient || new LiveAdsbClient();
  const enrichmentService = options.enrichmentService || new AircraftEnrichmentService();
  const oceanicEstimator = options.oceanicEstimator || new OceanicEstimator({ enrichmentService });
  const trackHistory = new Map();

  // Production-grade caching & per-IP rate limits (configurable for tests)
  const snapshotCacheMs = options.snapshotCacheMs ?? (options.adsbClient ? 0 : 2500);
  const flightsLimiter = createIpRateLimiter({
    windowMs: 60_000,
    max: options.flightsRateLimitPerMin ?? 60
  });
  const enrichLimiter = createIpRateLimiter({
    windowMs: 60_000,
    max: options.enrichRateLimitPerMin ?? 30
  });

  // Pre-serialized + pre-gzipped response cache for /api/flights (eliminates redundant JSON.stringify + gzip under load)
  const snapshotCache = new Map(); // cacheKey -> { at, payload, jsonBuf, gzipBuf }
  const inFlightSnapshots = new Map(); // cacheKey -> Promise
  const staticGzipCache = new Map(); // fullPath -> { mtimeMs, gzBuf }
  const metarCache = new Map(); // icao -> { at, data }
  const metarFetcher = options.metarFetcher || null;
  const serverStats = { flightsRequests: 0, snapshotCacheHits: 0, rateLimitedCount: 0 };

  // Feed background harvester contacts directly into the oceanic anchor tracker
  if (adsbClient && typeof adsbClient === 'object') {
    adsbClient.onFlightsObserved = (flights, nowMs) => oceanicEstimator.observeLiveFlights(flights, nowMs);
  }

  function recordTracks(flights) {
    const now = Math.floor(Date.now() / 1000);
    for (const f of flights) {
      let hist = trackHistory.get(f.icao24);
      if (!hist) {
        hist = [];
        trackHistory.set(f.icao24, hist);
      }
      const last = hist[hist.length - 1];
      if (!last || Math.abs(last.lat - f.lat) > 0.005 || Math.abs(last.lon - f.lon) > 0.005) {
        hist.push({ lat: f.lat, lon: f.lon, altFt: f.altitudeFt, ts: now });
        if (hist.length > 60) hist.shift();
      }
    }
    if (trackHistory.size > 4000) {
      for (const [k, v] of trackHistory.entries()) {
        if (!v.length || now - v[v.length - 1].ts > 900) {
          trackHistory.delete(k);
        }
      }
    }
  }

  async function resolveLiveFlights(params = {}) {
    const provider = params.provider === 'adsbfi' ? 'adsbfi' : 'opensky';
    const lat = Number.isFinite(Number(params.lat)) ? Number(params.lat) : 37.46;
    const lon = Number.isFinite(Number(params.lon)) ? Number(params.lon) : 126.44;
    const distNm = Number.isFinite(Number(params.dist)) ? Number(params.dist) : 250;
    const includeEstimated = Boolean(params.includeEstimated);

    const result = await adsbClient.fetchLiveFlights({ provider, lat, lon, distNm });
    let combinedFlights = result.flights;
    let estimatedCount = 0;

    if (result.ok) {
      recordTracks(result.flights);
      oceanicEstimator.observeLiveFlights(result.flights);

      if (includeEstimated && provider !== 'adsbfi') {
        const liveSet = new Set(result.flights.map((f) => f.icao24));
        const activeHubs = typeof adsbClient.getActiveCoverageHubs === 'function'
          ? adsbClient.getActiveCoverageHubs()
          : null;
        const estimated = oceanicEstimator.getEstimatedFlights(liveSet, Date.now(), activeHubs);
        estimatedCount = estimated.length;
        if (estimatedCount > 0) {
          combinedFlights = [...result.flights, ...estimated];
        }
      }
    }

    return {
      ok: result.ok,
      activeSource: result.source,
      notice: result.notice || null,
      error: result.ok ? null : (result.error || '실시간 ADS-B 데이터를 수신할 수 없습니다'),
      timestamp: Date.now(),
      updatedAt: result.updatedAt || null,
      totalRaw: result.totalRaw ?? result.flights.length,
      scanProgress: result.scanProgress || null,
      liveCount: result.flights.length,
      estimatedCount,
      count: combinedFlights.length,
      totalCount: combinedFlights.length,
      flights: combinedFlights
    };
  }

  async function fetchAirportMetar(rawCode) {
    const code = String(rawCode || '').trim().toUpperCase();
    let icao = code;
    if (code.length === 3) {
      const found = AIRPORTS.find((a) => a.iata === code);
      if (found?.icao) icao = found.icao;
    }
    if (!/^[A-Z0-9]{4}$/.test(icao)) {
      return { ok: false, error: '유효한 공항 ICAO 코드가 아닙니다' };
    }
    const cached = metarCache.get(icao);
    if (cached && Date.now() - cached.at < 10 * 60_000) {
      return { ok: true, cached: true, metar: cached.data };
    }
    try {
      let parsed = null;
      if (typeof metarFetcher === 'function') {
        parsed = await metarFetcher(icao);
      } else {
        const res = await fetch(
          `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(icao)}&format=json`,
          {
            headers: { Accept: 'application/json', 'User-Agent': 'AeroGlobe3D/1.0' },
            signal: AbortSignal.timeout(6000)
          }
        );
        if (res.ok) {
          const arr = await res.json();
          if (Array.isArray(arr) && arr.length > 0) {
            parsed = parseMetarResponse(arr[0], icao);
          }
        }
      }
      if (!parsed) {
        return { ok: false, icao, error: '현재 METAR 기상 정보를 수신할 수 없습니다' };
      }
      metarCache.set(icao, { at: Date.now(), data: parsed });
      if (metarCache.size > 300) {
        const oldest = metarCache.keys().next().value;
        if (oldest) metarCache.delete(oldest);
      }
      return { ok: true, cached: false, metar: parsed };
    } catch {
      return { ok: false, icao, error: 'METAR 기상 서버 연결 시간 초과' };
    }
  }

  async function getCachedGlobalSnapshot(params) {
    const cacheKey = `${params.provider}:${params.includeEstimated ? 1 : 0}`;
    const now = Date.now();
    const hit = snapshotCache.get(cacheKey);
    if (snapshotCacheMs > 0 && hit && now - hit.at < snapshotCacheMs) {
      serverStats.snapshotCacheHits++;
      return hit;
    }

    if (inFlightSnapshots.has(cacheKey)) {
      serverStats.snapshotCacheHits++;
      return inFlightSnapshots.get(cacheKey);
    }

    const work = (async () => {
      const payload = await resolveLiveFlights(params);
      const jsonBuf = Buffer.from(JSON.stringify(payload), 'utf8');
      const gzipBuf = jsonBuf.length >= 1024 ? zlib.gzipSync(jsonBuf, { level: 5 }) : null;
      const entry = { at: Date.now(), payload, jsonBuf, gzipBuf };
      // Only cache healthy snapshots so outage states & recovery stay instantaneous
      if (snapshotCacheMs > 0 && payload.ok) {
        snapshotCache.set(cacheKey, entry);
      }
      return entry;
    })().finally(() => {
      inFlightSnapshots.delete(cacheKey);
    });

    inFlightSnapshots.set(cacheKey, work);
    return work;
  }

  const sseClients = new Set();

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
      }

      const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = reqUrl.pathname;
      const ip = getClientIp(req);

      if (pathname === '/api/health') {
        if (typeof adsbClient.touchActivity === 'function') adsbClient.touchActivity();
        return sendJson(req, res, 200, {
          status: 'ok',
          mode: 'live-only',
          uptimeSec: Math.round(process.uptime()),
          oceanicAnchors: oceanicEstimator.getStats().trackedAnchors
        });
      }

      if (pathname === '/api/status' || pathname === '/api/debug') {
        return sendJson(req, res, 200, {
          mode: 'live-only',
          nodeVersion: process.version,
          upstream: adsbClient.getStatus(),
          oceanic: oceanicEstimator.getStats(),
          enrichment: typeof enrichmentService.getStats === 'function' ? enrichmentService.getStats() : null,
          server: { ...serverStats, snapshotCacheMs },
          airportsCount: AIRPORTS.length,
          serverTimeUtc: new Date().toISOString()
        });
      }

      if (pathname === '/api/airports') {
        return sendJson(req, res, 200, { count: AIRPORTS.length, airports: AIRPORTS }, { 'Cache-Control': 'public, max-age=3600' });
      }

      if (pathname === '/api/weather/metar') {
        const code = reqUrl.searchParams.get('icao') || reqUrl.searchParams.get('iata') || '';
        const metarResult = await fetchAirportMetar(code);
        return sendJson(req, res, 200, metarResult, { 'Cache-Control': 'public, max-age=300' });
      }

      if (pathname === '/api/flights') {
        serverStats.flightsRequests++;
        const rl = flightsLimiter(ip);
        if (!rl.allowed) {
          serverStats.rateLimitedCount++;
          return sendJson(
            req,
            res,
            429,
            { ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', count: 0, flights: [] },
            { 'Retry-After': String(rl.retryAfterSec) }
          );
        }

        const provider = reqUrl.searchParams.get('provider') || 'opensky';
        const lat = reqUrl.searchParams.get('lat');
        const lon = reqUrl.searchParams.get('lon');
        const dist = reqUrl.searchParams.get('dist');
        const q = reqUrl.searchParams.get('q') || '';
        const estParam = reqUrl.searchParams.get('estimated');
        const includeEstimated = estParam === '1' || estParam === 'true';

        // Fast path: pre-serialized + pre-gzipped global snapshot shared across all concurrent visitors!
        if (!q && provider !== 'adsbfi') {
          const entry = await getCachedGlobalSnapshot({ provider, lat, lon, dist, includeEstimated });
          return sendPreEncoded(req, res, 200, entry);
        }

        const payload = await resolveLiveFlights({ provider, lat, lon, dist, includeEstimated });
        const filtered = filterFlights(payload.flights, q);
        return sendJson(req, res, 200, {
          ...payload,
          count: filtered.length,
          totalCount: payload.flights.length,
          flights: filtered
        });
      }

      if (pathname.startsWith('/api/flights/')) {
        const icao24 = decodeURIComponent(pathname.slice('/api/flights/'.length)).toLowerCase();
        const provider = reqUrl.searchParams.get('provider') || 'opensky';
        const payload = await resolveLiveFlights({ provider, includeEstimated: true });
        const flight = payload.flights.find((f) => f.icao24 === icao24);
        if (!flight) {
          return sendJson(req, res, 404, { error: 'Flight not found', icao24 });
        }
        return sendJson(req, res, 200, {
          flight,
          track: trackHistory.get(icao24) || []
        });
      }

      if (pathname.startsWith('/api/enrich/')) {
        const rl = enrichLimiter(ip);
        if (!rl.allowed) {
          serverStats.rateLimitedCount++;
          return sendJson(
            req,
            res,
            429,
            { ok: false, rateLimited: true, error: '상세 조회 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
            { 'Retry-After': String(rl.retryAfterSec) }
          );
        }
        const icao24 = decodeURIComponent(pathname.slice('/api/enrich/'.length)).toLowerCase();
        const callsign = reqUrl.searchParams.get('callsign') || '';
        const info = await enrichmentService.lookup(icao24, callsign);
        return sendJson(req, res, 200, info, { 'Cache-Control': 'public, max-age=300' });
      }

      if (pathname === '/api/stream') {
        const provider = reqUrl.searchParams.get('provider') || 'opensky';
        const lat = reqUrl.searchParams.get('lat');
        const lon = reqUrl.searchParams.get('lon');
        const dist = reqUrl.searchParams.get('dist');
        const estParam = reqUrl.searchParams.get('estimated');
        const includeEstimated = estParam === '1' || estParam === 'true';

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
          ...CORS_HEADERS
        });
        if (typeof res.flushHeaders === 'function') res.flushHeaders();
        res.write(': connected\n\n');

        const client = { res, provider, lat, lon, dist, includeEstimated };
        sseClients.add(client);

        const pushUpdate = async () => {
          if (res.writableEnded) return;
          try {
            const payload = await resolveLiveFlights({
              provider: client.provider,
              lat: client.lat,
              lon: client.lon,
              dist: client.dist,
              includeEstimated: client.includeEstimated
            });
            res.write(`event: flights\ndata: ${JSON.stringify(payload)}\n\n`);
          } catch {
            // Ignore transient write errors
          }
        };

        await pushUpdate();
        const timer = setInterval(pushUpdate, 6000);

        req.on('close', () => {
          clearInterval(timer);
          sseClients.delete(client);
        });
        return;
      }

      // Static file server from public/ (with in-memory Gzip cache for JS/CSS/HTML/world-geo.json)
      const relPath = pathname === '/' ? '/index.html' : pathname;
      const safePath = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
      const fullPath = path.join(PUBLIC_DIR, safePath);

      if (!fullPath.startsWith(PUBLIC_DIR) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not Found');
      }

      const ext = path.extname(fullPath).toLowerCase();
      const cacheHeader = ext === '.html'
        ? 'no-cache'
        : (safePath === '/world-geo.json' ? 'public, max-age=86400' : 'public, max-age=300');

      if (COMPRESSIBLE_EXTS.has(ext) && clientAcceptsGzip(req)) {
        const stat = fs.statSync(fullPath);
        let cached = staticGzipCache.get(fullPath);
        if (!cached || cached.mtimeMs !== stat.mtimeMs) {
          const raw = fs.readFileSync(fullPath);
          const gzBuf = zlib.gzipSync(raw, { level: 6 });
          cached = { mtimeMs: stat.mtimeMs, gzBuf };
          staticGzipCache.set(fullPath, cached);
        }
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Content-Encoding': 'gzip',
          'Content-Length': cached.gzBuf.length,
          Vary: 'Accept-Encoding',
          'Cache-Control': cacheHeader
        });
        return res.end(cached.gzBuf);
      }

      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        Vary: 'Accept-Encoding',
        'Cache-Control': cacheHeader
      });
      fs.createReadStream(fullPath).pipe(res);
    } catch (err) {
      sendJson(req, res, 500, { error: 'Internal server error', message: err.message });
    }
  });

  server.on('close', () => {
    if (typeof adsbClient.stop === 'function') adsbClient.stop();
    if (typeof oceanicEstimator.stop === 'function') oceanicEstimator.stop();
    for (const c of sseClients) {
      if (!c.res.writableEnded) c.res.end();
    }
    sseClients.clear();
  });

  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const PORT = Number(process.env.PORT || 3000);
  const HOST = process.env.HOST || '0.0.0.0';
  const adsbClient = new LiveAdsbClient();
  const enrichmentService = new AircraftEnrichmentService();
  const stateFile = process.env.OCEANIC_STATE_FILE || path.resolve(__dirname, '../data/oceanic-anchors.json');
  const oceanicEstimator = new OceanicEstimator({ enrichmentService, stateFile });
  const server = createAppServer({ adsbClient, enrichmentService, oceanicEstimator, snapshotCacheMs: 3000 });

  server.listen(PORT, HOST, () => {
    console.log(`[AeroGlobe3D] Public-ready Live ADS-B server listening on http://${HOST}:${PORT}`);
    // Restore any persisted oceanic anchors and pre-warm global coastal gateways immediately
    oceanicEstimator.startPersistence();
    adsbClient.startWarmup();
  });

  const gracefulShutdown = async () => {
    try {
      await oceanicEstimator.savePersistedState();
    } catch {
      // Ignore
    }
    server.close(() => process.exit(0));
  };
  process.once('SIGTERM', gracefulShutdown);
  process.once('SIGINT', gracefulShutdown);
}
