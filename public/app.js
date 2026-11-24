import { Globe3D } from './globe.js';
import { LiveBrowserAdsbClient, STATIC_AIRPORTS } from './flight-engine.js';
import { resolveAircraftCountry, decodeCallsign } from './aviation-meta.js';

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
  enrichmentCache: new Map(),
  enrichmentPending: new Set(),
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

let cameraFetchTimer = null;

const globe = new Globe3D(canvas, {
  initialLat: 36,
  initialLon: 128,
  initialZoom: 1.55,
  autoRotate: false,
  dayNight: true,
  showTrails: true,
  showAirports: true,
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
    const country = resolveAircraftCountry(flight.icao24, flight.registration, flight.originCountry);
    const csInfo = decodeCallsign(flight.callsign);
    const enriched = state.enrichmentCache.get(flight.icao24);
    const iataCode = enriched?.flightroute?.callsignIata || flight.iataFlight || csInfo?.iataFlight;
    const titleStr = iataCode && iataCode !== flight.callsign
      ? `${country.flag} ${iataCode} (${flight.callsign})`
      : `${country.flag} ${flight.callsign}`;
    const route = enriched?.flightroute;
    const routeStr = route?.origin && route?.destination
      ? `${route.origin.iata || route.origin.icao} → ${route.destination.iata || route.destination.icao}`
      : (flight.airlineName || csInfo?.airlineKo || country.nameKo);
    const typeMeta = flight.aircraftType && flight.aircraftType !== 'ADS-B' ? ` · ${flight.aircraftType}` : '';
    tooltipEl.innerHTML = `
      <div><span class="tooltip-callsign">${escapeHtml(titleStr)}</span><span>${escapeHtml(typeMeta)}</span></div>
      <div class="tooltip-meta">${escapeHtml(routeStr)} · ${formatNumber(flight.altitudeFt)} ft · ${flight.speedKts} kts</div>
    `;
    tooltipEl.style.left = `${Math.min(window.innerWidth - 250, pos.x + 14)}px`;
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
      (f.iataFlight && f.iataFlight.toLowerCase().includes(q)) ||
      (f.airlineName && f.airlineName.toLowerCase().includes(q)) ||
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
  const f = state.rawFlights.find((item) => item.icao24 === icao24);
  if (f) fetchFlightEnrichment(f);
}

const CATEGORY_LABELS = {
  A1: '소형기 (Light)',
  A2: '중소형기 (Small)',
  A3: '대형기 (Large)',
  A4: '대형 와류기 (High Vortex)',
  A5: '초대형기 (Heavy)',
  A6: '고성능기 (High Perf)',
  A7: '헬리콥터 (Rotorcraft)',
  B1: '글라이더',
  B2: '기구/비행선',
  B4: '초경량기',
  B6: '무인기 (UAV)'
};

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
  if (f.squawk === '7700' || f.emergency === 'general') return { label: '비상 (7700)', cls: 'emergency' };
  if (f.squawk === '7600') return { label: '통신두절 (7600)', cls: 'emergency' };
  if (f.squawk === '7500') return { label: '긴급 (7500)', cls: 'emergency' };
  if (f.onGround) return { label: '지상', cls: '' };
  const vr = f.verticalRateFpm || 0;
  const alt = f.altitudeFt || 0;
  if (vr > 350) return { label: alt < 10000 ? '이륙·상승' : '상승 중', cls: 'climbing' };
  if (vr < -350) return { label: alt < 10000 ? '접근·착륙' : '하강 중', cls: 'descending' };
  if (alt >= 18000) return { label: `순항 · FL${Math.round(alt / 100)}`, cls: '' };
  return { label: '비행 중', cls: '' };
}

function formatSquawkText(sqk, emergency) {
  if (!sqk || sqk === '----') return 'SQK ----';
  if (sqk === '7700') return 'SQK 7700 · 비상';
  if (sqk === '7600') return 'SQK 7600 · 통신두절';
  if (sqk === '7500') return 'SQK 7500 · 긴급';
  if (emergency) return `SQK ${sqk} · ${emergency}`;
  return `SQK ${sqk}`;
}

function formatDurationKorean(minutes) {
  if (!minutes || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
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
      const res = await fetch(`./api/enrich/${encodeURIComponent(icao)}?${qs.toString()}`);
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
    listSubtitleEl.textContent = '수신된 실시간 항공기가 없습니다';
    listContainerEl.innerHTML = '<p class="panel-subtitle">실시간 ADS-B 신호를 기다리는 중이거나 검색 결과가 없습니다.</p>';
    return;
  }

  listSubtitleEl.textContent = state.searchQuery
    ? `검색 결과 ${formatNumber(state.flights.length)}대 중 상위 ${topFlights.length}대`
    : `실시간 ${formatNumber(state.flights.length)}대 중 현재 화면 인접 ${topFlights.length}대`;

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
        : null;
      const airlineStr = enriched?.flightroute?.airline?.name || f.airlineName || csInfo?.airlineKo || null;
      const subParts = [routeStr, airlineStr, country.nameKo].filter(Boolean);
      return `
        <button type="button" class="flight-row${selectedClass}" data-icao="${escapeHtml(f.icao24)}">
          <div class="flight-row-main">
            <span class="flight-row-callsign">${country.flag} ${escapeHtml(callLabel)} <span class="muted">${escapeHtml(f.aircraftType)}</span></span>
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
  const airlineDisplay = csInfo?.airlineKo
    || routeInfo?.airline?.name
    || acInfo?.owner
    || f.airlineName
    || '민간 · 일반 항공기';
  const countryDisplay = `${country.flag} ${country.nameKo}`;

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
  if (routeInfo?.origin && routeInfo?.destination) {
    const o = routeInfo.origin;
    const d = routeInfo.destination;
    routeCardEl.classList.remove('unavailable');
    document.getElementById('detail-origin-iata').textContent = o.iata || o.icao || '---';
    document.getElementById('detail-origin-city').textContent = o.city || o.name || '출발지';
    document.getElementById('detail-dest-iata').textContent = d.iata || d.icao || '---';
    document.getElementById('detail-dest-city').textContent = d.city || d.name || '목적지';

    if (typeof o.lat === 'number' && typeof d.lat === 'number') {
      const totalKm = Math.max(1, haversineKm(o.lat, o.lon, d.lat, d.lon));
      const flownKm = haversineKm(o.lat, o.lon, f.lat, f.lon);
      const remainKm = Math.round(haversineKm(f.lat, f.lon, d.lat, d.lon));
      const pct = Math.max(2, Math.min(98, Math.round((flownKm / (flownKm + remainKm || totalKm)) * 100)));
      const etaMin = f.speedKmh > 120 ? Math.round((remainKm / f.speedKmh) * 60) : 0;
      document.getElementById('detail-route-progress').style.width = `${pct}%`;
      document.getElementById('detail-route-eta').textContent = etaMin > 0
        ? `잔여 ${formatNumber(remainKm)} km · 약 ${formatDurationKorean(etaMin)}`
        : `총 ${formatNumber(Math.round(totalKm))} km`;
    } else {
      document.getElementById('detail-route-progress').style.width = '50%';
      document.getElementById('detail-route-eta').textContent = '실시간 운항 중';
    }
  } else if (isPending || !enriched) {
    routeCardEl.classList.remove('unavailable');
    document.getElementById('detail-origin-iata').textContent = '...';
    document.getElementById('detail-origin-city').textContent = '조회 중';
    document.getElementById('detail-dest-iata').textContent = '...';
    document.getElementById('detail-dest-city').textContent = '조회 중';
    document.getElementById('detail-route-progress').style.width = '30%';
    document.getElementById('detail-route-eta').textContent = '출발·목적지 조회 중...';
  } else {
    routeCardEl.classList.add('unavailable');
    document.getElementById('detail-origin-iata').textContent = '미공개';
    document.getElementById('detail-origin-city').textContent = '출발지 없음';
    document.getElementById('detail-dest-iata').textContent = '미공개';
    document.getElementById('detail-dest-city').textContent = '목적지 없음';
    document.getElementById('detail-route-progress').style.width = '0%';
    document.getElementById('detail-route-eta').textContent = '비정기·개인·군용 등 공개 노선 없음';
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
  document.getElementById('detail-source').textContent = f.source === 'adsblol'
    ? 'adsb.lol Live ADS-B'
    : (f.source === 'adsbfi' ? 'adsb.fi Open Data' : (f.source === 'flyitaly' ? 'FlyItalyADSB' : 'OpenSky Network'));
  document.getElementById('detail-contact-age').textContent = formatAge(f.lastContact);

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
    enrichStatusEl.textContent = '조회 중...';
  } else if (enriched?.ok) {
    enrichStatusEl.textContent = 'DB 연동 완료';
  } else {
    enrichStatusEl.textContent = 'ADS-B 실시간';
  }

  const fullModelStr = [acInfo?.manufacturer, acInfo?.type].filter(Boolean).join(' ')
    || (f.aircraftLabel && f.aircraftLabel !== 'Live Transponder' ? f.aircraftLabel : '정보 없음');
  document.getElementById('spec-model').textContent = fullModelStr;
  document.getElementById('spec-owner').textContent = acInfo?.owner || routeInfo?.airline?.name || csInfo?.airlineKo || f.airlineName || '정보 없음';

  const catLabel = f.category ? (CATEGORY_LABELS[f.category] || f.category) : null;
  const yearLabel = f.year ? `${f.year}년 제작` : null;
  document.getElementById('spec-category').textContent = [catLabel, yearLabel].filter(Boolean).join(' · ') || '정보 없음';

  const airspeedParts = [];
  if (f.mach) airspeedParts.push(`Mach ${f.mach.toFixed(2)}`);
  if (f.ias) airspeedParts.push(`IAS ${f.ias}kt`);
  if (f.tas) airspeedParts.push(`TAS ${f.tas}kt`);
  document.getElementById('spec-airspeed').textContent = airspeedParts.join(' · ') || '미수신';

  const navParts = [];
  if (f.navAltFt) navParts.push(`MCP ${formatNumber(f.navAltFt)} ft`);
  if (f.navQnh) navParts.push(`QNH ${f.navQnh} hPa`);
  document.getElementById('spec-nav').textContent = navParts.join(' · ') || '미수신';

  const weatherParts = [];
  if (f.windDir !== null && f.windDir !== undefined && f.windSpeedKts !== null && f.windSpeedKts !== undefined) {
    weatherParts.push(`${f.windDir}° / ${f.windSpeedKts} kts`);
  }
  if (f.oat !== null && f.oat !== undefined) weatherParts.push(`${f.oat}°C`);
  document.getElementById('spec-weather').textContent = weatherParts.join(' · ') || '미수신';

  const sigParts = [f.positionSource || 'ADS-B'];
  if (f.rssi !== null && f.rssi !== undefined) sigParts.push(`${f.rssi} dBFS`);
  if (f.messages) sigParts.push(`${formatNumber(f.messages)} pkt`);
  document.getElementById('spec-signal').textContent = sigParts.join(' · ');

  // Footer & Chart
  document.getElementById('detail-aircraft-label').textContent = fullModelStr !== '정보 없음' ? fullModelStr : (f.aircraftLabel || 'Live Transponder');
  document.getElementById('detail-icao').textContent = f.icao24.toUpperCase();
  document.getElementById('detail-reg').textContent = regDisplay;
  document.getElementById('detail-country').textContent = countryDisplay;

  followBtn.classList.toggle('active', state.followSelected);
  followBtn.textContent = state.followSelected ? '추적 해제' : '카메라 추적';
  renderLiveAltitudeChart(f);
}

function formatSourceTitle(src, scanProgress) {
  if (src === 'opensky') return 'LIVE · OpenSky Network (전 세계 전체)';
  if (src === 'flyitaly') return 'LIVE · FlyItalyADSB (전 세계 전체)';
  if (src === 'adsb-global') {
    if (scanProgress && scanProgress.completed < scanProgress.total) {
      return `LIVE · 전 세계 스캔 중 (${scanProgress.completed}/${scanProgress.total}구역)`;
    }
    return `LIVE · 전 세계 ${scanProgress?.total || 98}구역 실시간 ADS-B`;
  }
  if (src === 'adsb-local') return 'LIVE · adsb.fi + adsb.lol (주변 250NM)';
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
    sourceLabelEl.textContent = formatSourceTitle(state.activeSource, payload.scanProgress);

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
      globe.targetZoom = Math.min(globe.maxZoom, globe.targetZoom * 1.45);
    });
  }

  if (mobileZoomOutBtn) {
    mobileZoomOutBtn.addEventListener('click', () => {
      globe.targetZoom = Math.max(globe.minZoom, globe.targetZoom / 1.45);
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

  document.getElementById('zoom-in-btn').addEventListener('click', () => {
    globe.targetZoom = Math.min(globe.maxZoom, globe.targetZoom * 1.45);
  });
  document.getElementById('zoom-out-btn').addEventListener('click', () => {
    globe.targetZoom = Math.max(globe.minZoom, globe.targetZoom / 1.45);
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
      document.getElementById('detail-contact-age').textContent = formatAge(f.lastContact);
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
