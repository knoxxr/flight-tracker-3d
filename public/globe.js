import { WORLD_POLYGONS, CITY_LIGHTS } from './world-data.js';

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

    // Camera state (smoothly damped toward target)
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

    // Pre-densify world coastline polygons onto unit sphere
    this.landPolygons = WORLD_POLYGONS.map((poly) => densifyPolygon(poly, 2.8));
    this.cityVecs = CITY_LIGHTS.map(([lat, lon]) => latLonToVec3(lat, lon));
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
    this.targetZoom = Math.max(0.85, Math.min(6.5, zoom));
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

      // Two-finger pinch-to-zoom
      if (activePointers.size >= 2) {
        const dist = getPinchDistance();
        if (dist && prevPinchDist && prevPinchDist > 8) {
          const ratio = dist / prevPinchDist;
          this.targetZoom = Math.max(0.85, Math.min(6.5, this.targetZoom * ratio));
        }
        prevPinchDist = dist;
        return;
      }

      // Single-finger / mouse orbit drag
      if (this.isDragging && activePointers.size === 1) {
        const dx = e.clientX - this.lastPointer.x;
        const dy = e.clientY - this.lastPointer.y;
        const moveThresh = e.pointerType === 'touch' ? 5 : 2;
        if (Math.abs(dx) > moveThresh || Math.abs(dy) > moveThresh) {
          this.dragMoved = true;
          this.followSelected = false;
        }
        const sensitivity = (e.pointerType === 'touch' ? 0.34 : 0.28) / Math.sqrt(this.zoom);
        this.targetLon -= dx * sensitivity;
        this.targetLat = Math.max(-82, Math.min(82, this.targetLat + dy * sensitivity));
        this.velocityLon = -dx * sensitivity * 0.35;
        this.velocityLat = dy * sensitivity * 0.35;
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
        this.isDragging = false;
        prevPinchDist = null;
        wasPinching = false;

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
        const factor = Math.exp(-e.deltaY * 0.0012);
        this.targetZoom = Math.max(0.85, Math.min(6.5, this.targetZoom * factor));
      },
      { passive: false }
    );
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

    // Apply subtle inertia after dragging
    if (!this.isDragging && (Math.abs(this.velocityLon) > 0.005 || Math.abs(this.velocityLat) > 0.005)) {
      this.targetLon += this.velocityLon;
      this.targetLat = Math.max(-82, Math.min(82, this.targetLat + this.velocityLat));
      this.velocityLon *= 0.91;
      this.velocityLat *= 0.91;
    }

    // Smooth camera damping
    const damp = 1 - Math.exp(-dt * 9.5);
    this.camLat += (this.targetLat - this.camLat) * damp;
    this.camLon += (this.targetLon - this.camLon) * damp;
    this.zoom += (this.targetZoom - this.zoom) * damp;

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

    // 4. Lat/Lon Graticule
    if (this.options.showGraticule) {
      this._drawGraticule(ctx, mat, cx, cy, R, isLight);
    }

    // 5. Continents & Coastlines (horizon-clipped)
    this._drawLandmasses(ctx, mat, cx, cy, R, isLight);

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

    // 7. Airport Hubs (on globe surface)
    if (this.options.showAirports) {
      this._drawAirports(ctx, mat, cx, cy, R, isLight);
    }

    ctx.restore(); // End planet disc clip

    // Subtle crisp planet border
    ctx.strokeStyle = isLight ? 'rgba(59, 130, 246, 0.35)' : 'rgba(125, 211, 252, 0.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // 8. Selected Flight 3D Live Track & Projected Heading Vector (or Route Arc if available)
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

    // 9. Aircraft Markers (depth-sorted, elevated in 3D space)
    this._drawFlights(ctx, mat, cx, cy, R, isLight, now);

    ctx.restore();
  }

  _drawGraticule(ctx, mat, cx, cy, R, isLight) {
    ctx.lineWidth = 0.7;

    // Parallels (every 30 deg)
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.strokeStyle = lat === 0
        ? (isLight ? 'rgba(30, 64, 110, 0.22)' : 'rgba(125, 211, 252, 0.16)')
        : (isLight ? 'rgba(30, 64, 110, 0.10)' : 'rgba(148, 184, 218, 0.08)');
      ctx.beginPath();
      let penDown = false;
      for (let lon = -180; lon <= 180; lon += 4) {
        const p = this._projectVec(latLonToVec3(lat, lon), mat, cx, cy, R);
        if (p.z > 0) {
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

    // Meridians (every 30 deg)
    ctx.strokeStyle = isLight ? 'rgba(30, 64, 110, 0.10)' : 'rgba(148, 184, 218, 0.08)';
    for (let lon = -180; lon < 180; lon += 30) {
      ctx.beginPath();
      let penDown = false;
      for (let lat = -84; lat <= 84; lat += 4) {
        const p = this._projectVec(latLonToVec3(lat, lon), mat, cx, cy, R);
        if (p.z > 0) {
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

  _drawLandmasses(ctx, mat, cx, cy, R, isLight) {
    ctx.fillStyle = isLight ? '#e8ece6' : '#16283e';
    ctx.strokeStyle = isLight ? '#8ea6b8' : '#2d4d70';
    ctx.lineWidth = Math.min(1.4, 0.75 + this.zoom * 0.18);

    for (const poly of this.landPolygons) {
      const n = poly.length;
      const rotated = new Array(n);
      let anyVisible = false;
      for (let i = 0; i < n; i++) {
        const r = this._rotateVec(poly[i], mat);
        rotated[i] = r;
        if (r[2] >= 0) anyVisible = true;
      }
      if (!anyVisible) continue;

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
          // Crossing visible -> hidden: compute horizon intersection
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
          // Crossing hidden -> visible: compute horizon re-entry & trace horizon arc
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

  _drawAirports(ctx, mat, cx, cy, R, isLight) {
    const showLabels = this.zoom >= 1.55;
    ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'middle';

    for (const a of this.airports) {
      const p = this._projectVec(a.vec, mat, cx, cy, R);
      if (p.z <= 0.08) continue;
      const alpha = Math.min(1, p.z * 2.2);

      ctx.fillStyle = isLight
        ? `rgba(14, 116, 144, ${0.72 * alpha})`
        : `rgba(148, 210, 245, ${0.62 * alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.zoom > 2 ? 2.6 : 1.9, 0, Math.PI * 2);
      ctx.fill();

      if (showLabels && p.z > 0.25) {
        ctx.fillStyle = isLight
          ? `rgba(15, 23, 42, ${0.78 * alpha})`
          : `rgba(203, 224, 245, ${0.78 * alpha})`;
        ctx.fillText(a.iata, p.x + 5, p.y);
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

    for (const f of this.flights) {
      const vec = latLonToVec3(f.lat, f.lon);
      const altRatio = Math.min(1.2, Math.max(0, (f.altitudeFt || 0) / 42000));
      const lift = 1 + 0.008 + altRatio * 0.036;
      const p = this._projectVec(vec, mat, cx, cy, R, lift);

      // True 3D horizon occlusion: visible if on front hemisphere OR lifted above the horizon silhouette
      const visible = p.z > -0.02 || Math.hypot(p.rx * lift, p.ry * lift) > 1.002;
      if (!visible) continue;

      // Compute exact 2D screen-space heading angle by projecting a short forward step
      const hdgRad = (f.heading || 0) * DEG2RAD;
      const stepDeg = 0.65;
      const cosLat = Math.max(0.15, Math.cos(f.lat * DEG2RAD));
      const aheadLat = Math.max(-89, Math.min(89, f.lat + Math.cos(hdgRad) * stepDeg));
      const aheadLon = f.lon + (Math.sin(hdgRad) * stepDeg) / cosLat;
      const pAhead = this._projectVec(latLonToVec3(aheadLat, aheadLon), mat, cx, cy, R, lift);
      const screenAngle = Math.atan2(pAhead.y - p.y, pAhead.x - p.x);

      let tail = null;
      if (showTrails) {
        const backDeg = 2.4;
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
    const baseSize = Math.min(9.5, (4.4 + this.zoom * 1.15) * densityScale);

    for (const item of projected) {
      const { flight, x, y, z, angle, tail, surface } = item;
      const isSelected = flight.icao24 === this.selectedIcao;
      const isHovered = flight.icao24 === this.hoveredIcao;
      const depthAlpha = Math.max(0.32, Math.min(1, (z + 0.25) * 1.15));
      const color = this.options.altitudeColor
        ? altitudeColor(flight.altitudeFt || 0, isLight)
        : (isLight ? '#0369a1' : '#38bdf8');

      // 3D vertical altitude drop-line to ground shadow
      if (surface && surface.z > 0 && (!dense || isSelected || this.zoom > 2.4)) {
        ctx.strokeStyle = isSelected
          ? 'rgba(251, 191, 36, 0.72)'
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

      // Subtle motion wake trail (skip expensive CanvasGradient allocations when >700 planes visible)
      if (tail) {
        ctx.save();
        if (!dense || isSelected || isHovered) {
          const grad = ctx.createLinearGradient(x, y, tail.x, tail.y);
          grad.addColorStop(0, isSelected ? '#fbbf24' : color);
          grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
          ctx.globalAlpha = (isSelected ? 0.85 : 0.42) * depthAlpha;
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

      // Selection reticle pulse
      if (isSelected || isHovered) {
        const pulse = isSelected ? (1 + Math.sin(now * 0.006) * 0.14) : 1;
        ctx.save();
        ctx.strokeStyle = isSelected ? '#fbbf24' : color;
        ctx.lineWidth = isSelected ? 1.8 : 1.2;
        ctx.beginPath();
        ctx.arc(x, y, (baseSize + 6.5) * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Crisp oriented airplane silhouette
      const s = isSelected ? baseSize * 1.42 : isHovered ? baseSize * 1.25 : baseSize;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.globalAlpha = isSelected || isHovered ? 1 : depthAlpha;
      ctx.fillStyle = isSelected ? '#fef08a' : color;

      ctx.beginPath();
      // Fuselage nose -> right wing -> tail -> left wing
      ctx.moveTo(s * 1.15, 0);
      ctx.lineTo(s * 0.25, s * 0.22);
      ctx.lineTo(-s * 0.18, s * 1.05);
      ctx.lineTo(-s * 0.45, s * 0.95);
      ctx.lineTo(-s * 0.22, s * 0.2);
      ctx.lineTo(-s * 0.78, s * 0.14);
      ctx.lineTo(-s * 1.02, s * 0.46);
      ctx.lineTo(-s * 1.15, s * 0.42);
      ctx.lineTo(-s * 0.98, 0);
      ctx.lineTo(-s * 1.15, -s * 0.42);
      ctx.lineTo(-s * 1.02, -s * 0.46);
      ctx.lineTo(-s * 0.78, -s * 0.14);
      ctx.lineTo(-s * 0.22, -s * 0.2);
      ctx.lineTo(-s * 0.45, -s * 0.95);
      ctx.lineTo(-s * 0.18, -s * 1.05);
      ctx.lineTo(s * 0.25, -s * 0.22);
      ctx.closePath();
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      ctx.restore();

      // Callsign label when selected or deeply zoomed in
      if (isSelected || (this.zoom >= 3.2 && z > 0.35)) {
        ctx.save();
        ctx.font = `${isSelected ? '700' : '600'} 10px ui-monospace, SFMono-Regular, Menlo, monospace`;
        const label = flight.callsign || flight.icao24;
        const tw = ctx.measureText(label).width + 8;
        ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.88)' : 'rgba(6, 15, 29, 0.84)';
        ctx.beginPath();
        ctx.roundRect(x + s + 5, y - 8, tw, 16, 4);
        ctx.fill();
        ctx.fillStyle = isSelected ? (isLight ? '#b45309' : '#fde047') : (isLight ? '#0f172a' : '#e2e8f0');
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + s + 9, y + 0.5);
        ctx.restore();
      }
    }
  }
}
