const OPENSKY_STATES_URL = 'https://opensky-network.org/api/states/all';
const OPENSKY_OAUTH_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

/**
 * Parse a raw 17-element OpenSky state vector array into a normalized flight telemetry object.
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
    flightNumber: callsign,
    airline: originCountry,
    originCountry,
    aircraftType: 'ADS-B',
    aircraftLabel: 'Live ADS-B Transponder',
    registration: icao24.toUpperCase(),
    squawk,
    origin: null,
    originName: null,
    destination: null,
    destinationName: null,
    originCoords: null,
    destCoords: null,
    distanceKm: null,
    remainingKm: null,
    etaMinutes: null,
    progress: null,
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

export class OpenSkyClient {
  constructor(options = {}) {
    this.username = options.username || process.env.OPENSKY_USERNAME || '';
    this.password = options.password || process.env.OPENSKY_PASSWORD || '';
    this.clientId = options.clientId || process.env.OPENSKY_CLIENT_ID || '';
    this.clientSecret = options.clientSecret || process.env.OPENSKY_CLIENT_SECRET || '';
    this.pollIntervalMs = Number(options.pollIntervalMs || process.env.OPENSKY_POLL_INTERVAL_MS || 15000);
    this.maxFlights = Number(options.maxFlights || process.env.MAX_FLIGHTS || 600);

    this.cachedFlights = [];
    this.lastFetchMs = 0;
    this.lastSuccessMs = 0;
    this.lastError = null;
    this.oauthToken = null;
    this.oauthExpiresAt = 0;
    this.inFlightRequest = null;
    this.backoffUntilMs = 0;
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

  async fetchFlights(bounds = null) {
    const now = Date.now();

    // Respect cache & rate-limit backoff window
    if (this.cachedFlights.length > 0 && now - this.lastFetchMs < this.pollIntervalMs) {
      const elapsedSec = (now - this.lastSuccessMs) / 1000;
      return {
        ok: true,
        cached: true,
        flights: this.cachedFlights.map((f) => deadReckonFlight(f, elapsedSec))
      };
    }

    if (now < this.backoffUntilMs) {
      return {
        ok: false,
        error: this.lastError || 'OpenSky rate-limit backoff active',
        flights: []
      };
    }

    if (this.inFlightRequest) {
      return this.inFlightRequest;
    }

    this.inFlightRequest = this._doFetch(bounds).finally(() => {
      this.inFlightRequest = null;
    });

    return this.inFlightRequest;
  }

  async _doFetch(bounds) {
    this.lastFetchMs = Date.now();
    try {
      const url = new URL(OPENSKY_STATES_URL);
      if (bounds) {
        url.searchParams.set('lamin', String(bounds.lamin));
        url.searchParams.set('lomin', String(bounds.lomin));
        url.searchParams.set('lamax', String(bounds.lamax));
        url.searchParams.set('lomax', String(bounds.lomax));
      }

      const headers = {
        Accept: 'application/json',
        'User-Agent': 'FlightTracker3D/1.0',
        ...(await this.getAuthHeaders())
      };

      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(8000)
      });

      if (res.status === 429) {
        this.lastError = 'OpenSky API rate limit reached (HTTP 429)';
        this.backoffUntilMs = Date.now() + 60_000;
        return { ok: false, error: this.lastError, flights: [] };
      }

      if (!res.ok) {
        this.lastError = `OpenSky API error (HTTP ${res.status})`;
        this.backoffUntilMs = Date.now() + 30_000;
        return { ok: false, error: this.lastError, flights: [] };
      }

      const data = await res.json();
      const rawStates = Array.isArray(data?.states) ? data.states : [];
      const nowSec = Math.floor(Date.now() / 1000);

      // Prefer airborne aircraft with callsigns, evenly sampled across globe
      const parsed = [];
      for (const vec of rawStates) {
        const flight = parseOpenSkyStateVector(vec, nowSec);
        if (flight && !flight.onGround) {
          parsed.push(flight);
        }
      }

      const sampled = this.sampleEvenly(parsed, this.maxFlights);
      this.cachedFlights = sampled;
      this.lastSuccessMs = Date.now();
      this.lastError = null;
      this.backoffUntilMs = 0;

      return {
        ok: true,
        cached: false,
        totalRaw: parsed.length,
        flights: sampled
      };
    } catch (err) {
      this.lastError = err?.message || 'Unable to reach OpenSky Network';
      this.backoffUntilMs = Date.now() + 30_000;
      return { ok: false, error: this.lastError, flights: [] };
    }
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
      lastSuccessAt: this.lastSuccessMs ? new Date(this.lastSuccessMs).toISOString() : null,
      lastError: this.lastError,
      cachedCount: this.cachedFlights.length,
      backoffActive: Date.now() < this.backoffUntilMs
    };
  }
}
