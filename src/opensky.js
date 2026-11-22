const OPENSKY_STATES_URL = 'https://opensky-network.org/api/states/all';
const OPENSKY_OAUTH_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const ADSBFI_BASE_URL = 'https://opendata.adsb.fi/api/v3';

/**
 * Parse a raw 17-element OpenSky state vector array into a normalized live ADS-B flight object.
 * Spec: https://openskynetwork.github.io/opensky-api/rest.html#all-state-vectors
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
 * Parse an adsb.fi v3 / ADS-B Exchange v2 aircraft object into the same normalized live flight object.
 */
export function parseAdsbFiAircraft(ac, nowSec = Math.floor(Date.now() / 1000)) {
  if (!ac || typeof ac.lat !== 'number' || typeof ac.lon !== 'number') return null;
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
  const heading = typeof ac.track === 'number' ? ((ac.track % 360) + 360) % 360 : 0;
  const verticalRateFpm = typeof ac.baro_rate === 'number'
    ? Math.round(ac.baro_rate)
    : (typeof ac.geom_rate === 'number' ? Math.round(ac.geom_rate) : 0);
  const verticalRateMs = Number((verticalRateFpm * 0.00508).toFixed(2));

  const callsign = String(ac.flight || '').trim() || String(ac.r || '').trim() || icao24.toUpperCase();
  const seenSec = typeof ac.seen === 'number' ? Math.round(ac.seen) : 0;

  return {
    icao24,
    callsign,
    originCountry: String(ac.ownOp || ac.dbFlags ? (ac.ownOp || 'Live ADS-B') : 'Live ADS-B'),
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
    source: 'adsbfi',
    lastContact: Math.max(0, nowSec - seenSec)
  };
}

/**
 * Dead-reckon a live ADS-B aircraft position forward by elapsedSec using its speed and true track.
 */
export function deadReckonFlight(flight, elapsedSec) {
  if (!flight || flight.onGround || !flight.speedMs || elapsedSec <= 0 || elapsedSec > 60) {
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

    this.cachedOpenSky = [];
    this.lastOpenSkyFetchMs = 0;
    this.lastOpenSkySuccessMs = 0;
    this.openSkyBackoffUntilMs = 0;
    this.lastOpenSkyError = null;
    this.inFlightOpenSky = null;

    this.oauthToken = null;
    this.oauthExpiresAt = 0;
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
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: AbortSignal.timeout(7000)
        });
        if (!tokenRes.ok) {
          throw new Error(`OpenSky OAuth failed (${tokenRes.status})`);
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
        'User-Agent': 'AeroGlobe3D/1.0 (+https://github.com/knoxxr/flight-tracker-3d)',
        ...(await this.getAuthHeaders())
      };

      const res = await fetch(OPENSKY_STATES_URL, {
        headers,
        signal: AbortSignal.timeout(9000)
      });

      if (res.status === 429) {
        this.lastOpenSkyError = 'OpenSky 요청 한도 초과 (HTTP 429)';
        this.openSkyBackoffUntilMs = Date.now() + 60_000;
        return { ok: false, source: 'opensky', error: this.lastOpenSkyError, flights: [] };
      }

      if (!res.ok) {
        this.lastOpenSkyError = `OpenSky 응답 오류 (HTTP ${res.status})`;
        this.openSkyBackoffUntilMs = Date.now() + 30_000;
        return { ok: false, source: 'opensky', error: this.lastOpenSkyError, flights: [] };
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

      return {
        ok: true,
        source: 'opensky',
        cached: false,
        totalRaw: parsed.length,
        updatedAt: this.lastOpenSkySuccessMs,
        flights: sampled
      };
    } catch (err) {
      this.lastOpenSkyError = err?.message || 'OpenSky Network에 연결할 수 없습니다';
      this.openSkyBackoffUntilMs = Date.now() + 25_000;
      return { ok: false, source: 'opensky', error: this.lastOpenSkyError, flights: [] };
    }
  }

  async fetchAdsbFi(lat = 37.46, lon = 126.44, distNm = 250) {
    try {
      const clampedDist = Math.max(10, Math.min(250, Math.round(distNm)));
      const url = `${ADSBFI_BASE_URL}/lat/${Number(lat).toFixed(3)}/lon/${Number(lon).toFixed(3)}/dist/${clampedDist}`;
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'AeroGlobe3D/1.0 (+https://github.com/knoxxr/flight-tracker-3d)'
        },
        signal: AbortSignal.timeout(8000)
      });

      if (!res.ok) {
        return { ok: false, source: 'adsbfi', error: `adsb.fi 응답 오류 (HTTP ${res.status})`, flights: [] };
      }

      const data = await res.json();
      const list = Array.isArray(data?.aircraft) ? data.aircraft : (Array.isArray(data?.ac) ? data.ac : []);
      const nowSec = Math.floor(Date.now() / 1000);
      const flights = [];
      for (const ac of list) {
        const f = parseAdsbFiAircraft(ac, nowSec);
        if (f && !f.onGround) flights.push(f);
      }

      return {
        ok: true,
        source: 'adsbfi',
        updatedAt: Date.now(),
        totalRaw: flights.length,
        flights
      };
    } catch (err) {
      return {
        ok: false,
        source: 'adsbfi',
        error: err?.message || 'adsb.fi에 연결할 수 없습니다',
        flights: []
      };
    }
  }

  async fetchLiveFlights({ provider = 'opensky', lat = 37.46, lon = 126.44, distNm = 250 } = {}) {
    if (provider === 'adsbfi') {
      return this.fetchAdsbFi(lat, lon, distNm);
    }

    const globalRes = await this.fetchOpenSky();
    if (globalRes.ok) return globalRes;

    // If OpenSky is temporarily unavailable/rate-limited, try real live adsb.fi around camera center
    const regionalRes = await this.fetchAdsbFi(lat, lon, distNm);
    if (regionalRes.ok) {
      return {
        ...regionalRes,
        notice: `OpenSky 일시 제한으로 adsb.fi 실시간 지역 피드(반경 ${distNm}NM)로 수신 중`
      };
    }

    return {
      ok: false,
      source: 'opensky',
      error: globalRes.error || regionalRes.error || '실시간 ADS-B 피드에 연결할 수 없습니다',
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
      cachedCount: this.cachedOpenSky.length,
      backoffActive: Date.now() < this.openSkyBackoffUntilMs
    };
  }
}

// Keep backward-compatible named export alias
export { LiveAdsbClient as OpenSkyClient };
