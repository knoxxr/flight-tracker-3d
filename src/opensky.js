const OPENSKY_STATES_URL = 'https://opensky-network.org/api/states/all';
const OPENSKY_OAUTH_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const ADSBFI_BASE_URL = 'https://opendata.adsb.fi/api/v3';
const ADSBLOL_BASE_URL = 'https://api.adsb.lol/v2';

const USER_AGENT = 'AeroGlobe3D/1.1 (+https://github.com/knoxxr/flight-tracker-3d)';

// High-traffic global ADS-B coverage hubs for multi-region real-time harvesting when OpenSky is rate-limited
export const GLOBAL_LIVE_HUBS = [
  { id: 'KR', name: 'Seoul/Korea', lat: 37.46, lon: 126.44 },
  { id: 'EU-W', name: 'London', lat: 51.47, lon: -0.45 },
  { id: 'US-E', name: 'New York', lat: 40.64, lon: -73.78 },
  { id: 'JP', name: 'Tokyo', lat: 35.68, lon: 139.77 },
  { id: 'EU-C', name: 'Frankfurt', lat: 50.04, lon: 8.56 },
  { id: 'US-W', name: 'Los Angeles', lat: 33.94, lon: -118.41 },
  { id: 'US-M', name: 'Chicago', lat: 41.97, lon: -87.91 },
  { id: 'ME', name: 'Dubai', lat: 25.25, lon: 55.37 },
  { id: 'SEA', name: 'Singapore', lat: 1.36, lon: 103.99 },
  { id: 'AU', name: 'Sydney', lat: -33.94, lon: 151.18 }
];

/**
 * Parse a raw 17-element OpenSky state vector array into a normalized live ADS-B flight object.
 */
export function parseOpenSkyStateVector(vec, nowSec = Math.floor(Date.now() / 1000)) {
  if (!Array.isArray(vec) || vec.length < 12) return null;
  const lon = vec[5];
  const lat = vec[6];
  if (typeof lat !== 'number' || typeof lon !== 'number' || Number.isNaN(lat) || Number.isNaN(lon)) {
    return null;
  }

  const icao24 = String(vec[0] || '').trim().toLowerCase();
  if (!icao24) return null;

  const callsign = String(vec[1] || '').trim() || icao24.toUpperCase();
  const originCountry = String(vec[2] || 'Unknown').trim();
  const lastContact = typeof vec[4] === 'number' ? vec[4] : nowSec;
  const baroAltM = typeof vec[7] === 'number' ? vec[7] : (typeof vec[13] === 'number' ? vec[13] : 0);
  const onGround = Boolean(vec[8]);
  const velocityMs = typeof vec[9] === 'number' ? vec[9] : 0;
  const heading = typeof vec[10] === 'number' ? ((vec[10] % 360) + 360) % 360 : 0;
  const verticalRateMs = typeof vec[11] === 'number' ? vec[11] : 0;
  const squawk = vec[14] ? String(vec[14]).trim() : '----';

  const altitudeM = Math.max(0, Math.round(baroAltM));
  const altitudeFt = Math.round(altitudeM * 3.28084);
  const speedKts = Math.round(velocityMs * 1.94384);
  const speedKmh = Math.round(velocityMs * 3.6);
  const verticalRateFpm = Math.round(verticalRateMs * 196.85);

  return {
    icao24,
    callsign,
    originCountry,
    aircraftType: 'ADS-B',
    aircraftLabel: 'Live Transponder',
    registration: icao24.toUpperCase(),
    squawk,
    lat: Number(lat.toFixed(4)),
    lon: Number(lon.toFixed(4)),
    altitudeM,
    altitudeFt,
    speedMs: Number(velocityMs.toFixed(1)),
    speedKts,
    speedKmh,
    heading: Number(heading.toFixed(1)),
    verticalRateMs: Number(verticalRateMs.toFixed(2)),
    verticalRateFpm,
    onGround,
    source: 'opensky',
    lastContact
  };
}

/**
 * Parse an ADS-B Exchange v2 / adsb.fi v3 / adsb.lol v2 aircraft object into a normalized live flight object.
 */
export function parseAdsbFiAircraft(ac, nowSec = Math.floor(Date.now() / 1000), source = 'adsbfi') {
  if (!ac || typeof ac.lat !== 'number' || typeof ac.lon !== 'number') return null;
  if (Number.isNaN(ac.lat) || Number.isNaN(ac.lon)) return null;
  const icao24 = String(ac.hex || '').trim().toLowerCase();
  if (!icao24) return null;

  const onGround = ac.alt_baro === 'ground' || ac.alt_baro === 0;
  const altFtRaw = typeof ac.alt_baro === 'number'
    ? ac.alt_baro
    : (typeof ac.alt_geom === 'number' ? ac.alt_geom : 0);
  const altitudeFt = Math.max(0, Math.round(altFtRaw));
  const altitudeM = Math.round(altitudeFt * 0.3048);

  const speedKts = typeof ac.gs === 'number' ? Math.round(ac.gs) : 0;
  const speedMs = Number((speedKts * 0.514444).toFixed(1));
  const speedKmh = Math.round(speedKts * 1.852);
  const heading = typeof ac.track === 'number'
    ? ((ac.track % 360) + 360) % 360
    : (typeof ac.true_heading === 'number' ? ((ac.true_heading % 360) + 360) % 360 : 0);
  const verticalRateFpm = typeof ac.baro_rate === 'number'
    ? Math.round(ac.baro_rate)
    : (typeof ac.geom_rate === 'number' ? Math.round(ac.geom_rate) : 0);
  const verticalRateMs = Number((verticalRateFpm * 0.00508).toFixed(2));

  const callsign = String(ac.flight || '').trim() || String(ac.r || '').trim() || icao24.toUpperCase();
  const seenSec = typeof ac.seen_pos === 'number'
    ? Math.round(ac.seen_pos)
    : (typeof ac.seen === 'number' ? Math.round(ac.seen) : 0);

  return {
    icao24,
    callsign,
    originCountry: String(ac.ownOp || (source === 'adsblol' ? 'adsb.lol Live' : 'adsb.fi Live')).trim(),
    aircraftType: String(ac.t || 'ADS-B').trim(),
    aircraftLabel: String(ac.desc || ac.t || 'Live Transponder').trim(),
    registration: String(ac.r || icao24.toUpperCase()).trim(),
    squawk: ac.squawk ? String(ac.squawk).trim() : '----',
    lat: Number(ac.lat.toFixed(4)),
    lon: Number(ac.lon.toFixed(4)),
    altitudeM,
    altitudeFt,
    speedMs,
    speedKts,
    speedKmh,
    heading: Number(heading.toFixed(1)),
    verticalRateMs,
    verticalRateFpm,
    onGround,
    source,
    lastContact: Math.max(0, nowSec - seenSec)
  };
}

/**
 * Dead-reckon a live ADS-B aircraft position forward by elapsedSec using its groundspeed and true track.
 */
export function deadReckonFlight(flight, elapsedSec) {
  if (!flight || flight.onGround || !flight.speedMs || elapsedSec <= 0 || elapsedSec > 90) {
    return flight;
  }
  const distKm = (flight.speedMs * elapsedSec) / 1000;
  const angularDist = distKm / 6371.0088;
  const bearing = (flight.heading * Math.PI) / 180;
  const lat1 = (flight.lat * Math.PI) / 180;
  const lon1 = (flight.lon * Math.PI) / 180;

  const sinLat2 = Math.sin(lat1) * Math.cos(angularDist) +
    Math.cos(lat1) * Math.sin(angularDist) * Math.cos(bearing);
  const lat2 = Math.asin(Math.max(-1, Math.min(1, sinLat2)));
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDist) * Math.cos(lat1),
    Math.cos(angularDist) - Math.sin(lat1) * Math.sin(lat2)
  );

  let nextLon = (lon2 * 180) / Math.PI;
  if (nextLon > 180) nextLon -= 360;
  if (nextLon < -180) nextLon += 360;

  const nextAltM = Math.max(0, Math.round(flight.altitudeM + (flight.verticalRateMs || 0) * elapsedSec));

  return {
    ...flight,
    lat: Number(((lat2 * 180) / Math.PI).toFixed(4)),
    lon: Number(nextLon.toFixed(4)),
    altitudeM: nextAltM,
    altitudeFt: Math.round(nextAltM * 3.28084)
  };
}

export class LiveAdsbClient {
  constructor(options = {}) {
    this.username = options.username || process.env.OPENSKY_USERNAME || '';
    this.password = options.password || process.env.OPENSKY_PASSWORD || '';
    this.clientId = options.clientId || process.env.OPENSKY_CLIENT_ID || '';
    this.clientSecret = options.clientSecret || process.env.OPENSKY_CLIENT_SECRET || '';
    this.pollIntervalMs = Number(options.pollIntervalMs || process.env.OPENSKY_POLL_INTERVAL_MS || 20000);
    this.maxFlights = Number(options.maxFlights || process.env.MAX_FLIGHTS || 1500);

    // OpenSky cache & backoff
    this.cachedOpenSky = [];
    this.lastOpenSkyFetchMs = 0;
    this.lastOpenSkySuccessMs = 0;
    this.openSkyBackoffUntilMs = 0;
    this.lastOpenSkyError = null;
    this.inFlightOpenSky = null;
    this.oauthToken = null;
    this.oauthExpiresAt = 0;

    // Multi-hub real-time ADS-B aggregator (adsb.fi + adsb.lol) when OpenSky is unavailable/rate-limited
    this.hubFlights = new Map(); // icao24 -> { flight, fetchedAt }
    this.hubCursor = 0;
    this.harvesterTimer = null;
    this.lastClientActivityMs = Date.now();
    this.diagnostics = {
      opensky: { status: 'idle', count: 0, error: null, at: null },
      adsbfi: { status: 'idle', count: 0, error: null, at: null },
      adsblol: { status: 'idle', count: 0, error: null, at: null }
    };
  }

  async getAuthHeaders() {
    if (this.clientId && this.clientSecret) {
      if (!this.oauthToken || Date.now() >= this.oauthExpiresAt - 30000) {
        const body = new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret
        });
        const tokenRes = await fetch(OPENSKY_OAUTH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
          body,
          signal: AbortSignal.timeout(6000)
        });
        if (!tokenRes.ok) {
          throw new Error(`OpenSky OAuth failed (HTTP ${tokenRes.status})`);
        }
        const tokenData = await tokenRes.json();
        this.oauthToken = tokenData.access_token;
        this.oauthExpiresAt = Date.now() + (tokenData.expires_in || 1800) * 1000;
      }
      return { Authorization: `Bearer ${this.oauthToken}` };
    }

    if (this.username && this.password) {
      const encoded = Buffer.from(`${this.username}:${this.password}`).toString('base64');
      return { Authorization: `Basic ${encoded}` };
    }

    return {};
  }

  async fetchOpenSky() {
    const now = Date.now();
    if (this.cachedOpenSky.length > 0 && now - this.lastOpenSkyFetchMs < this.pollIntervalMs) {
      const elapsedSec = (now - this.lastOpenSkySuccessMs) / 1000;
      return {
        ok: true,
        source: 'opensky',
        cached: true,
        updatedAt: this.lastOpenSkySuccessMs,
        flights: this.cachedOpenSky.map((f) => deadReckonFlight(f, elapsedSec))
      };
    }

    if (now < this.openSkyBackoffUntilMs) {
      const waitSec = Math.ceil((this.openSkyBackoffUntilMs - now) / 1000);
      return {
        ok: false,
        source: 'opensky',
        error: `${this.lastOpenSkyError || 'OpenSky 요청 제한'} (${waitSec}초 후 재시도)`,
        flights: []
      };
    }

    if (this.inFlightOpenSky) return this.inFlightOpenSky;
    this.inFlightOpenSky = this._doFetchOpenSky().finally(() => {
      this.inFlightOpenSky = null;
    });
    return this.inFlightOpenSky;
  }

  async _doFetchOpenSky() {
    this.lastOpenSkyFetchMs = Date.now();
    try {
      const headers = {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        ...(await this.getAuthHeaders())
      };

      const res = await fetch(OPENSKY_STATES_URL, {
        headers,
        signal: AbortSignal.timeout(6500)
      });

      if (!res.ok) {
        const msg = res.status === 429
          ? 'OpenSky 요청 한도 초과 (HTTP 429)'
          : `OpenSky 응답 오류 (HTTP ${res.status})`;
        this.lastOpenSkyError = msg;
        this.openSkyBackoffUntilMs = Date.now() + (res.status === 429 || res.status === 403 ? 120_000 : 45_000);
        this.diagnostics.opensky = { status: `HTTP ${res.status}`, count: 0, error: msg, at: new Date().toISOString() };
        return { ok: false, source: 'opensky', error: msg, flights: [] };
      }

      const data = await res.json();
      const rawStates = Array.isArray(data?.states) ? data.states : [];
      const nowSec = Math.floor(Date.now() / 1000);

      const parsed = [];
      for (const vec of rawStates) {
        const flight = parseOpenSkyStateVector(vec, nowSec);
        if (flight && !flight.onGround) {
          parsed.push(flight);
        }
      }

      const sampled = this.sampleEvenly(parsed, this.maxFlights);
      this.cachedOpenSky = sampled;
      this.lastOpenSkySuccessMs = Date.now();
      this.lastOpenSkyError = null;
      this.openSkyBackoffUntilMs = 0;
      this.diagnostics.opensky = { status: 'HTTP 200', count: parsed.length, error: null, at: new Date().toISOString() };

      return {
        ok: true,
        source: 'opensky',
        cached: false,
        totalRaw: parsed.length,
        updatedAt: this.lastOpenSkySuccessMs,
        flights: sampled
      };
    } catch (err) {
      const msg = err?.name === 'TimeoutError' || err?.name === 'AbortError'
        ? 'OpenSky 응답 시간 초과'
        : (err?.message || 'OpenSky Network에 연결할 수 없습니다');
      this.lastOpenSkyError = msg;
      this.openSkyBackoffUntilMs = Date.now() + 60_000;
      this.diagnostics.opensky = { status: 'ERROR', count: 0, error: msg, at: new Date().toISOString() };
      return { ok: false, source: 'opensky', error: msg, flights: [] };
    }
  }

  async fetchAdsbFi(lat = 37.46, lon = 126.44, distNm = 250) {
    try {
      const clampedDist = Math.max(10, Math.min(250, Math.round(distNm)));
      const url = `${ADSBFI_BASE_URL}/lat/${Number(lat).toFixed(3)}/lon/${Number(lon).toFixed(3)}/dist/${clampedDist}`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(7000)
      });

      if (!res.ok) {
        const msg = `adsb.fi HTTP ${res.status}`;
        this.diagnostics.adsbfi = { status: `HTTP ${res.status}`, count: 0, error: msg, at: new Date().toISOString() };
        return { ok: false, source: 'adsbfi', error: msg, flights: [] };
      }

      const data = await res.json();
      const list = Array.isArray(data?.aircraft) ? data.aircraft : (Array.isArray(data?.ac) ? data.ac : []);
      const nowSec = Math.floor(Date.now() / 1000);
      const flights = [];
      for (const ac of list) {
        const f = parseAdsbFiAircraft(ac, nowSec, 'adsbfi');
        if (f && !f.onGround) flights.push(f);
      }

      this.diagnostics.adsbfi = { status: 'HTTP 200', count: flights.length, error: null, at: new Date().toISOString() };
      return { ok: true, source: 'adsbfi', updatedAt: Date.now(), totalRaw: flights.length, flights };
    } catch (err) {
      const msg = err?.message || 'adsb.fi 연결 실패';
      this.diagnostics.adsbfi = { status: 'ERROR', count: 0, error: msg, at: new Date().toISOString() };
      return { ok: false, source: 'adsbfi', error: msg, flights: [] };
    }
  }

  async fetchAdsbLol(lat = 37.46, lon = 126.44, distNm = 250) {
    try {
      const clampedDist = Math.max(10, Math.min(250, Math.round(distNm)));
      const url = `${ADSBLOL_BASE_URL}/point/${Number(lat).toFixed(3)}/${Number(lon).toFixed(3)}/${clampedDist}`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(7000)
      });

      if (!res.ok) {
        const msg = `adsb.lol HTTP ${res.status}`;
        this.diagnostics.adsblol = { status: `HTTP ${res.status}`, count: 0, error: msg, at: new Date().toISOString() };
        return { ok: false, source: 'adsblol', error: msg, flights: [] };
      }

      const data = await res.json();
      const list = Array.isArray(data?.ac) ? data.ac : (Array.isArray(data?.aircraft) ? data.aircraft : []);
      const nowSec = Math.floor(Date.now() / 1000);
      const flights = [];
      for (const ac of list) {
        const f = parseAdsbFiAircraft(ac, nowSec, 'adsblol');
        if (f && !f.onGround) flights.push(f);
      }

      this.diagnostics.adsblol = { status: 'HTTP 200', count: flights.length, error: null, at: new Date().toISOString() };
      return { ok: true, source: 'adsblol', updatedAt: Date.now(), totalRaw: flights.length, flights };
    } catch (err) {
      const msg = err?.message || 'adsb.lol 연결 실패';
      this.diagnostics.adsblol = { status: 'ERROR', count: 0, error: msg, at: new Date().toISOString() };
      return { ok: false, source: 'adsblol', error: msg, flights: [] };
    }
  }

  _mergeIntoHubCache(flights) {
    const now = Date.now();
    for (const f of flights) {
      this.hubFlights.set(f.icao24, { flight: f, fetchedAt: now });
    }
    // Prune stale contacts older than 3 minutes
    for (const [key, entry] of this.hubFlights.entries()) {
      if (now - entry.fetchedAt > 180_000) {
        this.hubFlights.delete(key);
      }
    }
  }

  _getHubSnapshot() {
    const now = Date.now();
    const list = [];
    for (const entry of this.hubFlights.values()) {
      const ageSec = (now - entry.fetchedAt) / 1000;
      if (ageSec <= 180) {
        list.push(deadReckonFlight(entry.flight, Math.min(ageSec, 45)));
      }
    }
    return this.sampleEvenly(list, this.maxFlights);
  }

  _ensureHubHarvesterRunning() {
    if (this.harvesterTimer) return;
    // Gently harvest 1 global hub every 2.2s (well under 1 req/s rate limit) while users are active
    this.harvesterTimer = setInterval(async () => {
      if (Date.now() - this.lastClientActivityMs > 90_000) {
        clearInterval(this.harvesterTimer);
        this.harvesterTimer = null;
        return;
      }
      const hub = GLOBAL_LIVE_HUBS[this.hubCursor % GLOBAL_LIVE_HUBS.length];
      this.hubCursor++;
      const useLolFirst = this.hubCursor % 2 === 0;
      const primary = useLolFirst
        ? await this.fetchAdsbLol(hub.lat, hub.lon, 250)
        : await this.fetchAdsbFi(hub.lat, hub.lon, 250);
      if (primary.ok) {
        this._mergeIntoHubCache(primary.flights);
      } else {
        const backup = useLolFirst
          ? await this.fetchAdsbFi(hub.lat, hub.lon, 250)
          : await this.fetchAdsbLol(hub.lat, hub.lon, 250);
        if (backup.ok) this._mergeIntoHubCache(backup.flights);
      }
    }, 2200);
    if (typeof this.harvesterTimer.unref === 'function') {
      this.harvesterTimer.unref();
    }
  }

  async _bootstrapHubs(focusLat, focusLon) {
    // Query 2 different real-time ADS-B networks in parallel (1 req each, respects both rate limits)
    // - adsb.fi on the user's focused view (e.g. Korea/Asia)
    // - adsb.lol on London (Europe) so global flights populate immediately within ~1 second!
    const [r1, r2] = await Promise.all([
      this.fetchAdsbFi(focusLat, focusLon, 250),
      this.fetchAdsbLol(51.47, -0.45, 250)
    ]);
    if (r1.ok) this._mergeIntoHubCache(r1.flights);
    if (r2.ok) this._mergeIntoHubCache(r2.flights);

    // If focus area had 0 or adsb.fi failed, also try adsb.lol on focus area
    if ((!r1.ok || r1.flights.length === 0) && r2.ok) {
      const r3 = await this.fetchAdsbLol(focusLat, focusLon, 250);
      if (r3.ok) this._mergeIntoHubCache(r3.flights);
    }
  }

  async fetchLiveFlights({ provider = 'opensky', lat = 37.46, lon = 126.44, distNm = 250 } = {}) {
    this.lastClientActivityMs = Date.now();

    if (provider === 'adsbfi') {
      const fi = await this.fetchAdsbFi(lat, lon, distNm);
      if (fi.ok && fi.flights.length > 0) return fi;
      const lol = await this.fetchAdsbLol(lat, lon, distNm);
      if (lol.ok) {
        return {
          ...lol,
          notice: fi.ok ? null : `adsb.fi 일시 지연으로 adsb.lol 실시간(반경 ${distNm}NM) 수신 중`
        };
      }
      if (fi.ok) return fi; // genuinely 0 planes in this 250NM circle
      return {
        ok: false,
        source: 'adsbfi',
        error: `${fi.error || 'adsb.fi 실패'} / ${lol.error || 'adsb.lol 실패'}`,
        flights: []
      };
    }

    // Global mode: 1) Try OpenSky Network first
    const globalRes = await this.fetchOpenSky();
    if (globalRes.ok && globalRes.flights.length > 0) {
      return globalRes;
    }

    // 2) OpenSky rate-limited/blocked on cloud IP -> seamlessly harvest 100% REAL ADS-B from adsb.fi + adsb.lol across global hubs
    if (this.hubFlights.size === 0) {
      await this._bootstrapHubs(lat, lon);
    }
    this._ensureHubHarvesterRunning();

    const hubList = this._getHubSnapshot();
    if (hubList.length > 0) {
      return {
        ok: true,
        source: 'adsb-global',
        updatedAt: Date.now(),
        totalRaw: this.hubFlights.size,
        notice: `OpenSky 클라우드 IP 제한(${this.lastOpenSkyError || '429'})으로 adsb.fi + adsb.lol 글로벌 실시간 ADS-B 수집 중`,
        flights: hubList
      };
    }

    return {
      ok: false,
      source: 'opensky',
      error: `실시간 피드 수신 실패 — OpenSky: ${globalRes.error || '실패'} | adsb.fi: ${this.diagnostics.adsbfi.error || '0대'} | adsb.lol: ${this.diagnostics.adsblol.error || '0대'}`,
      flights: []
    };
  }

  sampleEvenly(list, limit) {
    if (list.length <= limit) return list;
    const step = list.length / limit;
    const result = [];
    for (let i = 0; i < limit; i++) {
      result.push(list[Math.floor(i * step)]);
    }
    return result;
  }

  getStatus() {
    return {
      authenticated: Boolean((this.clientId && this.clientSecret) || (this.username && this.password)),
      lastSuccessAt: this.lastOpenSkySuccessMs ? new Date(this.lastOpenSkySuccessMs).toISOString() : null,
      lastError: this.lastOpenSkyError,
      cachedOpenSkyCount: this.cachedOpenSky.length,
      hubAggregatedCount: this.hubFlights.size,
      backoffActive: Date.now() < this.openSkyBackoffUntilMs,
      diagnostics: this.diagnostics
    };
  }

  stop() {
    if (this.harvesterTimer) {
      clearInterval(this.harvesterTimer);
      this.harvesterTimer = null;
    }
  }
}

export { LiveAdsbClient as OpenSkyClient };
