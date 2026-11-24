// Flightradar24-style Real-Anchor Oceanic & Blind-Spot Flight Estimator.
// Never invents fake flights: ONLY projects genuinely received live ADS-B cruise aircraft
// along their real adsbdb/hexdb Great Circle route (or short conservative track) after
// they fly beyond coastal/terrestrial ADS-B receiver coverage.

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371.0088;

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
  // Forward bearing at destination is reverse of back-azimuth
  const backBearing = initialBearingDeg(nextLat, nextLon, lat, lon);
  const nextHeading = (backBearing + 180) % 360;

  return {
    lat: Number(nextLat.toFixed(4)),
    lon: Number(nextLon.toFixed(4)),
    heading: Number(nextHeading.toFixed(1))
  };
}

const MAX_ROUTE_ESTIMATE_MS = 8 * 60 * 60 * 1000; // Up to 8 hours for transoceanic routes
const MAX_HEADING_ESTIMATE_MS = 45 * 60 * 1000; // Conservative 45 min cap when route is unknown
const MIN_SILENCE_FOR_ESTIMATE_MS = 35 * 1000; // Wait 35s after leaving live set before estimating
const MAX_STORED_ANCHORS = 3500;

export class OceanicEstimator {
  constructor(options = {}) {
    this.enrichmentService = options.enrichmentService || null;
    this.anchors = new Map(); // icao24 -> { flight, observedAtMs, routeState, route, routeCheckedAt }
    this.lookupQueue = [];
    this.lookupQueuedSet = new Set();
    this.lookupTimer = null;
    this.lookupBusy = false;
  }

  /**
   * Record currently received live airborne flights as real last-seen anchors.
   */
  observeLiveFlights(flights, nowMs = Date.now()) {
    if (!Array.isArray(flights)) return;
    for (let i = 0; i < flights.length; i++) {
      const f = flights[i];
      if (!f || !f.icao24 || f.onGround || f.estimated) continue;
      // Only track cruising/climbing jet traffic capable of crossing oceans or blind spots
      if ((f.altitudeFt || 0) < 16000 || (f.speedKts || 0) < 220) continue;

      const existing = this.anchors.get(f.icao24);
      if (existing) {
        const callChanged = existing.flight.callsign !== f.callsign;
        existing.flight = f;
        existing.observedAtMs = nowMs;
        if (callChanged) {
          existing.routeState = 'idle';
          existing.route = null;
        }
      } else {
        if (this.anchors.size >= MAX_STORED_ANCHORS) {
          // Evict oldest anchor
          const oldestKey = this.anchors.keys().next().value;
          if (oldestKey) this.anchors.delete(oldestKey);
        }
        this.anchors.set(f.icao24, {
          flight: f,
          observedAtMs: nowMs,
          routeState: 'idle', // 'idle' | 'pending' | 'resolved' | 'none'
          route: null,
          routeCheckedAt: 0
        });
      }
    }
  }

  _enqueueRouteLookup(icao24, callsign) {
    if (!this.enrichmentService) return;
    const cleanCall = String(callsign || '').trim().toUpperCase();
    // Skip hex-only callsigns without airline prefix
    if (!cleanCall || cleanCall === icao24.toUpperCase() || !/^[A-Z]{2,3}\d/.test(cleanCall)) {
      const entry = this.anchors.get(icao24);
      if (entry) entry.routeState = 'none';
      return;
    }
    if (this.lookupQueuedSet.has(icao24)) return;
    if (this.lookupQueue.length >= 80) return;

    const entry = this.anchors.get(icao24);
    if (!entry || entry.routeState !== 'idle') return;
    entry.routeState = 'pending';
    this.lookupQueuedSet.add(icao24);
    this.lookupQueue.push({ icao24, callsign: cleanCall });
    this._ensureLookupWorker();
  }

  _ensureLookupWorker() {
    if (this.lookupTimer || !this.enrichmentService) return;
    // Gentle 850ms interval (~1.1 req/s max) to stay super polite to adsbdb.com & hexdb.io
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
    }, 850);
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

      // Trigger polite background route resolution as soon as a real cruise flight enters blind spot
      if (entry.routeState === 'idle') {
        this._enqueueRouteLookup(icao24, f.callsign);
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

        // Verify the plane was actually flying toward this destination (guards against outdated return-leg routes)
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

      // Conservative heading-based projection when route is unavailable or pending (high-altitude jets only, <= 45 min)
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
      pendingRouteLookups: this.lookupQueue.length
    };
  }

  stop() {
    if (this.lookupTimer) {
      clearInterval(this.lookupTimer);
      this.lookupTimer = null;
    }
  }
}
