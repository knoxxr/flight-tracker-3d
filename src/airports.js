export const AIRPORTS = [
  // East Asia
  { iata: 'ICN', icao: 'RKSI', name: '인천국제공항', en: 'Incheon Intl', city: 'Seoul', country: 'KR', region: 'asia', lat: 37.4602, lon: 126.4407 },
  { iata: 'GMP', icao: 'RKSS', name: '김포국제공항', en: 'Gimpo Intl', city: 'Seoul', country: 'KR', region: 'asia', lat: 37.5583, lon: 126.7906 },
  { iata: 'CJU', icao: 'RKPC', name: '제주국제공항', en: 'Jeju Intl', city: 'Jeju', country: 'KR', region: 'asia', lat: 33.5113, lon: 126.4930 },
  { iata: 'PUS', icao: 'RKPK', name: '김해국제공항', en: 'Gimhae Intl', city: 'Busan', country: 'KR', region: 'asia', lat: 35.1796, lon: 128.9382 },
  { iata: 'NRT', icao: 'RJAA', name: '도쿄 나리타공항', en: 'Tokyo Narita', city: 'Tokyo', country: 'JP', region: 'asia', lat: 35.7720, lon: 140.3929 },
  { iata: 'HND', icao: 'RJTT', name: '도쿄 하네다공항', en: 'Tokyo Haneda', city: 'Tokyo', country: 'JP', region: 'asia', lat: 35.5494, lon: 139.7798 },
  { iata: 'KIX', icao: 'RJBB', name: '오사카 간사이공항', en: 'Osaka Kansai', city: 'Osaka', country: 'JP', region: 'asia', lat: 34.4347, lon: 135.2440 },
  { iata: 'PEK', icao: 'ZBAA', name: '베이징 수도공항', en: 'Beijing Capital', city: 'Beijing', country: 'CN', region: 'asia', lat: 40.0799, lon: 116.6031 },
  { iata: 'PVG', icao: 'ZSPD', name: '상하이 푸둥공항', en: 'Shanghai Pudong', city: 'Shanghai', country: 'CN', region: 'asia', lat: 31.1443, lon: 121.8083 },
  { iata: 'CAN', icao: 'ZGGG', name: '광저우 바이윈공항', en: 'Guangzhou Baiyun', city: 'Guangzhou', country: 'CN', region: 'asia', lat: 23.3924, lon: 113.2988 },
  { iata: 'HKG', icao: 'VHHH', name: '홍콩국제공항', en: 'Hong Kong Intl', city: 'Hong Kong', country: 'HK', region: 'asia', lat: 22.3080, lon: 113.9185 },
  { iata: 'TPE', icao: 'RCTP', name: '타이베이 타오위안', en: 'Taipei Taoyuan', city: 'Taipei', country: 'TW', region: 'asia', lat: 25.0797, lon: 121.2342 },

  // Southeast & South Asia
  { iata: 'SIN', icao: 'WSSS', name: '싱가포르 창이공항', en: 'Singapore Changi', city: 'Singapore', country: 'SG', region: 'asia', lat: 1.3644, lon: 103.9915 },
  { iata: 'BKK', icao: 'VTBS', name: '방콕 수완나품공항', en: 'Bangkok Suvarnabhumi', city: 'Bangkok', country: 'TH', region: 'asia', lat: 13.6900, lon: 100.7501 },
  { iata: 'KUL', icao: 'WMKK', name: '쿠알라룸푸르공항', en: 'Kuala Lumpur Intl', city: 'Kuala Lumpur', country: 'MY', region: 'asia', lat: 2.7456, lon: 101.7072 },
  { iata: 'SGN', icao: 'VVTS', name: '호찌민 떤선녓공항', en: 'Ho Chi Minh City', city: 'Ho Chi Minh', country: 'VN', region: 'asia', lat: 10.8188, lon: 106.6519 },
  { iata: 'MNL', icao: 'RPLL', name: '마닐라 니노이아키노', en: 'Manila Ninoy Aquino', city: 'Manila', country: 'PH', region: 'asia', lat: 14.5086, lon: 121.0194 },
  { iata: 'CGK', icao: 'WIII', name: '자카르타 수카르노하타', en: 'Jakarta Soekarno-Hatta', city: 'Jakarta', country: 'ID', region: 'asia', lat: -6.1256, lon: 106.6559 },
  { iata: 'DEL', icao: 'VIDP', name: '델리 인디라간디공항', en: 'Delhi Indira Gandhi', city: 'New Delhi', country: 'IN', region: 'asia', lat: 28.5562, lon: 77.1000 },
  { iata: 'BOM', icao: 'VABB', name: '뭄바이 차트라파티공항', en: 'Mumbai Chhatrapati', city: 'Mumbai', country: 'IN', region: 'asia', lat: 19.0896, lon: 72.8656 },

  // Oceania
  { iata: 'SYD', icao: 'YSSY', name: '시드니 킹스포드스미스', en: 'Sydney Kingsford', city: 'Sydney', country: 'AU', region: 'oceania', lat: -33.9399, lon: 151.1753 },
  { iata: 'MEL', icao: 'YMML', name: '멜버른공항', en: 'Melbourne Airport', city: 'Melbourne', country: 'AU', region: 'oceania', lat: -37.6690, lon: 144.8410 },
  { iata: 'PER', icao: 'YPPH', name: '퍼스공항', en: 'Perth Airport', city: 'Perth', country: 'AU', region: 'oceania', lat: -31.9403, lon: 115.9670 },
  { iata: 'AKL', icao: 'NZAA', name: '오클랜드공항', en: 'Auckland Airport', city: 'Auckland', country: 'NZ', region: 'oceania', lat: -37.0082, lon: 174.7850 },

  // Middle East
  { iata: 'DXB', icao: 'OMDB', name: '두바이국제공항', en: 'Dubai Intl', city: 'Dubai', country: 'AE', region: 'middle_east', lat: 25.2532, lon: 55.3657 },
  { iata: 'DOH', icao: 'OTHH', name: '도하 하마드국제공항', en: 'Doha Hamad Intl', city: 'Doha', country: 'QA', region: 'middle_east', lat: 25.2731, lon: 51.6081 },
  { iata: 'AUH', icao: 'OMAA', name: '아부다비국제공항', en: 'Abu Dhabi Zayed', city: 'Abu Dhabi', country: 'AE', region: 'middle_east', lat: 24.4330, lon: 54.6511 },
  { iata: 'RUH', icao: 'OERK', name: '리야드 킹칼리드공항', en: 'Riyadh King Khalid', city: 'Riyadh', country: 'SA', region: 'middle_east', lat: 24.9576, lon: 46.6988 },
  { iata: 'IST', icao: 'LTFM', name: '이스탄불국제공항', en: 'Istanbul Airport', city: 'Istanbul', country: 'TR', region: 'europe', lat: 41.2753, lon: 28.7519 },

  // Europe
  { iata: 'LHR', icao: 'EGLL', name: '런던 히드로공항', en: 'London Heathrow', city: 'London', country: 'GB', region: 'europe', lat: 51.4700, lon: -0.4543 },
  { iata: 'CDG', icao: 'LFPG', name: '파리 샤를드골공항', en: 'Paris Charles de Gaulle', city: 'Paris', country: 'FR', region: 'europe', lat: 49.0097, lon: 2.5479 },
  { iata: 'FRA', icao: 'EDDF', name: '프랑크푸르트공항', en: 'Frankfurt Airport', city: 'Frankfurt', country: 'DE', region: 'europe', lat: 50.0379, lon: 8.5622 },
  { iata: 'MUC', icao: 'EDDM', name: '뮌헨공항', en: 'Munich Airport', city: 'Munich', country: 'DE', region: 'europe', lat: 48.3537, lon: 11.7750 },
  { iata: 'AMS', icao: 'EHAM', name: '암스테르담 스키폴', en: 'Amsterdam Schiphol', city: 'Amsterdam', country: 'NL', region: 'europe', lat: 52.3105, lon: 4.7683 },
  { iata: 'MAD', icao: 'LEMD', name: '마드리드 바라하스', en: 'Madrid Barajas', city: 'Madrid', country: 'ES', region: 'europe', lat: 40.4983, lon: -3.5676 },
  { iata: 'BCN', icao: 'LEBL', name: '바르셀로나 엘프라트', en: 'Barcelona El Prat', city: 'Barcelona', country: 'ES', region: 'europe', lat: 41.2974, lon: 2.0833 },
  { iata: 'FCO', icao: 'LIRF', name: '로마 피우미치노공항', en: 'Rome Fiumicino', city: 'Rome', country: 'IT', region: 'europe', lat: 41.8003, lon: 12.2389 },
  { iata: 'ZRH', icao: 'LSZH', name: '취리히공항', en: 'Zurich Airport', city: 'Zurich', country: 'CH', region: 'europe', lat: 47.4582, lon: 8.5555 },
  { iata: 'HEL', icao: 'EFHK', name: '헬싱키 반타공항', en: 'Helsinki Vantaa', city: 'Helsinki', country: 'FI', region: 'europe', lat: 60.3172, lon: 24.9633 },
  { iata: 'ARN', icao: 'ESSA', name: '스톡홀름 알란다공항', en: 'Stockholm Arlanda', city: 'Stockholm', country: 'SE', region: 'europe', lat: 59.6519, lon: 17.9186 },
  { iata: 'KEF', icao: 'BIKF', name: '레이캬비크 케플라비크', en: 'Reykjavik Keflavik', city: 'Reykjavik', country: 'IS', region: 'europe', lat: 63.9850, lon: -22.6056 },
  { iata: 'ATH', icao: 'LGAV', name: '아테네국제공항', en: 'Athens Intl', city: 'Athens', country: 'GR', region: 'europe', lat: 37.9364, lon: 23.9445 },

  // North America
  { iata: 'JFK', icao: 'KJFK', name: '뉴욕 JFK 국제공항', en: 'New York JFK', city: 'New York', country: 'US', region: 'americas', lat: 40.6413, lon: -73.7781 },
  { iata: 'LAX', icao: 'KLAX', name: '로스앤젤레스공항', en: 'Los Angeles Intl', city: 'Los Angeles', country: 'US', region: 'americas', lat: 33.9416, lon: -118.4085 },
  { iata: 'SFO', icao: 'KSFO', name: '샌프란시스코공항', en: 'San Francisco Intl', city: 'San Francisco', country: 'US', region: 'americas', lat: 37.6213, lon: -122.3790 },
  { iata: 'ORD', icao: 'KORD', name: '시카고 오헤어공항', en: 'Chicago O\'Hare', city: 'Chicago', country: 'US', region: 'americas', lat: 41.9742, lon: -87.9073 },
  { iata: 'ATL', icao: 'KATL', name: '애틀랜타 하츠필드', en: 'Atlanta Hartsfield', city: 'Atlanta', country: 'US', region: 'americas', lat: 33.6407, lon: -84.4277 },
  { iata: 'DFW', icao: 'KDFW', name: '댈러스 포트워스공항', en: 'Dallas Fort Worth', city: 'Dallas', country: 'US', region: 'americas', lat: 32.8998, lon: -97.0403 },
  { iata: 'SEA', icao: 'KSEA', name: '시애틀 타코마공항', en: 'Seattle-Tacoma', city: 'Seattle', country: 'US', region: 'americas', lat: 47.4502, lon: -122.3088 },
  { iata: 'MIA', icao: 'KMIA', name: '마이애미국제공항', en: 'Miami Intl', city: 'Miami', country: 'US', region: 'americas', lat: 25.7959, lon: -80.2870 },
  { iata: 'HNL', icao: 'PHNL', name: '호놀룰루공항', en: 'Honolulu Intl', city: 'Honolulu', country: 'US', region: 'americas', lat: 21.3187, lon: -157.9225 },
  { iata: 'ANC', icao: 'PANC', name: '앵커리지공항', en: 'Anchorage Intl', city: 'Anchorage', country: 'US', region: 'americas', lat: 61.1743, lon: -149.9962 },
  { iata: 'YYZ', icao: 'CYYZ', name: '토론토 피어슨공항', en: 'Toronto Pearson', city: 'Toronto', country: 'CA', region: 'americas', lat: 43.6777, lon: -79.6248 },
  { iata: 'YVR', icao: 'CYVR', name: '밴쿠버국제공항', en: 'Vancouver Intl', city: 'Vancouver', country: 'CA', region: 'americas', lat: 49.1947, lon: -123.1792 },
  { iata: 'MEX', icao: 'MMMX', name: '멕시코시티공항', en: 'Mexico City Intl', city: 'Mexico City', country: 'MX', region: 'americas', lat: 19.4361, lon: -99.0719 },

  // South America
  { iata: 'GRU', icao: 'SBGR', name: '상파울루 과룰류스', en: 'Sao Paulo Guarulhos', city: 'Sao Paulo', country: 'BR', region: 'americas', lat: -23.4356, lon: -46.4731 },
  { iata: 'EZE', icao: 'SAEZ', name: '부에노스아이레스', en: 'Buenos Aires Ezeiza', city: 'Buenos Aires', country: 'AR', region: 'americas', lat: -34.8222, lon: -58.5358 },
  { iata: 'BOG', icao: 'SKBO', name: '보고타 엘도라도공항', en: 'Bogota El Dorado', city: 'Bogota', country: 'CO', region: 'americas', lat: 4.7016, lon: -74.1469 },
  { iata: 'SCL', icao: 'SCEL', name: '산티아고공항', en: 'Santiago Arturo Merino', city: 'Santiago', country: 'CL', region: 'americas', lat: -33.3930, lon: -70.7858 },
  { iata: 'LIM', icao: 'SPJC', name: '리마 호르헤차베스', en: 'Lima Jorge Chavez', city: 'Lima', country: 'PE', region: 'americas', lat: -12.0219, lon: -77.1143 },

  // Africa
  { iata: 'CAI', icao: 'HECA', name: '카이로국제공항', en: 'Cairo Intl', city: 'Cairo', country: 'EG', region: 'africa', lat: 30.1219, lon: 31.4056 },
  { iata: 'ADD', icao: 'HAAB', name: '아디스아바바 볼레', en: 'Addis Ababa Bole', city: 'Addis Ababa', country: 'ET', region: 'africa', lat: 8.9779, lon: 38.7993 },
  { iata: 'JNB', icao: 'FAOR', name: '요하네스버그공항', en: 'Johannesburg OR Tambo', city: 'Johannesburg', country: 'ZA', region: 'africa', lat: -26.1367, lon: 28.2411 },
  { iata: 'CPT', icao: 'FACT', name: '케이프타운공항', en: 'Cape Town Intl', city: 'Cape Town', country: 'ZA', region: 'africa', lat: -33.9715, lon: 18.6021 },
  { iata: 'CMN', icao: 'GMMN', name: '카사블랑카공항', en: 'Casablanca Mohammed V', city: 'Casablanca', country: 'MA', region: 'africa', lat: 33.3675, lon: -7.5899 },
  { iata: 'NBO', icao: 'HKJK', name: '나이로비 조모케냐타', en: 'Nairobi Jomo Kenyatta', city: 'Nairobi', country: 'KE', region: 'africa', lat: -1.3192, lon: 36.9278 }
];

export const AIRPORT_MAP = new Map(AIRPORTS.map((a) => [a.iata, a]));
