// Bilingual i18n module for AeroGlobe 3D (English default, Korean toggleable).
// Zero external dependencies; usable in both browser and Node.js unit tests.

export const I18N_DICTIONARY = {
  en: {
    pageTitle: 'AeroGlobe 3D — Global Live ADS-B Flight Tracker',
    langToggleTitle: 'Switch language (EN / 한국어)',
    langButton: '한국어',

    // Top HUD
    modeGlobal: 'Global',
    modeGlobalTitle: 'Global live ADS-B coverage across 103 hubs',
    modeLocal: 'Nearby',
    modeLocalTitle: 'Live ADS-B within 250 NM of current camera center',
    refreshTitle: 'Refresh live ADS-B now',
    mobileSearch: 'Search',
    mobileList: 'List',
    connectingLive: 'Connecting to live ADS-B...',
    livePrefix: 'Live',
    liveUnit: '',
    searchPlaceholder: 'Search callsign, reg, ICAO24, country, type',
    listToggleBtn: 'List',
    listToggleTitle: 'Open live flight list',

    // Bottom HUD Layers & Presets
    toggleRotate: 'Auto Rotate',
    toggleDayNight: 'Day/Night',
    toggleTrails: 'Trails',
    togglePlaces: 'Places',
    toggleAirports: 'Airports',
    toggleEstimated: 'Oceanic Est.',
    toggleEstimatedTitle: 'Project real coastal ADS-B flights across oceanic blind spots along actual routes',
    presetKorea: 'East Asia',
    presetWorld: 'World',
    presetEurope: 'Europe',
    presetNorthAmerica: 'N. America',
    presetMiddleEast: 'Middle East',
    presetAtlantic: 'N. Atlantic',
    presetPacific: 'Pacific',

    // Bottom-Right Legend & Filters
    legendAltTitle: 'ALT (FT)',
    legendEstimated: 'Est.',
    legendEstimatedTitle: 'Filter oceanic estimated flights only',
    legendTypeTitle: 'Filter',
    filterHeavy: 'Heavy',
    filterHeavyTitle: 'Filter super-heavy 4-engine & widebody jets',
    filterCargo: 'Cargo',
    filterCargoTitle: 'Filter cargo freighters only',
    filterProp: 'Prop',
    filterPropTitle: 'Filter propeller & light aircraft only',
    filterHeli: 'Heli',
    filterHeliTitle: 'Filter helicopters only',
    filterMilitary: 'Mil',
    filterMilitaryTitle: 'Filter military aircraft only',
    filterClear: 'All ✕',
    filterClearTitle: 'Clear category filter',

    // Flight List Panel
    listTitle: 'Live Airborne Flights',
    listWaiting: 'Waiting for live telemetry...',
    listEmptySub: 'No live aircraft received',
    listEmptyBody: 'Waiting for live ADS-B signals or no flights match your filter.',
    listSearchSummary: 'Showing top {shown} of {total} matching flights',
    listLiveSummary: 'Showing {shown} nearest of {total} live flights',
    estShortBadge: 'Est.',
    estFullBadge: 'Oceanic Est.',
    countWithEst: '{live} (+{est} est.)',

    // Flight Detail Panel
    originLabel: 'ORIGIN',
    destLabel: 'DESTINATION',
    routeLookupShort: 'Lookup...',
    routeLookupLong: 'Looking up route...',
    routeUnavailableCode: 'N/A',
    routeUnavailableOrigin: 'No origin',
    routeUnavailableDest: 'No destination',
    routeUnavailableNote: 'No public route (private, charter, or military)',
    routeOriginFallback: 'Origin Airport',
    routeDestFallback: 'Destination',
    routeActive: 'In Flight',
    routeRemain: '{km} km left · ~{dur}',
    routeTotal: 'Total {km} km',
    specsHeader: 'Aircraft · Avionics · Upper Air',
    specModel: 'Manufacturer · Type',
    specOwner: 'Operator · Owner',
    specCategory: 'Category · Built',
    specAirspeed: 'Mach · Airspeed',
    specNav: 'Target Alt · QNH',
    specWeather: 'Wind · OAT',
    specSignal: 'Feed · Signal',
    altLabel: 'ALTITUDE',
    speedLabel: 'GROUND SPEED',
    headingLabel: 'TRUE TRACK',
    coordsLabel: 'COORDS (LAT / LON)',
    profileHeader: 'Live Altitude History',
    profileAccumulating: 'Collecting points (1)',
    metaReg: 'REG',
    metaCountry: 'COUNTRY',
    followBtn: 'Follow',
    unfollowBtn: 'Unfollow',
    centerBtn: 'Center',
    shareBtn: 'Share',
    shareTitle: 'Copy shareable tracking link',
    shareCopied: 'Copied ✓',
    sharePrompt: 'Copy share link:',

    // Flight Phases & Avionics
    phaseEstRoute: 'Oceanic Est. (Route)',
    phaseEstHeading: 'Oceanic Est. (Track)',
    phaseEmergency7700: 'Emergency (7700)',
    phaseEmergency7600: 'Radio Failure (7600)',
    phaseEmergency7500: 'Hijack Alert (7500)',
    phaseGround: 'On Ground',
    phaseTakeoff: 'Takeoff / Climb',
    phaseClimbing: 'Climbing',
    phaseApproach: 'Approach / Landing',
    phaseDescending: 'Descending',
    phaseCruise: 'Cruise · FL{fl}',
    phaseAirborne: 'Airborne',
    sqk7700: 'SQK 7700 · Emergency',
    sqk7600: 'SQK 7600 · Radio Fail',
    sqk7500: 'SQK 7500 · Hijack',
    emergencyShort7700: 'Emergency',
    emergencyShort7600: 'Radio Fail',
    emergencyShort7500: 'Hijack',
    emergencyBannerTitle: 'Emergency Squawk',

    // Detail Values & Status
    civilianAircraft: 'Civil / General Aviation',
    statusLookingUp: 'Loading...',
    statusDbReady: 'DB Connected',
    statusAdsbLive: 'Live ADS-B',
    noData: 'N/A',
    notReceived: 'N/A',
    builtYear: 'Built {year}',
    estSourceRoute: 'Estimated · Great Circle Route',
    estSourceTrack: 'Estimated · Last Track',
    lastSignalPrefix: 'Last live {age}',
    justNow: 'Just now',
    secAgo: '{s}s ago',
    minSecAgo: '{m}m {s}s ago',
    durHm: '{h}h {m}m',
    durM: '{m}m',

    // Source Strip Messages
    srcOpenSky: 'LIVE · OpenSky Network (Global)',
    srcFlyItaly: 'LIVE · FlyItalyADSB (Global)',
    srcGridScanning: 'LIVE · Scanning Global Grid ({done}/{total} cells)',
    srcGridComplete: 'LIVE · Global {total}-Cell ADS-B Grid',
    srcLocalDual: 'LIVE · adsb.fi + adsb.lol (250 NM)',
    srcAdsbLol: 'LIVE · adsb.lol (250 NM Radius)',
    srcAdsbFi: 'LIVE · adsb.fi (250 NM Radius)',
    srcHolding: 'LIVE (Holding recent positions)',
    srcWaiting: 'Waiting for live ADS-B feed',
    srcLoading: 'Fetching live ADS-B...',
    errBackendHttp: 'Backend error (HTTP {status})',
    errNetwork: 'Server connection error ({msg})',
    errFeedFallback: 'Unable to fetch live ADS-B data. Retrying automatically.',

    // Airport METAR Board
    metarHeader: 'Live Airport Weather (NOAA METAR)',
    metarTempLabel: 'TEMP / DEWPOINT',
    metarWindLabel: 'WIND',
    metarVisLabel: 'VISIBILITY',
    metarQnhLabel: 'PRESSURE (QNH)',
    metarLoading: 'Loading weather data...',
    metarCalm: 'Calm',
    metarNoRaw: 'No raw report',
    metarUnavailable: 'Unavailable',
    metarNoInfo: 'METAR weather not available',
    metarConnectErr: 'Cannot reach METAR server',
    metarLatest: 'Latest',
    airportFlightsHeader: 'Linked & Nearby Flights (180 km)',
    airportFlightsCount: '{n}',
    airportFlightsEmpty: 'No live flights within 180 km of this airport.<br/>Switch to Nearby mode or zoom in.',
    aptArrival: 'ARR',
    aptDeparture: 'DEP',

    // Globe Canvas Tags
    globeLastSeen: 'Last ADS-B',

    // Emitter Categories
    catA1: 'Light',
    catA2: 'Small',
    catA3: 'Large',
    catA4: 'High Vortex Large',
    catA5: 'Heavy',
    catA6: 'High Performance',
    catA7: 'Rotorcraft',
    catB1: 'Glider',
    catB2: 'Lighter-than-air',
    catB4: 'Ultralight',
    catB6: 'UAV / Drone'
  },

  ko: {
    pageTitle: 'AeroGlobe 3D — 전 세계 실시간 ADS-B 항공기 추적기',
    langToggleTitle: '언어 전환 (English / 한국어)',
    langButton: 'EN',

    // Top HUD
    modeGlobal: '전세계',
    modeGlobalTitle: '전 세계 103개 허브 실시간 ADS-B 통합 수신',
    modeLocal: '주변',
    modeLocalTitle: '현재 화면 중심 반경 250NM 실시간 ADS-B',
    refreshTitle: '실시간 ADS-B 즉시 새로고침',
    mobileSearch: '검색',
    mobileList: '목록',
    connectingLive: '실시간 ADS-B 연결 중...',
    livePrefix: '실시간',
    liveUnit: '대',
    searchPlaceholder: '편명, 등록번호, ICAO24, 국적, 기종 검색',
    listToggleBtn: '목록',
    listToggleTitle: '실시간 항공편 목록 열기',

    // Bottom HUD Layers & Presets
    toggleRotate: '자동 회전',
    toggleDayNight: '밤/낮 그림자',
    toggleTrails: '비행 궤적',
    togglePlaces: '주요 지명',
    toggleAirports: '공항 허브',
    toggleEstimated: '공해상 추정',
    toggleEstimatedTitle: '해안 마지막 실시간 수신 항공기를 실제 노선(adsbdb) 따라 공해상 추정 표시',
    presetKorea: '한국·동아시아',
    presetWorld: '전 세계',
    presetEurope: '유럽',
    presetNorthAmerica: '북미',
    presetMiddleEast: '중동',
    presetAtlantic: '북대서양',
    presetPacific: '태평양',

    // Bottom-Right Legend & Filters
    legendAltTitle: '고도 (FT)',
    legendEstimated: '추정',
    legendEstimatedTitle: '공해상 추정 항공기만 필터링',
    legendTypeTitle: '기종 필터',
    filterHeavy: '대형',
    filterHeavyTitle: '초대형 4발 · 광동체 여객기만 보기',
    filterCargo: '화물',
    filterCargoTitle: '화물기만 보기',
    filterProp: '경비행',
    filterPropTitle: '경비행기 · 프로펠러만 보기',
    filterHeli: '헬기',
    filterHeliTitle: '헬리콥터만 보기',
    filterMilitary: '군용',
    filterMilitaryTitle: '군용기 · 전투기만 보기',
    filterClear: '전체 ✕',
    filterClearTitle: '필터 초기화',

    // Flight List Panel
    listTitle: '실시간 비행 중 항공기',
    listWaiting: '실시간 수신 대기 중',
    listEmptySub: '수신된 실시간 항공기가 없습니다',
    listEmptyBody: '실시간 ADS-B 신호를 기다리는 중이거나 검색 결과가 없습니다.',
    listSearchSummary: '검색 결과 {total}대 중 상위 {shown}대',
    listLiveSummary: '실시간 {total}대 중 현재 화면 인접 {shown}대',
    estShortBadge: '추정',
    estFullBadge: '공해상 추정',
    countWithEst: '{live} (+추정 {est})',

    // Flight Detail Panel
    originLabel: '출발지',
    destLabel: '목적지',
    routeLookupShort: '조회 중...',
    routeLookupLong: '출발·목적지 조회 중...',
    routeUnavailableCode: '미공개',
    routeUnavailableOrigin: '출발지 없음',
    routeUnavailableDest: '목적지 없음',
    routeUnavailableNote: '비정기·개인·군용 등 공개 노선 없음',
    routeOriginFallback: '출발 공항',
    routeDestFallback: '목적 공항',
    routeActive: '실시간 운항 중',
    routeRemain: '잔여 {km} km · 약 {dur}',
    routeTotal: '총 {km} km',
    specsHeader: '기체 상세 · 항전 · 상공 기상',
    specModel: '제조사 · 기종',
    specOwner: '운항 · 소유사',
    specCategory: '기체 등급 · 기령',
    specAirspeed: '마하 · 대기속도',
    specNav: '목표고도 · QNH',
    specWeather: '상공 바람 · 외기온',
    specSignal: '수신방식 · 신호',
    altLabel: '고도 (ALTITUDE)',
    speedLabel: '대지속도 (SPEED)',
    headingLabel: '진방위 (TRUE TRACK)',
    coordsLabel: '좌표 (LAT / LON)',
    profileHeader: '실시간 수신 고도 추이',
    profileAccumulating: '수신 포인트 누적 중 (1개)',
    metaReg: '등록번호',
    metaCountry: '국적',
    followBtn: '카메라 추적',
    unfollowBtn: '추적 해제',
    centerBtn: '위치 이동',
    shareBtn: '공유',
    shareTitle: '이 항공기 추적 링크 복사',
    shareCopied: '복사됨 ✓',
    sharePrompt: '공유 링크를 복사하세요:',

    // Flight Phases & Avionics
    phaseEstRoute: '공해상 추정 (노선)',
    phaseEstHeading: '공해상 추정 (항로)',
    phaseEmergency7700: '비상 (7700)',
    phaseEmergency7600: '통신두절 (7600)',
    phaseEmergency7500: '긴급 (7500)',
    phaseGround: '지상',
    phaseTakeoff: '이륙·상승',
    phaseClimbing: '상승 중',
    phaseApproach: '접근·착륙',
    phaseDescending: '하강 중',
    phaseCruise: '순항 · FL{fl}',
    phaseAirborne: '비행 중',
    sqk7700: 'SQK 7700 · 비상',
    sqk7600: 'SQK 7600 · 통신두절',
    sqk7500: 'SQK 7500 · 긴급',
    emergencyShort7700: '비상',
    emergencyShort7600: '통신두절',
    emergencyShort7500: '긴급',
    emergencyBannerTitle: '비상 스쿼크 감지',

    // Detail Values & Status
    civilianAircraft: '민간 · 일반 항공기',
    statusLookingUp: '조회 중...',
    statusDbReady: 'DB 연동 완료',
    statusAdsbLive: 'ADS-B 실시간',
    noData: '정보 없음',
    notReceived: '미수신',
    builtYear: '{year}년 제작',
    estSourceRoute: 'Estimated · 실제 노선 대권 추정',
    estSourceTrack: 'Estimated · 마지막 항로 추정',
    lastSignalPrefix: '마지막 수신 {age}',
    justNow: '방금 수신',
    secAgo: '{s}초 전',
    minSecAgo: '{m}분 {s}초 전',
    durHm: '{h}시간 {m}분',
    durM: '{m}분',

    // Source Strip Messages
    srcOpenSky: 'LIVE · OpenSky Network (전 세계 전체)',
    srcFlyItaly: 'LIVE · FlyItalyADSB (전 세계 전체)',
    srcGridScanning: 'LIVE · 전 세계 스캔 중 ({done}/{total}구역)',
    srcGridComplete: 'LIVE · 전 세계 {total}구역 실시간 ADS-B',
    srcLocalDual: 'LIVE · adsb.fi + adsb.lol (주변 250NM)',
    srcAdsbLol: 'LIVE · adsb.lol (화면 반경 250NM)',
    srcAdsbFi: 'LIVE · adsb.fi (화면 반경 250NM)',
    srcHolding: 'LIVE (최근 수신 위치 유지 중)',
    srcWaiting: '실시간 ADS-B 연결 대기 중',
    srcLoading: '실시간 ADS-B 수신 중...',
    errBackendHttp: '백엔드 응답 오류 (HTTP {status})',
    errNetwork: '서버 연결 오류 ({msg})',
    errFeedFallback: '실시간 ADS-B 데이터를 가져오지 못했습니다. 잠시 후 자동 재시도합니다.',

    // Airport METAR Board
    metarHeader: '실시간 공항 기상 (NOAA METAR)',
    metarTempLabel: '기온 / 이슬점',
    metarWindLabel: '풍향 / 풍속',
    metarVisLabel: '시정',
    metarQnhLabel: '기압 (QNH)',
    metarLoading: '기상 데이터를 불러오는 중...',
    metarCalm: '바람 약함',
    metarNoRaw: '원문 없음',
    metarUnavailable: '미수신',
    metarNoInfo: 'METAR 기상 정보 없음',
    metarConnectErr: 'METAR 기상 서버 연결 불가',
    metarLatest: '최신',
    airportFlightsHeader: '실시간 연계 · 반경 180km 항공기',
    airportFlightsCount: '{n}대',
    airportFlightsEmpty: '현재 이 공항 반경 180km 내 수신 항공기가 없습니다.<br/>상단에서 주변 모드를 누르거나 지도를 확대해 보세요.',
    aptArrival: '도착',
    aptDeparture: '출발',

    // Globe Canvas Tags
    globeLastSeen: '마지막 수신',

    // Emitter Categories
    catA1: '소형기 (Light)',
    catA2: '중소형기 (Small)',
    catA3: '대형기 (Large)',
    catA4: '대형 와류기 (High Vortex)',
    catA5: '초대형기 (Heavy)',
    catA6: '고성능기 (High Perf)',
    catA7: '헬리콥터 (Rotorcraft)',
    catB1: '글라이더',
    catB2: '기구/비행선',
    catB4: '초경량기',
    catB6: '무인기 (UAV)'
  }
};

const STORAGE_KEY = 'aeroglobe_lang';

function resolveInitialLang() {
  if (typeof window !== 'undefined') {
    try {
      const param = new URLSearchParams(window.location.search).get('lang');
      if (param === 'ko' || param === 'en') return param;
      const saved = window.localStorage?.getItem(STORAGE_KEY);
      if (saved === 'ko' || saved === 'en') return saved;
    } catch {
      // Ignore storage access restrictions
    }
  }
  return 'en'; // English default
}

let currentLang = resolveInitialLang();

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  const next = lang === 'ko' ? 'ko' : 'en';
  currentLang = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage?.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage access restrictions
    }
  }
  return currentLang;
}

export function t(key, vars = null, lang = currentLang) {
  const dict = I18N_DICTIONARY[lang] || I18N_DICTIONARY.en;
  let str = dict[key] ?? I18N_DICTIONARY.en[key] ?? key;
  if (vars && typeof vars === 'object') {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, String(v ?? ''));
    }
  }
  return str;
}

export function formatDurationI18n(minutes, lang = currentLang) {
  if (!minutes || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? t('durHm', { h, m }, lang) : t('durM', { m }, lang);
}

export function formatAgeI18n(epochSec, lang = currentLang) {
  if (!epochSec) return t('justNow', null, lang);
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - epochSec));
  if (diff < 2) return t('justNow', null, lang);
  if (diff < 60) return t('secAgo', { s: diff }, lang);
  return t('minSecAgo', { m: Math.floor(diff / 60), s: diff % 60 }, lang);
}

export function applyDomTranslations(lang = currentLang) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.title = t('pageTitle', null, lang);

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key, null, lang);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.setAttribute('placeholder', t(key, null, lang));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.setAttribute('title', t(key, null, lang));
  });
}
