import { Globe3D } from './globe.js';
import { LiveBrowserAdsbClient, STATIC_AIRPORTS } from './flight-engine.js';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const liveClient = new LiveBrowserAdsbClient();

const state = {
  provider: 'opensky', // 'opensky' (global live) | 'adsbfi' (250NM around current view)
  activeSource: 'opensky',
  backendAvailable: false,
  rawFlights: [],
  flights: [],
  trackHistory: new Map(),
  searchQuery: '',
  selectedIcao: null,
  followSelected: false,
  panelMode: 'none',
  lastSyncMs: performance.now(),
  lastUpdatedAt: null,
  eventSource: null,
  pollTimer: null
};

// DOM References
const canvas = document.getElementById('globe-canvas');
const utcClockEl = document.getElementById('utc-clock');
const statusDotEl = document.getElementById('status-dot');
const sourceLabelEl = document.getElementById('source-label');
const flightCountEl = document.getElementById('flight-count');
const liveNoticeEl = document.getElementById('live-notice');
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
const refreshBtn = document.getElementById('refresh-live-btn');

const globe = new Globe3D(canvas, {
  initialLat: 36,
  initialLon: 128,
  initialZoom: 1.55,
  autoRotate: false,
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
    const meta = flight.aircraftType && flight.aircraftType !== 'ADS-B'
      ? ` · ${flight.aircraftType}`
      : (flight.originCountry ? ` · ${flight.originCountry}` : '');
    tooltipEl.innerHTML = `
      <div><span class="tooltip-callsign">${escapeHtml(flight.callsign)}</span><span>${escapeHtml(meta)}</span></div>
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

function formatAge(epochSec) {
  if (!epochSec) return '방금 수신';
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - epochSec);
  if (diff < 2) return '방금 수신';
  if (diff < 60) return `${diff}초 전`;
  return `${Math.floor(diff / 60)}분 ${diff % 60}초 전`;
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

function applySearchFilter() {
  const q = state.searchQuery.trim().toLowerCase();
  if (!q) {
    state.flights = state.rawFlights;
  } else {
    state.flights = state.rawFlights.filter((f) =>
      (f.callsign && f.callsign.toLowerCase().includes(q)) ||
      (f.icao24 && f.icao24.toLowerCase().includes(q)) ||
      (f.registration && f.registration.toLowerCase().includes(q)) ||
      (f.aircraftType && f.aircraftType.toLowerCase().includes(q)) ||
      (f.originCountry && f.originCountry.toLowerCase().includes(q)) ||
      (f.squawk && f.squawk.toLowerCase().includes(q))
    );
  }
  flightCountEl.textContent = formatNumber(state.flights.length);
  if (state.panelMode === 'list') renderFlightList();
  if (state.panelMode === 'detail' && state.selectedIcao) renderFlightDetail();
}

function setPanelMode(mode) {
  state.panelMode = mode;
  const mobileListBtn = document.getElementById('mobile-list-btn');
  if (mode === 'none') {
    document.body.classList.remove('sheet-open');
    sidePanelEl.classList.add('hidden');
    listViewEl.classList.add('hidden');
    detailViewEl.classList.add('hidden');
    if (mobileListBtn) mobileListBtn.classList.remove('active');
    return;
  }
  document.body.classList.add('sheet-open');
  sidePanelEl.classList.remove('hidden');
  listViewEl.classList.toggle('hidden', mode !== 'list');
  detailViewEl.classList.toggle('hidden', mode !== 'detail');
  if (mobileListBtn) mobileListBtn.classList.toggle('active', mode === 'list');
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
  const topFlights = state.flights.slice(0, 80);
  if (state.flights.length === 0) {
    listSubtitleEl.textContent = '수신된 실시간 항공기가 없습니다';
    listContainerEl.innerHTML = '<p class="panel-subtitle">실시간 ADS-B 신호를 기다리는 중이거나 검색 결과가 없습니다.</p>';
    return;
  }

  listSubtitleEl.textContent = state.searchQuery
    ? `검색 결과 ${formatNumber(state.flights.length)}대 중 상위 ${topFlights.length}대`
    : `실시간 ${formatNumber(state.flights.length)}대 중 상위 ${topFlights.length}대`;

  listContainerEl.innerHTML = topFlights
    .map((f) => {
      const selectedClass = f.icao24 === state.selectedIcao ? ' selected' : '';
      const sub = f.registration && f.registration !== f.icao24.toUpperCase()
        ? `${f.registration} · ${f.originCountry}`
        : f.originCountry;
      return `
        <button type="button" class="flight-row${selectedClass}" data-icao="${escapeHtml(f.icao24)}">
          <div class="flight-row-main">
            <span class="flight-row-callsign">${escapeHtml(f.callsign)} <span class="muted">${escapeHtml(f.aircraftType)}</span></span>
            <span class="flight-row-sub">${escapeHtml(sub)}</span>
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
      <text x="16" y="14" fill="#6c859e" font-size="10" font-family="ui-monospace, monospace">수신 포인트 누적 중 (1개)</text>
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

  document.getElementById('detail-callsign').textContent = f.callsign;
  document.getElementById('detail-aircraft-type').textContent = f.aircraftType || 'ADS-B';
  document.getElementById('detail-airline').textContent = f.originCountry || 'Live ADS-B';
  document.getElementById('detail-source').textContent = f.source === 'adsblol'
    ? 'adsb.lol Live ADS-B'
    : (f.source === 'adsbfi' ? 'adsb.fi Open Data' : 'OpenSky Network');
  document.getElementById('detail-contact-age').textContent = formatAge(f.lastContact);

  document.getElementById('detail-alt-ft').textContent = `${formatNumber(f.altitudeFt)} ft`;
  document.getElementById('detail-alt-m').textContent = `${formatNumber(f.altitudeM)} m`;
  document.getElementById('detail-speed-kts').textContent = `${f.speedKts} kts`;
  document.getElementById('detail-speed-kmh').textContent = `${f.speedKmh} km/h`;
  document.getElementById('detail-heading').textContent = `${Math.round(f.heading)}°`;

  const vrate = f.verticalRateFpm || 0;
  const vSign = vrate > 30 ? '▲ +' : vrate < -30 ? '▼ ' : '● ';
  document.getElementById('detail-vrate').textContent = `${vSign}${vrate} fpm`;

  document.getElementById('detail-coords').textContent = `${f.lat.toFixed(3)}°, ${f.lon.toFixed(3)}°`;
  document.getElementById('detail-squawk').textContent = `SQK ${f.squawk || '----'}`;
  document.getElementById('detail-aircraft-label').textContent = f.aircraftLabel || 'Live Transponder';
  document.getElementById('detail-icao').textContent = f.icao24.toUpperCase();
  document.getElementById('detail-reg').textContent = f.registration || '---';
  document.getElementById('detail-country').textContent = f.originCountry || '---';

  followBtn.classList.toggle('active', state.followSelected);
  followBtn.textContent = state.followSelected ? '추적 해제' : '카메라 추적';
  renderLiveAltitudeChart(f);
}

function formatSourceTitle(src) {
  if (src === 'opensky') return 'LIVE · OpenSky Network (전 세계)';
  if (src === 'adsb-global') return 'LIVE · adsb.fi + adsb.lol (글로벌 허브)';
  if (src === 'adsblol') return 'LIVE · adsb.lol (화면 반경 250NM)';
  if (src === 'adsbfi') return 'LIVE · adsb.fi (화면 반경 250NM)';
  return 'LIVE · ADS-B';
}

function handleLivePayload(payload) {
  if (!payload || payload.skipped) return;

  if (payload.ok) {
    state.activeSource = payload.activeSource || state.provider;
    state.rawFlights = payload.flights || [];
    state.lastSyncMs = performance.now();
    state.lastUpdatedAt = payload.updatedAt || Date.now();
    recordTrackPoints(state.rawFlights);

    statusDotEl.className = 'status-dot';
    sourceLabelEl.textContent = formatSourceTitle(state.activeSource);

    if (payload.notice) {
      liveNoticeEl.textContent = payload.notice;
      liveNoticeEl.classList.remove('hidden');
    } else {
      liveNoticeEl.classList.add('hidden');
    }
    applySearchFilter();
    return;
  }

  // Strictly real-time ONLY: never inject simulated aircraft on error.
  statusDotEl.className = state.rawFlights.length > 0 ? 'status-dot warn' : 'status-dot error';
  sourceLabelEl.textContent = state.rawFlights.length > 0
    ? 'LIVE (최근 수신 위치 유지 중)'
    : '실시간 ADS-B 연결 대기 중';
  liveNoticeEl.textContent = payload.error || '실시간 ADS-B 데이터를 가져오지 못했습니다. 잠시 후 자동 재시도합니다.';
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
    lon: String(lon)
  });
  try {
    const res = await fetch(`./api/flights?${qs.toString()}`, { cache: 'no-store' });
    if (!res.ok) {
      handleLivePayload({ ok: false, error: `백엔드 응답 오류 (HTTP ${res.status})` });
      return;
    }
    const payload = await res.json();
    handleLivePayload(payload);
  } catch (err) {
    handleLivePayload({ ok: false, error: `서버 연결 오류 (${err?.message || 'network'})` });
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
  sourceLabelEl.textContent = '실시간 ADS-B 수신 중...';

  if (state.backendAvailable) {
    // Use reliable JSON polling against /api/flights (immune to Render/Cloudflare SSE proxy buffering)
    fetchBackendOnce();
    state.pollTimer = setInterval(fetchBackendOnce, 5000);
    return;
  }

  // Static hosting (GitHub Pages): direct browser live ADS-B polling
  fetchDirectOnce(force);
  const intervalMs = state.provider === 'adsbfi' ? 6000 : 20000;
  state.pollTimer = setInterval(() => fetchDirectOnce(false), intervalMs);
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
      globe.targetZoom = Math.min(6.5, globe.targetZoom * 1.32);
    });
  }

  if (mobileZoomOutBtn) {
    mobileZoomOutBtn.addEventListener('click', () => {
      globe.targetZoom = Math.max(0.85, globe.targetZoom / 1.32);
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

  // Region camera presets — when in adsb.fi mode, also immediately fetch live planes for that region
  document.querySelectorAll('#region-presets .chip-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#region-presets .chip-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.followSelected = false;
      globe.setFollowSelected(false);
      globe.flyTo(Number(btn.dataset.lat), Number(btn.dataset.lon), Number(btn.dataset.zoom));
      if (state.provider === 'adsbfi' || state.activeSource === 'adsbfi') {
        setTimeout(() => connectLiveFeed(true), 150);
      }
    });
  });

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

  const handleResize = () => globe.resize();
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', () => setTimeout(handleResize, 120));
}

function updateClock() {
  utcClockEl.textContent = `${new Date().toISOString().slice(11, 19)} UTC`;
  if (state.panelMode === 'detail' && state.selectedIcao) {
    const f = state.rawFlights.find((item) => item.icao24 === state.selectedIcao);
    if (f) {
      document.getElementById('detail-contact-age').textContent = formatAge(f.lastContact);
    }
  }
}

function animate(now) {
  const elapsedSec = (now - state.lastSyncMs) / 1000;
  const smoothFlights = state.flights.map((f) => extrapolateLiveFlight(f, elapsedSec));
  globe.setFlights(smoothFlights);
  globe.render(now);
  requestAnimationFrame(animate);
}

async function init() {
  bindUI();
  updateClock();
  setInterval(updateClock, 1000);
  requestAnimationFrame(animate);

  state.backendAvailable = await detectBackend();
  await loadAirports();
  connectLiveFeed(true);
}

init();
