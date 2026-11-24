import { Globe3D } from './globe.js';
import { LiveBrowserAdsbClient, STATIC_AIRPORTS } from './flight-engine.js';
import { resolveAircraftCountry, decodeCallsign, classifyAircraftIcon } from './aviation-meta.js';
import { t, getLang, setLang, applyDomTranslations, formatDurationI18n, formatAgeI18n } from './i18n.js';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const DEFAULT_REMOTE_API_BASE = 'https://flight-tracker-3d.onrender.com';
const EMERGENCY_SQUAWK_CODES = new Set(['7700', '7600', '7500']);
const liveClient = new LiveBrowserAdsbClient();
const urlParams = new URLSearchParams(window.location.search);

function locCountry(country) {
  if (!country) return getLang() === 'ko' ? '미상' : 'Unknown';
  return getLang() === 'ko' ? (country.nameKo || country.nameEn || '미상') : (country.nameEn || country.nameKo || 'Unknown');
}

function locAirline(csInfo) {
  if (!csInfo) return null;
  return getLang() === 'ko' ? (csInfo.airlineKo || csInfo.airlineEn || null) : (csInfo.airlineEn || csInfo.airlineKo || null);
}

function locIconLabel(iconMeta) {
  if (!iconMeta) return '';
  return getLang() === 'ko' ? (iconMeta.labelKo || iconMeta.labelEn || '') : (iconMeta.labelEn || iconMeta.labelKo || '');
}

function locAirportName(apt) {
  if (!apt) return '';
  return getLang() === 'ko' ? (apt.name || apt.en || apt.iata) : (apt.en || apt.name || apt.iata);
}

const state = {
  provider: 'opensky', // 'opensky' (global live) | 'adsbfi' (250NM around current view)
  activeSource: 'opensky',
  lastScanProgress: null,
  backendAvailable: false,
  apiBase: '', // '' for same-origin, or DEFAULT_REMOTE_API_BASE when hosted on static GitHub Pages
  showEstimated: true,
  categoryFilter: urlParams.get('filter') || null,
  liveCount: 0,
  estimatedCount: 0,
  rawFlights: [],
  flights: [],
  trackHistory: new Map(),
  enrichmentCache: new Map(),
  enrichmentPending: new Set(),
  metarCache: new Map(),
  searchQuery: '',
  selectedIcao: null,
  selectedAirport: null,
  pendingDeepLinkFlight: (urlParams.get('flight') || '').trim().toUpperCase() || null,
  followSelected: false,
  panelMode: 'none',
  lastSyncMs: performance.now(),
  lastUpdatedAt: null,
  eventSource: null,
  pollTimer: null
};

function apiUrl(path) {
  if (state.apiBase) {
    return `${state.apiBase.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  }
  return path.startsWith('/') ? `.${path}` : path;
}

// DOM References
const canvas = document.getElementById('globe-canvas');
const utcClockEl = document.getElementById('utc-clock');
const statusDotEl = document.getElementById('status-dot');
const sourceLabelEl = document.getElementById('source-label');
const flightCountEl = document.getElementById('flight-count');
const liveNoticeEl = document.getElementById('live-notice');
const emergencyBannerEl = document.getElementById('emergency-banner');
const searchInputEl = document.getElementById('flight-search');
const toggleListBtn = document.getElementById('toggle-list-btn');
const sidePanelEl = document.getElementById('side-panel');
const listViewEl = document.getElementById('flight-list-view');
const detailViewEl = document.getElementById('flight-detail-view');
const airportViewEl = document.getElementById('airport-detail-view');
const listContainerEl = document.getElementById('flight-list-container');
const listSubtitleEl = document.getElementById('list-subtitle');
const tooltipEl = document.getElementById('hover-tooltip');
const followBtn = document.getElementById('follow-flight-btn');
const centerBtn = document.getElementById('center-flight-btn');
const shareBtn = document.getElementById('share-flight-btn');
const refreshBtn = document.getElementById('refresh-live-btn');
const langToggleBtn = document.getElementById('lang-toggle-btn');

let cameraFetchTimer = null;

const initLat = Number.isFinite(Number(urlParams.get('lat'))) && urlParams.has('lat') ? Number(urlParams.get('lat')) : 36;
const initLon = Number.isFinite(Number(urlParams.get('lon'))) && urlParams.has('lon') ? Number(urlParams.get('lon')) : 128;
const initZoom = Number.isFinite(Number(urlParams.get('zoom'))) && urlParams.has('zoom')
  ? Math.max(0.85, Math.min(150, Number(urlParams.get('zoom'))))
  : 1.55;

const globe = new Globe3D(canvas, {
  initialLat: initLat,
  initialLon: initLon,
  initialZoom: initZoom,
  autoRotate: false,
  dayNight: true,
  showTrails: true,
  showAirports: true,
  lang: getLang(),
  onCameraSettled: () => {
    if (!state.backendAvailable) return;
    clearTimeout(cameraFetchTimer);
    cameraFetchTimer = setTimeout(() => fetchBackendOnce(), 400);
  },
  onSelectFlight: (flight) => {
    if (flight) {
      selectFlight(flight.icao24, false);
    } else {
      state.selectedIcao = null;
      state.selectedAirport = null;
      state.followSelected = false;
      if (state.panelMode === 'detail' || state.panelMode === 'airport') {
        setPanelMode('none');
      }
    }
  },
  onSelectAirport: (airport) => {
    if (airport) {
      selectAirport(airport, false);
    }
  },
  onHoverFlight: (flight, pos) => {
    if (!flight) {
      tooltipEl.classList.add('hidden');
      return;
    }
    const country = resolveAircraftCountry(flight.icao24, flight.registration, flight.originCountry);
    const csInfo = decodeCallsign(flight.callsign);
    const iconMeta = classifyAircraftIcon(flight);
    const enriched = state.enrichmentCache.get(flight.icao24);
    const iataCode = enriched?.flightroute?.callsignIata || flight.iataFlight || csInfo?.iataFlight;
    const titleStr = iataCode && iataCode !== flight.callsign
      ? `${country.flag} ${iataCode} (${flight.callsign})`
      : `${country.flag} ${flight.callsign}`;
    const route = enriched?.flightroute;
    const routeStr = route?.origin && route?.destination
      ? `${route.origin.iata || route.origin.icao} → ${route.destination.iata || route.destination.icao}`
      : (flight.origin && flight.destination
        ? `${flight.origin} → ${flight.destination}`
        : (locAirline(csInfo) || flight.airlineName || locCountry(country)));
    const iconLabel = locIconLabel(iconMeta);
    const typeMeta = flight.aircraftType && flight.aircraftType !== 'ADS-B'
      ? ` · ${flight.aircraftType} (${iconLabel})`
      : ` · ${iconLabel}`;
    const estBadge = flight.estimated ? `<span class="est-pill">${escapeHtml(t('estFullBadge'))}</span>` : '';
    tooltipEl.innerHTML = `
      <div><span class="tooltip-callsign">${escapeHtml(titleStr)}</span><span>${escapeHtml(typeMeta)}</span>${estBadge}</div>
      <div class="tooltip-meta">${escapeHtml(routeStr)} · ${formatNumber(flight.altitudeFt)} ft · ${flight.speedKts} kts</div>
    `;
    tooltipEl.style.left = `${Math.min(window.innerWidth - 280, pos.x + 14)}px`;
    tooltipEl.style.top = `${Math.max(12, pos.y - 44)}px`;
    tooltipEl.classList.remove('hidden');
  }
});

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function formatAge(epochSec) {
  return formatAgeI18n(epochSec);
}

// Smooth 1x real-time dead-reckoning between live ADS-B packets
function extrapolateLiveFlight(flight, dtSec) {
  if (!flight || flight.onGround || !flight.speedMs || dtSec <= 0 || dtSec > 45) {
    return flight;
  }
  const distKm = (flight.speedMs * dtSec) / 1000;
  const angularDist = distKm / 6371.0088;
  const bearing = (flight.heading || 0) * DEG2RAD;
  const lat1 = flight.lat * DEG2RAD;
  const lon1 = flight.lon * DEG2RAD;

  const sinLat2 = Math.sin(lat1) * Math.cos(angularDist) +
    Math.cos(lat1) * Math.sin(angularDist) * Math.cos(bearing);
  const lat2 = Math.asin(Math.max(-1, Math.min(1, sinLat2)));
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDist) * Math.cos(lat1),
    Math.cos(angularDist) - Math.sin(lat1) * Math.sin(lat2)
  );
  let nextLon = lon2 * RAD2DEG;
  if (nextLon > 180) nextLon -= 360;
  if (nextLon < -180) nextLon += 360;

  return {
    ...flight,
    lat: lat2 * RAD2DEG,
    lon: nextLon
  };
}

function recordTrackPoints(flights) {
  const nowSec = Math.floor(Date.now() / 1000);
  for (const f of flights) {
    let hist = state.trackHistory.get(f.icao24);
    if (!hist) {
      hist = [];
      state.trackHistory.set(f.icao24, hist);
    }
    const last = hist[hist.length - 1];
    if (!last || Math.abs(last.lat - f.lat) > 0.004 || Math.abs(last.lon - f.lon) > 0.004) {
      hist.push({ lat: f.lat, lon: f.lon, altFt: f.altitudeFt, ts: nowSec });
      if (hist.length > 50) hist.shift();
    }
    f.track = hist;
  }
}

function matchesCategoryFilter(f, filter) {
  if (!filter) return true;
  if (filter === 'estimated') return Boolean(f.estimated);
  const icon = f._iconMeta || (f._iconMeta = classifyAircraftIcon(f));
  if (filter === 'heavy') return icon.kind === 'super_heavy' || icon.kind === 'heavy';
  if (filter === 'cargo') return icon.kind === 'cargo';
  if (filter === 'prop') return icon.kind === 'prop';
  if (filter === 'heli') return icon.kind === 'helicopter';
  if (filter === 'military') return icon.kind === 'military_fighter' || icon.kind === 'military_heavy';
  return true;
}

function updateCategoryFilterUI() {
  document.querySelectorAll('.legend-filter-btn[data-filter]').forEach((btn) => {
    btn.classList.toggle('active', state.categoryFilter === btn.dataset.filter);
  });
  const clearBtn = document.getElementById('clear-filter-btn');
  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !state.categoryFilter);
  }
}

function renderEmergencyBanner() {
  if (!emergencyBannerEl) return;
  const emergencies = state.rawFlights.filter(
    (f) => !f.estimated && f.squawk && EMERGENCY_SQUAWK_CODES.has(f.squawk)
  );
  if (emergencies.length === 0) {
    emergencyBannerEl.classList.add('hidden');
    emergencyBannerEl.innerHTML = '';
    return;
  }
  const chips = emergencies.slice(0, 4).map((f) => {
    const label = t(`emergencyShort${f.squawk}`);
    return `<button type="button" class="emergency-chip" data-icao="${escapeHtml(f.icao24)}">🚨 ${escapeHtml(f.squawk)} ${escapeHtml(f.callsign || f.icao24)} (${escapeHtml(label)})</button>`;
  }).join('');
  emergencyBannerEl.innerHTML = `<span>${escapeHtml(t('emergencyBannerTitle'))}</span>${chips}`;
  emergencyBannerEl.classList.remove('hidden');
  emergencyBannerEl.querySelectorAll('.emergency-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectFlight(btn.dataset.icao, true);
    });
  });
}

function applySearchFilter() {
  const q = state.searchQuery.trim().toLowerCase();
  let base = state.showEstimated
    ? state.rawFlights
    : state.rawFlights.filter((f) => !f.estimated);

  if (state.categoryFilter) {
    base = base.filter((f) => matchesCategoryFilter(f, state.categoryFilter));
  }

  if (!q) {
    state.flights = base;
  } else {
    state.flights = base.filter((f) =>
      (f.callsign && f.callsign.toLowerCase().includes(q)) ||
      (f.iataFlight && f.iataFlight.toLowerCase().includes(q)) ||
      (f.airlineName && f.airlineName.toLowerCase().includes(q)) ||
      (f.origin && f.origin.toLowerCase().includes(q)) ||
      (f.destination && f.destination.toLowerCase().includes(q)) ||
      (f.icao24 && f.icao24.toLowerCase().includes(q)) ||
      (f.registration && f.registration.toLowerCase().includes(q)) ||
      (f.aircraftType && f.aircraftType.toLowerCase().includes(q)) ||
      (f.originCountry && f.originCountry.toLowerCase().includes(q)) ||
      (f.squawk && f.squawk.toLowerCase().includes(q))
    );
  }
  const estShown = state.flights.reduce((acc, f) => acc + (f.estimated ? 1 : 0), 0);
  const liveShown = state.flights.length - estShown;
  flightCountEl.textContent = estShown > 0
    ? t('countWithEst', { live: formatNumber(liveShown), est: formatNumber(estShown) })
    : formatNumber(liveShown);
  renderEmergencyBanner();
  if (state.panelMode === 'list') renderFlightList();
  if (state.panelMode === 'detail' && state.selectedIcao) renderFlightDetail();
  if (state.panelMode === 'airport' && state.selectedAirport) renderAirportDetail();
}

function setPanelMode(mode) {
  state.panelMode = mode;
  const mobileListBtn = document.getElementById('mobile-list-btn');
  if (mode === 'none') {
    document.body.classList.remove('sheet-open');
    sidePanelEl.classList.add('hidden');
    listViewEl.classList.add('hidden');
    detailViewEl.classList.add('hidden');
    if (airportViewEl) airportViewEl.classList.add('hidden');
    if (mobileListBtn) mobileListBtn.classList.remove('active');
    return;
  }
  document.body.classList.add('sheet-open');
  sidePanelEl.classList.remove('hidden');
  listViewEl.classList.toggle('hidden', mode !== 'list');
  detailViewEl.classList.toggle('hidden', mode !== 'detail');
  if (airportViewEl) airportViewEl.classList.toggle('hidden', mode !== 'airport');
  if (mobileListBtn) mobileListBtn.classList.toggle('active', mode === 'list');
  if (mode === 'list') renderFlightList();
  if (mode === 'detail') renderFlightDetail();
  if (mode === 'airport') renderAirportDetail();
}

function selectFlight(icao24, fly = true) {
  state.selectedAirport = null;
  globe.selectedAirportIata = null;
  state.selectedIcao = icao24;
  globe.setSelectedFlight(icao24, fly);
  setPanelMode('detail');
  renderFlightDetail();
  const f = state.rawFlights.find((item) => item.icao24 === icao24);
  if (f) fetchFlightEnrichment(f);
}

async function fetchAirportMetarClient(airport) {
  const code = (airport.icao || airport.iata || '').toUpperCase();
  if (!code) return;
  const cached = state.metarCache.get(code);
  if (cached && Date.now() - cached.at < 5 * 60_000) {
    renderAirportDetail();
    return;
  }
  state.metarCache.set(code, { at: Date.now(), loading: true, metar: null, error: null });
  renderAirportDetail();
  try {
    let data = null;
    if (state.backendAvailable) {
      const res = await fetch(apiUrl(`/api/weather/metar?icao=${encodeURIComponent(code)}`));
      if (res.ok) data = await res.json();
    }
    if (data?.ok && data.metar) {
      state.metarCache.set(code, { at: Date.now(), loading: false, metar: data.metar, error: null });
    } else {
      state.metarCache.set(code, { at: Date.now(), loading: false, metar: null, errorKey: 'metarNoInfo', error: null });
    }
  } catch {
    state.metarCache.set(code, { at: Date.now(), loading: false, metar: null, errorKey: 'metarConnectErr', error: null });
  }
  if (state.panelMode === 'airport' && state.selectedAirport?.iata === airport.iata) {
    renderAirportDetail();
  }
}

function selectAirport(airport, fly = true) {
  state.selectedIcao = null;
  state.followSelected = false;
  globe.setSelectedFlight(null, false);
  globe.selectedAirportIata = airport.iata;
  state.selectedAirport = airport;
  if (fly) {
    globe.flyTo(airport.lat, airport.lon, Math.max(globe.targetZoom, 3.2));
  }
  setPanelMode('airport');
  fetchAirportMetarClient(airport);
}

function renderAirportDetail() {
  const apt = state.selectedAirport;
  if (!apt || !airportViewEl) return;
  document.getElementById('airport-code').textContent = apt.iata || '---';
  document.getElementById('airport-icao').textContent = apt.icao || '----';
  document.getElementById('airport-name').textContent = `${locAirportName(apt)}${apt.city ? ` · ${apt.city}` : ''}`;

  const code = (apt.icao || apt.iata || '').toUpperCase();
  const mState = state.metarCache.get(code);
  const fltCatEl = document.getElementById('airport-fltcat');
  const obsTimeEl = document.getElementById('metar-obs-time');
  const tempEl = document.getElementById('metar-temp');
  const windEl = document.getElementById('metar-wind');
  const visEl = document.getElementById('metar-vis');
  const qnhEl = document.getElementById('metar-qnh');
  const rawEl = document.getElementById('metar-raw');

  if (!mState || mState.loading) {
    fltCatEl.textContent = 'METAR';
    fltCatEl.className = 'phase-tag';
    obsTimeEl.textContent = t('statusLookingUp');
    tempEl.textContent = '--';
    windEl.textContent = '--';
    visEl.textContent = '--';
    qnhEl.textContent = '--';
    rawEl.textContent = t('metarLoading');
  } else if (mState.metar) {
    const m = mState.metar;
    fltCatEl.textContent = m.fltCat || 'METAR';
    fltCatEl.className = `phase-tag ${m.fltCat === 'VFR' ? 'climbing' : (m.fltCat === 'IFR' || m.fltCat === 'LIFR' ? 'emergency' : '')}`;
    obsTimeEl.textContent = m.obsTime ? `${String(m.obsTime).slice(11, 16)} UTC` : t('metarLatest');
    tempEl.textContent = m.tempC != null
      ? `${m.tempC}°C${m.dewpC != null ? ` / ${m.dewpC}°C` : ''}`
      : '--';
    windEl.textContent = m.wspd != null
      ? `${m.wdir != null ? `${m.wdir}° ` : ''}${m.wspd}kt${m.wgst ? ` G${m.wgst}` : ''}`
      : t('metarCalm');
    visEl.textContent = m.visib ? `${m.visib} SM` : '--';
    qnhEl.textContent = m.altimHpa != null ? `${m.altimHpa} hPa` : '--';
    rawEl.textContent = m.rawOb || t('metarNoRaw');
  } else {
    fltCatEl.textContent = 'METAR';
    fltCatEl.className = 'phase-tag';
    obsTimeEl.textContent = t('metarUnavailable');
    tempEl.textContent = '--';
    windEl.textContent = '--';
    visEl.textContent = '--';
    qnhEl.textContent = '--';
    rawEl.textContent = mState.errorKey ? t(mState.errorKey) : (mState.error || t('metarNoInfo'));
  }

  // Gather route-matched flights + nearby live flights within 180 km
  const iata = (apt.iata || '').toUpperCase();
  const icao = (apt.icao || '').toUpperCase();
  const matched = [];
  for (let i = 0; i < state.rawFlights.length; i++) {
    const f = state.rawFlights[i];
    const distKm = haversineKm(apt.lat, apt.lon, f.lat, f.lon);
    const orig = String(f.origin || '').toUpperCase();
    const dest = String(f.destination || '').toUpperCase();
    const isArr = (iata && dest === iata) || (icao && dest === icao);
    const isDep = (iata && orig === iata) || (icao && orig === icao);
    if (isArr || isDep || distKm <= 180) {
      matched.push({ f, distKm, role: isArr ? 'arr' : (isDep ? 'dep' : 'near') });
    }
  }
  matched.sort((a, b) => {
    const pA = a.role === 'near' ? 1 : 0;
    const pB = b.role === 'near' ? 1 : 0;
    if (pA !== pB) return pA - pB;
    return a.distKm - b.distKm;
  });

  document.getElementById('airport-flights-count').textContent = t('airportFlightsCount', { n: matched.length });
  const listEl = document.getElementById('airport-flights-list');
  if (matched.length === 0) {
    listEl.innerHTML = `<div class="empty-state">${t('airportFlightsEmpty')}</div>`;
    return;
  }
  listEl.innerHTML = matched.slice(0, 60).map(({ f, distKm, role }) => {
    const country = resolveAircraftCountry(f.icao24, f.registration, f.originCountry);
    const csInfo = decodeCallsign(f.callsign);
    const title = csInfo?.iataFlight && csInfo.iataFlight !== f.callsign
      ? `${country.flag} ${csInfo.iataFlight} (${f.callsign})`
      : `${country.flag} ${f.callsign || f.icao24}`;
    const pill = role === 'arr'
      ? `<span class="apt-dir-pill arr">${escapeHtml(t('aptArrival'))}</span>`
      : (role === 'dep'
        ? `<span class="apt-dir-pill dep">${escapeHtml(t('aptDeparture'))}</span>`
        : `<span class="apt-dir-pill near">${Math.round(distKm)}km</span>`);
    const sub = f.origin && f.destination
      ? `${f.origin} → ${f.destination} · ${f.aircraftType || 'ADS-B'}`
      : `${locAirline(csInfo) || locCountry(country)} · ${f.aircraftType || 'ADS-B'}`;
    return `
      <button type="button" class="flight-row" data-icao="${escapeHtml(f.icao24)}">
        <div class="flight-row-main">
          <div class="flight-row-callsign">${escapeHtml(title)}${pill}</div>
          <div class="flight-row-route">${escapeHtml(sub)}</div>
        </div>
        <div class="flight-row-meta">
          <strong>${formatNumber(f.altitudeFt)} ft</strong>
          <span>${f.speedKts} kts</span>
        </div>
      </button>
    `;
  }).join('');

  listEl.querySelectorAll('.flight-row').forEach((row) => {
    row.addEventListener('click', () => {
      selectFlight(row.dataset.icao, true);
    });
  });
}

function getCategoryLabel(cat) {
  if (!cat) return null;
  const key = `cat${cat}`;
  const translated = t(key);
  return translated !== key ? translated : cat;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function compassDir(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

function getFlightPhase(f) {
  if (f.estimated) {
    return f.estimateBasis === 'route'
      ? { label: t('phaseEstRoute'), cls: 'estimated' }
      : { label: t('phaseEstHeading'), cls: 'estimated' };
  }
  if (f.squawk === '7700' || f.emergency === 'general') return { label: t('phaseEmergency7700'), cls: 'emergency' };
  if (f.squawk === '7600') return { label: t('phaseEmergency7600'), cls: 'emergency' };
  if (f.squawk === '7500') return { label: t('phaseEmergency7500'), cls: 'emergency' };
  if (f.onGround) return { label: t('phaseGround'), cls: '' };
  const vr = f.verticalRateFpm || 0;
  const alt = f.altitudeFt || 0;
  if (vr > 350) return { label: alt < 10000 ? t('phaseTakeoff') : t('phaseClimbing'), cls: 'climbing' };
  if (vr < -350) return { label: alt < 10000 ? t('phaseApproach') : t('phaseDescending'), cls: 'descending' };
  if (alt >= 18000) return { label: t('phaseCruise', { fl: Math.round(alt / 100) }), cls: '' };
  return { label: t('phaseAirborne'), cls: '' };
}

function formatSquawkText(sqk, emergency) {
  if (!sqk || sqk === '----') return 'SQK ----';
  if (sqk === '7700') return t('sqk7700');
  if (sqk === '7600') return t('sqk7600');
  if (sqk === '7500') return t('sqk7500');
  if (emergency) return `SQK ${sqk} · ${emergency}`;
  return `SQK ${sqk}`;
}

function formatDurationLocal(minutes) {
  return formatDurationI18n(minutes);
}

function applyEnrichmentToFlight(f) {
  const info = state.enrichmentCache.get(f.icao24);
  if (!info || !info.flightroute) return f;
  const orig = info.flightroute.origin;
  const dest = info.flightroute.destination;
  if (orig && dest && typeof orig.lat === 'number' && typeof dest.lat === 'number') {
    const totalKm = Math.max(1, haversineKm(orig.lat, orig.lon, dest.lat, dest.lon));
    const flownKm = haversineKm(orig.lat, orig.lon, f.lat, f.lon);
    const remainKm = haversineKm(f.lat, f.lon, dest.lat, dest.lon);
    const progress = Math.max(0.02, Math.min(0.98, flownKm / (flownKm + remainKm || totalKm)));
    return {
      ...f,
      origin: orig.iata || orig.icao,
      destination: dest.iata || dest.icao,
      originCoords: [orig.lat, orig.lon],
      destCoords: [dest.lat, dest.lon],
      progress
    };
  }
  return f;
}

async function fetchHexDbAirportClient(icao) {
  try {
    const res = await fetch(`https://hexdb.io/api/v1/airport/icao/${encodeURIComponent(icao)}`);
    if (!res.ok) return { iata: icao, icao, name: icao, city: null, lat: null, lon: null };
    const ap = await res.json();
    return {
      iata: ap.iata || ap.icao || icao,
      icao: ap.icao || icao,
      name: ap.airport || icao,
      city: ap.region_name || ap.airport || null,
      lat: typeof ap.latitude === 'number' ? ap.latitude : null,
      lon: typeof ap.longitude === 'number' ? ap.longitude : null
    };
  } catch {
    return { iata: icao, icao, name: icao, city: null, lat: null, lon: null };
  }
}

async function fetchFlightEnrichment(flight) {
  const icao = flight.icao24;
  if (!icao || state.enrichmentCache.has(icao) || state.enrichmentPending.has(icao)) return;
  state.enrichmentPending.add(icao);
  if (state.selectedIcao === icao && state.panelMode === 'detail') {
    renderFlightDetail();
  }

  try {
    let data = null;
    if (state.backendAvailable) {
      const qs = new URLSearchParams({ callsign: flight.callsign || '' });
      const res = await fetch(apiUrl(`/api/enrich/${encodeURIComponent(icao)}?${qs.toString()}`));
      if (res.ok) data = await res.json();
    } else {
      // Static GitHub Pages fallback: query CORS-open adsbdb.com + hexdb.io directly
      const call = (flight.callsign || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
      let aircraft = null;
      let flightroute = null;
      let photo = null;

      try {
        const url = call && call.toLowerCase() !== icao
          ? `https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(icao.toUpperCase())}?callsign=${encodeURIComponent(call)}`
          : `https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(icao.toUpperCase())}`;
        const res = await fetch(url);
        if (res.ok) {
          const raw = await res.json();
          const r = raw?.response || {};
          const ac = r.aircraft && typeof r.aircraft === 'object' ? r.aircraft : null;
          const fr = r.flightroute && typeof r.flightroute === 'object' ? r.flightroute : null;
          if (ac) {
            aircraft = {
              type: ac.type,
              icaoType: ac.icao_type,
              manufacturer: ac.manufacturer,
              registration: ac.registration,
              owner: ac.registered_owner,
              ownerCountry: ac.registered_owner_country_name
            };
            if (ac.url_photo || ac.url_photo_thumbnail) {
              photo = { url: ac.url_photo || ac.url_photo_thumbnail, credit: 'adsbdb' };
            }
          }
          if (fr) {
            flightroute = {
              callsignIata: fr.callsign_iata,
              airline: fr.airline,
              origin: fr.origin ? {
                iata: fr.origin.iata_code || fr.origin.icao_code,
                icao: fr.origin.icao_code,
                name: fr.origin.name,
                city: fr.origin.municipality,
                lat: fr.origin.latitude,
                lon: fr.origin.longitude
              } : null,
              destination: fr.destination ? {
                iata: fr.destination.iata_code || fr.destination.icao_code,
                icao: fr.destination.icao_code,
                name: fr.destination.name,
                city: fr.destination.municipality,
                lat: fr.destination.latitude,
                lon: fr.destination.longitude
              } : null
            };
          }
        }
      } catch {
        // Fallback to hexdb below
      }

      if (!flightroute && call && call.toLowerCase() !== icao) {
        try {
          const rHex = await fetch(`https://hexdb.io/api/v1/route/icao/${encodeURIComponent(call)}`);
          if (rHex.ok) {
            const jHex = await rHex.json();
            const legs = String(jHex?.route || '').split('-').map((s) => s.trim().toUpperCase()).filter(Boolean);
            if (legs.length >= 2) {
              const [origin, destination] = await Promise.all([
                fetchHexDbAirportClient(legs[0]),
                fetchHexDbAirportClient(legs[legs.length - 1])
              ]);
              flightroute = { callsignIata: null, airline: null, origin, destination };
            }
          }
        } catch {
          // Ignore
        }
      }

      data = { ok: Boolean(aircraft || flightroute || photo), aircraft, flightroute, photo };
    }

    state.enrichmentCache.set(icao, data || { ok: false, aircraft: null, flightroute: null, photo: null });
  } catch {
    state.enrichmentCache.set(icao, { ok: false, aircraft: null, flightroute: null, photo: null });
  } finally {
    state.enrichmentPending.delete(icao);
    if (state.selectedIcao === icao && state.panelMode === 'detail') {
      renderFlightDetail();
    }
    if (state.panelMode === 'list') {
      renderFlightList();
    }
  }
}

function renderFlightList() {
  const cLat = globe.camLat;
  const cLon = ((((globe.camLon + 180) % 360) + 360) % 360) - 180;
  const sorted = [...state.flights].sort((a, b) => {
    const da = (a.lat - cLat) ** 2 + (a.lon - cLon) ** 2;
    const db = (b.lat - cLat) ** 2 + (b.lon - cLon) ** 2;
    return da - db;
  });
  const topFlights = sorted.slice(0, 150);
  if (state.flights.length === 0) {
    listSubtitleEl.textContent = t('listEmptySub');
    listContainerEl.innerHTML = `<p class="panel-subtitle">${escapeHtml(t('listEmptyBody'))}</p>`;
    return;
  }

  listSubtitleEl.textContent = state.searchQuery
    ? t('listSearchSummary', { total: formatNumber(state.flights.length), shown: topFlights.length })
    : t('listLiveSummary', { total: formatNumber(state.flights.length), shown: topFlights.length });

  listContainerEl.innerHTML = topFlights
    .map((f) => {
      const selectedClass = f.icao24 === state.selectedIcao ? ' selected' : '';
      const country = resolveAircraftCountry(f.icao24, f.registration, f.originCountry);
      const csInfo = decodeCallsign(f.callsign);
      const enriched = state.enrichmentCache.get(f.icao24);
      const iataCode = enriched?.flightroute?.callsignIata || f.iataFlight || csInfo?.iataFlight;
      const callLabel = iataCode && iataCode !== f.callsign ? `${iataCode} · ${f.callsign}` : f.callsign;
      const route = enriched?.flightroute;
      const routeStr = route?.origin && route?.destination
        ? `${route.origin.iata || route.origin.icao} → ${route.destination.iata || route.destination.icao}`
        : (f.origin && f.destination ? `${f.origin} → ${f.destination}` : null);
      const airlineStr = locAirline(csInfo) || enriched?.flightroute?.airline?.name || f.airlineName || null;
      const subParts = [routeStr, airlineStr, locCountry(country)].filter(Boolean);
      const estTag = f.estimated ? `<span class="est-pill">${escapeHtml(t('estShortBadge'))}</span>` : '';
      return `
        <button type="button" class="flight-row${selectedClass}" data-icao="${escapeHtml(f.icao24)}">
          <div class="flight-row-main">
            <span class="flight-row-callsign">${country.flag} ${escapeHtml(callLabel)} <span class="muted">${escapeHtml(f.aircraftType)}</span>${estTag}</span>
            <span class="flight-row-sub">${escapeHtml(subParts.join(' · '))}</span>
          </div>
          <div class="flight-row-metrics">
            <div>${formatNumber(f.altitudeFt)} ft</div>
            <div class="muted">${f.speedKts} kts</div>
          </div>
        </button>
      `;
    })
    .join('');

  listContainerEl.querySelectorAll('.flight-row').forEach((btn) => {
    btn.addEventListener('click', () => selectFlight(btn.dataset.icao, true));
  });
}

function renderLiveAltitudeChart(flight) {
  const svg = document.getElementById('altitude-profile-svg');
  const track = state.trackHistory.get(flight.icao24) || [{ altFt: flight.altitudeFt }];
  const maxAlt = Math.max(42000, ...track.map((p) => p.altFt || 0));

  if (track.length === 1) {
    const y = 52 - Math.min(1, (flight.altitudeFt || 0) / maxAlt) * 40;
    svg.innerHTML = `
      <line x1="14" y1="52" x2="266" y2="52" stroke="rgba(148,184,218,0.22)" stroke-width="1"/>
      <line x1="14" y1="${y.toFixed(1)}" x2="266" y2="${y.toFixed(1)}" stroke="rgba(56,189,248,0.45)" stroke-dasharray="3 3" stroke-width="1.2"/>
      <circle cx="258" cy="${y.toFixed(1)}" r="4" fill="#fbbf24" stroke="#091322" stroke-width="1.5"/>
      <text x="16" y="14" fill="#6c859e" font-size="10" font-family="ui-monospace, monospace">${escapeHtml(t('profileAccumulating'))}</text>
    `;
    return;
  }

  const pts = track.map((pt, idx) => {
    const x = 14 + (idx / (track.length - 1)) * 252;
    const y = 52 - Math.min(1, Math.max(0, (pt.altFt || 0) / maxAlt)) * 40;
    return [x, y];
  });
  const lineD = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const areaD = `${lineD} L ${pts[pts.length - 1][0].toFixed(1)} 52 L 14 52 Z`;
  const last = pts[pts.length - 1];

  svg.innerHTML = `
    <defs>
      <linearGradient id="liveAltGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.34"/>
        <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    <line x1="14" y1="52" x2="266" y2="52" stroke="rgba(148,184,218,0.22)" stroke-width="1"/>
    <path d="${areaD}" fill="url(#liveAltGrad)"/>
    <path d="${lineD}" fill="none" stroke="#38bdf8" stroke-width="1.8"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4" fill="#fbbf24" stroke="#091322" stroke-width="1.5"/>
  `;
}

function renderFlightDetail() {
  const f = state.rawFlights.find((item) => item.icao24 === state.selectedIcao);
  if (!f) return;

  const enriched = state.enrichmentCache.get(f.icao24);
  const isPending = state.enrichmentPending.has(f.icao24);
  const acInfo = enriched?.aircraft;
  const routeInfo = enriched?.flightroute;
  const photoInfo = enriched?.photo;
  const csInfo = decodeCallsign(f.callsign);

  const icaoType = acInfo?.icaoType || f.aircraftType || 'ADS-B';
  const regDisplay = acInfo?.registration || f.registration || '---';
  const country = resolveAircraftCountry(
    f.icao24,
    regDisplay,
    acInfo?.ownerCountry || routeInfo?.airline?.country || f.originCountry
  );
  const iataFlight = routeInfo?.callsignIata || f.iataFlight || csInfo?.iataFlight;
  const airlineDisplay = locAirline(csInfo)
    || routeInfo?.airline?.name
    || acInfo?.owner
    || f.airlineName
    || t('civilianAircraft');
  const countryDisplay = `${country.flag} ${locCountry(country)}`;

  document.getElementById('detail-callsign').textContent = iataFlight && iataFlight !== f.callsign
    ? `${iataFlight} · ${f.callsign}`
    : f.callsign;
  document.getElementById('detail-aircraft-type').textContent = icaoType;
  document.getElementById('detail-country-pill').textContent = countryDisplay;
  document.getElementById('detail-airline').textContent = airlineDisplay;

  // Flight Phase Badge
  const phase = getFlightPhase(f);
  const phaseEl = document.getElementById('detail-phase');
  phaseEl.textContent = phase.label;
  phaseEl.className = `phase-tag${phase.cls ? ' ' + phase.cls : ''}`;

  // Real Origin -> Destination Route Card (always visible)
  const routeCardEl = document.getElementById('detail-route-card');
  const effectiveOrigin = routeInfo?.origin || (f.origin && f.originCoords ? { iata: f.origin, city: t('routeOriginFallback'), lat: f.originCoords[0], lon: f.originCoords[1] } : null);
  const effectiveDest = routeInfo?.destination || (f.destination && f.destCoords ? { iata: f.destination, city: t('routeDestFallback'), lat: f.destCoords[0], lon: f.destCoords[1] } : null);

  if (effectiveOrigin && effectiveDest) {
    const o = effectiveOrigin;
    const d = effectiveDest;
    routeCardEl.classList.remove('unavailable');
    document.getElementById('detail-origin-iata').textContent = o.iata || o.icao || '---';
    document.getElementById('detail-origin-city').textContent = o.city || o.name || t('routeOriginFallback');
    document.getElementById('detail-dest-iata').textContent = d.iata || d.icao || '---';
    document.getElementById('detail-dest-city').textContent = d.city || d.name || t('routeDestFallback');

    if (typeof o.lat === 'number' && typeof d.lat === 'number') {
      const totalKm = Math.max(1, haversineKm(o.lat, o.lon, d.lat, d.lon));
      const flownKm = haversineKm(o.lat, o.lon, f.lat, f.lon);
      const remainKm = Math.round(haversineKm(f.lat, f.lon, d.lat, d.lon));
      const pct = Math.max(2, Math.min(98, Math.round((flownKm / (flownKm + remainKm || totalKm)) * 100)));
      const etaMin = f.speedKmh > 120 ? Math.round((remainKm / f.speedKmh) * 60) : 0;
      document.getElementById('detail-route-progress').style.width = `${pct}%`;
      document.getElementById('detail-route-eta').textContent = etaMin > 0
        ? t('routeRemain', { km: formatNumber(remainKm), dur: formatDurationLocal(etaMin) })
        : t('routeTotal', { km: formatNumber(Math.round(totalKm)) });
    } else {
      document.getElementById('detail-route-progress').style.width = '50%';
      document.getElementById('detail-route-eta').textContent = t('routeActive');
    }
  } else if (isPending || !enriched) {
    routeCardEl.classList.remove('unavailable');
    document.getElementById('detail-origin-iata').textContent = '...';
    document.getElementById('detail-origin-city').textContent = t('routeLookupShort');
    document.getElementById('detail-dest-iata').textContent = '...';
    document.getElementById('detail-dest-city').textContent = t('routeLookupShort');
    document.getElementById('detail-route-progress').style.width = '30%';
    document.getElementById('detail-route-eta').textContent = t('routeLookupLong');
  } else {
    routeCardEl.classList.add('unavailable');
    document.getElementById('detail-origin-iata').textContent = t('routeUnavailableCode');
    document.getElementById('detail-origin-city').textContent = t('routeUnavailableOrigin');
    document.getElementById('detail-dest-iata').textContent = t('routeUnavailableCode');
    document.getElementById('detail-dest-city').textContent = t('routeUnavailableDest');
    document.getElementById('detail-route-progress').style.width = '0%';
    document.getElementById('detail-route-eta').textContent = t('routeUnavailableNote');
  }

  // Aircraft Photo Card
  const photoCardEl = document.getElementById('detail-photo-card');
  const photoImgEl = document.getElementById('detail-photo-img');
  if (photoInfo?.url) {
    if (photoImgEl.dataset.src !== photoInfo.url) {
      photoImgEl.dataset.src = photoInfo.url;
      photoImgEl.dataset.failed = '';
      photoImgEl.src = photoInfo.url;
      photoImgEl.onerror = () => {
        photoImgEl.dataset.failed = '1';
        photoCardEl.classList.add('hidden');
      };
    }
    const fullModel = [acInfo?.manufacturer, acInfo?.type].filter(Boolean).join(' ') || f.aircraftLabel || icaoType;
    document.getElementById('detail-photo-model').textContent = `${fullModel} · ${regDisplay}`;
    document.getElementById('detail-photo-credit').textContent = photoInfo.credit || '';
    if (photoImgEl.dataset.failed === '1') {
      photoCardEl.classList.add('hidden');
    } else {
      photoCardEl.classList.remove('hidden');
    }
  } else {
    photoCardEl.classList.add('hidden');
  }

  // Source & Signal Age
  if (f.estimated) {
    document.getElementById('detail-source').textContent = f.estimateBasis === 'route'
      ? t('estSourceRoute')
      : t('estSourceTrack');
    const estAge = f.lastLiveAt ? formatAge(f.lastLiveAt) : formatAge(f.lastContact);
    document.getElementById('detail-contact-age').textContent = t('lastSignalPrefix', { age: estAge });
  } else {
    document.getElementById('detail-source').textContent = f.source === 'adsblol'
      ? 'adsb.lol Live ADS-B'
      : (f.source === 'adsbfi' ? 'adsb.fi Open Data' : (f.source === 'flyitaly' ? 'FlyItalyADSB' : 'OpenSky Network'));
    document.getElementById('detail-contact-age').textContent = formatAge(f.lastContact);
  }

  // Core Telemetry Grid
  const altSub = f.altGeomFt && Math.abs(f.altGeomFt - f.altitudeFt) > 150
    ? `${formatNumber(f.altitudeM)} m · GPS ${formatNumber(f.altGeomFt)} ft`
    : `${formatNumber(f.altitudeM)} m`;
  document.getElementById('detail-alt-ft').textContent = `${formatNumber(f.altitudeFt)} ft`;
  document.getElementById('detail-alt-m').textContent = altSub;

  document.getElementById('detail-speed-kts').textContent = `${f.speedKts} kts`;
  document.getElementById('detail-speed-kmh').textContent = f.mach
    ? `${f.speedKmh} km/h · M ${f.mach.toFixed(2)}`
    : `${f.speedKmh} km/h`;

  document.getElementById('detail-heading').textContent = `${Math.round(f.heading)}° ${compassDir(f.heading)}`;
  const vrate = f.verticalRateFpm || 0;
  const vSign = vrate > 30 ? '▲ +' : vrate < -30 ? '▼ ' : '● ';
  document.getElementById('detail-vrate').textContent = `${vSign}${vrate} fpm`;

  document.getElementById('detail-coords').textContent = `${f.lat.toFixed(3)}°, ${f.lon.toFixed(3)}°`;
  document.getElementById('detail-squawk').textContent = formatSquawkText(f.squawk, f.emergency);

  // Extended Aircraft Specs, Avionics & Weather
  const enrichStatusEl = document.getElementById('detail-enrich-status');
  if (state.enrichmentPending.has(f.icao24)) {
    enrichStatusEl.textContent = t('statusLookingUp');
  } else if (enriched?.ok) {
    enrichStatusEl.textContent = t('statusDbReady');
  } else {
    enrichStatusEl.textContent = t('statusAdsbLive');
  }

  const noDataLabel = t('noData');
  const fullModelStr = [acInfo?.manufacturer, acInfo?.type].filter(Boolean).join(' ')
    || (f.aircraftLabel && f.aircraftLabel !== 'Live Transponder' ? f.aircraftLabel : noDataLabel);
  document.getElementById('spec-model').textContent = fullModelStr;
  document.getElementById('spec-owner').textContent = acInfo?.owner || routeInfo?.airline?.name || locAirline(csInfo) || f.airlineName || noDataLabel;

  const iconMeta = classifyAircraftIcon(f);
  const catLabel = getCategoryLabel(f.category);
  const yearLabel = f.year ? t('builtYear', { year: f.year }) : null;
  document.getElementById('spec-category').textContent = [locIconLabel(iconMeta), catLabel, yearLabel].filter(Boolean).join(' · ') || noDataLabel;

  const airspeedParts = [];
  if (f.mach) airspeedParts.push(`Mach ${f.mach.toFixed(2)}`);
  if (f.ias) airspeedParts.push(`IAS ${f.ias}kt`);
  if (f.tas) airspeedParts.push(`TAS ${f.tas}kt`);
  document.getElementById('spec-airspeed').textContent = airspeedParts.join(' · ') || t('notReceived');

  const navParts = [];
  if (f.navAltFt) navParts.push(`MCP ${formatNumber(f.navAltFt)} ft`);
  if (f.navQnh) navParts.push(`QNH ${f.navQnh} hPa`);
  document.getElementById('spec-nav').textContent = navParts.join(' · ') || t('notReceived');

  const weatherParts = [];
  if (f.windDir !== null && f.windDir !== undefined && f.windSpeedKts !== null && f.windSpeedKts !== undefined) {
    weatherParts.push(`${f.windDir}° / ${f.windSpeedKts} kts`);
  }
  if (f.oat !== null && f.oat !== undefined) weatherParts.push(`${f.oat}°C`);
  document.getElementById('spec-weather').textContent = weatherParts.join(' · ') || t('notReceived');

  const sigParts = [f.positionSource || 'ADS-B'];
  if (f.rssi !== null && f.rssi !== undefined) sigParts.push(`${f.rssi} dBFS`);
  if (f.messages) sigParts.push(`${formatNumber(f.messages)} pkt`);
  document.getElementById('spec-signal').textContent = sigParts.join(' · ');

  // Footer & Chart
  document.getElementById('detail-aircraft-label').textContent = fullModelStr !== noDataLabel ? fullModelStr : (f.aircraftLabel || 'Live Transponder');
  document.getElementById('detail-icao').textContent = f.icao24.toUpperCase();
  document.getElementById('detail-reg').textContent = regDisplay;
  document.getElementById('detail-country').textContent = countryDisplay;

  followBtn.classList.toggle('active', state.followSelected);
  followBtn.textContent = state.followSelected ? t('unfollowBtn') : t('followBtn');
  renderLiveAltitudeChart(f);
}

function formatSourceTitle(src, scanProgress) {
  if (src === 'opensky') return t('srcOpenSky');
  if (src === 'flyitaly') return t('srcFlyItaly');
  if (src === 'adsb-global') {
    if (scanProgress && scanProgress.completed < scanProgress.total) {
      return t('srcGridScanning', { done: scanProgress.completed, total: scanProgress.total });
    }
    return t('srcGridComplete', { total: scanProgress?.total || 103 });
  }
  if (src === 'adsb-local') return t('srcLocalDual');
  if (src === 'adsblol') return t('srcAdsbLol');
  if (src === 'adsbfi') return t('srcAdsbFi');
  return 'LIVE · ADS-B';
}

function handleLivePayload(payload) {
  if (!payload || payload.skipped) return;

  if (payload.ok) {
    state.activeSource = payload.activeSource || state.provider;
    state.lastScanProgress = payload.scanProgress || null;
    state.rawFlights = payload.flights || [];
    state.lastSyncMs = performance.now();
    state.lastUpdatedAt = payload.updatedAt || Date.now();
    recordTrackPoints(state.rawFlights);

    statusDotEl.className = 'status-dot';
    sourceLabelEl.textContent = formatSourceTitle(state.activeSource, payload.scanProgress);

    if (payload.notice && state.activeSource !== 'adsb-global') {
      liveNoticeEl.textContent = payload.notice;
      liveNoticeEl.classList.remove('hidden');
    } else {
      liveNoticeEl.classList.add('hidden');
    }
    applySearchFilter();

    // Auto-select flight from shared deep-link (?flight=KAL081 or ?flight=71be20)
    if (state.pendingDeepLinkFlight) {
      const target = state.pendingDeepLinkFlight;
      const found = state.rawFlights.find((f) =>
        (f.callsign && f.callsign.toUpperCase() === target) ||
        (f.iataFlight && f.iataFlight.toUpperCase() === target) ||
        (f.icao24 && f.icao24.toUpperCase() === target)
      );
      if (found) {
        state.pendingDeepLinkFlight = null;
        selectFlight(found.icao24, true);
      }
    }
    return;
  }

  // Strictly real-time ONLY: never inject simulated aircraft on error.
  statusDotEl.className = state.rawFlights.length > 0 ? 'status-dot warn' : 'status-dot error';
  sourceLabelEl.textContent = state.rawFlights.length > 0
    ? t('srcHolding')
    : t('srcWaiting');
  liveNoticeEl.textContent = payload.error || t('errFeedFallback');
  liveNoticeEl.classList.remove('hidden');
}

function stopConnections() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

async function fetchBackendOnce() {
  const lat = Number(globe.targetLat.toFixed(3));
  const lon = Number(((((globe.targetLon + 180) % 360) + 360) % 360 - 180).toFixed(3));
  const qs = new URLSearchParams({
    provider: state.provider,
    lat: String(lat),
    lon: String(lon),
    estimated: state.showEstimated ? '1' : '0'
  });
  try {
    const res = await fetch(apiUrl(`/api/flights?${qs.toString()}`), { cache: 'no-store' });
    if (!res.ok) {
      handleLivePayload({ ok: false, error: t('errBackendHttp', { status: res.status }) });
      return;
    }
    const payload = await res.json();
    handleLivePayload(payload);
  } catch (err) {
    handleLivePayload({ ok: false, error: t('errNetwork', { msg: err?.message || 'network' }) });
  }
}

async function fetchDirectOnce(force = false) {
  const lat = Number(globe.targetLat.toFixed(3));
  const lon = Number(((((globe.targetLon + 180) % 360) + 360) % 360 - 180).toFixed(3));
  const payload = await liveClient.fetchLive({
    provider: state.provider,
    lat,
    lon,
    force
  });
  handleLivePayload(payload);
}

function connectLiveFeed(force = false) {
  stopConnections();
  statusDotEl.className = 'status-dot warn';
  sourceLabelEl.textContent = t('srcLoading');

  if (state.backendAvailable) {
    // Reliable JSON polling (6s when active, throttled to 15s when browser tab is hidden)
    let hiddenTicks = 0;
    fetchBackendOnce();
    state.pollTimer = setInterval(() => {
      if (document.hidden) {
        hiddenTicks++;
        if (hiddenTicks < 3) return;
        hiddenTicks = 0;
      } else {
        hiddenTicks = 0;
      }
      fetchBackendOnce();
    }, 6000);
    return;
  }

  // Static hosting (GitHub Pages): direct browser live ADS-B polling
  fetchDirectOnce(force);
  const intervalMs = state.provider === 'adsbfi' ? 6000 : 20000;
  state.pollTimer = setInterval(() => {
    if (!document.hidden) fetchDirectOnce(false);
  }, intervalMs);
}

async function probeBackendHealth(baseUrl, timeoutMs = 4000) {
  try {
    const url = baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/health` : './api/health';
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return false;
    const data = await res.json();
    return data?.status === 'ok';
  } catch {
    return false;
  }
}

async function detectBackend() {
  // 1) Same-origin Node server (Render or local server)
  if (await probeBackendHealth('', 2500)) {
    state.apiBase = '';
    return true;
  }
  // 2) Static hosting (GitHub Pages) -> auto-connect to shared Render live API
  const remoteBase = (urlParams.get('api') || DEFAULT_REMOTE_API_BASE || '').trim();
  if (remoteBase && await probeBackendHealth(remoteBase, 5000)) {
    state.apiBase = remoteBase.replace(/\/$/, '');
    return true;
  }
  return false;
}

async function loadAirports() {
  if (state.backendAvailable) {
    try {
      const res = await fetch(apiUrl('/api/airports'));
      const data = await res.json();
      globe.setAirports(data.airports || STATIC_AIRPORTS);
      return;
    } catch {
      // Fallback to static airport reference coordinates
    }
  }
  globe.setAirports(STATIC_AIRPORTS);
}

function bindUI() {
  // Real-time ADS-B source buttons (OpenSky global vs adsb.fi local 250NM)
  document.querySelectorAll('.mode-btn[data-provider]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn[data-provider]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.provider = btn.dataset.provider;
      connectLiveFeed(true);
    });
  });

  refreshBtn.addEventListener('click', () => connectLiveFeed(true));

  searchInputEl.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    applySearchFilter();
    if (state.searchQuery.trim() && state.panelMode === 'none') {
      setPanelMode('list');
    }
  });

  toggleListBtn.addEventListener('click', () => {
    setPanelMode(state.panelMode === 'list' ? 'none' : 'list');
  });

  const hudTopEl = document.getElementById('hud-top');
  const hudBottomEl = document.getElementById('hud-bottom');
  const mobileSearchBtn = document.getElementById('mobile-search-btn');
  const mobileListBtn = document.getElementById('mobile-list-btn');
  const mobileLayersBtn = document.getElementById('mobile-layers-btn');
  const mobileZoomInBtn = document.getElementById('mobile-zoom-in-btn');
  const mobileZoomOutBtn = document.getElementById('mobile-zoom-out-btn');
  const sheetHandleEl = document.getElementById('sheet-handle');

  if (mobileSearchBtn && hudTopEl) {
    mobileSearchBtn.addEventListener('click', () => {
      const open = hudTopEl.classList.toggle('search-open');
      mobileSearchBtn.classList.toggle('active', open);
      if (open) {
        setTimeout(() => searchInputEl.focus(), 50);
      }
    });
  }

  if (mobileListBtn) {
    mobileListBtn.addEventListener('click', () => {
      setPanelMode(state.panelMode === 'list' ? 'none' : 'list');
    });
  }

  if (mobileLayersBtn && hudBottomEl) {
    mobileLayersBtn.addEventListener('click', () => {
      const open = hudBottomEl.classList.toggle('layers-open');
      mobileLayersBtn.classList.toggle('active', open);
    });
  }

  if (mobileZoomInBtn) {
    mobileZoomInBtn.addEventListener('click', () => {
      globe.targetZoom = Math.min(globe.maxZoom, globe.targetZoom * 1.65);
    });
  }

  if (mobileZoomOutBtn) {
    mobileZoomOutBtn.addEventListener('click', () => {
      globe.targetZoom = Math.max(globe.minZoom, globe.targetZoom / 1.65);
    });
  }

  if (sheetHandleEl) {
    sheetHandleEl.addEventListener('click', () => {
      if (state.panelMode === 'detail') {
        state.selectedIcao = null;
        state.followSelected = false;
        globe.setSelectedFlight(null);
      }
      setPanelMode('none');
    });
  }

  document.getElementById('close-list-btn').addEventListener('click', () => setPanelMode('none'));
  document.getElementById('close-detail-btn').addEventListener('click', () => {
    state.selectedIcao = null;
    state.followSelected = false;
    globe.setSelectedFlight(null);
    setPanelMode('none');
  });
  const closeAirportBtn = document.getElementById('close-airport-btn');
  if (closeAirportBtn) {
    closeAirportBtn.addEventListener('click', () => {
      state.selectedAirport = null;
      globe.selectedAirportIata = null;
      setPanelMode('none');
    });
  }

  // Interactive one-click aircraft category / purpose filters on bottom-right legend
  document.querySelectorAll('.legend-filter-btn[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.filter;
      state.categoryFilter = state.categoryFilter === next ? null : next;
      if (state.categoryFilter === 'estimated' && !state.showEstimated) {
        state.showEstimated = true;
        const estBtn = document.getElementById('toggle-estimated');
        if (estBtn) estBtn.classList.add('active');
        if (state.backendAvailable) fetchBackendOnce();
      }
      updateCategoryFilterUI();
      applySearchFilter();
    });
  });

  const clearFilterBtn = document.getElementById('clear-filter-btn');
  if (clearFilterBtn) {
    clearFilterBtn.addEventListener('click', () => {
      state.categoryFilter = null;
      updateCategoryFilterUI();
      applySearchFilter();
    });
  }
  updateCategoryFilterUI();

  // Region camera presets — immediately fetch live planes around the new region too
  document.querySelectorAll('#region-presets .chip-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#region-presets .chip-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.followSelected = false;
      globe.setFollowSelected(false);
      globe.flyTo(Number(btn.dataset.lat), Number(btn.dataset.lon), Number(btn.dataset.zoom));
      if (state.backendAvailable) {
        setTimeout(() => fetchBackendOnce(), 150);
      } else if (state.provider === 'adsbfi' || state.activeSource === 'adsbfi') {
        setTimeout(() => connectLiveFeed(true), 150);
      }
    });
  });

  const bindToggle = (id, optKey) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', () => {
      const next = !globe.options[optKey];
      globe.setOption(optKey, next);
      el.classList.toggle('active', next);
    });
  };
  bindToggle('toggle-rotate', 'autoRotate');
  bindToggle('toggle-daynight', 'dayNight');
  bindToggle('toggle-trails', 'showTrails');
  bindToggle('toggle-places', 'showPlaces');
  bindToggle('toggle-airports', 'showAirports');

  const estToggleBtn = document.getElementById('toggle-estimated');
  const legendEstEl = document.getElementById('legend-estimated');
  if (estToggleBtn) {
    estToggleBtn.addEventListener('click', () => {
      state.showEstimated = !state.showEstimated;
      estToggleBtn.classList.toggle('active', state.showEstimated);
      if (legendEstEl) legendEstEl.classList.toggle('hidden', !state.showEstimated);
      if (!state.showEstimated && state.categoryFilter === 'estimated') {
        state.categoryFilter = null;
        updateCategoryFilterUI();
      }
      applySearchFilter();
      if (state.backendAvailable) {
        fetchBackendOnce();
      }
    });
  }

  document.getElementById('zoom-in-btn').addEventListener('click', () => {
    globe.targetZoom = Math.min(globe.maxZoom, globe.targetZoom * 1.65);
  });
  document.getElementById('zoom-out-btn').addEventListener('click', () => {
    globe.targetZoom = Math.max(globe.minZoom, globe.targetZoom / 1.65);
  });

  followBtn.addEventListener('click', () => {
    if (!state.selectedIcao) return;
    state.followSelected = !state.followSelected;
    globe.setFollowSelected(state.followSelected);
    if (state.followSelected) {
      globe.setOption('autoRotate', false);
      document.getElementById('toggle-rotate').classList.remove('active');
    }
    renderFlightDetail();
  });

  centerBtn.addEventListener('click', () => {
    const f = state.rawFlights.find((item) => item.icao24 === state.selectedIcao);
    if (f) globe.flyTo(f.lat, f.lon, Math.max(globe.targetZoom, 2.3));
  });

  if (langToggleBtn) {
    langToggleBtn.addEventListener('click', () => {
      const next = getLang() === 'en' ? 'ko' : 'en';
      setLang(next);
      globe.setOption('lang', next);
      applyDomTranslations(next);
      if (state.rawFlights.length > 0) {
        sourceLabelEl.textContent = formatSourceTitle(state.activeSource, state.lastScanProgress);
      }
      applySearchFilter();
    });
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const f = state.rawFlights.find((item) => item.icao24 === state.selectedIcao);
      const shareParams = new URLSearchParams();
      if (f) {
        shareParams.set('flight', f.callsign || f.icao24);
        shareParams.set('lat', Number(f.lat).toFixed(2));
        shareParams.set('lon', Number(f.lon).toFixed(2));
      } else {
        shareParams.set('lat', Number(globe.targetLat).toFixed(2));
        shareParams.set('lon', Number(globe.targetLon).toFixed(2));
      }
      shareParams.set('zoom', Number(Math.max(globe.targetZoom, 2.4)).toFixed(2));
      if (state.categoryFilter) shareParams.set('filter', state.categoryFilter);
      if (getLang() === 'ko') shareParams.set('lang', 'ko');
      const shareUrl = `${window.location.origin}${window.location.pathname}?${shareParams.toString()}`;
      try {
        window.history.replaceState(null, '', `?${shareParams.toString()}`);
      } catch {
        // Ignore history restrictions
      }
      let copied = false;
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
          await navigator.clipboard.writeText(shareUrl);
          copied = true;
        } catch {
          copied = false;
        }
      }
      if (copied) {
        shareBtn.textContent = t('shareCopied');
        setTimeout(() => { shareBtn.textContent = t('shareBtn'); }, 2000);
      } else {
        window.prompt(t('sharePrompt'), shareUrl);
      }
    });
  }

  const handleResize = () => globe.resize();
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', () => setTimeout(handleResize, 120));
}

async function loadDetailedGeo() {
  try {
    const res = await fetch('./world-geo.json');
    if (res.ok) {
      const geo = await res.json();
      globe.setDetailedGeo(geo);
    }
  } catch {
    // Keep built-in coarse polygons as fallback
  }
}

function updateClock() {
  utcClockEl.textContent = `${new Date().toISOString().slice(11, 19)} UTC`;
  if (state.panelMode === 'detail' && state.selectedIcao) {
    const f = state.rawFlights.find((item) => item.icao24 === state.selectedIcao);
    if (f) {
      document.getElementById('detail-contact-age').textContent = f.estimated
        ? t('lastSignalPrefix', { age: formatAge(f.lastLiveAt || f.lastContact) })
        : formatAge(f.lastContact);
    }
  }
}

function animate(now) {
  const elapsedSec = (now - state.lastSyncMs) / 1000;
  const smoothFlights = state.flights.map((f) => {
    const moved = extrapolateLiveFlight(f, elapsedSec);
    return moved.icao24 === state.selectedIcao ? applyEnrichmentToFlight(moved) : moved;
  });
  globe.setFlights(smoothFlights);
  globe.render(now);
  requestAnimationFrame(animate);
}

async function init() {
  applyDomTranslations(getLang());
  bindUI();
  updateClock();
  setInterval(updateClock, 1000);
  requestAnimationFrame(animate);

  // Load 50m high-detail coastlines, country borders & lakes in parallel with backend detection
  loadDetailedGeo();
  state.backendAvailable = await detectBackend();
  await loadAirports();
  connectLiveFeed(true);
}

init();
