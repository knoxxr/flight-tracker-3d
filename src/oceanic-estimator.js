// Flightradar24-style Real-Anchor Oceanic & Blind-Spot Flight Estimator (100% Free).
// Never invents fake flights: ONLY projects genuinely received live ADS-B cruise aircraft
// along their real adsbdb/hexdb Great Circle route (or short conservative track) after
// they fly beyond coastal/terrestrial ADS-B receiver coverage.
// Supports zero-dependency persistence to local JSON file and optional free Upstash Redis REST.

import fs from 'node:fs';
import path from 'node:path';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371.0088;

const LONG_HAUL_TYPES = new Set([
  'A388', 'A380', 'B744', 'B748', 'B772', 'B773', 'B77W', 'B77L', 'B778', 'B779',
  'B788', 'B789', 'B78X', 'A359', 'A35K', 'A332', 'A333', 'A338', 'A339',
  'A342', 'A343', 'A345', 'A346', 'B763', 'B764', 'MD11', 'A321', 'A21N'
]);

export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function initialBearingDeg(lat1, lon1, lat2, lon2) {
  const phi1 = lat1 * DEG2RAD;
  const phi2 = lat2 * DEG2RAD;
  const dLam = (lon2 - lon1) * DEG2RAD;
  const y = Math.sin(dLam) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLam);
  return ((Math.atan2(y, x) * RAD2DEG) + 360) % 360;
}

export function angularDiffDeg(a, b) {
  const diff = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return diff;
}

/**
 * Advance a point (lat1, lon1) by distKm along the Great Circle directly toward (lat2, lon2).
 * Returns new coordinates, true forward heading along the Great Circle, remaining distance, and arrival flag.
 */
export function advanceAlongGreatCircle(lat1, lon1, lat2, lon2, distKm) {
  const totalKm = haversineKm(lat1, lon1, lat2, lon2);
  if (totalKm < 1 || distKm >= totalKm - 15) {
    return {
      lat: Number(lat2.toFixed(4)),
      lon: Number(lon2.toFixed(4)),
      heading: Number(initialBearingDeg(lat1, lon1, lat2, lon2).toFixed(1)),
      remainingKm: 0,
      arrived: true
    };
  }

  const frac = Math.max(0, Math.min(1, distKm / totalKm));
  const delta = totalKm / EARTH_RADIUS_KM;
  const sinD = Math.sin(delta);
  if (sinD < 1e-6) {
    return {
      lat: Number((lat1 + (lat2 - lat1) * frac).toFixed(4)),
      lon: Number((lon1 + (lon2 - lon1) * frac).toFixed(4)),
      heading: Number(initialBearingDeg(lat1, lon1, lat2, lon2).toFixed(1)),
      remainingKm: Math.max(0, totalKm - distKm),
      arrived: false
    };
  }

  const phi1 = lat1 * DEG2RAD;
  const lam1 = lon1 * DEG2RAD;
  const phi2 = lat2 * DEG2RAD;
  const lam2 = lon2 * DEG2RAD;

  const A = Math.sin((1 - frac) * delta) / sinD;
  const B = Math.sin(frac * delta) / sinD;

  const x = A * Math.cos(phi1) * Math.cos(lam1) + B * Math.cos(phi2) * Math.cos(lam2);
  const y = A * Math.cos(phi1) * Math.sin(lam1) + B * Math.cos(phi2) * Math.sin(lam2);
  const z = A * Math.sin(phi1) + B * Math.sin(phi2);

  const nextLat = Math.atan2(z, Math.hypot(x, y)) * RAD2DEG;
  const nextLon = Math.atan2(y, x) * RAD2DEG;
  const nextHeading = initialBearingDeg(nextLat, nextLon, lat2, lon2);

  return {
    lat: Number(nextLat.toFixed(4)),
    lon: Number(nextLon.toFixed(4)),
    heading: Number(nextHeading.toFixed(1)),
    remainingKm: Math.max(0, totalKm - distKm),
    arrived: false
  };
}

/**
 * Advance a point (lat, lon) by distKm along a Great Circle starting with initial headingDeg.
 */
export function advanceByHeading(lat, lon, headingDeg, distKm) {
  const delta = distKm / EARTH_RADIUS_KM;
  const theta = headingDeg * DEG2RAD;
  const phi1 = lat * DEG2RAD;
  const lam1 = lon * DEG2RAD;

  const sinPhi2 = Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));
  const lam2 = lam1 + Math.atan2(
    Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
    Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
  );

  const nextLat = phi2 * RAD2DEG;
  const nextLon = ((((lam2 * RAD2DEG) + 540) % 360) - 180);
  const backBearing = initialBearingDeg(nextLat, nextLon, lat, lon);
  const nextHeading = (backBearing + 180) % 360;

  return {
    lat: Number(nextLat.toFixed(4)),
    lon: Number(nextLon.toFixed(4)),
    heading: Number(nextHeading.toFixed(1))
  };
}

const MAX_ROUTE_ESTIMATE_MS = 10 * 60 * 60 * 1000; // Up to 10 hours for ultra-long-haul transpacific routes
const MAX_HEADING_ESTIMATE_MS = 50 * 60 * 1000; // Conservative 50 min cap when route is unknown
const MIN_SILENCE_FOR_ESTIMATE_MS = 35 * 1000; // Wait 35s after leaving live set before estimating
const MAX_STORED_ANCHORS = 4000;
const UPSTASH_KEY = 'aeroglobe:oceanic_anchors:v1';

export class OceanicEstimator {
  constructor(options = {}) {
    this.enrichmentService = options.enrichmentService || null;
    this.stateFile = options.stateFile ?? process.env.OCEANIC_STATE_FILE ?? null;
    this.upstashUrl = options.upstashUrl ?? process.env.UPSTASH_REDIS_REST_URL ?? '';
    this.upstashToken = options.upstashToken ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '';
    this.persistIntervalMs = Number(options.persistIntervalMs || 60_000);

    this.anchors = new Map(); // icao24 -> { flight, observedAtMs, routeState, route, routeCheckedAt }
    this.lookupQueue = [];
    this.lookupQueuedSet = new Set();
    this.lookupTimer = null;
    this.lookupBusy = false;
    this.persistTimer = null;
    this.lastPersistAt = null;
    this.restoredCount = 0;
  }

  /**
   * Export active anchors for free local disk or Upstash Redis persistence.
   */
  exportState(nowMs = Date.now()) {
    const entries = [];
    for (const [icao24, entry] of this.anchors.entries()) {
      const ageMs = nowMs - entry.observedAtMs;
      if (ageMs > MAX_ROUTE_ESTIMATE_MS) continue;
      if (entry.routeState !== 'resolved' && ageMs > MAX_HEADING_ESTIMATE_MS) continue;
      entries.push({
        icao24,
        flight: entry.flight,
        observedAtMs: entry.observedAtMs,
        routeState: entry.routeState === 'pending' ? 'idle' : entry.routeState,
        route: entry.route || null,
        routeCheckedAt: entry.routeCheckedAt || 0
      });
    }
    return { version: 1, savedAt: nowMs, entries };
  }

  /**
   * Restore previously persisted anchors after server restart or Render wake-up.
   */
  importState(data, nowMs = Date.now()) {
    if (!data || !Array.isArray(data.entries)) return 0;
    let restored = 0;
    for (const item of data.entries) {
      if (!item?.icao24 || !item?.flight || typeof item.observedAtMs !== 'number') continue;
      const ageMs = nowMs - item.observedAtMs;
      if (ageMs < 0 || ageMs > MAX_ROUTE_ESTIMATE_MS) continue;
      if (item.routeState !== 'resolved' && ageMs > MAX_HEADING_ESTIMATE_MS) continue;
      if (this.anchors.has(item.icao24)) continue;
      this.anchors.set(item.icao24, {
        flight: item.flight,
        observedAtMs: item.observedAtMs,
        routeState: item.routeState === 'resolved' && item.route ? 'resolved' : 'idle',
        route: item.route || null,
        routeCheckedAt: item.routeCheckedAt || 0
      });
      restored++;
      if (this.anchors.size >= MAX_STORED_ANCHORS) break;
    }
    this.restoredCount = restored;
    return restored;
  }

  async loadPersistedState() {
    // 1) Try free Upstash Redis REST if configured (survives Render ephemeral disk resets!)
    if (this.upstashUrl && this.upstashToken) {
      try {
        const res = await fetch(`${this.upstashUrl.replace(/\/$/, '')}/get/${encodeURIComponent(UPSTASH_KEY)}`, {
          headers: { Authorization: `Bearer ${this.upstashToken}` },
          signal: AbortSignal.timeout(5000)
        });
        if (res.ok) {
          const json = await res.json();
          if (typeof json?.result === 'string' && json.result.length > 2) {
            const parsed = JSON.parse(json.result);
            const n = this.importState(parsed);
            if (n > 0) return n;
          }
        }
      } catch {
        // Fallback to local state file
      }
    }

    // 2) Try local JSON file (zero-cost disk persistence across process restarts)
    if (this.stateFile) {
      try {
        if (fs.existsSync(this.stateFile)) {
          const raw = fs.readFileSync(this.stateFile, 'utf8');
          const parsed = JSON.parse(raw);
          return this.importState(parsed);
        }
      } catch {
        // Ignore corrupt/missing file
      }
    }
    return 0;
  }

  async savePersistedState() {
    const payload = this.exportState();
    if (payload.entries.length === 0) return false;
    const serialized = JSON.stringify(payload);
    let saved = false;

    if (this.stateFile) {
      try {
        const dir = path.dirname(this.stateFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const tmp = `${this.stateFile}.tmp`;
        fs.writeFileSync(tmp, serialized, 'utf8');
        fs.renameSync(tmp, this.stateFile);
        saved = true;
      } catch {
        // Non-fatal
      }
    }

    if (this.upstashUrl && this.upstashToken) {
      try {
        const res = await fetch(this.upstashUrl.replace(/\/$/, ''), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.upstashToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(['SET', UPSTASH_KEY, serialized, 'EX', 36000]),
          signal: AbortSignal.timeout(5000)
        });
        if (res.ok) saved = true;
      } catch {
        // Non-fatal
      }
    }

    if (saved) this.lastPersistAt = new Date().toISOString();
    return saved;
  }

  startPersistence() {
    if (!this.stateFile && !(this.upstashUrl && this.upstashToken)) return;
    this.loadPersistedState().catch(() => {});
    if (this.persistTimer) return;
    this.persistTimer = setInterval(() => {
      this.savePersistedState().catch(() => {});
    }, this.persistIntervalMs);
    if (typeof this.persistTimer.unref === 'function') {
      this.persistTimer.unref();
    }
  }

  /**
   * Record currently received live airborne flights as real last-seen anchors.
   * Proactively pre-warms routes for high-altitude long-haul jets so coastal exits are seamless!
   */
  observeLiveFlights(flights, nowMs = Date.now()) {
    if (!Array.isArray(flights)) return;
    for (let i = 0; i < flights.length; i++) {
      const f = flights[i];
      if (!f || !f.icao24 || f.onGround || f.estimated) continue;
      if ((f.altitudeFt || 0) < 16000 || (f.speedKts || 0) < 220) continue;

      let entry = this.anchors.get(f.icao24);
      if (entry) {
        const callChanged = entry.flight.callsign !== f.callsign;
        entry.flight = f;
        entry.observedAtMs = nowMs;
        if (callChanged) {
          entry.routeState = 'idle';
          entry.route = null;
        }
      } else {
        if (this.anchors.size >= MAX_STORED_ANCHORS) {
          const oldestKey = this.anchors.keys().next().value;
          if (oldestKey) this.anchors.delete(oldestKey);
        }
        entry = {
          flight: f,
          observedAtMs: nowMs,
          routeState: 'idle', // 'idle' | 'pending' | 'resolved' | 'none'
          route: null,
          routeCheckedAt: 0
        };
        this.anchors.set(f.icao24, entry);
      }

      // Proactive route pre-warming: when queue has room, pre-fetch routes for high-altitude widebodies
      // so the instant they exit coastal ADS-B range, their oceanic Great Circle route is ready!
      if (entry.routeState === 'idle' &&
        this.lookupQueue.length < 18 &&
        (f.altitudeFt || 0) >= 30000 &&
        (f.speedKts || 0) >= 380 &&
        LONG_HAUL_TYPES.has(String(f.aircraftType || '').toUpperCase())) {
        this._enqueueRouteLookup(f.icao24, f.callsign, false);
      }
    }
  }

  _enqueueRouteLookup(icao24, callsign, highPriority = true) {
    if (!this.enrichmentService) return;
    const cleanCall = String(callsign || '').trim().toUpperCase();
    if (!cleanCall || cleanCall === icao24.toUpperCase() || !/^[A-Z]{2,3}\d/.test(cleanCall)) {
      const entry = this.anchors.get(icao24);
      if (entry) entry.routeState = 'none';
      return;
    }
    if (this.lookupQueuedSet.has(icao24)) return;
    if (this.lookupQueue.length >= 90) return;

    const entry = this.anchors.get(icao24);
    if (!entry || entry.routeState !== 'idle') return;
    entry.routeState = 'pending';
    this.lookupQueuedSet.add(icao24);
    if (highPriority) {
      this.lookupQueue.unshift({ icao24, callsign: cleanCall });
    } else {
      this.lookupQueue.push({ icao24, callsign: cleanCall });
    }
    this._ensureLookupWorker();
  }

  _ensureLookupWorker() {
    if (this.lookupTimer || !this.enrichmentService) return;
    // Polite 900ms interval (~1.1 req/s max) to respect adsbdb.com & hexdb.io
    this.lookupTimer = setInterval(async () => {
      if (this.lookupQueue.length === 0) {
        clearInterval(this.lookupTimer);
        this.lookupTimer = null;
        return;
      }
      if (this.lookupBusy) return;
      this.lookupBusy = true;
      const item = this.lookupQueue.shift();
      this.lookupQueuedSet.delete(item.icao24);
      try {
        const res = await this.enrichmentService.lookup(item.icao24, item.callsign);
        const entry = this.anchors.get(item.icao24);
        if (entry) {
          const fr = res?.flightroute;
          if (fr?.origin && fr?.destination &&
            typeof fr.origin.lat === 'number' && typeof fr.destination.lat === 'number') {
            entry.route = fr;
            entry.routeState = 'resolved';
          } else {
            entry.routeState = 'none';
          }
          entry.routeCheckedAt = Date.now();
        }
      } catch {
        const entry = this.anchors.get(item.icao24);
        if (entry) entry.routeState = 'none';
      } finally {
        this.lookupBusy = false;
      }
    }, 900);
    if (typeof this.lookupTimer.unref === 'function') {
      this.lookupTimer.unref();
    }
  }

  /**
   * Compute currently active Estimated positions for real aircraft that have flown out of live ADS-B range.
   */
  getEstimatedFlights(liveIcaoSet, nowMs = Date.now()) {
    const estimated = [];

    for (const [icao24, entry] of this.anchors.entries()) {
      if (liveIcaoSet && liveIcaoSet.has(icao24)) {
        continue; // Live ADS-B signal is active — never emit duplicate estimate
      }

      const elapsedMs = nowMs - entry.observedAtMs;
      if (elapsedMs < MIN_SILENCE_FOR_ESTIMATE_MS) continue;

      const f = entry.flight;
      const elapsedSec = elapsedMs / 1000;
      const speedKmh = f.speedKmh || Math.round((f.speedKts || 450) * 1.852);
      const distKm = (speedKmh * elapsedSec) / 3600;

      // High-priority route lookup for planes actively entering oceanic blind spots
      if (entry.routeState === 'idle') {
        this._enqueueRouteLookup(icao24, f.callsign, true);
      }

      if (entry.routeState === 'resolved' && entry.route) {
        if (elapsedMs > MAX_ROUTE_ESTIMATE_MS) {
          this.anchors.delete(icao24);
          continue;
        }
        const orig = entry.route.origin;
        const dest = entry.route.destination;
        const bearingToDest = initialBearingDeg(f.lat, f.lon, dest.lat, dest.lon);
        const headingMismatch = angularDiffDeg(f.heading || 0, bearingToDest);
        const initialRemainKm = haversineKm(f.lat, f.lon, dest.lat, dest.lon);

        // Verify the plane was actually flying toward this destination (guards against return-leg callsigns)
        if (initialRemainKm > 35 && headingMismatch <= 85) {
          const step = advanceAlongGreatCircle(f.lat, f.lon, dest.lat, dest.lon, distKm);
          if (step.arrived) {
            this.anchors.delete(icao24);
            continue;
          }

          const totalRouteKm = Math.max(1, haversineKm(orig.lat, orig.lon, dest.lat, dest.lon));
          const flownKm = haversineKm(orig.lat, orig.lon, step.lat, step.lon);
          const progress = Math.max(0.02, Math.min(0.98, flownKm / (flownKm + step.remainingKm || totalRouteKm)));

          estimated.push({
            ...f,
            lat: step.lat,
            lon: step.lon,
            heading: step.heading,
            verticalRateMs: 0,
            verticalRateFpm: 0,
            estimated: true,
            estimateBasis: 'route',
            estimatedAgeSec: Math.round(elapsedSec),
            lastLiveLat: f.lat,
            lastLiveLon: f.lon,
            lastLiveAt: Math.floor(entry.observedAtMs / 1000),
            origin: orig.iata || orig.icao,
            destination: dest.iata || dest.icao,
            originCoords: [orig.lat, orig.lon],
            destCoords: [dest.lat, dest.lon],
            progress,
            iataFlight: entry.route.callsignIata || f.iataFlight || null,
            airlineName: f.airlineName || entry.route.airline?.name || null,
            source: 'estimated-route'
          });
          continue;
        }
      }

      // Conservative heading-based projection when route is unavailable or pending (high-altitude jets only, <= 50 min)
      if (elapsedMs <= MAX_HEADING_ESTIMATE_MS && (f.altitudeFt || 0) >= 24000 && (f.speedKts || 0) >= 280) {
        const step = advanceByHeading(f.lat, f.lon, f.heading || 0, distKm);
        estimated.push({
          ...f,
          lat: step.lat,
          lon: step.lon,
          heading: step.heading,
          verticalRateMs: 0,
          verticalRateFpm: 0,
          estimated: true,
          estimateBasis: 'heading',
          estimatedAgeSec: Math.round(elapsedSec),
          lastLiveLat: f.lat,
          lastLiveLon: f.lon,
          lastLiveAt: Math.floor(entry.observedAtMs / 1000),
          source: 'estimated-track'
        });
      } else if (elapsedMs > MAX_HEADING_ESTIMATE_MS && entry.routeState !== 'pending') {
        this.anchors.delete(icao24);
      }
    }

    return estimated;
  }

  getStats() {
    let resolved = 0;
    for (const entry of this.anchors.values()) {
      if (entry.routeState === 'resolved') resolved++;
    }
    return {
      trackedAnchors: this.anchors.size,
      resolvedRoutes: resolved,
      pendingRouteLookups: this.lookupQueue.length,
      restoredOnBoot: this.restoredCount,
      persistenceMode: (this.upstashUrl && this.upstashToken)
        ? 'upstash-redis'
        : (this.stateFile ? 'local-file' : 'memory-only'),
      lastPersistAt: this.lastPersistAt
    };
  }

  stop() {
    if (this.lookupTimer) {
      clearInterval(this.lookupTimer);
      this.lookupTimer = null;
    }
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
  }
}
