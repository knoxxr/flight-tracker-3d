import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIRPORTS } from './airports.js';
import { GlobalFlightSimulator } from './simulator.js';
import { OpenSkyClient } from './opensky.js';

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
    (f.flightNumber && f.flightNumber.toLowerCase().includes(q)) ||
    (f.icao24 && f.icao24.toLowerCase().includes(q)) ||
    (f.airline && f.airline.toLowerCase().includes(q)) ||
    (f.origin && f.origin.toLowerCase().includes(q)) ||
    (f.destination && f.destination.toLowerCase().includes(q)) ||
    (f.originCountry && f.originCountry.toLowerCase().includes(q))
  );
}

export function createAppServer(options = {}) {
  const defaultMode = options.mode || process.env.FLIGHT_DATA_MODE || 'auto';
  const simulator = options.simulator || new GlobalFlightSimulator({ timeScale: options.timeScale ?? 14 });
  const opensky = options.opensky || new OpenSkyClient();
  const trackHistory = new Map();

  function recordTracks(flights) {
    const now = Math.floor(Date.now() / 1000);
    for (const f of flights) {
      let hist = trackHistory.get(f.icao24);
      if (!hist) {
        hist = [];
        trackHistory.set(f.icao24, hist);
      }
      const last = hist[hist.length - 1];
      if (!last || Math.abs(last.lat - f.lat) > 0.01 || Math.abs(last.lon - f.lon) > 0.01) {
        hist.push({ lat: f.lat, lon: f.lon, altFt: f.altitudeFt, ts: now });
        if (hist.length > 40) hist.shift();
      }
    }
    // Trim stale tracks
    if (trackHistory.size > 2000) {
      for (const [k, v] of trackHistory.entries()) {
        if (!v.length || now - v[v.length - 1].ts > 600) {
          trackHistory.delete(k);
        }
      }
    }
  }

  async function resolveFlights(requestedMode = defaultMode) {
    const mode = ['auto', 'live', 'simulation'].includes(requestedMode) ? requestedMode : defaultMode;

    if (mode === 'simulation') {
      const flights = simulator.getSnapshot();
      recordTracks(flights);
      return {
        mode: 'simulation',
        activeSource: 'simulation',
        fallbackReason: null,
        timestamp: Date.now(),
        count: flights.length,
        flights
      };
    }

    const liveResult = await opensky.fetchFlights();
    if (liveResult.ok && liveResult.flights.length > 0) {
      recordTracks(liveResult.flights);
      return {
        mode,
        activeSource: 'opensky',
        fallbackReason: null,
        cached: Boolean(liveResult.cached),
        timestamp: Date.now(),
        count: liveResult.flights.length,
        flights: liveResult.flights
      };
    }

    if (mode === 'live') {
      return {
        mode: 'live',
        activeSource: 'opensky',
        fallbackReason: liveResult.error || 'Live ADS-B feed temporarily unavailable',
        timestamp: Date.now(),
        count: 0,
        flights: []
      };
    }

    // Smooth fallback to realistic global simulation when OpenSky is unavailable or rate-limited
    const flights = simulator.getSnapshot();
    recordTracks(flights);
    return {
      mode: 'auto',
      activeSource: 'simulation',
      fallbackReason: liveResult.error || 'OpenSky unavailable — running global simulation',
      timestamp: Date.now(),
      count: flights.length,
      flights
    };
  }

  const sseClients = new Set();

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = reqUrl.pathname;

      if (pathname === '/api/health') {
        return sendJson(res, 200, { status: 'ok', uptimeSec: Math.round(process.uptime()) });
      }

      if (pathname === '/api/status') {
        return sendJson(res, 200, {
          defaultMode,
          opensky: opensky.getStatus(),
          airportsCount: AIRPORTS.length,
          simulatedFleetSize: simulator.flights.length,
          serverTimeUtc: new Date().toISOString()
        });
      }

      if (pathname === '/api/airports') {
        return sendJson(res, 200, { count: AIRPORTS.length, airports: AIRPORTS });
      }

      if (pathname === '/api/flights') {
        const modeParam = reqUrl.searchParams.get('mode') || defaultMode;
        const q = reqUrl.searchParams.get('q') || '';
        const payload = await resolveFlights(modeParam);
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
        const modeParam = reqUrl.searchParams.get('mode') || defaultMode;
        const payload = await resolveFlights(modeParam);
        const flight = payload.flights.find((f) => f.icao24 === icao24);
        if (!flight) {
          return sendJson(res, 404, { error: 'Flight not found', icao24 });
        }
        return sendJson(res, 200, {
          flight,
          track: trackHistory.get(icao24) || []
        });
      }

      if (pathname === '/api/stream') {
        const modeParam = reqUrl.searchParams.get('mode') || defaultMode;
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive'
        });

        const client = { res, mode: modeParam };
        sseClients.add(client);

        const pushUpdate = async () => {
          if (res.writableEnded) return;
          try {
            const payload = await resolveFlights(client.mode);
            res.write(`event: flights\ndata: ${JSON.stringify(payload)}\n\n`);
          } catch {
            // Ignore transient write errors
          }
        };

        await pushUpdate();
        const timer = setInterval(pushUpdate, 2500);

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
  const server = createAppServer();
  server.listen(PORT, HOST, () => {
    console.log(`[FlightTracker3D] Server listening on http://${HOST}:${PORT}`);
  });
}
