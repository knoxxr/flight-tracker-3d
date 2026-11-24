import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
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

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
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
        const estimated = oceanicEstimator.getEstimatedFlights(liveSet);
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
      flights: combinedFlights
    };
  }

  const sseClients = new Set();

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = reqUrl.pathname;

      if (pathname === '/api/health') {
        return sendJson(res, 200, { status: 'ok', mode: 'live-only', uptimeSec: Math.round(process.uptime()) });
      }

      if (pathname === '/api/status' || pathname === '/api/debug') {
        return sendJson(res, 200, {
          mode: 'live-only',
          nodeVersion: process.version,
          upstream: adsbClient.getStatus(),
          oceanic: oceanicEstimator.getStats(),
          airportsCount: AIRPORTS.length,
          serverTimeUtc: new Date().toISOString()
        });
      }

      if (pathname === '/api/airports') {
        return sendJson(res, 200, { count: AIRPORTS.length, airports: AIRPORTS });
      }

      if (pathname === '/api/flights') {
        const provider = reqUrl.searchParams.get('provider') || 'opensky';
        const lat = reqUrl.searchParams.get('lat');
        const lon = reqUrl.searchParams.get('lon');
        const dist = reqUrl.searchParams.get('dist');
        const q = reqUrl.searchParams.get('q') || '';
        const estParam = reqUrl.searchParams.get('estimated');
        const includeEstimated = estParam === '1' || estParam === 'true';
        const payload = await resolveLiveFlights({ provider, lat, lon, dist, includeEstimated });
        const filtered = filterFlights(payload.flights, q);
        return sendJson(res, 200, {
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
          return sendJson(res, 404, { error: 'Flight not found', icao24 });
        }
        return sendJson(res, 200, {
          flight,
          track: trackHistory.get(icao24) || []
        });
      }

      if (pathname.startsWith('/api/enrich/')) {
        const icao24 = decodeURIComponent(pathname.slice('/api/enrich/'.length)).toLowerCase();
        const callsign = reqUrl.searchParams.get('callsign') || '';
        const info = await enrichmentService.lookup(icao24, callsign);
        return sendJson(res, 200, info);
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
          'X-Accel-Buffering': 'no'
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
        const timer = setInterval(pushUpdate, 5000);

        req.on('close', () => {
          clearInterval(timer);
          sseClients.delete(client);
        });
        return;
      }

      // Static file server from public/
      const relPath = pathname === '/' ? '/index.html' : pathname;
      const safePath = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
      const fullPath = path.join(PUBLIC_DIR, safePath);

      if (!fullPath.startsWith(PUBLIC_DIR) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not Found');
      }

      const ext = path.extname(fullPath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300'
      });
      fs.createReadStream(fullPath).pipe(res);
    } catch (err) {
      sendJson(res, 500, { error: 'Internal server error', message: err.message });
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
  const server = createAppServer({ adsbClient });
  server.listen(PORT, HOST, () => {
    console.log(`[AeroGlobe3D] Live-Only ADS-B server listening on http://${HOST}:${PORT}`);
    // Pre-warm the 96-cell global grid immediately on boot
    adsbClient.startWarmup();
  });
}
