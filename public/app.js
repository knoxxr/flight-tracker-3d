import { Globe3D } from './globe.js';
import { BrowserFlightEngine, STATIC_AIRPORTS } from './flight-engine.js';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const browserEngine = new BrowserFlightEngine();

const state = {
  mode: 'auto',
  activeSource: 'simulation',
  fallbackReason: null,
  backendAvailable: false,
  rawFlights: [],
  flights: [],
  airports: [],
  searchQuery: '',
  selectedIcao: null,
  followSelected: false,
  panelMode: 'none', // 'none' | 'list' | 'detail'
  lastServerSyncMs: performance.now(),
  eventSource: null,
  staticPollTimer: null
};

// DOM References
const canvas = document.getElementById('globe-canvas');
const utcClockEl = document.getElementById('utc-clock');
const statusDotEl = document.getElementById('status-dot');
const sourceLabelEl = document.getElementById('source-label');
const flightCountEl = document.getElementById('flight-count');
const fallbackNoticeEl = document.getElementById('fallback-notice');
const searchInputEl = document.getElementById('flight-search');
const toggleListBtn = document.getElementById('toggle-list-btn');
const sidePanelEl = document.getElementById('side-panel');
const listViewEl = document.getElementById('flight-list-view');
const detailViewEl = document.getElementById('flight-detail-view');
const listContainerEl = document.getElementById('flight-list-container');
const listSubtitleEl = document.getElementById('list-subtitle');
const tooltipEl = document.getElementById('hover-tooltip');
const followBtn = document.getElementById('follow-flight-btn');
const centerBtn = document.getElementById('center-flight-btn');

const globe = new Globe3D(canvas, {
  initialLat: 32,
  initialLon: 126,
  initialZoom: 1.35,
  autoRotate: true,
  dayNight: true,
  showTrails: true,
  showAirports: true,
  onSelectFlight: (flight) => {
    if (flight) {
      selectFlight(flight.icao24, false);
    } else {
      state.selectedIcao = null;
      state.followSelected = false;
      if (state.panelMode === 'detail') {
        setPanelMode('none');
      }
    }
  },
  onHoverFlight: (flight, pos) => {
    if (!flight) {
      tooltipEl.classList.add('hidden');
      return;
    }
    const routeText = flight.origin && flight.destination
      ? ` · ${flight.origin} → ${flight.destination}`
      : '';
    tooltipEl.innerHTML = `
      <div><span class="tooltip-callsign">${escapeHtml(flight.callsign)}</span><span>${escapeHtml(routeText)}</span></div>
      <div class="tooltip-meta">${formatNumber(flight.altitudeFt)} ft · ${flight.speedKts} kts · HDG ${Math.round(flight.heading)}°</div>
    `;
    tooltipEl.style.left = `${Math.min(window.innerWidth - 220, pos.x + 14)}px`;
    tooltipEl.style.top = `${Math.max(12, pos.y - 42)}px`;
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

function formatEta(minutes) {
  if (!minutes || minutes <= 0) return '실시간 ADS-B';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `잔여 ${h}시간 ${m}분` : `잔여 ${m}분`;
}

// Smooth client-side 60fps dead-reckoning between server SSE pushes
function extrapolateFlight(flight, dtSec) {
  if (!flight || flight.onGround || !flight.speedMs || dtSec <= 0 || dtSec > 8) {
    return flight;
  }
  // Simulator runs accelerated timeScale (~14x); live ADS-B moves at real 1x speed
  const speedMultiplier = flight.source === 'simulation' ? 14 : 1;
  const distKm = (flight.speedMs * dtSec * speedMultiplier) / 1000;
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

function applySearchFilter() {
  const q = state.searchQuery.trim().toLowerCase();
  if (!q) {
    state.flights = state.rawFlights;
  } else {
    state.flights = state.rawFlights.filter((f) =>
      (f.callsign && f.callsign.toLowerCase().includes(q)) ||
      (f.flightNumber && f.flightNumber.toLowerCase().includes(q)) ||
      (f.icao24 && f.icao24.toLowerCase().includes(q)) ||
      (f.airline && f.airline.toLowerCase().includes(q)) ||
      (f.origin && f.origin.toLowerCase().includes(q)) ||
      (f.destination && f.destination.toLowerCase().includes(q)) ||
      (f.originCountry && f.originCountry.toLowerCase().includes(q))
    );
  }
  flightCountEl.textContent = formatNumber(state.flights.length);
  if (state.panelMode === 'list') {
    renderFlightList();
  }
  if (state.panelMode === 'detail' && state.selectedIcao) {
    renderFlightDetail();
  }
}

function setPanelMode(mode) {
  state.panelMode = mode;
  if (mode === 'none') {
    sidePanelEl.classList.add('hidden');
    listViewEl.classList.add('hidden');
    detailViewEl.classList.add('hidden');
    return;
  }
  sidePanelEl.classList.remove('hidden');
  listViewEl.classList.toggle('hidden', mode !== 'list');
  detailViewEl.classList.toggle('hidden', mode !== 'detail');
  if (mode === 'list') renderFlightList();
  if (mode === 'detail') renderFlightDetail();
}

function selectFlight(icao24, fly = true) {
  state.selectedIcao = icao24;
  globe.setSelectedFlight(icao24, fly);
  setPanelMode('detail');
  renderFlightDetail();
}

function renderFlightList() {
  const topFlights = state.flights.slice(0, 60);
  listSubtitleEl.textContent = state.searchQuery
    ? `검색 결과 ${state.flights.length}대 중 상위 ${topFlights.length}대`
    : `전체 ${state.flights.length}대 중 상위 ${topFlights.length}대`;

  listContainerEl.innerHTML = topFlights
    .map((f) => {
      const route = f.origin && f.destination ? `${f.origin} → ${f.destination}` : f.originCountry;
      const selectedClass = f.icao24 === state.selectedIcao ? ' selected' : '';
      return `
        <button type="button" class="flight-row${selectedClass}" data-icao="${escapeHtml(f.icao24)}">
          <div class="flight-row-main">
            <span class="flight-row-callsign">${escapeHtml(f.callsign)} <span class="muted">${escapeHtml(f.aircraftType)}</span></span>
            <span class="flight-row-sub">${escapeHtml(route)} · ${escapeHtml(f.airline)}</span>
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
    btn.addEventListener('click', () => {
      selectFlight(btn.dataset.icao, true);
    });
  });
}

function renderAltitudeProfileSvg(flight) {
  const svg = document.getElementById('altitude-profile-svg');
  const progress = typeof flight.progress === 'number' ? flight.progress : 0.5;
  const px = 14 + progress * 252;
  const altNorm = Math.min(1, Math.max(0.08, (flight.altitudeFt || 32000) / 42000));
  const py = 54 - altNorm * 40;

  svg.innerHTML = `
    <defs>
      <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    <line x1="14" y1="54" x2="266" y2="54" stroke="rgba(148,184,218,0.22)" stroke-width="1"/>
    <path d="M 14 54 C 34 54, 40 16, 62 16 L 218 16 C 240 16, 246 54, 266 54 Z" fill="url(#profGrad)"/>
    <path d="M 14 54 C 34 54, 40 16, 62 16 L 218 16 C 240 16, 246 54, 266 54" fill="none" stroke="rgba(56,189,248,0.7)" stroke-width="1.8"/>
    <line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${px.toFixed(1)}" y2="54" stroke="#fbbf24" stroke-dasharray="2 2" stroke-width="1.2"/>
    <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="#fbbf24" stroke="#091322" stroke-width="1.5"/>
  `;
}

function renderFlightDetail() {
  const f = state.rawFlights.find((item) => item.icao24 === state.selectedIcao);
  if (!f) return;

  document.getElementById('detail-callsign').textContent = f.callsign;
  document.getElementById('detail-aircraft-type').textContent = f.aircraftType || 'ADS-B';
  document.getElementById('detail-airline').textContent = f.airline || f.originCountry;

  const hasRoute = Boolean(f.origin && f.destination);
  document.getElementById('detail-origin').textContent = hasRoute ? f.origin : 'LIVE';
  document.getElementById('detail-origin-name').textContent = hasRoute ? (f.originName || f.origin) : '실시간 수신';
  document.getElementById('detail-dest').textContent = hasRoute ? f.destination : 'ADS-B';
  document.getElementById('detail-dest-name').textContent = hasRoute ? (f.destinationName || f.destination) : '트랜스폰더';
  document.getElementById('detail-progress-fill').style.width = `${Math.round((f.progress ?? 0.5) * 100)}%`;
  document.getElementById('detail-eta').textContent = hasRoute
    ? `${formatNumber(f.remainingKm)} km · ${formatEta(f.etaMinutes)}`
    : 'OpenSky 실시간 위치';

  document.getElementById('detail-alt-ft').textContent = `${formatNumber(f.altitudeFt)} ft`;
  document.getElementById('detail-alt-m').textContent = `${formatNumber(f.altitudeM)} m`;
  document.getElementById('detail-speed-kts').textContent = `${f.speedKts} kts`;
  document.getElementById('detail-speed-kmh').textContent = `${f.speedKmh} km/h`;
  document.getElementById('detail-heading').textContent = `${Math.round(f.heading)}°`;

  const vrate = f.verticalRateFpm || 0;
  const vSign = vrate > 30 ? '▲ +' : vrate < -30 ? '▼ ' : '● ';
  document.getElementById('detail-vrate').textContent = `${vSign}${vrate} fpm`;

  document.getElementById('detail-coords').textContent = `${f.lat.toFixed(2)}°, ${f.lon.toFixed(2)}°`;
  document.getElementById('detail-squawk').textContent = `SQK ${f.squawk || '----'}`;
  document.getElementById('detail-aircraft-label').textContent = f.aircraftLabel || f.aircraftType;
  document.getElementById('detail-icao').textContent = f.icao24.toUpperCase();
  document.getElementById('detail-reg').textContent = f.registration || '---';
  document.getElementById('detail-country').textContent = f.originCountry || '---';

  followBtn.classList.toggle('active', state.followSelected);
  followBtn.textContent = state.followSelected ? '추적 해제' : '카메라 추적';
  renderAltitudeProfileSvg(f);
}

function updateSourceStatus(payload) {
  state.activeSource = payload.activeSource || 'simulation';
  state.fallbackReason = payload.fallbackReason || null;

  statusDotEl.className = 'status-dot';
  if (state.activeSource === 'opensky') {
    sourceLabelEl.textContent = 'OpenSky LIVE ADS-B';
  } else {
    statusDotEl.classList.add('sim');
    sourceLabelEl.textContent = '글로벌 실시간 시뮬레이션';
  }

  if (state.fallbackReason && state.mode !== 'simulation') {
    statusDotEl.classList.add('warn');
    fallbackNoticeEl.textContent = `OpenSky 실시간 피드 지연/제한으로 시뮬레이션 전환됨 (${state.fallbackReason})`;
    fallbackNoticeEl.classList.remove('hidden');
  } else {
    fallbackNoticeEl.classList.add('hidden');
  }
}

function stopConnections() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  if (state.staticPollTimer) {
    clearInterval(state.staticPollTimer);
    state.staticPollTimer = null;
  }
}

async function runStaticTick(mode) {
  const payload = await browserEngine.resolve(mode);
  state.rawFlights = payload.flights || [];
  state.lastServerSyncMs = performance.now();
  updateSourceStatus(payload);
  applySearchFilter();
}

function connectStream(mode) {
  stopConnections();

  if (state.backendAvailable) {
    const es = new EventSource(`./api/stream?mode=${encodeURIComponent(mode)}`);
    state.eventSource = es;

    es.addEventListener('flights', (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        state.rawFlights = payload.flights || [];
        state.lastServerSyncMs = performance.now();
        updateSourceStatus(payload);
        applySearchFilter();
      } catch {
        // Ignore malformed chunk
      }
    });

    es.onerror = () => {
      sourceLabelEl.textContent = '재연결 중...';
      statusDotEl.className = 'status-dot warn';
    };
    return;
  }

  // Static hosting (GitHub Pages): render simulation immediately so globe is alive on frame 1,
  // then poll OpenSky ADS-B / simulation on interval.
  if (mode !== 'live') {
    const initialSim = browserEngine.getSimulatedSnapshot();
    state.rawFlights = initialSim;
    state.lastServerSyncMs = performance.now();
    updateSourceStatus({ mode, activeSource: 'simulation', fallbackReason: null });
    applySearchFilter();
  }

  runStaticTick(mode);
  state.staticPollTimer = setInterval(() => runStaticTick(state.mode), 3000);
}

async function detectBackend() {
  try {
    const res = await fetch('./api/health', { cache: 'no-store' });
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return false;
    const data = await res.json();
    return data?.status === 'ok';
  } catch {
    return false;
  }
}

async function loadAirports() {
  if (state.backendAvailable) {
    try {
      const res = await fetch('./api/airports');
      const data = await res.json();
      state.airports = data.airports || STATIC_AIRPORTS;
      globe.setAirports(state.airports);
      return;
    } catch {
      // Fall back to bundled airport catalog
    }
  }
  state.airports = STATIC_AIRPORTS;
  globe.setAirports(STATIC_AIRPORTS);
}

function bindUI() {
  // Mode buttons
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
      connectStream(state.mode);
    });
  });

  // Search box
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

  document.getElementById('close-list-btn').addEventListener('click', () => setPanelMode('none'));
  document.getElementById('close-detail-btn').addEventListener('click', () => {
    state.selectedIcao = null;
    state.followSelected = false;
    globe.setSelectedFlight(null);
    setPanelMode('none');
  });

  // Region camera presets
  document.querySelectorAll('#region-presets .chip-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#region-presets .chip-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.followSelected = false;
      globe.setFollowSelected(false);
      globe.flyTo(Number(btn.dataset.lat), Number(btn.dataset.lon), Number(btn.dataset.zoom));
    });
  });

  // Globe display toggles
  const bindToggle = (id, optKey) => {
    const el = document.getElementById(id);
    el.addEventListener('click', () => {
      const next = !globe.options[optKey];
      globe.setOption(optKey, next);
      el.classList.toggle('active', next);
    });
  };
  bindToggle('toggle-rotate', 'autoRotate');
  bindToggle('toggle-daynight', 'dayNight');
  bindToggle('toggle-trails', 'showTrails');
  bindToggle('toggle-airports', 'showAirports');

  document.getElementById('zoom-in-btn').addEventListener('click', () => {
    globe.targetZoom = Math.min(6.5, globe.targetZoom * 1.32);
  });
  document.getElementById('zoom-out-btn').addEventListener('click', () => {
    globe.targetZoom = Math.max(0.85, globe.targetZoom / 1.32);
  });

  // Follow & center buttons
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

  window.addEventListener('resize', () => globe.resize());
}

function updateClock() {
  const now = new Date();
  utcClockEl.textContent = `${now.toISOString().slice(11, 19)} UTC`;
}

function animate(now) {
  const elapsedSec = (now - state.lastServerSyncMs) / 1000;
  const smoothFlights = state.flights.map((f) => extrapolateFlight(f, elapsedSec));
  globe.setFlights(smoothFlights);
  globe.render(now);
  requestAnimationFrame(animate);
}

// Bootstrap
async function init() {
  bindUI();
  updateClock();
  setInterval(updateClock, 1000);
  requestAnimationFrame(animate);

  state.backendAvailable = await detectBackend();
  await loadAirports();
  connectStream(state.mode);
}

init();
