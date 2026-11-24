import { WORLD_POLYGONS, CITY_LIGHTS } from './world-data.js';
import { PLACE_LABELS } from './places-data.js';
import { classifyAircraftIcon } from './aviation-meta.js';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export function altitudeColor(altFt, isLight = false) {
  if (altFt >= 37000) return isLight ? '#d97706' : '#fbbf24'; // High cruise - amber gold
  if (altFt >= 28000) return isLight ? '#0284c7' : '#38bdf8'; // Cruise - sky blue
  if (altFt >= 15000) return isLight ? '#0d9488' : '#2dd4bf'; // Climb / descent - teal
  return isLight ? '#16a34a' : '#4ade80'; // Approach / low - emerald
}

function latLonToVec3(latDeg, lonDeg) {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const cosLat = Math.cos(lat);
  return [cosLat * Math.sin(lon), Math.sin(lat), cosLat * Math.cos(lon)];
}

function slerpVec3(a, b, t) {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  dot = Math.max(-1, Math.min(1, dot));
  const omega = Math.acos(dot);
  if (omega < 1e-5) return a;
  const sinO = Math.sin(omega);
  const w1 = Math.sin((1 - t) * omega) / sinO;
  const w2 = Math.sin(t * omega) / sinO;
  return [a[0] * w1 + b[0] * w2, a[1] * w1 + b[1] * w2, a[2] * w1 + b[2] * w2];
}

function densifyPolygon(poly, maxStepDeg = 2.8) {
  const vecs = [];
  for (let i = 0; i < poly.length; i++) {
    const a = latLonToVec3(poly[i][0], poly[i][1]);
    const b = latLonToVec3(poly[(i + 1) % poly.length][0], poly[(i + 1) % poly.length][1]);
    const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const angleDeg = Math.acos(dot) * RAD2DEG;
    const steps = Math.max(1, Math.ceil(angleDeg / maxStepDeg));
    for (let s = 0; s < steps; s++) {
      vecs.push(s === 0 ? a : slerpVec3(a, b, s / steps));
    }
  }
  return vecs;
}

function densifyFlatRing(flat, scale = 100, maxStepDeg = 2.6, closed = true) {
  const count = flat.length >> 1;
  const vecs = [];
  const limit = closed ? count : count - 1;
  for (let i = 0; i < limit; i++) {
    const lonA = flat[i * 2] / scale;
    const latA = flat[i * 2 + 1] / scale;
    const nextIdx = (i + 1) % count;
    const lonB = flat[nextIdx * 2] / scale;
    const latB = flat[nextIdx * 2 + 1] / scale;
    const a = latLonToVec3(latA, lonA);
    const b = latLonToVec3(latB, lonB);
    const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const angleDeg = Math.acos(dot) * RAD2DEG;
    const steps = Math.max(1, Math.ceil(angleDeg / maxStepDeg));
    for (let s = 0; s < steps; s++) {
      vecs.push(s === 0 ? a : slerpVec3(a, b, s / steps));
    }
  }
  if (!closed && count > 0) {
    vecs.push(latLonToVec3(flat[(count - 1) * 2 + 1] / scale, flat[(count - 1) * 2] / scale));
  }
  return vecs;
}

function buildGeoEntry(vecs) {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (let i = 0; i < vecs.length; i++) {
    sx += vecs[i][0];
    sy += vecs[i][1];
    sz += vecs[i][2];
  }
  const len = Math.hypot(sx, sy, sz);
  if (len < 1e-4) {
    return { vecs, center: [0, 1, 0], sinRadius: 1, isLarge: true };
  }
  const center = [sx / len, sy / len, sz / len];
  let minDot = 1;
  for (let i = 0; i < vecs.length; i++) {
    const d = vecs[i][0] * center[0] + vecs[i][1] * center[1] + vecs[i][2] * center[2];
    if (d < minDot) minDot = d;
  }
  const isLarge = minDot < 0.25;
  const sinRadius = isLarge ? 1 : Math.sqrt(Math.max(0, 1 - minDot * minDot));
  return { vecs, center, sinRadius, isLarge };
}

function computeSubsolarPoint(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  const dayOfYear = (date - start) / 86400000;
  // Approximate solar declination in degrees
  const decl = -23.44 * Math.cos(((360 / 365) * (dayOfYear + 10)) * DEG2RAD);
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const subsolarLon = (12 - utcHours) * 15;
  return { lat: decl, lon: subsolarLon };
}

export class Globe3D {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onSelectFlight = options.onSelectFlight || (() => {});
    this.onHoverFlight = options.onHoverFlight || (() => {});
    this.onCameraSettled = options.onCameraSettled || (() => {});

    // Camera state (smoothly damped toward target)
    this.minZoom = options.minZoom ?? 0.85;
    this.maxZoom = options.maxZoom ?? 150.0;
    this.camLat = options.initialLat ?? 32;
    this.camLon = options.initialLon ?? 126;
    this.zoom = options.initialZoom ?? 1.25;
    this.targetLat = this.camLat;
    this.targetLon = this.camLon;
    this.targetZoom = this.zoom;

    // Display options
    this.options = {
      autoRotate: options.autoRotate ?? true,
      dayNight: options.dayNight ?? true,
      showTrails: options.showTrails ?? true,
      showAirports: options.showAirports ?? true,
      showPlaces: options.showPlaces ?? true,
      showBorders: options.showBorders ?? true,
      showGraticule: options.showGraticule ?? true,
      altitudeColor: options.altitudeColor ?? true,
      isLight: options.isLight ?? false
    };

    // Scene data
    this.flights = [];
    this.airports = [];
    this.selectedIcao = null;
    this.hoveredIcao = null;
    this.followSelected = false;

    // Boot immediately with lightweight coastline polygons, then upgrade seamlessly to 50m detailed vector map
    this.landPolygons = WORLD_POLYGONS.map((poly) => buildGeoEntry(densifyPolygon(poly, 2.8)));
    this.borderLines = [];
    this.lakePolygons = [];
    this.cityVecs = CITY_LIGHTS.map(([lat, lon]) => latLonToVec3(lat, lon));
    this.places = PLACE_LABELS
      .map((p) => ({ ...p, vec: latLonToVec3(p.lat, p.lon) }))
      .sort((a, b) => {
        const tierOrder = { city1: 0, city2: 1, country: 2, ocean: 3 };
        if (tierOrder[a.type] !== tierOrder[b.type]) return tierOrder[a.type] - tierOrder[b.type];
        return (b.priority || 0) - (a.priority || 0);
      });
    this.stars = this._generateStarfield(140);

    // Hit-test cache for pointer interaction
    this.screenFlights = [];

    // Interaction state
    this.isDragging = false;
    this.dragMoved = false;
    this.lastPointer = { x: 0, y: 0 };
    this.velocityLon = 0;
    this.velocityLat = 0;
    this.lastFrameTime = performance.now();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this._bindEvents();
    this.resize();
  }

  /**
   * Load high-resolution Natural Earth 50m land polygons, country borders, and lakes.
   */
  setDetailedGeo(geo) {
    if (!geo || !Array.isArray(geo.land)) return;
    const scale = geo.scale || 100;
    this.landPolygons = geo.land.map((ring) => buildGeoEntry(densifyFlatRing(ring, scale, 2.6, true)));
    this.borderLines = Array.isArray(geo.borders)
      ? geo.borders.map((line) => buildGeoEntry(densifyFlatRing(line, scale, 2.6, false)))
      : [];
    this.lakePolygons = Array.isArray(geo.lakes)
      ? geo.lakes.map((ring) => buildGeoEntry(densifyFlatRing(ring, scale, 2.6, true)))
      : [];
  }

  _generateStarfield(count) {
    const stars = [];
    let seed = 4219;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < count; i++) {
      stars.push({
        x: rand(),
        y: rand(),
        r: 0.5 + rand() * 1.15,
        alpha: 0.18 + rand() * 0.55
      });
    }
    return stars;
  }

  setFlights(flights) {
    this.flights = flights || [];
  }

  setAirports(airports) {
    this.airports = (airports || []).map((a) => ({
      ...a,
      vec: latLonToVec3(a.lat, a.lon)
    }));
  }

  setOption(key, value) {
    this.options[key] = value;
  }

  setSelectedFlight(icao24, fly = false) {
    this.selectedIcao = icao24;
    if (!icao24) {
      this.followSelected = false;
      return;
    }
    if (fly) {
      const f = this.flights.find((item) => item.icao24 === icao24);
      if (f) {
        this.flyTo(f.lat, f.lon, Math.max(this.targetZoom, 2.1));
      }
    }
  }

  setFollowSelected(enabled) {
    this.followSelected = Boolean(enabled);
  }

  flyTo(lat, lon, zoom = 1.6) {
    this.targetLat = Math.max(-80, Math.min(80, lat));
    // Pick shortest longitude wrap path
    let diff = ((lon - this.targetLon + 540) % 360) - 180;
    this.targetLon += diff;
    this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
  }

  resize() {
    const rect = this.canvas.parentElement
      ? this.canvas.parentElement.getBoundingClientRect()
      : { width: window.innerWidth, height: window.innerHeight };
    this.width = Math.max(300, rect.width);
    this.height = Math.max(300, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  }

  _bindEvents() {
    const el = this.canvas;
    const activePointers = new Map();
    let prevPinchDist = null;
    let wasPinching = false;

    const getPinchDistance = () => {
      const pts = Array.from(activePointers.values());
      if (pts.length < 2) return null;
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    };

    el.addEventListener('pointerdown', (e) => {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      this.velocityLon = 0;
      this.velocityLat = 0;
      el.setPointerCapture(e.pointerId);

      if (activePointers.size === 1) {
        this.isDragging = true;
        this.dragMoved = false;
        wasPinching = false;
        prevPinchDist = null;
        this.lastPointer = { x: e.clientX, y: e.clientY };
      } else if (activePointers.size === 2) {
        // Transition cleanly into pinch-to-zoom
        this.isDragging = false;
        this.dragMoved = true;
        wasPinching = true;
        this.followSelected = false;
        prevPinchDist = getPinchDistance();
      }
    });

    el.addEventListener('pointermove', (e) => {
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      }

      // Two-finger pinch-to-zoom (up to 30x)
      if (activePointers.size >= 2) {
        const dist = getPinchDistance();
        if (dist && prevPinchDist && prevPinchDist > 8) {
          const ratio = dist / prevPinchDist;
          this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom * ratio));
        }
        prevPinchDist = dist;
        return;
      }

      // Single-finger / mouse orbit drag (1:1 pixel-locked even at 150x deep zoom)
      if (this.isDragging && activePointers.size === 1) {
        const dx = e.clientX - this.lastPointer.x;
        const dy = e.clientY - this.lastPointer.y;
        const moveThresh = e.pointerType === 'touch' ? 5 : 2;
        if (Math.abs(dx) > moveThresh || Math.abs(dy) > moveThresh) {
          this.dragMoved = true;
          this.followSelected = false;
        }
        const baseRadius = this.width < this.height
          ? Math.min(this.width * 0.45, this.height * 0.36)
          : Math.min(this.width, this.height) * 0.39;
        const R = Math.max(80, baseRadius * this.zoom);
        const degPerPx = RAD2DEG / R;
        const cosLat = Math.max(0.2, Math.cos(this.camLat * DEG2RAD));
        const dLon = (-dx * degPerPx) / cosLat;
        const dLat = dy * degPerPx;
        this.targetLon += dLon;
        this.targetLat = Math.max(-84, Math.min(84, this.targetLat + dLat));
        this.velocityLon = dLon * 0.32;
        this.velocityLat = dLat * 0.32;
        this.lastPointer = { x: e.clientX, y: e.clientY };
        return;
      }

      // Hover tooltip for mouse/pen only (avoid sticky tooltips on touch screens)
      if (e.pointerType === 'touch') return;
      const hit = this._hitTest(px, py, 16);
      const nextHover = hit ? hit.flight.icao24 : null;
      if (nextHover !== this.hoveredIcao) {
        this.hoveredIcao = nextHover;
        el.style.cursor = hit ? 'pointer' : 'grab';
      }
      this.onHoverFlight(hit ? hit.flight : null, { x: px, y: py });
    });

    const handlePointerEnd = (e, allowTap) => {
      activePointers.delete(e.pointerId);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }

      if (activePointers.size === 1) {
        // Resume smooth drag from remaining finger after pinch ends
        const remaining = Array.from(activePointers.values())[0];
        this.lastPointer = { x: remaining.x, y: remaining.y };
        this.isDragging = true;
        prevPinchDist = null;
        return;
      }

      if (activePointers.size === 0) {
        const shouldTap = allowTap && !this.dragMoved && !wasPinching;
        const movedView = this.dragMoved || wasPinching;
        this.isDragging = false;
        prevPinchDist = null;
        wasPinching = false;

        if (movedView) {
          this.onCameraSettled({ lat: this.targetLat, lon: this.targetLon, zoom: this.targetZoom });
        }

        if (shouldTap) {
          const rect = el.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const py = e.clientY - rect.top;
          const tapRadius = e.pointerType === 'touch' ? 30 : 18;
          const hit = this._hitTest(px, py, tapRadius);
          if (hit) {
            this.selectedIcao = hit.flight.icao24;
            this.onSelectFlight(hit.flight);
          } else {
            this.selectedIcao = null;
            this.followSelected = false;
            this.onSelectFlight(null);
          }
        }
      }
    };

    el.addEventListener('pointerup', (e) => handlePointerEnd(e, true));
    el.addEventListener('pointercancel', (e) => handlePointerEnd(e, false));

    el.addEventListener('pointerleave', () => {
      this.hoveredIcao = null;
      this.onHoverFlight(null, { x: 0, y: 0 });
    });

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.0018);
        this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom * factor));
      },
      { passive: false }
    );

    el.addEventListener('dblclick', () => {
      this.targetZoom = Math.min(this.maxZoom, this.targetZoom * 2.0);
    });
  }

  _hitTest(px, py, radiusPx = 16) {
    let best = null;
    let bestDistSq = radiusPx * radiusPx;
    // Iterate backwards so closer (frontmost) aircraft win
    for (let i = this.screenFlights.length - 1; i >= 0; i--) {
      const item = this.screenFlights[i];
      const dx = item.x - px;
      const dy = item.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestDistSq) {
        bestDistSq = d2;
        best = item;
      }
    }
    return best;
  }

  _computeRotationMatrix() {
    const lonRad = -this.camLon * DEG2RAD;
    const latRad = this.camLat * DEG2RAD;
    return {
      cosLon: Math.cos(lonRad),
      sinLon: Math.sin(lonRad),
      cosLat: Math.cos(latRad),
      sinLat: Math.sin(latRad)
    };
  }

  _rotateVec(v, m) {
    // Rotate around Y by -camLon
    const x1 = v[0] * m.cosLon + v[2] * m.sinLon;
    const y1 = v[1];
    const z1 = -v[0] * m.sinLon + v[2] * m.cosLon;
    // Rotate around X by camLat
    const x2 = x1;
    const y2 = y1 * m.cosLat - z1 * m.sinLat;
    const z2 = y1 * m.sinLat + z1 * m.cosLat;
    return [x2, y2, z2];
  }

  _projectVec(v, m, cx, cy, R, altitudeScale = 1) {
    const r = this._rotateVec(v, m);
    const sx = cx + r[0] * R * altitudeScale;
    const sy = cy - r[1] * R * altitudeScale;
    return { x: sx, y: sy, z: r[2], rx: r[0], ry: r[1], rz: r[2] };
  }

  render(now = performance.now()) {
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;

    // Follow selected aircraft smoothly if locked
    if (this.followSelected && this.selectedIcao) {
      const tracked = this.flights.find((f) => f.icao24 === this.selectedIcao);
      if (tracked) {
        this.targetLat = Math.max(-80, Math.min(80, tracked.lat));
        const diff = ((tracked.lon - this.targetLon + 540) % 360) - 180;
        this.targetLon += diff * 0.22;
      }
    } else if (this.options.autoRotate && !this.isDragging) {
      this.targetLon += dt * 2.1;
    }

    // Apply subtle inertia after dragging (fine threshold supports 150x deep zoom)
    if (!this.isDragging && (Math.abs(this.velocityLon) > 0.0002 || Math.abs(this.velocityLat) > 0.0002)) {
      this.targetLon += this.velocityLon;
      this.targetLat = Math.max(-84, Math.min(84, this.targetLat + this.velocityLat));
      this.velocityLon *= 0.91;
      this.velocityLat *= 0.91;
    }

    // Smooth camera damping (multiplicative log-space zoom damping stays silky from 0.85x to 150x)
    const damp = 1 - Math.exp(-dt * 9.5);
    this.camLat += (this.targetLat - this.camLat) * damp;
    this.camLon += (this.targetLon - this.camLon) * damp;
    this.zoom *= Math.pow(this.targetZoom / Math.max(0.01, this.zoom), damp);

    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    const isLight = this.options.isLight;

    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // 1. Background
    if (isLight) {
      const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.45, 40, W * 0.5, H * 0.5, Math.max(W, H) * 0.78);
      bgGrad.addColorStop(0, '#eef4fb');
      bgGrad.addColorStop(1, '#dce7f3');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);
    } else {
      const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.48, 40, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
      bgGrad.addColorStop(0, '#0a1628');
      bgGrad.addColorStop(0.65, '#050c17');
      bgGrad.addColorStop(1, '#02060d');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Subtle starfield
      for (const s of this.stars) {
        ctx.fillStyle = `rgba(210, 228, 255, ${s.alpha})`;
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const cx = W * 0.5;
    const cy = H * 0.5;
    const baseRadius = W < H ? Math.min(W * 0.45, H * 0.36) : Math.min(W, H) * 0.39;
    const R = baseRadius * this.zoom;
    const mat = this._computeRotationMatrix();

    // Solar direction in rotated camera space
    const sun = computeSubsolarPoint();
    const sunWorld = latLonToVec3(sun.lat, sun.lon);
    const sunCam = this._rotateVec(sunWorld, mat);

    // 2. Atmospheric outer halo
    const haloGrad = ctx.createRadialGradient(cx, cy, R * 0.94, cx, cy, R * 1.15);
    if (isLight) {
      haloGrad.addColorStop(0, 'rgba(56, 145, 226, 0.24)');
      haloGrad.addColorStop(0.55, 'rgba(96, 165, 250, 0.09)');
      haloGrad.addColorStop(1, 'rgba(96, 165, 250, 0)');
    } else {
      haloGrad.addColorStop(0, 'rgba(56, 189, 248, 0.26)');
      haloGrad.addColorStop(0.45, 'rgba(14, 116, 194, 0.10)');
      haloGrad.addColorStop(1, 'rgba(14, 116, 194, 0)');
    }
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.15, 0, Math.PI * 2);
    ctx.fill();

    // 3. Ocean sphere body (clipped to planet disc)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    const lightOffsetX = this.options.dayNight ? sunCam[0] * R * 0.45 : -R * 0.32;
    const lightOffsetY = this.options.dayNight ? -sunCam[1] * R * 0.45 : -R * 0.28;
    const oceanGrad = ctx.createRadialGradient(
      cx + lightOffsetX,
      cy + lightOffsetY,
      R * 0.08,
      cx,
      cy,
      R * 1.05
    );
    if (isLight) {
      oceanGrad.addColorStop(0, '#c8e1f6');
      oceanGrad.addColorStop(0.6, '#9fc7e8');
      oceanGrad.addColorStop(1, '#7ba9d1');
    } else {
      oceanGrad.addColorStop(0, '#123152');
      oceanGrad.addColorStop(0.58, '#0b1e36');
      oceanGrad.addColorStop(1, '#050e1c');
    }
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(cx - R - 2, cy - R - 2, R * 2 + 4, R * 2 + 4);

    // 4. Adaptive Lat/Lon Graticule (subdivides cleanly as user zooms in)
    if (this.options.showGraticule) {
      this._drawGraticule(ctx, mat, cx, cy, R, isLight);
    }

    // 5. High-Resolution Continents, Islands, Major Lakes & Country Borders
    this._drawLandmasses(ctx, mat, cx, cy, R, isLight);
    if (this.lakePolygons.length > 0) {
      this._drawLakes(ctx, mat, cx, cy, R, isLight);
    }
    if (this.options.showBorders && this.borderLines.length > 0) {
      this._drawBorders(ctx, mat, cx, cy, R, isLight);
    }

    // 6. Real-time Day/Night terminator & Night City Lights
    if (this.options.dayNight) {
      this._drawTerminatorAndCities(ctx, mat, sunWorld, sunCam, cx, cy, R, isLight);
    }

    // Inner spherical rim lighting
    const rimGrad = ctx.createRadialGradient(cx, cy, R * 0.78, cx, cy, R);
    rimGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    rimGrad.addColorStop(0.82, isLight ? 'rgba(30, 64, 110, 0.06)' : 'rgba(56, 189, 248, 0.04)');
    rimGrad.addColorStop(1, isLight ? 'rgba(30, 64, 110, 0.24)' : 'rgba(125, 211, 252, 0.26)');
    ctx.fillStyle = rimGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // 7. Geographic Place Names & Airport Hubs (shared collision boxes so labels never overlap)
    const labelBoxes = [];
    if (this.options.showPlaces) {
      this._drawPlaces(ctx, mat, cx, cy, R, isLight, labelBoxes);
    }

    // 8. Airport Hubs (on globe surface)
    if (this.options.showAirports) {
      this._drawAirports(ctx, mat, cx, cy, R, isLight, labelBoxes);
    }

    ctx.restore(); // End planet disc clip

    // Subtle crisp planet border
    ctx.strokeStyle = isLight ? 'rgba(59, 130, 246, 0.35)' : 'rgba(125, 211, 252, 0.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // 9. Selected Flight 3D Live Track & Projected Heading Vector (or Route Arc if available)
    const selectedFlight = this.selectedIcao
      ? this.flights.find((f) => f.icao24 === this.selectedIcao)
      : null;
    if (selectedFlight) {
      if (selectedFlight.originCoords && selectedFlight.destCoords) {
        this._drawSelectedRouteArc(ctx, selectedFlight, mat, cx, cy, R, isLight);
      } else {
        this._drawLiveSelectedTrack(ctx, selectedFlight, mat, cx, cy, R, isLight);
      }
    }

    // 10. Aircraft Markers (depth-sorted, elevated in 3D space)
    this._drawFlights(ctx, mat, cx, cy, R, isLight, now);

    ctx.restore();
  }

  _drawGraticule(ctx, mat, cx, cy, R, isLight) {
    const stepDeg = this.zoom >= 70 ? 0.2 : (this.zoom >= 28 ? 0.5 : (this.zoom >= 12 ? 2 : (this.zoom >= 5.5 ? 5 : (this.zoom >= 2.2 ? 15 : 30))));
    const sampleStep = this.zoom >= 70 ? 0.08 : (this.zoom >= 28 ? 0.2 : (this.zoom >= 8 ? 1 : (this.zoom >= 3.5 ? 2 : 4)));
    const W = this.width;
    const H = this.height;
    // Half angular viewport span for fast culling when deeply zoomed
    const spanDeg = this.zoom > 1.8 ? Math.min(95, (Math.max(W, H) / R) * RAD2DEG * 0.78 + stepDeg * 2) : 180;
    const minLat = Math.max(-84, Math.floor((this.camLat - spanDeg) / stepDeg) * stepDeg);
    const maxLat = Math.min(84, Math.ceil((this.camLat + spanDeg) / stepDeg) * stepDeg);

    ctx.lineWidth = this.zoom >= 5 ? 0.55 : 0.7;

    // Parallels
    for (let lat = minLat; lat <= maxLat + 1e-6; lat += stepDeg) {
      const isEq = Math.abs(lat) < 1e-4;
      const isMajor = isEq || Math.abs(lat - Math.round(lat / 10) * 10) < 1e-4;
      ctx.strokeStyle = isEq
        ? (isLight ? 'rgba(30, 64, 110, 0.24)' : 'rgba(125, 211, 252, 0.18)')
        : isMajor
          ? (isLight ? 'rgba(30, 64, 110, 0.11)' : 'rgba(148, 184, 218, 0.09)')
          : (isLight ? 'rgba(30, 64, 110, 0.06)' : 'rgba(148, 184, 218, 0.05)');
      ctx.beginPath();
      let penDown = false;
      const lonStart = spanDeg < 120 ? this.camLon - spanDeg * 1.4 : -180;
      const lonEnd = spanDeg < 120 ? this.camLon + spanDeg * 1.4 : 180;
      for (let lon = lonStart; lon <= lonEnd; lon += sampleStep) {
        const p = this._projectVec(latLonToVec3(lat, lon), mat, cx, cy, R);
        if (p.z > 0 && p.x >= -60 && p.x <= W + 60 && p.y >= -60 && p.y <= H + 60) {
          if (!penDown) {
            ctx.moveTo(p.x, p.y);
            penDown = true;
          } else {
            ctx.lineTo(p.x, p.y);
          }
        } else {
          penDown = false;
        }
      }
      ctx.stroke();
    }

    // Meridians
    const lonSpan = Math.min(180, spanDeg / Math.max(0.25, Math.cos(this.camLat * DEG2RAD)));
    const lonMin = lonSpan < 170 ? Math.floor((this.camLon - lonSpan) / stepDeg) * stepDeg : -180;
    const lonMax = lonSpan < 170 ? Math.ceil((this.camLon + lonSpan) / stepDeg) * stepDeg : 180 - stepDeg;
    for (let lon = lonMin; lon <= lonMax; lon += stepDeg) {
      const normLon = ((((lon + 180) % 360) + 360) % 360) - 180;
      const isMajor = Math.abs(normLon) % 30 === 0;
      ctx.strokeStyle = isMajor
        ? (isLight ? 'rgba(30, 64, 110, 0.11)' : 'rgba(148, 184, 218, 0.09)')
        : (isLight ? 'rgba(30, 64, 110, 0.06)' : 'rgba(148, 184, 218, 0.05)');
      ctx.beginPath();
      let penDown = false;
      for (let lat = minLat; lat <= maxLat; lat += sampleStep) {
        const p = this._projectVec(latLonToVec3(lat, lon), mat, cx, cy, R);
        if (p.z > 0 && p.x >= -60 && p.x <= W + 60 && p.y >= -60 && p.y <= H + 60) {
          if (!penDown) {
            ctx.moveTo(p.x, p.y);
            penDown = true;
          } else {
            ctx.lineTo(p.x, p.y);
          }
        } else {
          penDown = false;
        }
      }
      ctx.stroke();
    }
  }

  _drawPolygonEntries(ctx, entries, mat, cx, cy, R, minPxRadius = 1.1) {
    const W = this.width;
    const H = this.height;

    for (let eIdx = 0; eIdx < entries.length; eIdx++) {
      const entry = entries[eIdx];
      if (!entry.isLarge) {
        if (entry.sinRadius * R < minPxRadius) continue;
        const rc = this._rotateVec(entry.center, mat);
        if (rc[2] < -entry.sinRadius - 0.02) continue;
        const radPx = entry.sinRadius * R + 16;
        const scx = cx + rc[0] * R;
        const scy = cy - rc[1] * R;
        if (scx + radPx < 0 || scx - radPx > W || scy + radPx < 0 || scy - radPx > H) continue;
      }

      const poly = entry.vecs;
      const n = poly.length;
      const rotated = new Array(n);
      let anyVisible = false;
      let anyOnScreen = false;
      for (let i = 0; i < n; i++) {
        const r = this._rotateVec(poly[i], mat);
        rotated[i] = r;
        if (r[2] >= 0) {
          anyVisible = true;
          if (!anyOnScreen) {
            const sx = cx + r[0] * R;
            const sy = cy - r[1] * R;
            if (sx >= -80 && sx <= W + 80 && sy >= -80 && sy <= H + 80) anyOnScreen = true;
          }
        }
      }
      if (!anyVisible || (!entry.isLarge && !anyOnScreen)) continue;

      // Start at a visible vertex so hidden chains cleanly pair I_out -> I_in
      let startIdx = 0;
      for (let i = 0; i < n; i++) {
        if (rotated[i][2] >= 0) {
          startIdx = i;
          break;
        }
      }

      const clipped = [];
      let inHidden = false;
      let exitAngle = 0;
      let prevHiddenAngle = 0;
      let hiddenAngleDelta = 0;

      for (let step = 0; step <= n; step++) {
        const curr = rotated[(startIdx + step) % n];
        const prev = rotated[(startIdx + step - 1 + n) % n];
        const currVis = curr[2] >= 0;

        if (step === 0) {
          clipped.push([curr[0], curr[1]]);
          continue;
        }

        if (currVis && !inHidden) {
          clipped.push([curr[0], curr[1]]);
        } else if (!currVis && !inHidden) {
          const t = prev[2] / (prev[2] - curr[2]);
          let ix = prev[0] + (curr[0] - prev[0]) * t;
          let iy = prev[1] + (curr[1] - prev[1]) * t;
          const len = Math.hypot(ix, iy) || 1;
          ix /= len;
          iy /= len;
          clipped.push([ix, iy]);

          inHidden = true;
          exitAngle = Math.atan2(iy, ix);
          const curAng = Math.atan2(curr[1], curr[0]);
          let d = curAng - exitAngle;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          hiddenAngleDelta = d;
          prevHiddenAngle = curAng;
        } else if (!currVis && inHidden) {
          const curAng = Math.atan2(curr[1], curr[0]);
          let d = curAng - prevHiddenAngle;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          hiddenAngleDelta += d;
          prevHiddenAngle = curAng;
        } else if (currVis && inHidden) {
          const t = prev[2] / (prev[2] - curr[2]);
          let ix = prev[0] + (curr[0] - prev[0]) * t;
          let iy = prev[1] + (curr[1] - prev[1]) * t;
          const len = Math.hypot(ix, iy) || 1;
          ix /= len;
          iy /= len;

          const entryAngle = Math.atan2(iy, ix);
          let d = entryAngle - prevHiddenAngle;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          hiddenAngleDelta += d;

          const arcSteps = Math.max(2, Math.ceil(Math.abs(hiddenAngleDelta) / 0.1));
          for (let s = 1; s <= arcSteps; s++) {
            const ang = exitAngle + (hiddenAngleDelta * s) / arcSteps;
            clipped.push([Math.cos(ang), Math.sin(ang)]);
          }
          clipped.push([curr[0], curr[1]]);
          inHidden = false;
        }
      }

      if (clipped.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(cx + clipped[0][0] * R, cy - clipped[0][1] * R);
      for (let i = 1; i < clipped.length; i++) {
        ctx.lineTo(cx + clipped[i][0] * R, cy - clipped[i][1] * R);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  _drawLandmasses(ctx, mat, cx, cy, R, isLight) {
    ctx.fillStyle = isLight ? '#e8ece6' : '#19304a';
    ctx.strokeStyle = isLight ? '#7e9bb0' : '#3e6b99';
    ctx.lineWidth = Math.min(1.5, 0.78 + Math.log2(Math.max(1, this.zoom)) * 0.24);
    this._drawPolygonEntries(ctx, this.landPolygons, mat, cx, cy, R, 1.15);
  }

  _drawLakes(ctx, mat, cx, cy, R, isLight) {
    ctx.fillStyle = isLight ? '#a6cde9' : '#0c223c';
    ctx.strokeStyle = isLight ? '#7e9bb0' : '#315982';
    ctx.lineWidth = 0.7;
    this._drawPolygonEntries(ctx, this.lakePolygons, mat, cx, cy, R, 1.8);
  }

  _drawBorders(ctx, mat, cx, cy, R, isLight) {
    const W = this.width;
    const H = this.height;
    const alpha = Math.min(0.52, 0.22 + Math.log2(Math.max(1, this.zoom)) * 0.09);
    ctx.strokeStyle = isLight
      ? `rgba(71, 95, 120, ${alpha})`
      : `rgba(148, 194, 232, ${alpha})`;
    ctx.lineWidth = this.zoom >= 4 ? 1.0 : 0.75;

    ctx.beginPath();
    for (let bIdx = 0; bIdx < this.borderLines.length; bIdx++) {
      const entry = this.borderLines[bIdx];
      if (!entry.isLarge) {
        if (entry.sinRadius * R < 2.2) continue;
        const rc = this._rotateVec(entry.center, mat);
        if (rc[2] < -entry.sinRadius - 0.02) continue;
        const radPx = entry.sinRadius * R + 16;
        const scx = cx + rc[0] * R;
        const scy = cy - rc[1] * R;
        if (scx + radPx < 0 || scx - radPx > W || scy + radPx < 0 || scy - radPx > H) continue;
      }

      const vecs = entry.vecs;
      let penDown = false;
      for (let i = 0; i < vecs.length; i++) {
        const r = this._rotateVec(vecs[i], mat);
        if (r[2] > 0.01) {
          const sx = cx + r[0] * R;
          const sy = cy - r[1] * R;
          if (!penDown) {
            ctx.moveTo(sx, sy);
            penDown = true;
          } else {
            ctx.lineTo(sx, sy);
          }
        } else {
          penDown = false;
        }
      }
    }
    ctx.stroke();
  }

  _drawPlaces(ctx, mat, cx, cy, R, isLight, placedBoxes = []) {
    const W = this.width;
    const H = this.height;
    const zoom = this.zoom;

    const overlaps = (x1, y1, x2, y2) => {
      for (let i = 0; i < placedBoxes.length; i++) {
        const b = placedBoxes[i];
        if (x1 < b[2] && x2 > b[0] && y1 < b[3] && y2 > b[1]) return true;
      }
      return false;
    };

    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    for (let i = 0; i < this.places.length; i++) {
      const pl = this.places[i];
      if (zoom < (pl.minZoom ?? 0.85)) continue;
      if (pl.maxZoom && zoom > pl.maxZoom) continue;

      const p = this._projectVec(pl.vec, mat, cx, cy, R);
      if (p.z <= 0.14) continue;
      if (p.x < 18 || p.x > W - 18 || p.y < 18 || p.y > H - 18) continue;

      const horizonFade = Math.min(1, (p.z - 0.14) * 2.6);
      const maxFade = pl.maxZoom ? Math.min(1, (pl.maxZoom - zoom) / 1.1) : 1;
      const alpha = horizonFade * maxFade;
      if (alpha < 0.08) continue;

      let fontSize = 11;
      let padX = 5;
      let padY = 3;
      let isCity = false;

      if (pl.type === 'ocean') {
        fontSize = zoom >= 2.2 ? 11.5 : 10.5;
        ctx.font = `italic 500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif`;
        ctx.textAlign = 'center';
        padX = 12;
        padY = 6;
      } else if (pl.type === 'country') {
        fontSize = zoom >= 2.4 ? 12 : 10.5;
        ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif`;
        ctx.textAlign = 'center';
        padX = 8;
        padY = 5;
      } else if (pl.type === 'city1') {
        isCity = true;
        fontSize = zoom >= 3.5 ? 12 : 10.8;
        ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif`;
        ctx.textAlign = 'left';
        padX = 5;
        padY = 3;
      } else {
        isCity = true;
        fontSize = zoom >= 6 ? 11.2 : 10.2;
        ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif`;
        ctx.textAlign = 'left';
        padX = 4;
        padY = 2.5;
      }

      const textW = ctx.measureText(pl.name).width;
      const drawX = isCity ? p.x + 5.5 : p.x;
      const drawY = p.y;
      const boxX1 = isCity ? p.x - 3 : drawX - textW * 0.5 - padX;
      const boxX2 = isCity ? drawX + textW + padX : drawX + textW * 0.5 + padX;
      const boxY1 = drawY - fontSize * 0.6 - padY;
      const boxY2 = drawY + fontSize * 0.6 + padY;

      if (overlaps(boxX1, boxY1, boxX2, boxY2)) continue;
      placedBoxes.push([boxX1, boxY1, boxX2, boxY2]);

      if (isCity) {
        const dotR = pl.type === 'city1' ? (zoom >= 3 ? 2.1 : 1.7) : 1.35;
        ctx.fillStyle = isLight
          ? `rgba(15, 23, 42, ${0.75 * alpha})`
          : `rgba(226, 240, 255, ${0.82 * alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.lineWidth = pl.type === 'ocean' ? 2.2 : 2.8;
      ctx.strokeStyle = isLight
        ? `rgba(240, 246, 252, ${0.85 * alpha})`
        : `rgba(4, 12, 24, ${0.86 * alpha})`;
      ctx.strokeText(pl.name, drawX, drawY);

      if (pl.type === 'ocean') {
        ctx.fillStyle = isLight
          ? `rgba(30, 88, 145, ${0.52 * alpha})`
          : `rgba(125, 194, 244, ${0.46 * alpha})`;
      } else if (pl.type === 'country') {
        ctx.fillStyle = isLight
          ? `rgba(51, 65, 85, ${0.72 * alpha})`
          : `rgba(186, 214, 242, ${0.68 * alpha})`;
      } else if (pl.type === 'city1') {
        ctx.fillStyle = isLight
          ? `rgba(15, 23, 42, ${0.9 * alpha})`
          : `rgba(232, 243, 255, ${0.9 * alpha})`;
      } else {
        ctx.fillStyle = isLight
          ? `rgba(30, 41, 59, ${0.82 * alpha})`
          : `rgba(196, 218, 242, ${0.82 * alpha})`;
      }
      ctx.fillText(pl.name, drawX, drawY);
    }
    ctx.textAlign = 'left';
  }

  _drawTerminatorAndCities(ctx, mat, sunWorld, sunCam, cx, cy, R, isLight) {
    // Soft night shadow hemisphere projected from anti-solar direction
    const antiX = cx - sunCam[0] * R * 0.72;
    const antiY = cy + sunCam[1] * R * 0.72;
    const nightGrad = ctx.createRadialGradient(antiX, antiY, R * 0.15, antiX, antiY, R * 1.48);
    if (isLight) {
      nightGrad.addColorStop(0, 'rgba(15, 32, 62, 0.34)');
      nightGrad.addColorStop(0.55, 'rgba(15, 32, 62, 0.14)');
      nightGrad.addColorStop(1, 'rgba(15, 32, 62, 0)');
    } else {
      nightGrad.addColorStop(0, 'rgba(2, 6, 15, 0.62)');
      nightGrad.addColorStop(0.55, 'rgba(3, 10, 24, 0.32)');
      nightGrad.addColorStop(1, 'rgba(3, 10, 24, 0)');
    }
    ctx.fillStyle = nightGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // City lights glowing on the night hemisphere
    if (!isLight) {
      for (const cv of this.cityVecs) {
        const sunDot = cv[0] * sunWorld[0] + cv[1] * sunWorld[1] + cv[2] * sunWorld[2];
        if (sunDot > 0.08) continue; // Daylight side
        const p = this._projectVec(cv, mat, cx, cy, R);
        if (p.z <= 0.05) continue;
        const nightIntensity = Math.min(1, (-sunDot + 0.08) * 3.2) * Math.min(1, p.z * 2.5);
        const rad = 2.6 + this.zoom * 1.1;
        const g = ctx.createRadialGradient(p.x, p.y, 0.2, p.x, p.y, rad);
        g.addColorStop(0, `rgba(255, 214, 130, ${0.72 * nightIntensity})`);
        g.addColorStop(1, 'rgba(255, 180, 70, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawAirports(ctx, mat, cx, cy, R, isLight, placedBoxes = []) {
    const showLabels = this.zoom >= (this.options.showPlaces ? 2.1 : 1.55);
    const W = this.width;
    const H = this.height;
    ctx.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';

    const overlaps = (x1, y1, x2, y2) => {
      for (let i = 0; i < placedBoxes.length; i++) {
        const b = placedBoxes[i];
        if (x1 < b[2] && x2 > b[0] && y1 < b[3] && y2 > b[1]) return true;
      }
      return false;
    };

    for (const a of this.airports) {
      const p = this._projectVec(a.vec, mat, cx, cy, R);
      if (p.z <= 0.08) continue;
      if (p.x < -10 || p.x > W + 10 || p.y < -10 || p.y > H + 10) continue;
      const alpha = Math.min(1, p.z * 2.2);

      ctx.fillStyle = isLight
        ? `rgba(14, 116, 144, ${0.76 * alpha})`
        : `rgba(56, 189, 248, ${0.72 * alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.zoom > 2 ? 2.4 : 1.7, 0, Math.PI * 2);
      ctx.fill();

      if (showLabels && p.z > 0.25) {
        const w = ctx.measureText(a.iata).width;
        const candidates = [
          [p.x + 5, p.y],
          [p.x + 5, p.y + 10],
          [p.x - w - 5, p.y]
        ];
        for (const [lx, ly] of candidates) {
          const box = [lx - 2, ly - 6, lx + w + 3, ly + 6];
          if (!overlaps(box[0], box[1], box[2], box[3])) {
            placedBoxes.push(box);
            ctx.lineWidth = 2.4;
            ctx.strokeStyle = isLight
              ? `rgba(240, 246, 252, ${0.82 * alpha})`
              : `rgba(4, 12, 24, ${0.86 * alpha})`;
            ctx.strokeText(a.iata, lx, ly);
            ctx.fillStyle = isLight
              ? `rgba(14, 116, 144, ${0.88 * alpha})`
              : `rgba(125, 211, 252, ${0.86 * alpha})`;
            ctx.fillText(a.iata, lx, ly);
            break;
          }
        }
      }
    }
  }

  _drawSelectedRouteArc(ctx, flight, mat, cx, cy, R, isLight) {
    const startVec = latLonToVec3(flight.originCoords[0], flight.originCoords[1]);
    const endVec = latLonToVec3(flight.destCoords[0], flight.destCoords[1]);
    const segments = 72;
    const progress = typeof flight.progress === 'number' ? flight.progress : 0.5;
    const dot = Math.max(-1, Math.min(1, startVec[0] * endVec[0] + startVec[1] * endVec[1] + startVec[2] * endVec[2]));
    const angularLen = Math.acos(dot);
    const maxLift = Math.min(0.14, 0.03 + angularLen * 0.045);

    const drawSegmentRange = (tStart, tEnd, dashed, strokeStyle, width) => {
      ctx.save();
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = width;
      if (dashed) ctx.setLineDash([5, 5]);
      ctx.beginPath();
      let penDown = false;
      for (let i = 0; i <= segments; i++) {
        const t = tStart + ((tEnd - tStart) * i) / segments;
        const v = slerpVec3(startVec, endVec, t);
        const lift = 1 + Math.sin(Math.PI * t) * maxLift;
        const p = this._projectVec(v, mat, cx, cy, R, lift);
        // True 3D horizon occlusion test for elevated points
        const visible = p.z > 0 || Math.hypot(p.rx * lift, p.ry * lift) > 1.001;
        if (visible) {
          if (!penDown) {
            ctx.moveTo(p.x, p.y);
            penDown = true;
          } else {
            ctx.lineTo(p.x, p.y);
          }
        } else {
          penDown = false;
        }
      }
      ctx.stroke();
      ctx.restore();
    };

    // Flown solid luminous path
    drawSegmentRange(0, progress, false, isLight ? '#0284c7' : '#38bdf8', 2.4);
    // Remaining dashed path
    drawSegmentRange(progress, 1, true, isLight ? 'rgba(2, 132, 199, 0.55)' : 'rgba(186, 230, 253, 0.55)', 1.7);

    // Draw Origin & Destination pins
    const endpoints = [
      { vec: startVec, code: flight.origin, color: '#22c55e' },
      { vec: endVec, code: flight.destination, color: '#f59e0b' }
    ];
    ctx.font = '700 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'middle';

    for (const ep of endpoints) {
      const p = this._projectVec(ep.vec, mat, cx, cy, R, 1.003);
      if (p.z <= 0) continue;
      ctx.fillStyle = ep.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isLight ? '#ffffff' : '#091526';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (ep.code) {
        ctx.fillStyle = isLight ? 'rgba(255,255,255,0.9)' : 'rgba(9, 20, 38, 0.88)';
        const textW = ctx.measureText(ep.code).width + 10;
        ctx.beginPath();
        ctx.roundRect(p.x + 7, p.y - 9, textW, 18, 4);
        ctx.fill();
        ctx.fillStyle = ep.color;
        ctx.fillText(ep.code, p.x + 12, p.y + 0.5);
      }
    }

    // Mark the last coastal real-time ADS-B reception anchor for estimated oceanic aircraft
    if (flight.estimated && typeof flight.lastLiveLat === 'number' && typeof flight.lastLiveLon === 'number') {
      const pAnchor = this._projectVec(latLonToVec3(flight.lastLiveLat, flight.lastLiveLon), mat, cx, cy, R, 1.012);
      if (pAnchor.z > 0) {
        ctx.fillStyle = '#c084fc';
        ctx.beginPath();
        ctx.arc(pAnchor.x, pAnchor.y, 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isLight ? '#ffffff' : '#091526';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        const tag = '마지막 수신';
        ctx.font = '600 9.5px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif';
        const tw = ctx.measureText(tag).width + 8;
        ctx.fillStyle = isLight ? 'rgba(255,255,255,0.9)' : 'rgba(15, 10, 34, 0.88)';
        ctx.beginPath();
        ctx.roundRect(pAnchor.x + 6, pAnchor.y - 8, tw, 16, 4);
        ctx.fill();
        ctx.fillStyle = '#d8b4fe';
        ctx.fillText(tag, pAnchor.x + 10, pAnchor.y + 0.5);
      }
    }
  }

  _drawLiveSelectedTrack(ctx, flight, mat, cx, cy, R, isLight) {
    // 1. Draw actual recorded live ADS-B track points if we have >= 2 samples
    const track = Array.isArray(flight.track) ? flight.track : [];
    if (track.length >= 2) {
      ctx.save();
      ctx.strokeStyle = isLight ? '#0284c7' : '#38bdf8';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      let penDown = false;
      for (const pt of track) {
        const lift = 1 + 0.008 + Math.min(1.2, (pt.altFt || 0) / 42000) * 0.036;
        const p = this._projectVec(latLonToVec3(pt.lat, pt.lon), mat, cx, cy, R, lift);
        if (p.z > -0.02 || Math.hypot(p.rx * lift, p.ry * lift) > 1.001) {
          if (!penDown) {
            ctx.moveTo(p.x, p.y);
            penDown = true;
          } else {
            ctx.lineTo(p.x, p.y);
          }
        } else {
          penDown = false;
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    // 2. Draw forward projected true-track dashed arc (~320 km ahead)
    const speedKts = Math.max(120, flight.speedKts || 350);
    const totalDistKm = Math.min(480, Math.max(160, speedKts * 0.7));
    const lift = 1 + 0.008 + Math.min(1.2, (flight.altitudeFt || 0) / 42000) * 0.036;
    const bearing = (flight.heading || 0) * DEG2RAD;
    const lat1 = flight.lat * DEG2RAD;
    const lon1 = flight.lon * DEG2RAD;

    ctx.save();
    ctx.strokeStyle = isLight ? 'rgba(2, 132, 199, 0.6)' : 'rgba(250, 204, 21, 0.65)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    let penDown = false;
    for (let i = 0; i <= 20; i++) {
      const angDist = ((totalDistKm * (i / 20)) / 6371.0088);
      const sinLat2 = Math.sin(lat1) * Math.cos(angDist) + Math.cos(lat1) * Math.sin(angDist) * Math.cos(bearing);
      const lat2 = Math.asin(Math.max(-1, Math.min(1, sinLat2)));
      const lon2 = lon1 + Math.atan2(
        Math.sin(bearing) * Math.sin(angDist) * Math.cos(lat1),
        Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2)
      );
      const p = this._projectVec(latLonToVec3(lat2 * RAD2DEG, lon2 * RAD2DEG), mat, cx, cy, R, lift);
      if (p.z > -0.02 || Math.hypot(p.rx * lift, p.ry * lift) > 1.001) {
        if (!penDown) {
          ctx.moveTo(p.x, p.y);
          penDown = true;
        } else {
          ctx.lineTo(p.x, p.y);
        }
      } else {
        penDown = false;
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawFlights(ctx, mat, cx, cy, R, isLight, now) {
    const projected = [];
    const showTrails = this.options.showTrails;
    const altExag = 1 / (1 + Math.max(0, this.zoom - 2) * 0.32);
    const pad = 90;
    const maxX = this.width + pad;
    const maxY = this.height + pad;

    for (const f of this.flights) {
      const vec = latLonToVec3(f.lat, f.lon);
      const altRatio = Math.min(1.2, Math.max(0, (f.altitudeFt || 0) / 42000));
      const lift = 1 + (0.008 + altRatio * 0.036) * altExag;
      const p = this._projectVec(vec, mat, cx, cy, R, lift);

      // True 3D horizon occlusion + viewport culling when zoomed deep in
      const visible = p.z > -0.02 || Math.hypot(p.rx * lift, p.ry * lift) > 1.002;
      if (!visible) continue;
      if (f.icao24 !== this.selectedIcao && (p.x < -pad || p.x > maxX || p.y < -pad || p.y > maxY)) {
        continue;
      }

      // Compute exact 2D screen-space heading angle by projecting a short forward step
      const hdgRad = (f.heading || 0) * DEG2RAD;
      const stepDeg = Math.max(0.005, 0.65 / Math.max(1, this.zoom * 0.5));
      const cosLat = Math.max(0.15, Math.cos(f.lat * DEG2RAD));
      const aheadLat = Math.max(-89, Math.min(89, f.lat + Math.cos(hdgRad) * stepDeg));
      const aheadLon = f.lon + (Math.sin(hdgRad) * stepDeg) / cosLat;
      const pAhead = this._projectVec(latLonToVec3(aheadLat, aheadLon), mat, cx, cy, R, lift);
      const screenAngle = Math.atan2(pAhead.y - p.y, pAhead.x - p.x);

      let tail = null;
      if (showTrails) {
        const backDeg = Math.max(0.025, 2.4 / Math.max(1, this.zoom * 0.45));
        const backLat = Math.max(-89, Math.min(89, f.lat - Math.cos(hdgRad) * backDeg));
        const backLon = f.lon - (Math.sin(hdgRad) * backDeg) / cosLat;
        const pBack = this._projectVec(latLonToVec3(backLat, backLon), mat, cx, cy, R, lift);
        if (pBack.z > -0.05) {
          tail = pBack;
        }
      }

      const surface = (this.zoom > 1.75 || f.icao24 === this.selectedIcao)
        ? this._projectVec(vec, mat, cx, cy, R, 1.0)
        : null;

      projected.push({
        flight: f,
        x: p.x,
        y: p.y,
        z: p.z,
        angle: screenAngle,
        tail,
        surface
      });
    }

    // Painter's depth sort (far -> near)
    projected.sort((a, b) => a.z - b.z);
    this.screenFlights = projected;

    const dense = projected.length > 700;
    const densityScale = projected.length > 1800 ? 0.72 : (projected.length > 900 ? 0.85 : 1);
    const baseSize = Math.min(16.0, (4.4 + Math.log2(Math.max(1, this.zoom)) * 2.15) * densityScale);

    for (const item of projected) {
      const { flight, x, y, z, angle, tail, surface } = item;
      const isSelected = flight.icao24 === this.selectedIcao;
      const isHovered = flight.icao24 === this.hoveredIcao;
      const isEstimated = Boolean(flight.estimated);
      const depthAlpha = Math.max(0.32, Math.min(1, (z + 0.25) * 1.15));
      const color = isEstimated
        ? (isLight ? '#9333ea' : '#c084fc')
        : (this.options.altitudeColor
          ? altitudeColor(flight.altitudeFt || 0, isLight)
          : (isLight ? '#0369a1' : '#38bdf8'));

      // 3D vertical altitude drop-line to ground shadow
      if (surface && surface.z > 0 && (!dense || isSelected || this.zoom > 2.4)) {
        ctx.strokeStyle = isSelected
          ? 'rgba(251, 191, 36, 0.72)'
          : isEstimated
            ? 'rgba(192, 132, 252, 0.28)'
            : (isLight ? 'rgba(15, 23, 42, 0.16)' : 'rgba(148, 210, 245, 0.18)');
        ctx.lineWidth = isSelected ? 1.2 : 0.75;
        ctx.beginPath();
        ctx.moveTo(surface.x, surface.y);
        ctx.lineTo(x, y);
        ctx.stroke();

        ctx.fillStyle = isLight ? 'rgba(15, 23, 42, 0.22)' : 'rgba(2, 6, 15, 0.5)';
        ctx.beginPath();
        ctx.arc(surface.x, surface.y, isSelected ? 2.4 : 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Subtle motion wake trail (dashed violet for estimated oceanic aircraft)
      if (tail) {
        ctx.save();
        if (isEstimated) {
          ctx.setLineDash([3, 3]);
        }
        if (!dense || isSelected || isHovered || isEstimated) {
          const grad = ctx.createLinearGradient(x, y, tail.x, tail.y);
          grad.addColorStop(0, isSelected ? '#fbbf24' : color);
          grad.addColorStop(1, isEstimated ? 'rgba(192, 132, 252, 0)' : 'rgba(56, 189, 248, 0)');
          ctx.globalAlpha = (isSelected ? 0.85 : (isEstimated ? 0.52 : 0.42)) * depthAlpha;
          ctx.strokeStyle = grad;
        } else {
          ctx.globalAlpha = 0.22 * depthAlpha;
          ctx.strokeStyle = color;
        }
        ctx.lineWidth = isSelected ? 2.0 : (dense ? 0.85 : 1.15);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tail.x, tail.y);
        ctx.stroke();
        ctx.restore();
      }

      // Subtle dashed ring for estimated aircraft when zoomed in
      if (isEstimated && !isSelected && !isHovered && this.zoom >= 1.55) {
        ctx.save();
        ctx.setLineDash([2.5, 2.5]);
        ctx.strokeStyle = isLight ? 'rgba(147, 51, 234, 0.55)' : 'rgba(192, 132, 252, 0.52)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(x, y, baseSize + 3.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Selection reticle pulse
      if (isSelected || isHovered) {
        const pulse = isSelected ? (1 + Math.sin(now * 0.006) * 0.14) : 1;
        ctx.save();
        if (isEstimated) ctx.setLineDash([4, 3]);
        ctx.strokeStyle = isSelected ? (isEstimated ? '#d8b4fe' : '#fbbf24') : color;
        ctx.lineWidth = isSelected ? 1.8 : 1.2;
        ctx.beginPath();
        ctx.arc(x, y, (baseSize + 6.5) * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Size- & purpose-specific aircraft icon silhouette
      const iconMeta = flight._iconMeta || (flight._iconMeta = classifyAircraftIcon(flight));
      const useFastLod = projected.length > 1600 && this.zoom < 1.65 && !isSelected && !isHovered;
      const roleScale = iconMeta.scale || 1.0;
      const s = (isSelected ? baseSize * 1.38 : isHovered ? baseSize * 1.22 : baseSize) * roleScale;

      ctx.save();
      ctx.translate(x, y);
      if (iconMeta.kind !== 'balloon') {
        ctx.rotate(angle);
      }
      ctx.globalAlpha = isSelected || isHovered ? 1 : (isEstimated ? depthAlpha * 0.78 : depthAlpha);
      ctx.fillStyle = isSelected ? (isEstimated ? '#e9d5ff' : '#fef08a') : color;

      if (useFastLod) {
        ctx.beginPath();
        if (iconMeta.kind === 'helicopter') {
          ctx.arc(0, 0, s * 0.65, 0, Math.PI * 2);
        } else if (iconMeta.kind === 'prop') {
          ctx.moveTo(s * 0.9, 0);
          ctx.lineTo(s * 0.1, s * 0.95);
          ctx.lineTo(-s * 0.85, 0);
          ctx.lineTo(s * 0.1, -s * 0.95);
        } else {
          ctx.moveTo(s * 1.15, 0);
          ctx.lineTo(-s * 0.72, s * 0.78);
          ctx.lineTo(-s * 0.35, 0);
          ctx.lineTo(-s * 0.72, -s * 0.78);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        this._drawAircraftIcon(ctx, iconMeta.kind, s, isSelected, isEstimated, now);
      }

      ctx.restore();

      // Callsign (+ altitude when zoomed deep in) label
      if (isSelected || (this.zoom >= 3.2 && z > 0.35)) {
        ctx.save();
        ctx.font = `${isSelected ? '700' : '600'} 10px ui-monospace, SFMono-Regular, Menlo, monospace`;
        const baseLabel = (isEstimated ? '~' : '') + (flight.callsign || flight.icao24);
        const label = (!isSelected && this.zoom >= 6.5 && flight.altitudeFt)
          ? `${baseLabel} ${Math.round(flight.altitudeFt / 1000)}k`
          : baseLabel;
        const tw = ctx.measureText(label).width + 8;
        ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.88)' : 'rgba(6, 15, 29, 0.84)';
        ctx.beginPath();
        ctx.roundRect(x + s + 5, y - 8, tw, 16, 4);
        ctx.fill();
        ctx.fillStyle = isSelected
          ? (isEstimated ? '#d8b4fe' : (isLight ? '#b45309' : '#fde047'))
          : (isEstimated ? '#d8b4fe' : (isLight ? '#0f172a' : '#e2e8f0'));
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + s + 9, y + 0.5);
        ctx.restore();
      }
    }
  }

  _drawAircraftIcon(ctx, kind, s, isSelected, isEstimated, now) {
    if (kind === 'helicopter') {
      // Teardrop fuselage + tail boom + horizontal tail fin
      ctx.beginPath();
      ctx.moveTo(s * 0.78, 0);
      ctx.quadraticCurveTo(s * 0.52, s * 0.32, -s * 0.1, s * 0.24);
      ctx.lineTo(-s * 0.92, s * 0.08);
      ctx.lineTo(-s * 1.06, s * 0.34);
      ctx.lineTo(-s * 1.16, s * 0.30);
      ctx.lineTo(-s * 1.05, 0);
      ctx.lineTo(-s * 1.16, -s * 0.30);
      ctx.lineTo(-s * 1.06, -s * 0.34);
      ctx.lineTo(-s * 0.92, -s * 0.08);
      ctx.lineTo(-s * 0.1, -s * 0.24);
      ctx.quadraticCurveTo(s * 0.52, -s * 0.32, s * 0.78, 0);
      ctx.closePath();
      ctx.fill();

      // Spinning 4-blade main rotor centered on cabin
      const spin = (now * 0.011) % (Math.PI * 2);
      ctx.save();
      ctx.translate(s * 0.18, 0);
      ctx.rotate(spin);
      ctx.strokeStyle = isSelected ? '#fef08a' : ctx.fillStyle;
      ctx.lineWidth = Math.max(1.0, s * 0.14);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-s * 0.78, 0);
      ctx.lineTo(s * 0.78, 0);
      ctx.moveTo(0, -s * 0.78);
      ctx.lineTo(0, s * 0.78);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (kind === 'prop') {
      // General aviation / Turboprop: straight unswept high-aspect wings + nose prop bar
      ctx.beginPath();
      ctx.moveTo(s * 0.98, 0);
      ctx.lineTo(s * 0.72, s * 0.14);
      ctx.lineTo(s * 0.28, s * 0.16);
      ctx.lineTo(s * 0.22, s * 1.08);
      ctx.lineTo(-s * 0.08, s * 1.08);
      ctx.lineTo(-s * 0.12, s * 0.15);
      ctx.lineTo(-s * 0.78, s * 0.10);
      ctx.lineTo(-s * 0.86, s * 0.42);
      ctx.lineTo(-s * 1.02, s * 0.40);
      ctx.lineTo(-s * 0.96, 0);
      ctx.lineTo(-s * 1.02, -s * 0.40);
      ctx.lineTo(-s * 0.86, -s * 0.42);
      ctx.lineTo(-s * 0.78, -s * 0.10);
      ctx.lineTo(-s * 0.12, -s * 0.15);
      ctx.lineTo(-s * 0.08, -s * 1.08);
      ctx.lineTo(s * 0.22, -s * 1.08);
      ctx.lineTo(s * 0.28, -s * 0.16);
      ctx.lineTo(s * 0.72, -s * 0.14);
      ctx.closePath();
      ctx.fill();

      // Subtle front propeller disc bar
      ctx.strokeStyle = isSelected ? '#fef08a' : ctx.fillStyle;
      ctx.lineWidth = Math.max(0.9, s * 0.12);
      ctx.beginPath();
      ctx.moveTo(s * 1.05, -s * 0.26);
      ctx.lineTo(s * 1.05, s * 0.26);
      ctx.stroke();
      return;
    }

    if (kind === 'bizjet') {
      // Business Jet: slender needle nose, narrow swept wings, rear-mounted engines, T-tail
      ctx.beginPath();
      ctx.moveTo(s * 1.2, 0);
      ctx.lineTo(s * 0.35, s * 0.13);
      ctx.lineTo(-s * 0.15, s * 0.92);
      ctx.lineTo(-s * 0.38, s * 0.84);
      ctx.lineTo(-s * 0.18, s * 0.15);
      ctx.lineTo(-s * 0.56, s * 0.24); // rear engine pod
      ctx.lineTo(-s * 0.76, s * 0.20);
      ctx.lineTo(-s * 0.78, s * 0.10);
      ctx.lineTo(-s * 1.08, s * 0.44); // T-tail
      ctx.lineTo(-s * 1.18, s * 0.38);
      ctx.lineTo(-s * 1.02, 0);
      ctx.lineTo(-s * 1.18, -s * 0.38);
      ctx.lineTo(-s * 1.08, -s * 0.44);
      ctx.lineTo(-s * 0.78, -s * 0.10);
      ctx.lineTo(-s * 0.76, -s * 0.20);
      ctx.lineTo(-s * 0.56, -s * 0.24);
      ctx.lineTo(-s * 0.18, -s * 0.15);
      ctx.lineTo(-s * 0.38, -s * 0.84);
      ctx.lineTo(-s * 0.15, -s * 0.92);
      ctx.lineTo(s * 0.35, -s * 0.13);
      ctx.closePath();
      ctx.fill();
      return;
    }

    if (kind === 'military_fighter') {
      // Sharp Delta-Wing Fighter Jet + tactical crimson edge accent
      ctx.beginPath();
      ctx.moveTo(s * 1.24, 0);
      ctx.lineTo(s * 0.35, s * 0.18);
      ctx.lineTo(-s * 0.42, s * 0.96);
      ctx.lineTo(-s * 0.62, s * 0.88);
      ctx.lineTo(-s * 0.54, s * 0.22);
      ctx.lineTo(-s * 0.96, s * 0.48);
      ctx.lineTo(-s * 1.12, s * 0.40);
      ctx.lineTo(-s * 0.98, s * 0.14);
      ctx.lineTo(-s * 1.06, 0);
      ctx.lineTo(-s * 0.98, -s * 0.14);
      ctx.lineTo(-s * 1.12, -s * 0.40);
      ctx.lineTo(-s * 0.96, -s * 0.48);
      ctx.lineTo(-s * 0.54, -s * 0.22);
      ctx.lineTo(-s * 0.62, -s * 0.88);
      ctx.lineTo(-s * 0.42, -s * 0.96);
      ctx.lineTo(s * 0.35, -s * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#fef08a' : '#f87171';
      ctx.lineWidth = Math.max(0.85, s * 0.1);
      ctx.stroke();
      return;
    }

    if (kind === 'military_heavy') {
      // Tactical Military Transport / Tanker (C-17 / C-130 / KC-135) with broad fuselage & T-tail
      ctx.beginPath();
      ctx.moveTo(s * 1.08, 0);
      ctx.lineTo(s * 0.82, s * 0.21);
      ctx.lineTo(s * 0.26, s * 0.23);
      ctx.lineTo(-s * 0.08, s * 1.06);
      ctx.lineTo(-s * 0.34, s * 1.02);
      ctx.lineTo(-s * 0.20, s * 0.23);
      ctx.lineTo(-s * 0.82, s * 0.18);
      ctx.lineTo(-s * 1.06, s * 0.52);
      ctx.lineTo(-s * 1.18, s * 0.46);
      ctx.lineTo(-s * 1.02, 0);
      ctx.lineTo(-s * 1.18, -s * 0.46);
      ctx.lineTo(-s * 1.06, -s * 0.52);
      ctx.lineTo(-s * 0.82, -s * 0.18);
      ctx.lineTo(-s * 0.20, -s * 0.23);
      ctx.lineTo(-s * 0.34, -s * 1.02);
      ctx.lineTo(-s * 0.08, -s * 1.06);
      ctx.lineTo(s * 0.26, -s * 0.23);
      ctx.lineTo(s * 0.82, -s * 0.21);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#fef08a' : '#f87171';
      ctx.lineWidth = Math.max(0.85, s * 0.09);
      ctx.stroke();
      return;
    }

    if (kind === 'uav') {
      // High-aspect thin long-wing UAV / Drone
      ctx.beginPath();
      ctx.moveTo(s * 0.95, 0);
      ctx.lineTo(s * 0.15, s * 0.10);
      ctx.lineTo(s * 0.05, s * 1.28);
      ctx.lineTo(-s * 0.12, s * 1.28);
      ctx.lineTo(-s * 0.10, s * 0.10);
      ctx.lineTo(-s * 0.88, s * 0.08);
      ctx.lineTo(-s * 1.06, s * 0.34);
      ctx.lineTo(-s * 0.96, 0);
      ctx.lineTo(-s * 1.06, -s * 0.34);
      ctx.lineTo(-s * 0.88, -s * 0.08);
      ctx.lineTo(-s * 0.10, -s * 0.10);
      ctx.lineTo(-s * 0.12, -s * 1.28);
      ctx.lineTo(s * 0.05, -s * 1.28);
      ctx.lineTo(s * 0.15, -s * 0.10);
      ctx.closePath();
      ctx.fill();
      return;
    }

    if (kind === 'balloon') {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 1;
      ctx.stroke();
      return;
    }

    if (kind === 'super_heavy') {
      // 4-Engine Super-Heavy Widebody (A380, B747, A340): wide fuselage + 4 visible wing engines
      ctx.beginPath();
      ctx.moveTo(s * 1.14, 0);
      ctx.lineTo(s * 0.82, s * 0.21);
      ctx.lineTo(s * 0.32, s * 0.23);
      ctx.lineTo(-s * 0.18, s * 1.08);
      ctx.lineTo(-s * 0.44, s * 1.02);
      ctx.lineTo(-s * 0.24, s * 0.23);
      ctx.lineTo(-s * 0.78, s * 0.18);
      ctx.lineTo(-s * 1.04, s * 0.50);
      ctx.lineTo(-s * 1.16, s * 0.44);
      ctx.lineTo(-s * 0.98, 0);
      ctx.lineTo(-s * 1.16, -s * 0.44);
      ctx.lineTo(-s * 1.04, -s * 0.50);
      ctx.lineTo(-s * 0.78, -s * 0.18);
      ctx.lineTo(-s * 0.24, -s * 0.23);
      ctx.lineTo(-s * 0.44, -s * 1.02);
      ctx.lineTo(-s * 0.18, -s * 1.08);
      ctx.lineTo(s * 0.32, -s * 0.23);
      ctx.lineTo(s * 0.82, -s * 0.21);
      ctx.closePath();
      ctx.fill();

      // 4 distinct engine nacelles (2 per wing)
      ctx.fillRect(s * 0.04, s * 0.36, s * 0.24, s * 0.12);
      ctx.fillRect(-s * 0.12, s * 0.66, s * 0.22, s * 0.11);
      ctx.fillRect(s * 0.04, -s * 0.48, s * 0.24, s * 0.12);
      ctx.fillRect(-s * 0.12, -s * 0.77, s * 0.22, s * 0.11);
    } else if (kind === 'heavy' || kind === 'cargo') {
      // Widebody Twin-Jet (B777, B787, A350, A330, Cargo Freighter)
      ctx.beginPath();
      ctx.moveTo(s * 1.16, 0);
      ctx.lineTo(s * 0.82, s * 0.18);
      ctx.lineTo(s * 0.30, s * 0.20);
      ctx.lineTo(-s * 0.16, s * 1.06);
      ctx.lineTo(-s * 0.42, s * 0.98);
      ctx.lineTo(-s * 0.20, s * 0.20);
      ctx.lineTo(-s * 0.78, s * 0.15);
      ctx.lineTo(-s * 1.02, s * 0.46);
      ctx.lineTo(-s * 1.15, s * 0.42);
      ctx.lineTo(-s * 0.98, 0);
      ctx.lineTo(-s * 1.15, -s * 0.42);
      ctx.lineTo(-s * 1.02, -s * 0.46);
      ctx.lineTo(-s * 0.78, -s * 0.15);
      ctx.lineTo(-s * 0.20, -s * 0.20);
      ctx.lineTo(-s * 0.42, -s * 0.98);
      ctx.lineTo(-s * 0.16, -s * 1.06);
      ctx.lineTo(s * 0.30, -s * 0.20);
      ctx.lineTo(s * 0.82, -s * 0.18);
      ctx.closePath();
      ctx.fill();

      // 2 prominent widebody engine nacelles
      ctx.fillRect(s * 0.04, s * 0.34, s * 0.25, s * 0.12);
      ctx.fillRect(s * 0.04, -s * 0.46, s * 0.25, s * 0.12);

      // Cargo freighter amber-orange fuselage spine accent
      if (kind === 'cargo') {
        ctx.fillStyle = isSelected ? '#92400e' : '#fb923c';
        ctx.fillRect(-s * 0.45, -s * 0.10, s * 0.95, s * 0.20);
      }
    } else {
      // Classic Narrowbody Airliner (A320, B737, E190)
      ctx.beginPath();
      ctx.moveTo(s * 1.15, 0);
      ctx.lineTo(s * 0.25, s * 0.19);
      ctx.lineTo(-s * 0.18, s * 1.02);
      ctx.lineTo(-s * 0.44, s * 0.92);
      ctx.lineTo(-s * 0.22, s * 0.18);
      ctx.lineTo(-s * 0.78, s * 0.13);
      ctx.lineTo(-s * 1.02, s * 0.44);
      ctx.lineTo(-s * 1.15, s * 0.40);
      ctx.lineTo(-s * 0.98, 0);
      ctx.lineTo(-s * 1.15, -s * 0.40);
      ctx.lineTo(-s * 1.02, -s * 0.44);
      ctx.lineTo(-s * 0.78, -s * 0.13);
      ctx.lineTo(-s * 0.22, -s * 0.18);
      ctx.lineTo(-s * 0.44, -s * 0.92);
      ctx.lineTo(-s * 0.18, -s * 1.02);
      ctx.lineTo(s * 0.25, -s * 0.19);
      ctx.closePath();
      ctx.fill();
    }

    if (isSelected) {
      ctx.strokeStyle = isEstimated ? '#7e22ce' : '#92400e';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }
}
