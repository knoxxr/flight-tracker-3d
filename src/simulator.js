import { AIRPORTS, AIRPORT_MAP } from './airports.js';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371.0088;

export const AIRLINES = [
  { code: 'KAL', iata: 'KE', name: '대한항공 (Korean Air)', country: 'South Korea', hubs: ['ICN', 'GMP'] },
  { code: 'AAR', iata: 'OZ', name: '아시아나항공 (Asiana)', country: 'South Korea', hubs: ['ICN', 'GMP'] },
  { code: 'JNA', iata: 'LJ', name: '진에어 (Jin Air)', country: 'South Korea', hubs: ['ICN', 'CJU', 'PUS'] },
  { code: 'JJA', iata: '7C', name: '제주항공 (Jeju Air)', country: 'South Korea', hubs: ['ICN', 'GMP', 'CJU'] },
  { code: 'JAL', iata: 'JL', name: '일본항공 (JAL)', country: 'Japan', hubs: ['HND', 'NRT', 'KIX'] },
  { code: 'ANA', iata: 'NH', name: '전일본공수 (ANA)', country: 'Japan', hubs: ['HND', 'NRT', 'KIX'] },
  { code: 'SIA', iata: 'SQ', name: '싱가포르항공 (Singapore Airlines)', country: 'Singapore', hubs: ['SIN'] },
  { code: 'CPA', iata: 'CX', name: '캐세이퍼시픽 (Cathay Pacific)', country: 'Hong Kong', hubs: ['HKG'] },
  { code: 'EVA', iata: 'BR', name: '에바항공 (EVA Air)', country: 'Taiwan', hubs: ['TPE'] },
  { code: 'CCA', iata: 'CA', name: '중국국제항공 (Air China)', country: 'China', hubs: ['PEK', 'PVG'] },
  { code: 'CES', iata: 'MU', name: '중국동방항공 (China Eastern)', country: 'China', hubs: ['PVG'] },
  { code: 'THA', iata: 'TG', name: '타이항공 (Thai Airways)', country: 'Thailand', hubs: ['BKK'] },
  { code: 'UAE', iata: 'EK', name: '에미레이트항공 (Emirates)', country: 'UAE', hubs: ['DXB'] },
  { code: 'QTR', iata: 'QR', name: '카타르항공 (Qatar Airways)', country: 'Qatar', hubs: ['DOH'] },
  { code: 'THY', iata: 'TK', name: '터키항공 (Turkish Airlines)', country: 'Turkey', hubs: ['IST'] },
  { code: 'DLH', iata: 'LH', name: '루프트한자 (Lufthansa)', country: 'Germany', hubs: ['FRA', 'MUC'] },
  { code: 'BAW', iata: 'BA', name: '영국항공 (British Airways)', country: 'United Kingdom', hubs: ['LHR'] },
  { code: 'AFR', iata: 'AF', name: '에어프랑스 (Air France)', country: 'France', hubs: ['CDG'] },
  { code: 'KLM', iata: 'KL', name: 'KLM 네덜란드항공', country: 'Netherlands', hubs: ['AMS'] },
  { code: 'FIN', iata: 'AY', name: '핀에어 (Finnair)', country: 'Finland', hubs: ['HEL'] },
  { code: 'SWR', iata: 'LX', name: '스위스국제항공 (SWISS)', country: 'Switzerland', hubs: ['ZRH'] },
  { code: 'IBE', iata: 'IB', name: '이베리아항공 (Iberia)', country: 'Spain', hubs: ['MAD'] },
  { code: 'UAL', iata: 'UA', name: '유나이티드항공 (United)', country: 'United States', hubs: ['SFO', 'ORD', 'LAX', 'JFK'] },
  { code: 'DAL', iata: 'DL', name: '델타항공 (Delta)', country: 'United States', hubs: ['ATL', 'SEA', 'JFK', 'LAX'] },
  { code: 'AAL', iata: 'AA', name: '아메리칸항공 (American)', country: 'United States', hubs: ['DFW', 'MIA', 'JFK', 'LAX'] },
  { code: 'ACA', iata: 'AC', name: '에어캐나다 (Air Canada)', country: 'Canada', hubs: ['YYZ', 'YVR'] },
  { code: 'QFA', iata: 'QF', name: '콴타스항공 (Qantas)', country: 'Australia', hubs: ['SYD', 'MEL', 'PER'] },
  { code: 'ANZ', iata: 'NZ', name: '에어뉴질랜드 (Air New Zealand)', country: 'New Zealand', hubs: ['AKL'] },
  { code: 'AIC', iata: 'AI', name: '에어인디아 (Air India)', country: 'India', hubs: ['DEL', 'BOM'] },
  { code: 'LAN', iata: 'LA', name: '라탐항공 (LATAM)', country: 'Chile', hubs: ['SCL', 'GRU', 'LIM'] },
  { code: 'ETH', iata: 'ET', name: '에티오피아항공 (Ethiopian)', country: 'Ethiopia', hubs: ['ADD'] },
  { code: 'SAA', iata: 'SA', name: '남아프리카항공 (SAA)', country: 'South Africa', hubs: ['JNB', 'CPT'] }
];

const WIDEBODY_TYPES = [
  { model: 'B77W', label: 'Boeing 777-300ER', cruiseFt: 36000, cruiseKts: 495 },
  { model: 'A359', label: 'Airbus A350-900', cruiseFt: 39000, cruiseKts: 490 },
  { model: 'B789', label: 'Boeing 787-9 Dreamliner', cruiseFt: 40000, cruiseKts: 488 },
  { model: 'A388', label: 'Airbus A380-800', cruiseFt: 38000, cruiseKts: 492 },
  { model: 'B748', label: 'Boeing 747-8I', cruiseFt: 37000, cruiseKts: 500 },
  { model: 'A333', label: 'Airbus A330-300', cruiseFt: 36000, cruiseKts: 472 }
];

const NARROWBODY_TYPES = [
  { model: 'B738', label: 'Boeing 737-800', cruiseFt: 34000, cruiseKts: 445 },
  { model: 'B38M', label: 'Boeing 737 MAX 8', cruiseFt: 35000, cruiseKts: 452 },
  { model: 'A21N', label: 'Airbus A321neo', cruiseFt: 35000, cruiseKts: 450 },
  { model: 'A320', label: 'Airbus A320-200', cruiseFt: 33000, cruiseKts: 440 }
];

// Curated global corridors representing real high-traffic international & regional routes
const MAJOR_ROUTES = [
  // Korea / East Asia
  ['ICN', 'JFK'], ['ICN', 'LAX'], ['ICN', 'SFO'], ['ICN', 'SEA'], ['ICN', 'YVR'],
  ['ICN', 'LHR'], ['ICN', 'CDG'], ['ICN', 'FRA'], ['ICN', 'AMS'], ['ICN', 'FCO'],
  ['ICN', 'HEL'], ['ICN', 'IST'], ['ICN', 'DXB'], ['ICN', 'DOH'], ['ICN', 'SIN'],
  ['ICN', 'BKK'], ['ICN', 'HKG'], ['ICN', 'TPE'], ['ICN', 'NRT'], ['ICN', 'KIX'],
  ['ICN', 'PVG'], ['ICN', 'PEK'], ['ICN', 'SYD'], ['ICN', 'HNL'], ['ICN', 'SGN'],
  ['ICN', 'MNL'], ['ICN', 'DEL'], ['GMP', 'HND'], ['GMP', 'CJU'], ['PUS', 'NRT'],
  ['PUS', 'CJU'], ['ICN', 'ANC'], ['ICN', 'ATL'], ['ICN', 'DFW'], ['ICN', 'ZRH'],

  // Japan / China / SE Asia / Oceania
  ['HND', 'JFK'], ['HND', 'LHR'], ['HND', 'CDG'], ['HND', 'FRA'], ['HND', 'SFO'],
  ['NRT', 'LAX'], ['NRT', 'SIN'], ['NRT', 'SYD'], ['NRT', 'HNL'], ['NRT', 'BKK'],
  ['PVG', 'LAX'], ['PVG', 'FRA'], ['PVG', 'CDG'], ['PVG', 'SYD'], ['PEK', 'LHR'],
  ['PEK', 'JFK'], ['HKG', 'LHR'], ['HKG', 'SFO'], ['HKG', 'JFK'], ['HKG', 'SYD'],
  ['HKG', 'DXB'], ['SIN', 'LHR'], ['SIN', 'SYD'], ['SIN', 'SFO'], ['SIN', 'JFK'],
  ['SIN', 'FRA'], ['SIN', 'DXB'], ['SIN', 'DEL'], ['SIN', 'AKL'], ['SIN', 'MEL'],
  ['BKK', 'LHR'], ['BKK', 'FRA'], ['BKK', 'SYD'], ['KUL', 'LHR'], ['KUL', 'MEL'],
  ['TPE', 'SFO'], ['TPE', 'LAX'], ['TPE', 'AMS'], ['CGK', 'SIN'], ['CGK', 'SYD'],
  ['SYD', 'LAX'], ['SYD', 'DFW'], ['SYD', 'DXB'], ['SYD', 'AKL'], ['MEL', 'LAX'],
  ['PER', 'LHR'], ['AKL', 'SFO'], ['AKL', 'HNL'], ['DEL', 'LHR'], ['DEL', 'JFK'],
  ['DEL', 'FRA'], ['DEL', 'DXB'], ['BOM', 'LHR'], ['BOM', 'DXB'], ['BOM', 'SIN'],

  // Middle East / Europe / Africa
  ['DXB', 'LHR'], ['DXB', 'JFK'], ['DXB', 'LAX'], ['DXB', 'CDG'], ['DXB', 'FRA'],
  ['DXB', 'SYD'], ['DXB', 'JNB'], ['DXB', 'GRU'], ['DXB', 'NRT'], ['DOH', 'LHR'],
  ['DOH', 'JFK'], ['DOH', 'SYD'], ['DOH', 'GRU'], ['DOH', 'CPT'], ['AUH', 'LHR'],
  ['RUH', 'LHR'], ['IST', 'JFK'], ['IST', 'LAX'], ['IST', 'LHR'], ['IST', 'NRT'],
  ['IST', 'SIN'], ['IST', 'JNB'], ['IST', 'GRU'], ['IST', 'CAI'], ['LHR', 'JFK'],
  ['LHR', 'LAX'], ['LHR', 'SFO'], ['LHR', 'ORD'], ['LHR', 'ATL'], ['LHR', 'MIA'],
  ['LHR', 'YYZ'], ['LHR', 'MEX'], ['LHR', 'GRU'], ['LHR', 'JNB'], ['LHR', 'CPT'],
  ['LHR', 'CDG'], ['LHR', 'FRA'], ['LHR', 'MAD'], ['LHR', 'FCO'], ['LHR', 'ATH'],
  ['CDG', 'JFK'], ['CDG', 'LAX'], ['CDG', 'GRU'], ['CDG', 'EZE'], ['CDG', 'JNB'],
  ['CDG', 'NRT'], ['CDG', 'SIN'], ['CDG', 'YVR'], ['FRA', 'JFK'], ['FRA', 'ORD'],
  ['FRA', 'SFO'], ['FRA', 'GRU'], ['FRA', 'EZE'], ['FRA', 'JNB'], ['FRA', 'HND'],
  ['AMS', 'JFK'], ['AMS', 'ATL'], ['AMS', 'MEX'], ['AMS', 'GRU'], ['AMS', 'NBO'],
  ['AMS', 'SIN'], ['AMS', 'HNL'], ['MAD', 'BOG'], ['MAD', 'LIM'], ['MAD', 'EZE'],
  ['MAD', 'GRU'], ['MAD', 'MIA'], ['MAD', 'MEX'], ['MAD', 'JFK'], ['FCO', 'JFK'],
  ['FCO', 'EZE'], ['ZRH', 'SFO'], ['ZRH', 'JFK'], ['ZRH', 'SIN'], ['HEL', 'HND'],
  ['HEL', 'SIN'], ['ARN', 'JFK'], ['KEF', 'JFK'], ['KEF', 'LHR'], ['MUC', 'SFO'],

  // Americas & Africa
  ['JFK', 'LAX'], ['JFK', 'SFO'], ['JFK', 'MIA'], ['JFK', 'GRU'], ['JFK', 'EZE'],
  ['JFK', 'BOG'], ['JFK', 'HNL'], ['ORD', 'LAX'], ['ORD', 'SFO'], ['ORD', 'HND'],
  ['ORD', 'LHR'], ['ATL', 'LAX'], ['ATL', 'SFO'], ['ATL', 'GRU'], ['ATL', 'JNB'],
  ['DFW', 'LAX'], ['DFW', 'NRT'], ['DFW', 'LHR'], ['DFW', 'SCL'], ['SEA', 'NRT'],
  ['SEA', 'LHR'], ['SEA', 'ANC'], ['LAX', 'HNL'], ['LAX', 'MEX'], ['LAX', 'LIM'],
  ['SFO', 'HNL'], ['SFO', 'YVR'], ['MIA', 'GRU'], ['MIA', 'EZE'], ['MIA', 'BOG'],
  ['MIA', 'SCL'], ['MIA', 'LIM'], ['YYZ', 'YVR'], ['YYZ', 'LHR'], ['YYZ', 'GRU'],
  ['MEX', 'BOG'], ['MEX', 'SCL'], ['GRU', 'EZE'], ['GRU', 'SCL'], ['GRU', 'JNB'],
  ['SCL', 'AKL'], ['SCL', 'SYD'], ['EZE', 'BOG'], ['CAI', 'LHR'], ['CAI', 'JFK'],
  ['CAI', 'DXB'], ['CAI', 'NBO'], ['ADD', 'LHR'], ['ADD', 'JFK'], ['ADD', 'PEK'],
  ['ADD', 'GRU'], ['ADD', 'JNB'], ['NBO', 'LHR'], ['NBO', 'DXB'], ['CMN', 'JFK'],
  ['CMN', 'CDG'], ['JNB', 'CPT'], ['JNB', 'PER']
];

export function latLonToVec3(latDeg, lonDeg) {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const cosLat = Math.cos(lat);
  return [
    cosLat * Math.sin(lon),
    Math.sin(lat),
    cosLat * Math.cos(lon)
  ];
}

export function vec3ToLatLon([x, y, z]) {
  const lat = Math.asin(Math.max(-1, Math.min(1, y))) * RAD2DEG;
  const lon = Math.atan2(x, z) * RAD2DEG;
  return { lat, lon };
}

export function greatCircleDistanceKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function slerpLatLon(lat1, lon1, lat2, lon2, t) {
  const a = latLonToVec3(lat1, lon1);
  const b = latLonToVec3(lat2, lon2);
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  dot = Math.max(-1, Math.min(1, dot));
  const omega = Math.acos(dot);
  if (omega < 1e-6) {
    return { lat: lat1, lon: lon1 };
  }
  const sinOmega = Math.sin(omega);
  const w1 = Math.sin((1 - t) * omega) / sinOmega;
  const w2 = Math.sin(t * omega) / sinOmega;
  return vec3ToLatLon([
    a[0] * w1 + b[0] * w2,
    a[1] * w1 + b[1] * w2,
    a[2] * w1 + b[2] * w2
  ]);
}

export function initialBearingDeg(lat1, lon1, lat2, lon2) {
  const phi1 = lat1 * DEG2RAD;
  const phi2 = lat2 * DEG2RAD;
  const dLambda = (lon2 - lon1) * DEG2RAD;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return ((Math.atan2(y, x) * RAD2DEG) + 360) % 360;
}

function deterministicHash(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function pickAirlineForRoute(orig, dest, index) {
  const matching = AIRLINES.filter((a) => a.hubs.includes(orig) || a.hubs.includes(dest));
  if (matching.length > 0) {
    return matching[index % matching.length];
  }
  return AIRLINES[index % AIRLINES.length];
}

function computeAltitudeProfile(progress, cruiseFt) {
  const climbEnd = 0.12;
  const descentStart = 0.87;
  let altFt = cruiseFt;
  let verticalRateFpm = 0;

  if (progress < climbEnd) {
    const p = progress / climbEnd;
    const smooth = 1 - Math.pow(1 - p, 2.1);
    altFt = 1200 + (cruiseFt - 1200) * smooth;
    verticalRateFpm = Math.round(2200 * (1 - p * 0.72));
  } else if (progress > descentStart) {
    const p = (progress - descentStart) / (1 - descentStart);
    const smooth = 1 - Math.pow(p, 1.8);
    altFt = Math.max(800, 800 + (cruiseFt - 800) * smooth);
    verticalRateFpm = -Math.round(1650 * (0.45 + p * 0.55));
  } else {
    // Gentle step-climb variation during cruise
    const cruiseWave = Math.sin(progress * Math.PI * 3) * 180;
    altFt = cruiseFt + cruiseWave;
    verticalRateFpm = Math.round(Math.cos(progress * Math.PI * 3) * 45);
  }

  return {
    altitudeFt: Math.round(altFt),
    altitudeM: Math.round(altFt * 0.3048),
    verticalRateFpm,
    verticalRateMs: Number((verticalRateFpm * 0.00508).toFixed(2))
  };
}

export class GlobalFlightSimulator {
  constructor(options = {}) {
    this.timeScale = options.timeScale ?? 14; // Gentle acceleration so movement is visibly alive on a global 3D scale
    this.flights = [];
    this.initFleet();
  }

  initFleet() {
    let idx = 0;
    const pairs = [];

    // Bidirectional flights across all curated corridors
    for (const [a, b] of MAJOR_ROUTES) {
      if (AIRPORT_MAP.has(a) && AIRPORT_MAP.has(b)) {
        pairs.push([a, b]);
        pairs.push([b, a]);
      }
    }

    for (const [origCode, destCode] of pairs) {
      const origin = AIRPORT_MAP.get(origCode);
      const destination = AIRPORT_MAP.get(destCode);
      const distanceKm = greatCircleDistanceKm(origin.lat, origin.lon, destination.lat, destination.lon);
      const isLongHaul = distanceKm > 3600;
      const pool = isLongHaul ? WIDEBODY_TYPES : NARROWBODY_TYPES;

      const seedStr = `${origCode}-${destCode}-${idx}`;
      const r1 = deterministicHash(seedStr);
      const r2 = deterministicHash(`${seedStr}-b`);
      const r3 = deterministicHash(`${seedStr}-c`);

      const airline = pickAirlineForRoute(origCode, destCode, idx);
      const aircraft = pool[Math.floor(r1 * pool.length)];
      const flightNum = 10 + Math.floor(r2 * 890);
      const callsign = `${airline.code}${flightNum}`;
      const icaoHex = (0x710000 + idx * 137 + Math.floor(r3 * 97)).toString(16).padStart(6, '0').slice(0, 6);
      const squawk = String(2000 + Math.floor(r1 * 5700)).padStart(4, '0');

      const cruiseFt = aircraft.cruiseFt + (Math.floor(r3 * 5) - 2) * 1000;
      const cruiseKts = aircraft.cruiseKts + Math.round((r2 - 0.5) * 32);
      const cruiseKmh = cruiseKts * 1.852;
      const durationSec = Math.max(2400, (distanceKm / cruiseKmh) * 3600);

      this.flights.push({
        icao24: icaoHex,
        callsign,
        flightNumber: `${airline.iata}${flightNum}`,
        airline: airline.name,
        originCountry: airline.country,
        aircraftType: aircraft.model,
        aircraftLabel: aircraft.label,
        registration: `${origin.country === 'KR' ? 'HL' : origin.country === 'US' ? 'N' : origin.country === 'JP' ? 'JA' : 'G-'}${String(7000 + (idx * 19) % 2900)}`,
        squawk,
        origin: origCode,
        originName: origin.name,
        destination: destCode,
        destinationName: destination.name,
        originCoords: [origin.lat, origin.lon],
        destCoords: [destination.lat, destination.lon],
        distanceKm: Math.round(distanceKm),
        cruiseFt,
        cruiseKts,
        durationSec,
        phaseOffset: r1
      });

      idx++;
    }
  }

  getSnapshot(nowMs = Date.now()) {
    const tSec = (nowMs / 1000) * this.timeScale;

    return this.flights.map((f) => {
      const progress = ((tSec / f.durationSec) + f.phaseOffset) % 1;
      const pos = slerpLatLon(
        f.originCoords[0],
        f.originCoords[1],
        f.destCoords[0],
        f.destCoords[1],
        progress
      );
      const ahead = slerpLatLon(
        f.originCoords[0],
        f.originCoords[1],
        f.destCoords[0],
        f.destCoords[1],
        Math.min(0.9999, progress + 0.002)
      );
      const heading = initialBearingDeg(pos.lat, pos.lon, ahead.lat, ahead.lon);
      const alt = computeAltitudeProfile(progress, f.cruiseFt);

      // Speed gently tapers during climb & approach
      const speedFactor = progress < 0.08
        ? 0.58 + (progress / 0.08) * 0.42
        : progress > 0.90
          ? 0.55 + ((1 - progress) / 0.10) * 0.45
          : 1.0;
      const speedKts = Math.round(f.cruiseKts * speedFactor);
      const speedMs = Number((speedKts * 0.514444).toFixed(1));
      const remainingKm = Math.max(0, Math.round(f.distanceKm * (1 - progress)));
      const etaMinutes = Math.max(1, Math.round((remainingKm / Math.max(250, speedKts * 1.852)) * 60));

      return {
        icao24: f.icao24,
        callsign: f.callsign,
        flightNumber: f.flightNumber,
        airline: f.airline,
        originCountry: f.originCountry,
        aircraftType: f.aircraftType,
        aircraftLabel: f.aircraftLabel,
        registration: f.registration,
        squawk: f.squawk,
        origin: f.origin,
        originName: f.originName,
        destination: f.destination,
        destinationName: f.destinationName,
        originCoords: f.originCoords,
        destCoords: f.destCoords,
        distanceKm: f.distanceKm,
        remainingKm,
        etaMinutes,
        progress: Number(progress.toFixed(4)),
        lat: Number(pos.lat.toFixed(4)),
        lon: Number(pos.lon.toFixed(4)),
        altitudeM: alt.altitudeM,
        altitudeFt: alt.altitudeFt,
        speedMs,
        speedKts,
        speedKmh: Math.round(speedKts * 1.852),
        heading: Number(heading.toFixed(1)),
        verticalRateMs: alt.verticalRateMs,
        verticalRateFpm: alt.verticalRateFpm,
        onGround: false,
        source: 'simulation',
        lastContact: Math.floor(nowMs / 1000)
      };
    });
  }

  getAirportList() {
    return AIRPORTS;
  }
}
