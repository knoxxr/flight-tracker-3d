// Browser-side 100% REAL-TIME ADS-B client (zero simulation).
// Primary: OpenSky Network global state vectors (https://opensky-network.org/api/states/all)
// Secondary: adsb.fi open data v3 regional real-time ADS-B (https://opendata.adsb.fi/api/v3/lat/{lat}/lon/{lon}/dist/250)

import { resolveAircraftCountry, decodeCallsign } from './aviation-meta.js';

const OPENSKY_URL = 'https://opensky-network.org/api/states/all';
const ADSBFI_BASE_URL = 'https://opendata.adsb.fi/api/v3';

export const STATIC_AIRPORTS = [
  { iata: 'ICN', name: '인천국제공항', lat: 37.4602, lon: 126.4407 },
  { iata: 'GMP', name: '김포국제공항', lat: 37.5583, lon: 126.7906 },
  { iata: 'CJU', name: '제주국제공항', lat: 33.5113, lon: 126.4930 },
  { iata: 'PUS', name: '김해국제공항', lat: 35.1796, lon: 128.9382 },
  { iata: 'NRT', name: '도쿄 나리타공항', lat: 35.7720, lon: 140.3929 },
  { iata: 'HND', name: '도쿄 하네다공항', lat: 35.5494, lon: 139.7798 },
  { iata: 'KIX', name: '오사카 간사이공항', lat: 34.4347, lon: 135.2440 },
  { iata: 'PEK', name: '베이징 수도공항', lat: 40.0799, lon: 116.6031 },
  { iata: 'PVG', name: '상하이 푸둥공항', lat: 31.1443, lon: 121.8083 },
  { iata: 'HKG', name: '홍콩국제공항', lat: 22.3080, lon: 113.9185 },
  { iata: 'TPE', name: '타이베이 타오위안', lat: 25.0797, lon: 121.2342 },
  { iata: 'SIN', name: '싱가포르 창이공항', lat: 1.3644, lon: 103.9915 },
  { iata: 'BKK', name: '방콕 수완나품공항', lat: 13.6900, lon: 100.7501 },
  { iata: 'KUL', name: '쿠알라룸푸르공항', lat: 2.7456, lon: 101.7072 },
  { iata: 'MNL', name: '마닐라공항', lat: 14.5086, lon: 121.0194 },
  { iata: 'CGK', name: '자카르타공항', lat: -6.1256, lon: 106.6559 },
  { iata: 'DEL', name: '델리공항', lat: 28.5562, lon: 77.1000 },
  { iata: 'BOM', name: '뭄바이공항', lat: 19.0896, lon: 72.8656 },
  { iata: 'SYD', name: '시드니공항', lat: -33.9399, lon: 151.1753 },
  { iata: 'MEL', name: '멜버른공항', lat: -37.6690, lon: 144.8410 },
  { iata: 'AKL', name: '오클랜드공항', lat: -37.0082, lon: 174.7850 },
  { iata: 'DXB', name: '두바이국제공항', lat: 25.2532, lon: 55.3657 },
  { iata: 'DOH', name: '도하 하마드공항', lat: 25.2731, lon: 51.6081 },
  { iata: 'IST', name: '이스탄불공항', lat: 41.2753, lon: 28.7519 },
  { iata: 'LHR', name: '런던 히드로공항', lat: 51.4700, lon: -0.4543 },
  { iata: 'CDG', name: '파리 샤를드골공항', lat: 49.0097, lon: 2.5479 },
  { iata: 'FRA', name: '프랑크푸르트공항', lat: 50.0379, lon: 8.5622 },
  { iata: 'AMS', name: '암스테르담 스키폴', lat: 52.3105, lon: 4.7683 },
  { iata: 'MAD', name: '마드리드공항', lat: 40.4983, lon: -3.5676 },
  { iata: 'FCO', name: '로마 피우미치노', lat: 41.8003, lon: 12.2389 },
  { iata: 'ZRH', name: '취리히공항', lat: 47.4582, lon: 8.5555 },
  { iata: 'HEL', name: '헬싱키공항', lat: 60.3172, lon: 24.9633 },
  { iata: 'JFK', name: '뉴욕 JFK 공항', lat: 40.6413, lon: -73.7781 },
  { iata: 'LAX', name: '로스앤젤레스공항', lat: 33.9416, lon: -118.4085 },
  { iata: 'SFO', name: '샌프란시스코공항', lat: 37.6213, lon: -122.3790 },
  { iata: 'ORD', name: '시카고 오헤어공항', lat: 41.9742, lon: -87.9073 },
  { iata: 'ATL', name: '애틀랜타공항', lat: 33.6407, lon: -84.4277 },
  { iata: 'DFW', name: '댈러스공항', lat: 32.8998, lon: -97.0403 },
  { iata: 'SEA', name: '시애틀공항', lat: 47.4502, lon: -122.3088 },
  { iata: 'MIA', name: '마이애미공항', lat: 25.7959, lon: -80.2870 },
  { iata: 'HNL', name: '호놀룰루공항', lat: 21.3187, lon: -157.9225 },
  { iata: 'YYZ', name: '토론토공항', lat: 43.6777, lon: -79.6248 },
  { iata: 'YVR', name: '밴쿠버공항', lat: 49.1947, lon: -123.1792 },
  { iata: 'MEX', name: '멕시코시티공항', lat: 19.4361, lon: -99.0719 },
  { iata: 'GRU', name: '상파울루공항', lat: -23.4356, lon: -46.4731 },
  { iata: 'EZE', name: '부에노스아이레스', lat: -34.8222, lon: -58.5358 },
  { iata: 'SCL', name: '산티아고공항', lat: -33.3930, lon: -70.7858 },
  { iata: 'CAI', name: '카이로공항', lat: 30.1219, lon: 31.4056 },
  { iata: 'ADD', name: '아디스아바바공항', lat: 8.9779, lon: 38.7993 },
  { iata: 'JNB', name: '요하네스버그공항', lat: -26.1367, lon: 28.2411 }
];

function parseOpenSkyVector(v, nowSec) {
  if (!Array.isArray(v) || typeof v[5] !== 'number' || typeof v[6] !== 'number') return null;
  if (v[8]) return null; // airborne only
  const icao24 = String(v[0] || '').trim().toLowerCase();
  if (!icao24) return null;

  const callsign = String(v[1] || '').trim() || icao24.toUpperCase();
  const country = resolveAircraftCountry(icao24, '', v[2]);
  const csInfo = decodeCallsign(callsign);
  const altM = Math.max(0, Math.round(typeof v[7] === 'number' ? v[7] : (typeof v[13] === 'number' ? v[13] : 0)));
  const geomAltM = typeof v[13] === 'number' ? Math.max(0, Math.round(v[13])) : null;
  const altGeomFt = geomAltM !== null ? Math.round(geomAltM * 3.28084) : null;
  const velMs = typeof v[9] === 'number' ? v[9] : 0;
  const vrateMs = typeof v[11] === 'number' ? v[11] : 0;
  const posSourceMap = { 0: 'ADS-B', 1: 'ASTERIX', 2: 'MLAT', 3: 'FLARM' };
  const positionSource = typeof v[16] === 'number' ? (posSourceMap[v[16]] || 'ADS-B') : 'ADS-B';

  return {
    icao24,
    callsign,
    iataFlight: csInfo?.iataFlight || null,
    airlineName: csInfo?.airlineKo || csInfo?.airlineEn || null,
    originCountry: country.nameKo,
    countryFlag: country.flag,
    countryIso: country.iso,
    aircraftType: 'ADS-B',
    aircraftLabel: 'Live Transponder',
    registration: icao24.toUpperCase(),
    squawk: v[14] ? String(v[14]).trim() : '----',
    lat: Number(v[6].toFixed(4)),
    lon: Number(v[5].toFixed(4)),
    altitudeM: altM,
    altitudeFt: Math.round(altM * 3.28084),
    altGeomFt,
    speedMs: Number(velMs.toFixed(1)),
    speedKts: Math.round(velMs * 1.94384),
    speedKmh: Math.round(velMs * 3.6),
    heading: typeof v[10] === 'number' ? Number((((v[10] % 360) + 360) % 360).toFixed(1)) : 0,
    verticalRateMs: Number(vrateMs.toFixed(2)),
    verticalRateFpm: Math.round(vrateMs * 196.85),
    onGround: false,
    positionSource,
    category: null,
    mach: null,
    ias: null,
    tas: null,
    navAltFt: null,
    navQnh: null,
    oat: null,
    windDir: null,
    windSpeedKts: null,
    emergency: null,
    year: null,
    rssi: null,
    messages: null,
    source: 'opensky',
    lastContact: typeof v[4] === 'number' ? v[4] : nowSec
  };
}

function parseAdsbFiItem(ac, nowSec) {
  if (!ac || typeof ac.lat !== 'number' || typeof ac.lon !== 'number') return null;
  if (ac.alt_baro === 'ground' || ac.alt_baro === 0) return null;
  const icao24 = String(ac.hex || '').trim().toLowerCase();
  if (!icao24) return null;

  const callsign = String(ac.flight || '').trim() || String(ac.r || '').trim() || icao24.toUpperCase();
  const registration = String(ac.r || icao24.toUpperCase()).trim();
  const country = resolveAircraftCountry(icao24, registration, '');
  const csInfo = decodeCallsign(callsign);
  const altFt = Math.max(0, Math.round(typeof ac.alt_baro === 'number' ? ac.alt_baro : (typeof ac.alt_geom === 'number' ? ac.alt_geom : 0)));
  const altGeomFt = typeof ac.alt_geom === 'number' ? Math.max(0, Math.round(ac.alt_geom)) : null;
  const speedKts = typeof ac.gs === 'number' ? Math.round(ac.gs) : 0;
  const vrateFpm = typeof ac.baro_rate === 'number'
    ? Math.round(ac.baro_rate)
    : (typeof ac.geom_rate === 'number' ? Math.round(ac.geom_rate) : 0);
  const seen = typeof ac.seen_pos === 'number'
    ? Math.round(ac.seen_pos)
    : (typeof ac.seen === 'number' ? Math.round(ac.seen) : 0);
  const navAltFt = typeof ac.nav_altitude_mcp === 'number'
    ? Math.round(ac.nav_altitude_mcp)
    : (typeof ac.nav_altitude_fms === 'number' ? Math.round(ac.nav_altitude_fms) : null);

  return {
    icao24,
    callsign,
    iataFlight: csInfo?.iataFlight || null,
    airlineName: csInfo?.airlineKo || String(ac.ownOp || '').trim() || null,
    originCountry: country.nameKo,
    countryFlag: country.flag,
    countryIso: country.iso,
    aircraftType: String(ac.t || 'ADS-B').trim(),
    aircraftLabel: String(ac.desc || ac.t || 'Live Transponder').trim(),
    registration,
    squawk: ac.squawk ? String(ac.squawk).trim() : '----',
    lat: Number(ac.lat.toFixed(4)),
    lon: Number(ac.lon.toFixed(4)),
    altitudeM: Math.round(altFt * 0.3048),
    altitudeFt: altFt,
    altGeomFt,
    speedMs: Number((speedKts * 0.514444).toFixed(1)),
    speedKts,
    speedKmh: Math.round(speedKts * 1.852),
    heading: typeof ac.track === 'number' ? Number((((ac.track % 360) + 360) % 360).toFixed(1)) : 0,
    verticalRateMs: Number((vrateFpm * 0.00508).toFixed(2)),
    verticalRateFpm: vrateFpm,
    onGround: false,
    positionSource: ac.type ? String(ac.type).toUpperCase().replace('_ICAO', '') : 'ADS-B',
    category: ac.category ? String(ac.category).trim() : null,
    mach: typeof ac.mach === 'number' ? Number(ac.mach.toFixed(3)) : null,
    ias: typeof ac.ias === 'number' ? Math.round(ac.ias) : null,
    tas: typeof ac.tas === 'number' ? Math.round(ac.tas) : null,
    navAltFt,
    navQnh: typeof ac.nav_qnh === 'number' ? Number(ac.nav_qnh.toFixed(1)) : null,
    oat: typeof ac.oat === 'number' ? Math.round(ac.oat) : (typeof ac.tat === 'number' ? Math.round(ac.tat) : null),
    windDir: typeof ac.wd === 'number' ? Math.round(ac.wd) : null,
    windSpeedKts: typeof ac.ws === 'number' ? Math.round(ac.ws) : null,
    emergency: ac.emergency && ac.emergency !== 'none' ? String(ac.emergency) : null,
    year: ac.year ? String(ac.year).trim() : null,
    rssi: typeof ac.rssi === 'number' ? Number(ac.rssi.toFixed(1)) : null,
    messages: typeof ac.messages === 'number' ? ac.messages : null,
    source: 'adsbfi',
    lastContact: Math.max(0, nowSec - seen)
  };
}

export class LiveBrowserAdsbClient {
  constructor() {
    this.maxFlights = 15000;
    this.openSkyBackoffUntil = 0;
    this.lastOpenSkyFetch = 0;
    this.lastOpenSkyError = null;
    this.lastAdsbFiFetch = 0;
    this.lastAdsbFiKey = '';
  }

  async fetchOpenSky(force = false) {
    const now = Date.now();
    if (!force && now < this.openSkyBackoffUntil) {
      const waitSec = Math.ceil((this.openSkyBackoffUntil - now) / 1000);
      return {
        ok: false,
        source: 'opensky',
        error: `${this.lastOpenSkyError || 'OpenSky 요청 제한'} (${waitSec}초 후 재시도)`,
        flights: []
      };
    }

    this.lastOpenSkyFetch = now;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      const res = await fetch(OPENSKY_URL, { signal: controller.signal });
      clearTimeout(timer);

      if (res.status === 429) {
        this.lastOpenSkyError = 'OpenSky 요청 한도 초과 (HTTP 429)';
        this.openSkyBackoffUntil = now + 60000;
        return { ok: false, source: 'opensky', error: this.lastOpenSkyError, flights: [] };
      }
      if (!res.ok) {
        this.lastOpenSkyError = `OpenSky 응답 오류 (HTTP ${res.status})`;
        this.openSkyBackoffUntil = now + 30000;
        return { ok: false, source: 'opensky', error: this.lastOpenSkyError, flights: [] };
      }

      const data = await res.json();
      const states = Array.isArray(data?.states) ? data.states : [];
      const nowSec = Math.floor(now / 1000);
      const parsed = [];
      for (const v of states) {
        const f = parseOpenSkyVector(v, nowSec);
        if (f) parsed.push(f);
      }

      const sampled = [];
      const step = parsed.length > this.maxFlights ? parsed.length / this.maxFlights : 1;
      for (let i = 0; i < Math.min(this.maxFlights, parsed.length); i++) {
        sampled.push(parsed[Math.floor(i * step)]);
      }

      this.lastOpenSkyError = null;
      this.openSkyBackoffUntil = 0;
      return {
        ok: true,
        source: 'opensky',
        totalRaw: parsed.length,
        updatedAt: Date.now(),
        flights: sampled
      };
    } catch (err) {
      this.lastOpenSkyError = err?.name === 'AbortError'
        ? 'OpenSky 응답 시간 초과'
        : 'OpenSky Network에 연결할 수 없습니다';
      this.openSkyBackoffUntil = now + 25000;
      return { ok: false, source: 'opensky', error: this.lastOpenSkyError, flights: [] };
    }
  }

  async fetchAdsbFi(lat = 37.46, lon = 126.44, distNm = 250) {
    const now = Date.now();
    const key = `${Math.round(lat)}:${Math.round(lon)}`;
    // Respect adsb.fi 1 req/s rate limit
    if (now - this.lastAdsbFiFetch < 2500 && key === this.lastAdsbFiKey) {
      return { ok: false, skipped: true, source: 'adsbfi', flights: [] };
    }
    this.lastAdsbFiFetch = now;
    this.lastAdsbFiKey = key;

    try {
      const clampedDist = Math.max(10, Math.min(250, Math.round(distNm)));
      const url = `${ADSBFI_BASE_URL}/lat/${Number(lat).toFixed(3)}/lon/${Number(lon).toFixed(3)}/dist/${clampedDist}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (res.status === 429) {
        return { ok: false, source: 'adsbfi', error: 'adsb.fi 요청 한도 초과 (HTTP 429)', flights: [] };
      }
      if (!res.ok) {
        return { ok: false, source: 'adsbfi', error: `adsb.fi 응답 오류 (HTTP ${res.status})`, flights: [] };
      }

      const data = await res.json();
      const list = Array.isArray(data?.aircraft) ? data.aircraft : (Array.isArray(data?.ac) ? data.ac : []);
      const nowSec = Math.floor(Date.now() / 1000);
      const flights = [];
      for (const ac of list) {
        const f = parseAdsbFiItem(ac, nowSec);
        if (f) flights.push(f);
      }

      return {
        ok: true,
        source: 'adsbfi',
        totalRaw: flights.length,
        updatedAt: Date.now(),
        flights
      };
    } catch (err) {
      return {
        ok: false,
        source: 'adsbfi',
        error: err?.name === 'AbortError' ? 'adsb.fi 응답 시간 초과' : 'adsb.fi에 연결할 수 없습니다',
        flights: []
      };
    }
  }

  async fetchLive({ provider = 'opensky', lat = 37.46, lon = 126.44, force = false } = {}) {
    if (provider === 'adsbfi') {
      const regional = await this.fetchAdsbFi(lat, lon, 250);
      return {
        ok: regional.ok,
        skipped: Boolean(regional.skipped),
        activeSource: 'adsbfi',
        notice: null,
        error: regional.ok ? null : (regional.error || null),
        updatedAt: regional.updatedAt || null,
        totalRaw: regional.totalRaw ?? regional.flights.length,
        flights: regional.flights || []
      };
    }

    const globalRes = await this.fetchOpenSky(force);
    if (globalRes.ok) {
      return {
        ok: true,
        activeSource: 'opensky',
        notice: null,
        error: null,
        updatedAt: globalRes.updatedAt,
        totalRaw: globalRes.totalRaw,
        flights: globalRes.flights
      };
    }

    // Automatic failover to another 100% real-time ADS-B network (adsb.fi) around current camera view
    const regionalRes = await this.fetchAdsbFi(lat, lon, 250);
    if (regionalRes.ok) {
      return {
        ok: true,
        activeSource: 'adsbfi',
        notice: `OpenSky 일시 제한으로 현재 화면 중심 adsb.fi 실시간 ADS-B(반경 250NM) 수신 중`,
        error: null,
        updatedAt: regionalRes.updatedAt,
        totalRaw: regionalRes.totalRaw,
        flights: regionalRes.flights
      };
    }

    return {
      ok: false,
      activeSource: 'opensky',
      notice: null,
      error: globalRes.error || regionalRes.error || '실시간 ADS-B 피드에 연결할 수 없습니다',
      updatedAt: null,
      totalRaw: 0,
      flights: []
    };
  }
}
