const OPENSKY_STATES_URL = 'https://opensky-network.org/api/states/all';
const OPENSKY_OAUTH_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const ADSBFI_BASE_URL = 'https://opendata.adsb.fi/api/v3';
const ADSBLOL_BASE_URL = 'https://api.adsb.lol/v2';
const FLYITALY_GLOBAL_URL = 'https://api.flyitalyadsb.com/v2/lat/0/lon/0/dist/20040';

const USER_AGENT = 'AeroGlobe3D/1.3 (+https://github.com/knoxxr/flight-tracker-3d)';

// 96-cell seamless global grid (~463km / 250NM radius overlapping circles) covering:
// - All continents including inland/secondary cities
// - Oceanic island & coastal corridors (North Atlantic, Caribbean, North/South Pacific, Indian Ocean, Mediterranean)
export const GLOBAL_LIVE_HUBS = [
  // East Asia (Korea, Japan, China, Taiwan)
  { id: 'KR-N', name: 'Seoul/Incheon', lat: 37.5, lon: 126.9 },
  { id: 'KR-S', name: 'Busan/Jeju', lat: 34.3, lon: 127.8 },
  { id: 'JP-E', name: 'Tokyo/Kanto', lat: 35.7, lon: 139.8 },
  { id: 'JP-W', name: 'Osaka/Fukuoka', lat: 34.4, lon: 133.5 },
  { id: 'JP-N', name: 'Sapporo/Hokkaido', lat: 43.0, lon: 141.5 },
  { id: 'JP-S', name: 'Okinawa/Ryukyu', lat: 26.2, lon: 127.7 },
  { id: 'CN-N', name: 'Beijing/Tianjin', lat: 39.9, lon: 116.4 },
  { id: 'CN-NE', name: 'Shenyang/Harbin', lat: 43.8, lon: 125.3 },
  { id: 'CN-E', name: 'Shanghai/Nanjing', lat: 31.2, lon: 121.5 },
  { id: 'CN-C', name: 'Wuhan/Zhengzhou', lat: 32.0, lon: 114.0 },
  { id: 'CN-W', name: 'Chengdu/Chongqing', lat: 30.6, lon: 104.1 },
  { id: 'CN-S', name: 'Guangzhou/HongKong', lat: 22.8, lon: 113.6 },
  { id: 'CN-NW', name: 'Xian/Lanzhou', lat: 35.0, lon: 107.0 },
  { id: 'TW', name: 'Taipei/Taiwan', lat: 24.5, lon: 121.0 },

  // Europe (Full Continental + Nordics + Mediterranean + Islands)
  { id: 'UK-S', name: 'London/South UK', lat: 51.5, lon: -0.5 },
  { id: 'UK-N', name: 'Manchester/Scotland', lat: 55.2, lon: -3.2 },
  { id: 'IE', name: 'Dublin/Ireland', lat: 53.3, lon: -7.5 },
  { id: 'FR-N', name: 'Paris/Benelux', lat: 49.5, lon: 3.0 },
  { id: 'FR-S', name: 'Lyon/Marseille', lat: 44.5, lon: 4.5 },
  { id: 'ES-C', name: 'Madrid/Portugal', lat: 40.2, lon: -4.5 },
  { id: 'ES-E', name: 'Barcelona/Balearics', lat: 40.8, lon: 2.2 },
  { id: 'ES-S', name: 'Canary Islands', lat: 28.1, lon: -15.4 },
  { id: 'DE-W', name: 'Frankfurt/Amsterdam', lat: 50.8, lon: 7.2 },
  { id: 'DE-N', name: 'Berlin/Hamburg', lat: 53.0, lon: 12.0 },
  { id: 'DE-S', name: 'Munich/Zurich/Vienna', lat: 47.8, lon: 11.5 },
  { id: 'IT-N', name: 'Milan/Venice', lat: 45.4, lon: 10.5 },
  { id: 'IT-S', name: 'Rome/Naples/Sicily', lat: 40.5, lon: 14.5 },
  { id: 'NO', name: 'Oslo/Bergen', lat: 60.2, lon: 9.0 },
  { id: 'SE', name: 'Stockholm/Gothenburg', lat: 59.3, lon: 17.8 },
  { id: 'FI', name: 'Helsinki/Baltics', lat: 60.3, lon: 25.0 },
  { id: 'PL', name: 'Warsaw/Prague', lat: 51.5, lon: 19.5 },
  { id: 'RO', name: 'Bucharest/Budapest', lat: 45.8, lon: 23.0 },
  { id: 'GR', name: 'Athens/Aegean', lat: 38.0, lon: 23.8 },
  { id: 'TR-W', name: 'Istanbul/Ankara', lat: 40.8, lon: 30.0 },
  { id: 'TR-E', name: 'Antalya/Cyprus', lat: 36.2, lon: 34.0 },

  // North Atlantic Oceanic Corridors
  { id: 'ATL-IS', name: 'Reykjavik/Iceland', lat: 64.0, lon: -22.6 },
  { id: 'ATL-AZ', name: 'Azores/Mid-Atlantic', lat: 38.5, lon: -28.0 },
  { id: 'ATL-GL', name: 'Greenland/Nuuk', lat: 64.2, lon: -51.7 },
  { id: 'ATL-NL', name: 'Newfoundland/Gander', lat: 48.9, lon: -54.6 },
  { id: 'ATL-BM', name: 'Bermuda/W-Atlantic', lat: 32.3, lon: -64.8 },

  // North America (Full Continental USA, Canada, Mexico, Caribbean)
  { id: 'US-NE', name: 'New York/Boston', lat: 41.2, lon: -73.0 },
  { id: 'US-MA', name: 'Washington/Charlotte', lat: 37.2, lon: -78.5 },
  { id: 'US-SE', name: 'Atlanta/Nashville', lat: 34.0, lon: -84.5 },
  { id: 'US-FL', name: 'Miami/Orlando', lat: 27.0, lon: -81.0 },
  { id: 'US-GL', name: 'Chicago/Detroit', lat: 42.0, lon: -86.5 },
  { id: 'US-MN', name: 'Minneapolis/North Plains', lat: 45.0, lon: -94.0 },
  { id: 'US-MW', name: 'Kansas City/St Louis', lat: 38.8, lon: -93.0 },
  { id: 'US-TXN', name: 'Dallas/Oklahoma', lat: 33.2, lon: -97.0 },
  { id: 'US-TXS', name: 'Houston/New Orleans', lat: 29.8, lon: -94.5 },
  { id: 'US-CO', name: 'Denver/Rockies', lat: 39.8, lon: -105.0 },
  { id: 'US-AZ', name: 'Phoenix/Las Vegas', lat: 34.5, lon: -112.8 },
  { id: 'US-UT', name: 'Salt Lake/Idaho', lat: 41.5, lon: -112.0 },
  { id: 'US-SOCAL', name: 'Los Angeles/San Diego', lat: 33.9, lon: -118.2 },
  { id: 'US-NOCAL', name: 'San Francisco/Reno', lat: 38.0, lon: -122.0 },
  { id: 'US-NW', name: 'Seattle/Portland', lat: 46.8, lon: -122.3 },
  { id: 'CA-E', name: 'Toronto/Montreal', lat: 44.5, lon: -77.0 },
  { id: 'CA-W', name: 'Vancouver/Calgary', lat: 50.5, lon: -118.5 },
  { id: 'CA-C', name: 'Winnipeg/Central CA', lat: 49.9, lon: -97.2 },
  { id: 'US-AK', name: 'Anchorage/Alaska', lat: 61.2, lon: -150.0 },
  { id: 'MX-C', name: 'Mexico City/Guadalajara', lat: 19.6, lon: -99.5 },
  { id: 'MX-E', name: 'Cancun/Yucatan', lat: 21.0, lon: -87.0 },
  { id: 'CAR-E', name: 'Puerto Rico/Caribbean', lat: 18.4, lon: -66.0 },
  { id: 'CAR-W', name: 'Panama/Costa Rica', lat: 9.5, lon: -81.0 },

  // Pacific Ocean Corridors & Islands
  { id: 'PAC-HI', name: 'Honolulu/Hawaii', lat: 21.3, lon: -157.9 },
  { id: 'PAC-GU', name: 'Guam/Micronesia', lat: 13.5, lon: 144.8 },
  { id: 'PAC-FJ', name: 'Fiji/South Pacific', lat: -17.8, lon: 177.5 },
  { id: 'PAC-PF', name: 'Tahiti/French Polynesia', lat: -17.5, lon: -149.6 },

  // Southeast & South Asia
  { id: 'SEA-VN', name: 'Hanoi/Ho Chi Minh', lat: 14.5, lon: 107.0 },
  { id: 'SEA-TH', name: 'Bangkok/Myanmar', lat: 14.0, lon: 100.5 },
  { id: 'SEA-PH', name: 'Manila/Cebu', lat: 13.0, lon: 122.0 },
  { id: 'SEA-MY', name: 'Singapore/Kuala Lumpur', lat: 2.2, lon: 103.0 },
  { id: 'SEA-IDW', name: 'Jakarta/Java', lat: -6.5, lon: 108.0 },
  { id: 'SEA-IDE', name: 'Bali/Sulawesi', lat: -7.5, lon: 116.0 },
  { id: 'IN-N', name: 'Delhi/North India', lat: 28.5, lon: 77.2 },
  { id: 'IN-W', name: 'Mumbai/Ahmedabad', lat: 19.8, lon: 73.0 },
  { id: 'IN-S', name: 'Bengaluru/Chennai/SriLanka', lat: 12.5, lon: 78.5 },
  { id: 'IN-E', name: 'Kolkata/Dhaka', lat: 22.8, lon: 88.5 },
  { id: 'PK', name: 'Karachi/Lahore', lat: 28.0, lon: 70.0 },

  // Middle East & Indian Ocean
  { id: 'ME-AE', name: 'Dubai/Doha/Muscat', lat: 25.0, lon: 54.5 },
  { id: 'ME-SA', name: 'Riyadh/Jeddah', lat: 24.0, lon: 44.0 },
  { id: 'ME-IL', name: 'Cairo/Amman/Levant', lat: 30.5, lon: 33.5 },
  { id: 'IO-MV', name: 'Maldives/Indian Ocean', lat: 4.2, lon: 73.5 },
  { id: 'IO-MU', name: 'Mauritius/Reunion', lat: -20.3, lon: 57.5 },

  // Africa
  { id: 'AF-MA', name: 'Casablanca/Algiers', lat: 34.5, lon: -3.0 },
  { id: 'AF-NG', name: 'Lagos/West Africa', lat: 6.5, lon: 3.4 },
  { id: 'AF-ET', name: 'Addis Ababa/Nairobi', lat: 4.0, lon: 37.8 },
  { id: 'AF-ZA1', name: 'Johannesburg/Pretoria', lat: -26.1, lon: 28.2 },
  { id: 'AF-ZA2', name: 'Cape Town', lat: -33.9, lon: 18.6 },

  // South America
  { id: 'SA-CO', name: 'Bogota/Medellin', lat: 5.0, lon: -74.5 },
  { id: 'SA-PE', name: 'Lima/Quito', lat: -10.0, lon: -77.5 },
  { id: 'SA-BR1', name: 'Sao Paulo/Rio', lat: -23.2, lon: -45.5 },
  { id: 'SA-BR2', name: 'Brasilia/Salvador', lat: -15.0, lon: -44.0 },
  { id: 'SA-AR', name: 'Buenos Aires/Montevideo', lat: -34.6, lon: -58.4 },
  { id: 'SA-CL', name: 'Santiago/Chile', lat: -33.4, lon: -70.7 },

  // Oceania (Australia & New Zealand)
  { id: 'AU-SYD', name: 'Sydney/Brisbane', lat: -31.0, lon: 151.5 },
  { id: 'AU-MEL', name: 'Melbourne/Adelaide', lat: -37.2, lon: 143.0 },
  { id: 'AU-PER', name: 'Perth/West Australia', lat: -31.9, lon: 116.0 },
  { id: 'NZ', name: 'Auckland/Wellington', lat: -38.5, lon: 175.0 }
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
 * Parse an ADS-B Exchange v2 / adsb.fi v3 / adsb.lol v2 / FlyItalyADSB aircraft object.
 */
export function parseAdsbFiAircraft(ac, nowSec = Math.floor(Date.now() / 1000), source = 'adsbfi') {
  if (!ac || typeof ac.lat !== 'number' || typeof ac.lon !== 'number') return null;
  if (Number.isNaN(ac.lat) || Number.isNaN(ac.lon)) return null;
  const icao24 = String(ac.hex || '').trim().toLowerCase();
  if (!icao24) return null;

  const speedKts = typeof ac.gs === 'number' ? Math.round(ac.gs) : 0;
  const onGround = ac.alt_baro === 'ground' || (ac.alt_baro === 0 && speedKts < 45);
  const altFtRaw = typeof ac.alt_baro === 'number'
    ? ac.alt_baro
    : (typeof ac.alt_geom === 'number' ? ac.alt_geom : 0);
  const altitudeFt = Math.max(0, Math.round(altFtRaw));
  const altitudeM = Math.round(altitudeFt * 0.3048);

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
    originCountry: String(ac.ownOp || (source === 'adsblol' ? 'adsb.lol Live' : (source === 'flyitaly' ? 'FlyItalyADSB Live' : 'adsb.fi Live'))).trim(),
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
  if (!flight || flight.onGround || !flight.speedMs || elapsedSec <= 0 || elapsedSec > 180) {
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
    this.flyItalyKey = options.flyItalyKey || process.env.FLYITALY_API_KEY || '';
    this.flyItalyGlobal = String(options.flyItalyGlobal ?? process.env.FLYITALY_GLOBAL ?? '').toLowerCase() === 'true';

    this.pollIntervalMs = Number(options.pollIntervalMs || process.env.OPENSKY_POLL_INTERVAL_MS || 20000);
    // Virtually uncapped so global snapshots show ALL airborne aircraft worldwide
    this.maxFlights = Number(options.maxFlights || process.env.MAX_FLIGHTS || 15000);

    // Single-shot global snapshot caches
    this.cachedOpenSky = [];
    this.lastOpenSkyFetchMs = 0;
    this.lastOpenSkySuccessMs = 0;
    this.openSkyBackoffUntilMs = 0;
    this.lastOpenSkyError = null;
    this.inFlightOpenSky = null;
    this.oauthToken = null;
    this.oauthExpiresAt = 0;

    this.cachedFlyItaly = [];
    this.lastFlyItalyFetchMs = 0;
    this.lastFlyItalySuccessMs = 0;

    // 96-cell seamless global grid aggregator (adsb.fi + adsb.lol) + priority camera queue
    this.hubFlights = new Map(); // icao24 -> { flight, fetchedAt }
    this.scannedCells = new Set();
    this.hubCursor = 0;
    this.priorityQueue = [];
    this.harvesterTimer = null;
    this.harvesterBusy = false;
    this.lastClientActivityMs = Date.now();
    this.lastFocusQuery = { lat: null, lon: null, at: 0 };

    this.diagnostics = {
      opensky: { status: 'idle', count: 0, error: null, at: null },
      flyitaly: { status: 'idle', count: 0, error: null, at: null },
      adsbfi: { status: 'idle', count: 0, error: null, at: null },
      adsblol: { status: 'idle', count: 0, error: null, at: null }
    };
  }

  /**
   * Pre-warm the 96-cell global grid immediately on server startup so visitors see global traffic right away.
   */
  startWarmup() {
    this.lastClientActivityMs = Date.now();
    this._ensureHubHarvesterRunning();
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

  async fetchFlyItalyGlobal() {
    if (!this.flyItalyKey || !this.flyItalyGlobal) {
      return { ok: false, source: 'flyitaly', flights: [] };
    }
    const now = Date.now();
    if (this.cachedFlyItaly.length > 0 && now - this.lastFlyItalyFetchMs < 15_000) {
      const elapsedSec = (now - this.lastFlyItalySuccessMs) / 1000;
      return {
        ok: true,
        source: 'flyitaly',
        updatedAt: this.lastFlyItalySuccessMs,
        totalRaw: this.cachedFlyItaly.length,
        flights: this.cachedFlyItaly.map((f) => deadReckonFlight(f, elapsedSec))
      };
    }

    this.lastFlyItalyFetchMs = now;
    try {
      const res = await fetch(FLYITALY_GLOBAL_URL, {
        headers: {
          Accept: 'application/json',
          'X-Api-Key': this.flyItalyKey,
          'User-Agent': USER_AGENT
        },
        signal: AbortSignal.timeout(10_000)
      });
      if (!res.ok) {
        const msg = `FlyItalyADSB HTTP ${res.status}`;
        this.diagnostics.flyitaly = { status: `HTTP ${res.status}`, count: 0, error: msg, at: new Date().toISOString() };
        return { ok: false, source: 'flyitaly', error: msg, flights: [] };
      }
      const data = await res.json();
      const list = Array.isArray(data?.ac) ? data.ac : (Array.isArray(data?.aircraft) ? data.aircraft : []);
      const nowSec = Math.floor(Date.now() / 1000);
      const flights = [];
      for (const ac of list) {
        const f = parseAdsbFiAircraft(ac, nowSec, 'flyitaly');
        if (f && !f.onGround) flights.push(f);
      }
      this.cachedFlyItaly = this.sampleEvenly(flights, this.maxFlights);
      this.lastFlyItalySuccessMs = Date.now();
      this.diagnostics.flyitaly = { status: 'HTTP 200', count: flights.length, error: null, at: new Date().toISOString() };
      return {
        ok: true,
        source: 'flyitaly',
        updatedAt: this.lastFlyItalySuccessMs,
        totalRaw: flights.length,
        flights: this.cachedFlyItaly
      };
    } catch (err) {
      const msg = err?.message || 'FlyItalyADSB 연결 실패';
      this.diagnostics.flyitaly = { status: 'ERROR', count: 0, error: msg, at: new Date().toISOString() };
      return { ok: false, source: 'flyitaly', error: msg, flights: [] };
    }
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
        signal: AbortSignal.timeout(7500)
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
    // Retain contacts up to 4 minutes (smoothly dead-reckoned while 96 cells cycle every ~67s)
    for (const [key, entry] of this.hubFlights.entries()) {
      if (now - entry.fetchedAt > 240_000) {
        this.hubFlights.delete(key);
      }
    }
  }

  _getHubSnapshot() {
    const now = Date.now();
    const list = [];
    for (const entry of this.hubFlights.values()) {
      const ageSec = (now - entry.fetchedAt) / 1000;
      if (ageSec <= 240) {
        list.push(deadReckonFlight(entry.flight, Math.min(ageSec, 90)));
      }
    }
    return this.sampleEvenly(list, this.maxFlights);
  }

  _ensureHubHarvesterRunning() {
    if (this.harvesterTimer) return;
    // Dual-provider parallel sweep across 96 global cells:
    // Queries 1 cell on adsb.fi + 1 different cell on adsb.lol every 1.4s (~0.7 req/s each, well under 1 req/s limits)
    // Completes a full 96-cell planetary sweep in ~67 seconds!
    this.harvesterTimer = setInterval(async () => {
      if (Date.now() - this.lastClientActivityMs > 180_000 && this.scannedCells.size >= GLOBAL_LIVE_HUBS.length) {
        clearInterval(this.harvesterTimer);
        this.harvesterTimer = null;
        return;
      }
      if (this.harvesterBusy) return;
      this.harvesterBusy = true;
      try {
        const cellA = this.priorityQueue.length > 0
          ? this.priorityQueue.shift()
          : GLOBAL_LIVE_HUBS[this.hubCursor % GLOBAL_LIVE_HUBS.length];
        if (!cellA._priority) {
          this.hubCursor = (this.hubCursor + 1) % GLOBAL_LIVE_HUBS.length;
        }

        const cellB = this.priorityQueue.length > 0
          ? this.priorityQueue.shift()
          : GLOBAL_LIVE_HUBS[this.hubCursor % GLOBAL_LIVE_HUBS.length];
        if (!cellB._priority) {
          this.hubCursor = (this.hubCursor + 1) % GLOBAL_LIVE_HUBS.length;
        }

        const [resFi, resLol] = await Promise.all([
          this.fetchAdsbFi(cellA.lat, cellA.lon, 250),
          this.fetchAdsbLol(cellB.lat, cellB.lon, 250)
        ]);
        if (resFi.ok) {
          this._mergeIntoHubCache(resFi.flights);
          if (cellA.id) this.scannedCells.add(cellA.id);
        }
        if (resLol.ok) {
          this._mergeIntoHubCache(resLol.flights);
          if (cellB.id) this.scannedCells.add(cellB.id);
        }
      } finally {
        this.harvesterBusy = false;
      }
    }, 1400);
    if (typeof this.harvesterTimer.unref === 'function') {
      this.harvesterTimer.unref();
    }
  }

  _enqueueFocusAreaIfMoved(lat, lon) {
    const now = Date.now();
    const prev = this.lastFocusQuery;
    const movedEnough = prev.lat === null || Math.abs(lat - prev.lat) > 2.0 || Math.abs(lon - prev.lon) > 2.0;
    if (!movedEnough && now - prev.at < 10_000) return false;

    this.lastFocusQuery = { lat, lon, at: now };
    if (this.priorityQueue.length < 4) {
      this.priorityQueue.unshift({ lat, lon, _priority: true });
    }
    return true;
  }

  async fetchLiveFlights({ provider = 'opensky', lat = 37.46, lon = 126.44, distNm = 250 } = {}) {
    this.lastClientActivityMs = Date.now();

    if (provider === 'adsbfi') {
      const [fi, lol] = await Promise.all([
        this.fetchAdsbFi(lat, lon, distNm),
        this.fetchAdsbLol(lat, lon, distNm)
      ]);
      const merged = new Map();
      if (lol.ok) for (const f of lol.flights) merged.set(f.icao24, f);
      if (fi.ok) for (const f of fi.flights) merged.set(f.icao24, f);
      const combined = Array.from(merged.values());

      if (fi.ok || lol.ok) {
        this._mergeIntoHubCache(combined);
        return {
          ok: true,
          source: fi.ok && lol.ok ? 'adsb-local' : (fi.ok ? 'adsbfi' : 'adsblol'),
          updatedAt: Date.now(),
          totalRaw: combined.length,
          flights: combined
        };
      }
      return {
        ok: false,
        source: 'adsbfi',
        error: `${fi.error || 'adsb.fi 실패'} / ${lol.error || 'adsb.lol 실패'}`,
        flights: []
      };
    }

    // Global mode priority 1: FlyItalyADSB single-request global (~11,000 flights) if Pro key is configured
    if (this.flyItalyKey && this.flyItalyGlobal) {
      const fiGlobal = await this.fetchFlyItalyGlobal();
      if (fiGlobal.ok && fiGlobal.flights.length > 0) return fiGlobal;
    }

    // Global mode priority 2: OpenSky Network single-request global (up to 15,000 flights — ALL oceans & small cities)
    const globalRes = await this.fetchOpenSky();
    if (globalRes.ok && globalRes.flights.length > 0) {
      return globalRes;
    }

    // Global mode priority 3: 96-cell seamless planetary grid (adsb.fi + adsb.lol) + live camera focus
    this._ensureHubHarvesterRunning();
    const moved = this._enqueueFocusAreaIfMoved(lat, lon);
    if (this.hubFlights.size === 0 || moved) {
      // Immediately fetch the user's current camera center + one major hub so response is instant
      const [rFocus, rExtra] = await Promise.all([
        this.fetchAdsbFi(lat, lon, 250),
        this.hubFlights.size < 200 ? this.fetchAdsbLol(50.5, 6.0, 250) : this.fetchAdsbLol(lat, lon, 250)
      ]);
      if (rFocus.ok) this._mergeIntoHubCache(rFocus.flights);
      if (rExtra.ok) this._mergeIntoHubCache(rExtra.flights);
    }

    const hubList = this._getHubSnapshot();
    const scanProgress = {
      completed: this.scannedCells.size,
      total: GLOBAL_LIVE_HUBS.length
    };

    if (hubList.length > 0) {
      const done = scanProgress.completed >= scanProgress.total;
      return {
        ok: true,
        source: 'adsb-global',
        updatedAt: Date.now(),
        totalRaw: this.hubFlights.size,
        scanProgress,
        notice: done
          ? null
          : `전 세계 ${scanProgress.total}구역 실시간 스캔 중 (${scanProgress.completed}/${scanProgress.total}) — OpenSky 제한으로 adsb.fi+adsb.lol 통합 수신`,
        flights: hubList
      };
    }

    return {
      ok: false,
      source: 'opensky',
      scanProgress,
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
      flyItalyGlobalEnabled: Boolean(this.flyItalyKey && this.flyItalyGlobal),
      lastSuccessAt: this.lastOpenSkySuccessMs ? new Date(this.lastOpenSkySuccessMs).toISOString() : null,
      lastError: this.lastOpenSkyError,
      cachedOpenSkyCount: this.cachedOpenSky.length,
      hubAggregatedCount: this.hubFlights.size,
      scanProgress: {
        completed: this.scannedCells.size,
        total: GLOBAL_LIVE_HUBS.length
      },
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
