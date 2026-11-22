// Browser-side standalone flight engine for static hosting (GitHub Pages) & offline fallback.
// Supports both direct OpenSky Network live ADS-B polling and 456-flight Great Circle physics simulation.

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371.0088;
const OPENSKY_URL = 'https://opensky-network.org/api/states/all';

export const STATIC_AIRPORTS = [
  { iata: 'ICN', icao: 'RKSI', name: '인천국제공항', country: 'KR', lat: 37.4602, lon: 126.4407 },
  { iata: 'GMP', icao: 'RKSS', name: '김포국제공항', country: 'KR', lat: 37.5583, lon: 126.7906 },
  { iata: 'CJU', icao: 'RKPC', name: '제주국제공항', country: 'KR', lat: 33.5113, lon: 126.4930 },
  { iata: 'PUS', icao: 'RKPK', name: '김해국제공항', country: 'KR', lat: 35.1796, lon: 128.9382 },
  { iata: 'NRT', icao: 'RJAA', name: '도쿄 나리타공항', country: 'JP', lat: 35.7720, lon: 140.3929 },
  { iata: 'HND', icao: 'RJTT', name: '도쿄 하네다공항', country: 'JP', lat: 35.5494, lon: 139.7798 },
  { iata: 'KIX', icao: 'RJBB', name: '오사카 간사이공항', country: 'JP', lat: 34.4347, lon: 135.2440 },
  { iata: 'PEK', icao: 'ZBAA', name: '베이징 수도공항', country: 'CN', lat: 40.0799, lon: 116.6031 },
  { iata: 'PVG', icao: 'ZSPD', name: '상하이 푸둥공항', country: 'CN', lat: 31.1443, lon: 121.8083 },
  { iata: 'CAN', icao: 'ZGGG', name: '광저우 바이윈공항', country: 'CN', lat: 23.3924, lon: 113.2988 },
  { iata: 'HKG', icao: 'VHHH', name: '홍콩국제공항', country: 'HK', lat: 22.3080, lon: 113.9185 },
  { iata: 'TPE', icao: 'RCTP', name: '타이베이 타오위안', country: 'TW', lat: 25.0797, lon: 121.2342 },
  { iata: 'SIN', icao: 'WSSS', name: '싱가포르 창이공항', country: 'SG', lat: 1.3644, lon: 103.9915 },
  { iata: 'BKK', icao: 'VTBS', name: '방콕 수완나품공항', country: 'TH', lat: 13.6900, lon: 100.7501 },
  { iata: 'KUL', icao: 'WMKK', name: '쿠알라룸푸르공항', country: 'MY', lat: 2.7456, lon: 101.7072 },
  { iata: 'SGN', icao: 'VVTS', name: '호찌민공항', country: 'VN', lat: 10.8188, lon: 106.6519 },
  { iata: 'MNL', icao: 'RPLL', name: '마닐라공항', country: 'PH', lat: 14.5086, lon: 121.0194 },
  { iata: 'CGK', icao: 'WIII', name: '자카르타공항', country: 'ID', lat: -6.1256, lon: 106.6559 },
  { iata: 'DEL', icao: 'VIDP', name: '델리공항', country: 'IN', lat: 28.5562, lon: 77.1000 },
  { iata: 'BOM', icao: 'VABB', name: '뭄바이공항', country: 'IN', lat: 19.0896, lon: 72.8656 },
  { iata: 'SYD', icao: 'YSSY', name: '시드니공항', country: 'AU', lat: -33.9399, lon: 151.1753 },
  { iata: 'MEL', icao: 'YMML', name: '멜버른공항', country: 'AU', lat: -37.6690, lon: 144.8410 },
  { iata: 'PER', icao: 'YPPH', name: '퍼스공항', country: 'AU', lat: -31.9403, lon: 115.9670 },
  { iata: 'AKL', icao: 'NZAA', name: '오클랜드공항', country: 'NZ', lat: -37.0082, lon: 174.7850 },
  { iata: 'DXB', icao: 'OMDB', name: '두바이국제공항', country: 'AE', lat: 25.2532, lon: 55.3657 },
  { iata: 'DOH', icao: 'OTHH', name: '도하 하마드공항', country: 'QA', lat: 25.2731, lon: 51.6081 },
  { iata: 'AUH', icao: 'OMAA', name: '아부다비공항', country: 'AE', lat: 24.4330, lon: 54.6511 },
  { iata: 'RUH', icao: 'OERK', name: '리야드공항', country: 'SA', lat: 24.9576, lon: 46.6988 },
  { iata: 'IST', icao: 'LTFM', name: '이스탄불공항', country: 'TR', lat: 41.2753, lon: 28.7519 },
  { iata: 'LHR', icao: 'EGLL', name: '런던 히드로공항', country: 'GB', lat: 51.4700, lon: -0.4543 },
  { iata: 'CDG', icao: 'LFPG', name: '파리 샤를드골공항', country: 'FR', lat: 49.0097, lon: 2.5479 },
  { iata: 'FRA', icao: 'EDDF', name: '프랑크푸르트공항', country: 'DE', lat: 50.0379, lon: 8.5622 },
  { iata: 'MUC', icao: 'EDDM', name: '뮌헨공항', country: 'DE', lat: 48.3537, lon: 11.7750 },
  { iata: 'AMS', icao: 'EHAM', name: '암스테르담 스키폴', country: 'NL', lat: 52.3105, lon: 4.7683 },
  { iata: 'MAD', icao: 'LEMD', name: '마드리드공항', country: 'ES', lat: 40.4983, lon: -3.5676 },
  { iata: 'BCN', icao: 'LEBL', name: '바르셀로나공항', country: 'ES', lat: 41.2974, lon: 2.0833 },
  { iata: 'FCO', icao: 'LIRF', name: '로마 피우미치노', country: 'IT', lat: 41.8003, lon: 12.2389 },
  { iata: 'ZRH', icao: 'LSZH', name: '취리히공항', country: 'CH', lat: 47.4582, lon: 8.5555 },
  { iata: 'HEL', icao: 'EFHK', name: '헬싱키공항', country: 'FI', lat: 60.3172, lon: 24.9633 },
  { iata: 'ARN', icao: 'ESSA', name: '스톡홀름공항', country: 'SE', lat: 59.6519, lon: 17.9186 },
  { iata: 'KEF', icao: 'BIKF', name: '레이캬비크공항', country: 'IS', lat: 63.9850, lon: -22.6056 },
  { iata: 'ATH', icao: 'LGAV', name: '아테네공항', country: 'GR', lat: 37.9364, lon: 23.9445 },
  { iata: 'JFK', icao: 'KJFK', name: '뉴욕 JFK 공항', country: 'US', lat: 40.6413, lon: -73.7781 },
  { iata: 'LAX', icao: 'KLAX', name: '로스앤젤레스공항', country: 'US', lat: 33.9416, lon: -118.4085 },
  { iata: 'SFO', icao: 'KSFO', name: '샌프란시스코공항', country: 'US', lat: 37.6213, lon: -122.3790 },
  { iata: 'ORD', icao: 'KORD', name: '시카고 오헤어공항', country: 'US', lat: 41.9742, lon: -87.9073 },
  { iata: 'ATL', icao: 'KATL', name: '애틀랜타공항', country: 'US', lat: 33.6407, lon: -84.4277 },
  { iata: 'DFW', icao: 'KDFW', name: '댈러스공항', country: 'US', lat: 32.8998, lon: -97.0403 },
  { iata: 'SEA', icao: 'KSEA', name: '시애틀공항', country: 'US', lat: 47.4502, lon: -122.3088 },
  { iata: 'MIA', icao: 'KMIA', name: '마이애미공항', country: 'US', lat: 25.7959, lon: -80.2870 },
  { iata: 'HNL', icao: 'PHNL', name: '호놀룰루공항', country: 'US', lat: 21.3187, lon: -157.9225 },
  { iata: 'ANC', icao: 'PANC', name: '앵커리지공항', country: 'US', lat: 61.1743, lon: -149.9962 },
  { iata: 'YYZ', icao: 'CYYZ', name: '토론토공항', country: 'CA', lat: 43.6777, lon: -79.6248 },
  { iata: 'YVR', icao: 'CYVR', name: '밴쿠버공항', country: 'CA', lat: 49.1947, lon: -123.1792 },
  { iata: 'MEX', icao: 'MMMX', name: '멕시코시티공항', country: 'MX', lat: 19.4361, lon: -99.0719 },
  { iata: 'GRU', icao: 'SBGR', name: '상파울루공항', country: 'BR', lat: -23.4356, lon: -46.4731 },
  { iata: 'EZE', icao: 'SAEZ', name: '부에노스아이레스', country: 'AR', lat: -34.8222, lon: -58.5358 },
  { iata: 'BOG', icao: 'SKBO', name: '보고타공항', country: 'CO', lat: 4.7016, lon: -74.1469 },
  { iata: 'SCL', icao: 'SCEL', name: '산티아고공항', country: 'CL', lat: -33.3930, lon: -70.7858 },
  { iata: 'LIM', icao: 'SPJC', name: '리마공항', country: 'PE', lat: -12.0219, lon: -77.1143 },
  { iata: 'CAI', icao: 'HECA', name: '카이로공항', country: 'EG', lat: 30.1219, lon: 31.4056 },
  { iata: 'ADD', icao: 'HAAB', name: '아디스아바바공항', country: 'ET', lat: 8.9779, lon: 38.7993 },
  { iata: 'JNB', icao: 'FAOR', name: '요하네스버그공항', country: 'ZA', lat: -26.1367, lon: 28.2411 },
  { iata: 'CPT', icao: 'FACT', name: '케이프타운공항', country: 'ZA', lat: -33.9715, lon: 18.6021 },
  { iata: 'CMN', icao: 'GMMN', name: '카사블랑카공항', country: 'MA', lat: 33.3675, lon: -7.5899 },
  { iata: 'NBO', icao: 'HKJK', name: '나이로비공항', country: 'KE', lat: -1.3192, lon: 36.9278 }
];

const AIRPORT_MAP = new Map(STATIC_AIRPORTS.map((a) => [a.iata, a]));

const AIRLINES = [
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

const WIDEBODY = [
  { model: 'B77W', label: 'Boeing 777-300ER', cruiseFt: 36000, cruiseKts: 495 },
  { model: 'A359', label: 'Airbus A350-900', cruiseFt: 39000, cruiseKts: 490 },
  { model: 'B789', label: 'Boeing 787-9 Dreamliner', cruiseFt: 40000, cruiseKts: 488 },
  { model: 'A388', label: 'Airbus A380-800', cruiseFt: 38000, cruiseKts: 492 },
  { model: 'B748', label: 'Boeing 747-8I', cruiseFt: 37000, cruiseKts: 500 },
  { model: 'A333', label: 'Airbus A330-300', cruiseFt: 36000, cruiseKts: 472 }
];
const NARROWBODY = [
  { model: 'B738', label: 'Boeing 737-800', cruiseFt: 34000, cruiseKts: 445 },
  { model: 'B38M', label: 'Boeing 737 MAX 8', cruiseFt: 35000, cruiseKts: 452 },
  { model: 'A21N', label: 'Airbus A321neo', cruiseFt: 35000, cruiseKts: 450 },
  { model: 'A320', label: 'Airbus A320-200', cruiseFt: 33000, cruiseKts: 440 }
];

const ROUTES = [
  ['ICN','JFK'],['ICN','LAX'],['ICN','SFO'],['ICN','SEA'],['ICN','YVR'],['ICN','LHR'],['ICN','CDG'],['ICN','FRA'],
  ['ICN','AMS'],['ICN','FCO'],['ICN','HEL'],['ICN','IST'],['ICN','DXB'],['ICN','DOH'],['ICN','SIN'],['ICN','BKK'],
  ['ICN','HKG'],['ICN','TPE'],['ICN','NRT'],['ICN','KIX'],['ICN','PVG'],['ICN','PEK'],['ICN','SYD'],['ICN','HNL'],
  ['ICN','SGN'],['ICN','MNL'],['ICN','DEL'],['GMP','HND'],['GMP','CJU'],['PUS','NRT'],['PUS','CJU'],['ICN','ANC'],
  ['ICN','ATL'],['ICN','DFW'],['ICN','ZRH'],['HND','JFK'],['HND','LHR'],['HND','CDG'],['HND','FRA'],['HND','SFO'],
  ['NRT','LAX'],['NRT','SIN'],['NRT','SYD'],['NRT','HNL'],['NRT','BKK'],['PVG','LAX'],['PVG','FRA'],['PVG','CDG'],
  ['PVG','SYD'],['PEK','LHR'],['PEK','JFK'],['HKG','LHR'],['HKG','SFO'],['HKG','JFK'],['HKG','SYD'],['HKG','DXB'],
  ['SIN','LHR'],['SIN','SYD'],['SIN','SFO'],['SIN','JFK'],['SIN','FRA'],['SIN','DXB'],['SIN','DEL'],['SIN','AKL'],
  ['SIN','MEL'],['BKK','LHR'],['BKK','FRA'],['BKK','SYD'],['KUL','LHR'],['KUL','MEL'],['TPE','SFO'],['TPE','LAX'],
  ['TPE','AMS'],['CGK','SIN'],['CGK','SYD'],['SYD','LAX'],['SYD','DFW'],['SYD','DXB'],['SYD','AKL'],['MEL','LAX'],
  ['PER','LHR'],['AKL','SFO'],['AKL','HNL'],['DEL','LHR'],['DEL','JFK'],['DEL','FRA'],['DEL','DXB'],['BOM','LHR'],
  ['BOM','DXB'],['BOM','SIN'],['DXB','LHR'],['DXB','JFK'],['DXB','LAX'],['DXB','CDG'],['DXB','FRA'],['DXB','SYD'],
  ['DXB','JNB'],['DXB','GRU'],['DXB','NRT'],['DOH','LHR'],['DOH','JFK'],['DOH','SYD'],['DOH','GRU'],['DOH','CPT'],
  ['AUH','LHR'],['RUH','LHR'],['IST','JFK'],['IST','LAX'],['IST','LHR'],['IST','NRT'],['IST','SIN'],['IST','JNB'],
  ['IST','GRU'],['IST','CAI'],['LHR','JFK'],['LHR','LAX'],['LHR','SFO'],['LHR','ORD'],['LHR','ATL'],['LHR','MIA'],
  ['LHR','YYZ'],['LHR','MEX'],['LHR','GRU'],['LHR','JNB'],['LHR','CPT'],['LHR','CDG'],['LHR','FRA'],['LHR','MAD'],
  ['LHR','FCO'],['LHR','ATH'],['CDG','JFK'],['CDG','LAX'],['CDG','GRU'],['CDG','EZE'],['CDG','JNB'],['CDG','NRT'],
  ['CDG','SIN'],['CDG','YVR'],['FRA','JFK'],['FRA','ORD'],['FRA','SFO'],['FRA','GRU'],['FRA','EZE'],['FRA','JNB'],
  ['FRA','HND'],['AMS','JFK'],['AMS','ATL'],['AMS','MEX'],['AMS','GRU'],['AMS','NBO'],['AMS','SIN'],['AMS','HNL'],
  ['MAD','BOG'],['MAD','LIM'],['MAD','EZE'],['MAD','GRU'],['MAD','MIA'],['MAD','MEX'],['MAD','JFK'],['FCO','JFK'],
  ['FCO','EZE'],['ZRH','SFO'],['ZRH','JFK'],['ZRH','SIN'],['HEL','HND'],['HEL','SIN'],['ARN','JFK'],['KEF','JFK'],
  ['KEF','LHR'],['MUC','SFO'],['JFK','LAX'],['JFK','SFO'],['JFK','MIA'],['JFK','GRU'],['JFK','EZE'],['JFK','BOG'],
  ['JFK','HNL'],['ORD','LAX'],['ORD','SFO'],['ORD','HND'],['ORD','LHR'],['ATL','LAX'],['ATL','SFO'],['ATL','GRU'],
  ['ATL','JNB'],['DFW','LAX'],['DFW','NRT'],['DFW','LHR'],['DFW','SCL'],['SEA','NRT'],['SEA','LHR'],['SEA','ANC'],
  ['LAX','HNL'],['LAX','MEX'],['LAX','LIM'],['SFO','HNL'],['SFO','YVR'],['MIA','GRU'],['MIA','EZE'],['MIA','BOG'],
  ['MIA','SCL'],['MIA','LIM'],['YYZ','YVR'],['YYZ','LHR'],['YYZ','GRU'],['MEX','BOG'],['MEX','SCL'],['GRU','EZE'],
  ['GRU','SCL'],['GRU','JNB'],['SCL','AKL'],['SCL','SYD'],['EZE','BOG'],['CAI','LHR'],['CAI','JFK'],['CAI','DXB'],
  ['CAI','NBO'],['ADD','LHR'],['ADD','JFK'],['ADD','PEK'],['ADD','GRU'],['ADD','JNB'],['NBO','LHR'],['NBO','DXB'],
  ['CMN','JFK'],['CMN','CDG'],['JNB','CPT'],['JNB','PER']
];

function ll2v(latDeg, lonDeg) {
  const la = latDeg * DEG2RAD, lo = lonDeg * DEG2RAD, cl = Math.cos(la);
  return [cl * Math.sin(lo), Math.sin(la), cl * Math.cos(lo)];
}
function v2ll([x, y, z]) {
  return { lat: Math.asin(Math.max(-1, Math.min(1, y))) * RAD2DEG, lon: Math.atan2(x, z) * RAD2DEG };
}
function slerp(a, b, t) {
  let d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const o = Math.acos(d);
  if (o < 1e-6) return a;
  const s = Math.sin(o);
  const w1 = Math.sin((1 - t) * o) / s;
  const w2 = Math.sin(t * o) / s;
  return [a[0] * w1 + b[0] * w2, a[1] * w1 + b[1] * w2, a[2] * w1 + b[2] * w2];
}
function distKm(la1, lo1, la2, lo2) {
  const dLa = (la2 - la1) * DEG2RAD, dLo = (lo2 - lo1) * DEG2RAD;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * DEG2RAD) * Math.cos(la2 * DEG2RAD) * Math.sin(dLo / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function bearingDeg(la1, lo1, la2, lo2) {
  const p1 = la1 * DEG2RAD, p2 = la2 * DEG2RAD, dL = (lo2 - lo1) * DEG2RAD;
  return ((Math.atan2(Math.sin(dL) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dL)) * RAD2DEG) + 360) % 360;
}
function hash01(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

export class BrowserFlightEngine {
  constructor() {
    this.timeScale = 14;
    this.fleet = this._buildFleet();
    this.openskyCache = [];
    this.lastOpenSkyFetch = 0;
    this.backoffUntil = 0;
    this.lastError = null;
  }

  _buildFleet() {
    const out = [];
    let idx = 0;
    for (const [a, b] of ROUTES) {
      for (const [origCode, destCode] of [[a, b], [b, a]]) {
        const origin = AIRPORT_MAP.get(origCode);
        const dest = AIRPORT_MAP.get(destCode);
        if (!origin || !dest) continue;
        const dKm = distKm(origin.lat, origin.lon, dest.lat, dest.lon);
        const pool = dKm > 3600 ? WIDEBODY : NARROWBODY;
        const r1 = hash01(`${origCode}-${destCode}-${idx}`);
        const r2 = hash01(`${origCode}-${destCode}-${idx}-b`);
        const r3 = hash01(`${origCode}-${destCode}-${idx}-c`);
        const matching = AIRLINES.filter((al) => al.hubs.includes(origCode) || al.hubs.includes(destCode));
        const airline = matching.length ? matching[idx % matching.length] : AIRLINES[idx % AIRLINES.length];
        const ac = pool[Math.floor(r1 * pool.length)];
        const num = 10 + Math.floor(r2 * 890);
        const cruiseFt = ac.cruiseFt + (Math.floor(r3 * 5) - 2) * 1000;
        const cruiseKts = ac.cruiseKts + Math.round((r2 - 0.5) * 32);
        const durationSec = Math.max(2400, (dKm / (cruiseKts * 1.852)) * 3600);
        out.push({
          icao24: (0x710000 + idx * 137 + Math.floor(r3 * 97)).toString(16).padStart(6, '0').slice(0, 6),
          callsign: `${airline.code}${num}`,
          flightNumber: `${airline.iata}${num}`,
          airline: airline.name,
          originCountry: airline.country,
          aircraftType: ac.model,
          aircraftLabel: ac.label,
          registration: `${origin.country === 'KR' ? 'HL' : origin.country === 'US' ? 'N' : origin.country === 'JP' ? 'JA' : 'G-'}${7000 + (idx * 19) % 2900}`,
          squawk: String(2000 + Math.floor(r1 * 5700)).padStart(4, '0'),
          origin: origCode,
          originName: origin.name,
          destination: destCode,
          destinationName: dest.name,
          originCoords: [origin.lat, origin.lon],
          destCoords: [dest.lat, dest.lon],
          origVec: ll2v(origin.lat, origin.lon),
          destVec: ll2v(dest.lat, dest.lon),
          distanceKm: Math.round(dKm),
          cruiseFt,
          cruiseKts,
          durationSec,
          phaseOffset: r1
        });
        idx++;
      }
    }
    return out;
  }

  getSimulatedSnapshot(nowMs = Date.now()) {
    const tSec = (nowMs / 1000) * this.timeScale;
    return this.fleet.map((f) => {
      const progress = ((tSec / f.durationSec) + f.phaseOffset) % 1;
      const vPos = slerp(f.origVec, f.destVec, progress);
      const vAhead = slerp(f.origVec, f.destVec, Math.min(0.9999, progress + 0.002));
      const pos = v2ll(vPos);
      const ahead = v2ll(vAhead);
      const heading = bearingDeg(pos.lat, pos.lon, ahead.lat, ahead.lon);

      let altFt = f.cruiseFt;
      let verticalRateFpm = 0;
      if (progress < 0.12) {
        const p = progress / 0.12;
        altFt = 1200 + (f.cruiseFt - 1200) * (1 - Math.pow(1 - p, 2.1));
        verticalRateFpm = Math.round(2200 * (1 - p * 0.72));
      } else if (progress > 0.87) {
        const p = (progress - 0.87) / 0.13;
        altFt = Math.max(800, 800 + (f.cruiseFt - 800) * (1 - Math.pow(p, 1.8)));
        verticalRateFpm = -Math.round(1650 * (0.45 + p * 0.55));
      } else {
        altFt = f.cruiseFt + Math.sin(progress * Math.PI * 3) * 180;
        verticalRateFpm = Math.round(Math.cos(progress * Math.PI * 3) * 45);
      }

      const speedFactor = progress < 0.08 ? 0.58 + (progress / 0.08) * 0.42 : progress > 0.90 ? 0.55 + ((1 - progress) / 0.10) * 0.45 : 1;
      const speedKts = Math.round(f.cruiseKts * speedFactor);
      const remainingKm = Math.max(0, Math.round(f.distanceKm * (1 - progress)));
      const etaMinutes = Math.max(1, Math.round((remainingKm / Math.max(250, speedKts * 1.852)) * 60));

      return {
        ...f,
        progress: Number(progress.toFixed(4)),
        lat: Number(pos.lat.toFixed(4)),
        lon: Number(pos.lon.toFixed(4)),
        altitudeFt: Math.round(altFt),
        altitudeM: Math.round(altFt * 0.3048),
        speedMs: Number((speedKts * 0.514444).toFixed(1)),
        speedKts,
        speedKmh: Math.round(speedKts * 1.852),
        heading: Number(heading.toFixed(1)),
        verticalRateMs: Number((verticalRateFpm * 0.00508).toFixed(2)),
        verticalRateFpm,
        remainingKm,
        etaMinutes,
        onGround: false,
        source: 'simulation'
      };
    });
  }

  async fetchOpenSkyDirect() {
    const now = Date.now();
    if (this.openskyCache.length > 0 && now - this.lastOpenSkyFetch < 18000) {
      return { ok: true, flights: this.openskyCache };
    }
    if (now < this.backoffUntil) {
      return { ok: false, error: this.lastError || 'OpenSky rate-limit backoff', flights: [] };
    }

    this.lastOpenSkyFetch = now;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(OPENSKY_URL, { signal: controller.signal });
      clearTimeout(timer);

      if (res.status === 429) {
        this.lastError = 'OpenSky 요청 한도 초과 (HTTP 429)';
        this.backoffUntil = now + 60000;
        return { ok: false, error: this.lastError, flights: [] };
      }
      if (!res.ok) {
        this.lastError = `OpenSky 응답 오류 (HTTP ${res.status})`;
        this.backoffUntil = now + 30000;
        return { ok: false, error: this.lastError, flights: [] };
      }

      const data = await res.json();
      const states = Array.isArray(data?.states) ? data.states : [];
      const parsed = [];
      for (const v of states) {
        if (!Array.isArray(v) || typeof v[5] !== 'number' || typeof v[6] !== 'number' || v[8]) continue;
        const altM = Math.max(0, Math.round(typeof v[7] === 'number' ? v[7] : (v[13] || 0)));
        const velMs = typeof v[9] === 'number' ? v[9] : 0;
        parsed.push({
          icao24: String(v[0] || '').toLowerCase(),
          callsign: String(v[1] || '').trim() || String(v[0] || '').toUpperCase(),
          flightNumber: String(v[1] || '').trim(),
          airline: String(v[2] || 'Unknown'),
          originCountry: String(v[2] || 'Unknown'),
          aircraftType: 'ADS-B',
          aircraftLabel: 'Live ADS-B Transponder',
          registration: String(v[0] || '').toUpperCase(),
          squawk: v[14] ? String(v[14]).trim() : '----',
          origin: null,
          originName: null,
          destination: null,
          destinationName: null,
          originCoords: null,
          destCoords: null,
          progress: null,
          lat: Number(v[6].toFixed(4)),
          lon: Number(v[5].toFixed(4)),
          altitudeM: altM,
          altitudeFt: Math.round(altM * 3.28084),
          speedMs: Number(velMs.toFixed(1)),
          speedKts: Math.round(velMs * 1.94384),
          speedKmh: Math.round(velMs * 3.6),
          heading: typeof v[10] === 'number' ? Number((((v[10] % 360) + 360) % 360).toFixed(1)) : 0,
          verticalRateMs: typeof v[11] === 'number' ? Number(v[11].toFixed(2)) : 0,
          verticalRateFpm: typeof v[11] === 'number' ? Math.round(v[11] * 196.85) : 0,
          onGround: false,
          source: 'opensky'
        });
      }

      const limit = 600;
      const step = parsed.length > limit ? parsed.length / limit : 1;
      const sampled = [];
      for (let i = 0; i < Math.min(limit, parsed.length); i++) {
        sampled.push(parsed[Math.floor(i * step)]);
      }

      this.openskyCache = sampled;
      this.lastError = null;
      return { ok: true, flights: sampled };
    } catch (err) {
      this.lastError = err?.name === 'AbortError' ? 'OpenSky 응답 시간 초과' : 'OpenSky 네트워크 접근 불가';
      this.backoffUntil = now + 45000;
      return { ok: false, error: this.lastError, flights: [] };
    }
  }

  async resolve(mode = 'auto') {
    if (mode === 'simulation') {
      return {
        mode: 'simulation',
        activeSource: 'simulation',
        fallbackReason: null,
        flights: this.getSimulatedSnapshot()
      };
    }

    const live = await this.fetchOpenSkyDirect();
    if (live.ok && live.flights.length > 0) {
      return {
        mode,
        activeSource: 'opensky',
        fallbackReason: null,
        flights: live.flights
      };
    }

    if (mode === 'live') {
      return {
        mode: 'live',
        activeSource: 'opensky',
        fallbackReason: live.error || 'OpenSky 실시간 데이터를 가져올 수 없습니다',
        flights: []
      };
    }

    return {
      mode: 'auto',
      activeSource: 'simulation',
      fallbackReason: live.error || 'OpenSky 지연으로 글로벌 시뮬레이션 실행 중',
      flights: this.getSimulatedSnapshot()
    };
  }
}
