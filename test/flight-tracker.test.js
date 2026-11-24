import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOpenSkyStateVector,
  parseAdsbFiAircraft,
  deadReckonFlight
} from '../src/opensky.js';
import { parseAdsbDbResponse, parseHexDbRoute } from '../src/enrichment.js';
import { OceanicEstimator, advanceAlongGreatCircle } from '../src/oceanic-estimator.js';
import { resolveAircraftCountry, decodeCallsign, classifyAircraftIcon } from '../public/aviation-meta.js';
import { createAppServer, createIpRateLimiter } from '../src/server.js';

test('classifyAircraftIcon distinguishes aircraft by size and purpose', () => {
  assert.equal(classifyAircraftIcon({ aircraftType: 'A388', callsign: 'UAE322' }).kind, 'super_heavy');
  assert.equal(classifyAircraftIcon({ aircraftType: 'B77W', callsign: 'KAL081' }).kind, 'heavy');
  assert.equal(classifyAircraftIcon({ aircraftType: 'B77L', callsign: 'FDX501' }).kind, 'cargo');
  assert.equal(classifyAircraftIcon({ aircraftType: 'A321', callsign: 'AAR102' }).kind, 'narrowbody');
  assert.equal(classifyAircraftIcon({ aircraftType: 'GLEX', callsign: 'N650GA' }).kind, 'bizjet');
  assert.equal(classifyAircraftIcon({ aircraftType: 'C172', callsign: 'HL1234' }).kind, 'prop');
  assert.equal(classifyAircraftIcon({ aircraftType: 'H135', category: 'A7' }).kind, 'helicopter');
  assert.equal(classifyAircraftIcon({ aircraftType: 'F16', isMilitary: true }).kind, 'military_fighter');
  assert.equal(classifyAircraftIcon({ aircraftType: 'C17', callsign: 'RCH401' }).kind, 'military_heavy');
  assert.equal(classifyAircraftIcon({ aircraftType: 'RQ4', category: 'B6' }).kind, 'uav');
});

test('resolveAircraftCountry decodes ICAO24 hex & registration into Korean country + flag', () => {
  const kr = resolveAircraftCountry('71bf01', 'HL7701', '');
  assert.equal(kr.iso, 'KR');
  assert.equal(kr.nameKo, '대한민국');
  assert.equal(kr.flag, '🇰🇷');

  const hk = resolveAircraftCountry('780a01', 'B-KQA', '');
  assert.equal(hk.iso, 'HK');
  assert.equal(hk.nameKo, '홍콩');

  const us = resolveAircraftCountry('a12345', '', 'adsb.lol Live');
  assert.equal(us.iso, 'US');
  assert.equal(us.nameKo, '미국');
});

test('decodeCallsign converts ICAO callsign to IATA flight number & Korean airline name', () => {
  const ke = decodeCallsign('KAL081');
  assert.equal(ke.iataFlight, 'KE81');
  assert.equal(ke.airlineKo, '대한항공');

  const oz = decodeCallsign('AAR201');
  assert.equal(oz.iataFlight, 'OZ201');
  assert.equal(oz.airlineKo, '아시아나항공');

  const jl = decodeCallsign('JAL25');
  assert.equal(jl.iataFlight, 'JL25');
  assert.equal(jl.airlineKo, '일본항공 (JAL)');
});

test('parseHexDbRoute handles direct and multi-leg ICAO routes', () => {
  assert.deepEqual(parseHexDbRoute('RKSI-KJFK'), {
    originIcao: 'RKSI',
    destinationIcao: 'KJFK',
    via: []
  });
  assert.deepEqual(parseHexDbRoute('ZYHE-ZYHB-ZSPD'), {
    originIcao: 'ZYHE',
    destinationIcao: 'ZSPD',
    via: ['ZYHB']
  });
  assert.equal(parseHexDbRoute('INVALID'), null);
});

test('parseOpenSkyStateVector normalizes valid 17-element OpenSky state vector', () => {
  const raw = [
    '71be20', 'KAL081  ', 'Republic of Korea', 1700000000, 1700000001,
    126.4407, 37.4602, 10668, false, 245.5, 42.3, 2.5, null, 10900, '2415', false, 0
  ];
  const parsed = parseOpenSkyStateVector(raw, 1700000001);

  assert.ok(parsed);
  assert.equal(parsed.icao24, '71be20');
  assert.equal(parsed.callsign, 'KAL081');
  assert.equal(parsed.iataFlight, 'KE81');
  assert.equal(parsed.airlineName, '대한항공');
  assert.equal(parsed.originCountry, '대한민국');
  assert.equal(parsed.countryFlag, '🇰🇷');
  assert.equal(parsed.altitudeM, 10668);
  assert.ok(parsed.altitudeFt > 34900 && parsed.altitudeFt < 35100);
  assert.ok(parsed.altGeomFt > 35700 && parsed.altGeomFt < 35800);
  assert.ok(parsed.speedKts > 470 && parsed.speedKts < 485);
  assert.equal(parsed.squawk, '2415');
  assert.equal(parsed.positionSource, 'ADS-B');
  assert.equal(parsed.source, 'opensky');
});

test('parseOpenSkyStateVector rejects entries missing coordinates', () => {
  assert.equal(parseOpenSkyStateVector(['abc123', 'TEST', 'KR', 0, 0, null, 37.5]), null);
  assert.equal(parseOpenSkyStateVector([]), null);
});

test('parseAdsbFiAircraft normalizes adsb.fi v3 live aircraft object and extended avionics', () => {
  const ac = {
    hex: '71bf01',
    flight: 'AAR201  ',
    r: 'HL8382',
    t: 'A359',
    desc: 'AIRBUS A350-900',
    lat: 37.51,
    lon: 126.82,
    alt_baro: 35000,
    alt_geom: 35425,
    gs: 482,
    track: 85.4,
    baro_rate: 64,
    squawk: '2140',
    type: 'adsb_icao',
    category: 'A5',
    mach: 0.842,
    ias: 282,
    tas: 478,
    nav_altitude_mcp: 36000,
    nav_qnh: 1013.2,
    oat: -52,
    wd: 275,
    ws: 68,
    year: '2019',
    rssi: -14.6,
    messages: 4120,
    seen: 2
  };
  const parsed = parseAdsbFiAircraft(ac, 1700000000);

  assert.ok(parsed);
  assert.equal(parsed.icao24, '71bf01');
  assert.equal(parsed.callsign, 'AAR201');
  assert.equal(parsed.iataFlight, 'OZ201');
  assert.equal(parsed.airlineName, '아시아나항공');
  assert.equal(parsed.originCountry, '대한민국');
  assert.equal(parsed.countryFlag, '🇰🇷');
  assert.equal(parsed.registration, 'HL8382');
  assert.equal(parsed.aircraftType, 'A359');
  assert.equal(parsed.altitudeFt, 35000);
  assert.equal(parsed.altGeomFt, 35425);
  assert.equal(parsed.speedKts, 482);
  assert.equal(parsed.positionSource, 'ADSB');
  assert.equal(parsed.category, 'A5');
  assert.equal(parsed.mach, 0.842);
  assert.equal(parsed.ias, 282);
  assert.equal(parsed.tas, 478);
  assert.equal(parsed.navAltFt, 36000);
  assert.equal(parsed.navQnh, 1013.2);
  assert.equal(parsed.oat, -52);
  assert.equal(parsed.windDir, 275);
  assert.equal(parsed.windSpeedKts, 68);
  assert.equal(parsed.year, '2019');
  assert.equal(parsed.rssi, -14.6);
  assert.equal(parsed.messages, 4120);
  assert.equal(parsed.source, 'adsbfi');
  assert.equal(parsed.onGround, false);
});

test('parseAdsbFiAircraft flags ground aircraft accurately', () => {
  const ac = { hex: 'a00001', lat: 37.46, lon: 126.44, alt_baro: 'ground' };
  const parsed = parseAdsbFiAircraft(ac, 1700000000);
  assert.ok(parsed);
  assert.equal(parsed.onGround, true);
  assert.equal(parsed.altitudeFt, 0);
  assert.equal(parsed.originCountry, '미국');
});

test('parseAdsbDbResponse extracts aircraft metadata and origin/destination flightroute', () => {
  const raw = {
    response: {
      aircraft: {
        type: '777-3B5ER',
        icao_type: 'B77W',
        manufacturer: 'Boeing',
        registration: 'HL8008',
        registered_owner: 'Korean Air',
        registered_owner_country_name: 'Republic of Korea',
        registered_owner_country_iso_name: 'KR',
        url_photo: 'https://example.com/hl8008.jpg',
        url_photo_thumbnail: 'https://example.com/hl8008_thumb.jpg'
      },
      flightroute: {
        callsign_iata: 'KE081',
        airline: { name: 'Korean Air', iata: 'KE', icao: 'KAL', country: 'South Korea' },
        origin: {
          iata_code: 'ICN',
          icao_code: 'RKSI',
          name: 'Incheon International Airport',
          municipality: 'Seoul',
          country_name: 'South Korea',
          country_iso_name: 'KR',
          latitude: 37.4691,
          longitude: 126.4505
        },
        destination: {
          iata_code: 'JFK',
          icao_code: 'KJFK',
          name: 'John F Kennedy International Airport',
          municipality: 'New York',
          country_name: 'United States',
          country_iso_name: 'US',
          latitude: 40.6398,
          longitude: -73.7789
        }
      }
    }
  };

  const parsed = parseAdsbDbResponse(raw);
  assert.ok(parsed);
  assert.equal(parsed.aircraft.manufacturer, 'Boeing');
  assert.equal(parsed.aircraft.type, '777-3B5ER');
  assert.equal(parsed.aircraft.icaoType, 'B77W');
  assert.equal(parsed.aircraft.registration, 'HL8008');
  assert.equal(parsed.aircraft.owner, 'Korean Air');
  assert.equal(parsed.aircraft.photoUrl, 'https://example.com/hl8008.jpg');
  assert.equal(parsed.flightroute.callsignIata, 'KE081');
  assert.equal(parsed.flightroute.airline.name, 'Korean Air');
  assert.equal(parsed.flightroute.origin.iata, 'ICN');
  assert.equal(parsed.flightroute.origin.lat, 37.4691);
  assert.equal(parsed.flightroute.destination.iata, 'JFK');
  assert.equal(parsed.flightroute.destination.lon, -73.7789);
});

test('deadReckonFlight advances airborne aircraft position along true track', () => {
  const base = {
    lat: 37.0,
    lon: 127.0,
    altitudeM: 10000,
    altitudeFt: 32808,
    speedMs: 250,
    heading: 90,
    verticalRateMs: 0,
    onGround: false
  };
  const next = deadReckonFlight(base, 10);
  assert.ok(next.lon > base.lon, 'Expected eastward motion to increase longitude');
  assert.ok(Math.abs(next.lat - base.lat) < 0.05);
});

test('HTTP server serves live-only flights, detail, enrichment, search, airports, and never fabricates simulated data on feed outage', async () => {
  const mockLiveFlights = [
    {
      icao24: '71be20',
      callsign: 'KAL081',
      originCountry: 'Republic of Korea',
      aircraftType: 'B77W',
      aircraftLabel: 'Boeing 777-300ER',
      registration: 'HL8008',
      squawk: '2415',
      lat: 37.46,
      lon: 126.44,
      altitudeM: 10668,
      altitudeFt: 35000,
      speedMs: 250,
      speedKts: 486,
      speedKmh: 900,
      heading: 42,
      verticalRateMs: 0,
      verticalRateFpm: 0,
      onGround: false,
      source: 'opensky',
      lastContact: Math.floor(Date.now() / 1000)
    }
  ];

  let failFeed = false;
  const mockAdsbClient = {
    async fetchLiveFlights() {
      if (failFeed) {
        return { ok: false, source: 'opensky', error: 'HTTP 429', flights: [] };
      }
      return {
        ok: true,
        source: 'opensky',
        updatedAt: Date.now(),
        totalRaw: 1,
        flights: mockLiveFlights
      };
    },
    getStatus() {
      return { authenticated: false, lastSuccessAt: null, lastError: null, cachedCount: 1, backoffActive: false };
    }
  };

  const mockEnrichmentService = {
    async lookup(icao24, callsign) {
      return {
        ok: true,
        icao24,
        callsign,
        aircraft: { manufacturer: 'Boeing', type: '777-3B5ER', icaoType: 'B77W', owner: 'Korean Air' },
        flightroute: {
          callsignIata: 'KE081',
          origin: { iata: 'ICN', city: 'Seoul', lat: 37.4691, lon: 126.4505 },
          destination: { iata: 'JFK', city: 'New York', lat: 40.6398, lon: -73.7789 }
        },
        photo: { url: 'https://example.com/hl8008.jpg', credit: 'Planespotters.net' }
      };
    }
  };

  const server = createAppServer({ adsbClient: mockAdsbClient, enrichmentService: mockEnrichmentService });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.mode, 'live-only');

    const debugRes = await fetch(`${baseUrl}/api/debug`);
    assert.equal(debugRes.status, 200);
    const debugData = await debugRes.json();
    assert.equal(debugData.mode, 'live-only');
    assert.ok(debugData.upstream);

    const flightsRes = await fetch(`${baseUrl}/api/flights`);
    assert.equal(flightsRes.status, 200);
    const flightsData = await flightsRes.json();
    assert.equal(flightsData.ok, true);
    assert.equal(flightsData.activeSource, 'opensky');
    assert.equal(flightsData.count, 1);
    assert.equal(flightsData.flights[0].callsign, 'KAL081');

    const detailRes = await fetch(`${baseUrl}/api/flights/71be20`);
    assert.equal(detailRes.status, 200);
    const detailData = await detailRes.json();
    assert.equal(detailData.flight.icao24, '71be20');
    assert.ok(Array.isArray(detailData.track));

    const enrichRes = await fetch(`${baseUrl}/api/enrich/71be20?callsign=KAL081`);
    assert.equal(enrichRes.status, 200);
    const enrichData = await enrichRes.json();
    assert.equal(enrichData.ok, true);
    assert.equal(enrichData.aircraft.manufacturer, 'Boeing');
    assert.equal(enrichData.flightroute.origin.iata, 'ICN');
    assert.equal(enrichData.flightroute.destination.iata, 'JFK');
    assert.equal(enrichData.photo.url, 'https://example.com/hl8008.jpg');

    // When live feed fails, server MUST return 0 flights (zero simulated fallback)
    failFeed = true;
    const outageRes = await fetch(`${baseUrl}/api/flights`);
    assert.equal(outageRes.status, 200);
    const outageData = await outageRes.json();
    assert.equal(outageData.ok, false);
    assert.equal(outageData.count, 0);
    assert.deepEqual(outageData.flights, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('advanceAlongGreatCircle projects oceanic flight accurately along curved North Pacific arc', () => {
  // Tokyo (35.55, 139.78) -> Los Angeles (33.94, -118.41), advance 4000km
  const step = advanceAlongGreatCircle(35.55, 139.78, 33.94, -118.41, 4000);
  assert.equal(step.arrived, false);
  // Great Circle curves northward into North Pacific (~45-48°N)
  assert.ok(step.lat > 43, `Expected Great Circle to curve north (>43°N), got ${step.lat}`);
  assert.ok(step.remainingKm > 4000 && step.remainingKm < 5500);
});

test('OceanicEstimator projects real coastal flight along resolved route and retires upon arrival or live re-acquisition', () => {
  const estimator = new OceanicEstimator();
  const t0 = 1_700_000_000_000;
  const coastalFlight = {
    icao24: '71bf99',
    callsign: 'KAL017',
    lat: 36.2,
    lon: 141.5,
    altitudeFt: 35000,
    speedKts: 490,
    speedKmh: 907,
    heading: 55, // Northeast toward North Pacific Great Circle -> LAX
    onGround: false
  };

  estimator.observeLiveFlights([coastalFlight], t0);
  // Pre-seed resolved route ICN -> LAX
  const anchor = estimator.anchors.get('71bf99');
  anchor.routeState = 'resolved';
  anchor.route = {
    callsignIata: 'KE17',
    airline: { name: 'Korean Air' },
    origin: { iata: 'ICN', lat: 37.4691, lon: 126.4505 },
    destination: { iata: 'LAX', lat: 33.9416, lon: -118.4085 }
  };

  // While still in live ADS-B set, must NOT emit duplicate estimated plane
  assert.equal(estimator.getEstimatedFlights(new Set(['71bf99']), t0 + 3600_000).length, 0);

  // 2 hours after leaving Japanese coastal ADS-B coverage -> projected along Great Circle over Pacific
  const est = estimator.getEstimatedFlights(new Set(), t0 + 2 * 3600_000);
  assert.equal(est.length, 1);
  assert.equal(est[0].estimated, true);
  assert.equal(est[0].estimateBasis, 'route');
  assert.equal(est[0].origin, 'ICN');
  assert.equal(est[0].destination, 'LAX');
  assert.equal(est[0].iataFlight, 'KE17');
  assert.ok(est[0].lat > 40, `Expected North Pacific Great Circle arc latitude > 40°N, got ${est[0].lat}`);

  // 12 hours later (past destination arrival) -> retired cleanly
  const retired = estimator.getEstimatedFlights(new Set(), t0 + 12 * 3600_000);
  assert.equal(retired.length, 0);
  estimator.stop();
});

test('HTTP /api/flights?estimated=1 returns live + estimated oceanic aircraft while ?estimated=0 returns live only', async () => {
  const liveFlight = {
    icao24: '71be20',
    callsign: 'KAL081',
    lat: 37.46,
    lon: 126.44,
    altitudeFt: 35000,
    speedKts: 480,
    speedKmh: 889,
    heading: 42,
    onGround: false,
    source: 'opensky'
  };
  const mockAdsbClient = {
    async fetchLiveFlights() {
      return { ok: true, source: 'opensky', updatedAt: Date.now(), totalRaw: 1, flights: [liveFlight] };
    },
    getStatus() {
      return { authenticated: false };
    }
  };
  const estimator = new OceanicEstimator();
  const pastMs = Date.now() - 15 * 60 * 1000;
  estimator.observeLiveFlights([{
    icao24: '86d5e0',
    callsign: 'JAL062',
    lat: 35.8,
    lon: 141.2,
    altitudeFt: 36000,
    speedKts: 500,
    speedKmh: 926,
    heading: 58,
    onGround: false
  }], pastMs);
  const anchor = estimator.anchors.get('86d5e0');
  anchor.routeState = 'resolved';
  anchor.route = {
    callsignIata: 'JL62',
    origin: { iata: 'NRT', lat: 35.772, lon: 140.3929 },
    destination: { iata: 'LAX', lat: 33.9416, lon: -118.4085 }
  };

  const server = createAppServer({ adsbClient: mockAdsbClient, oceanicEstimator: estimator });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const liveOnly = await (await fetch(`${baseUrl}/api/flights?estimated=0`)).json();
    assert.equal(liveOnly.liveCount, 1);
    assert.equal(liveOnly.estimatedCount, 0);
    assert.equal(liveOnly.flights.length, 1);

    const withEst = await (await fetch(`${baseUrl}/api/flights?estimated=1`)).json();
    assert.equal(withEst.liveCount, 1);
    assert.equal(withEst.estimatedCount, 1);
    assert.equal(withEst.flights.length, 2);
    const estPlane = withEst.flights.find((f) => f.estimated);
    assert.ok(estPlane);
    assert.equal(estPlane.callsign, 'JAL062');
    assert.equal(estPlane.origin, 'NRT');
    assert.equal(estPlane.destination, 'LAX');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('createIpRateLimiter enforces per-IP limits and resets after window', () => {
  const limit = createIpRateLimiter({ windowMs: 10_000, max: 2 });
  assert.equal(limit('1.2.3.4', 1000).allowed, true);
  assert.equal(limit('1.2.3.4', 2000).allowed, true);
  const blocked = limit('1.2.3.4', 3000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1);
  // Different IP unaffected
  assert.equal(limit('5.6.7.8', 3000).allowed, true);
  // Resets cleanly after window elapses
  assert.equal(limit('1.2.3.4', 12000).allowed, true);
});

test('HTTP server coalesces concurrent /api/flights requests via snapshot cache, compresses with Gzip, and enforces per-IP rate limits', async () => {
  let upstreamCalls = 0;
  const bigFlights = Array.from({ length: 40 }, (_, i) => ({
    icao24: `71be${String(i).padStart(2, '0')}`,
    callsign: `KAL${100 + i}`,
    lat: 37.4 + i * 0.01,
    lon: 126.4 + i * 0.01,
    altitudeFt: 35000,
    speedKts: 480,
    heading: 90,
    onGround: false,
    source: 'adsblol'
  }));
  const mockAdsbClient = {
    async fetchLiveFlights() {
      upstreamCalls++;
      return { ok: true, source: 'adsb-global', updatedAt: Date.now(), totalRaw: bigFlights.length, flights: bigFlights };
    },
    getStatus() {
      return { authenticated: false };
    }
  };

  const server = createAppServer({
    adsbClient: mockAdsbClient,
    snapshotCacheMs: 3000,
    flightsRateLimitPerMin: 4,
    enrichRateLimitPerMin: 2
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 3 rapid requests from different IPs hit the shared 3s snapshot cache -> only 1 upstream call!
    const [r1, r2, r3] = await Promise.all([
      fetch(`${baseUrl}/api/flights?estimated=1`, { headers: { 'X-Forwarded-For': '10.0.0.1', 'Accept-Encoding': 'gzip' } }),
      fetch(`${baseUrl}/api/flights?estimated=1`, { headers: { 'X-Forwarded-For': '10.0.0.2', 'Accept-Encoding': 'gzip' } }),
      fetch(`${baseUrl}/api/flights?estimated=1`, { headers: { 'X-Forwarded-For': '10.0.0.3', 'Accept-Encoding': 'gzip' } })
    ]);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r3.status, 200);
    assert.equal(r1.headers.get('content-encoding'), 'gzip');
    const j1 = await r1.json();
    assert.equal(j1.flights.length, 40);
    assert.equal(upstreamCalls, 1, 'Expected all concurrent/cached visitors to share 1 upstream call');

    // Per-IP rate limit triggers HTTP 429 on 5th request from same IP
    for (let i = 0; i < 4; i++) {
      const r = await fetch(`${baseUrl}/api/flights?estimated=1`, { headers: { 'X-Forwarded-For': '9.9.9.9' } });
      assert.equal(r.status, 200);
    }
    const blocked = await fetch(`${baseUrl}/api/flights?estimated=1`, { headers: { 'X-Forwarded-For': '9.9.9.9' } });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('OceanicEstimator exports and restores persisted anchors cleanly across server restarts', () => {
  const t0 = 1_700_000_000_000;
  const estA = new OceanicEstimator();
  estA.observeLiveFlights([{
    icao24: '71bf88',
    callsign: 'KAL011',
    aircraftType: 'A388',
    lat: 36.0,
    lon: 141.0,
    altitudeFt: 37000,
    speedKts: 500,
    speedKmh: 926,
    heading: 58,
    onGround: false
  }], t0);
  const anchor = estA.anchors.get('71bf88');
  anchor.routeState = 'resolved';
  anchor.route = {
    callsignIata: 'KE11',
    origin: { iata: 'ICN', lat: 37.4691, lon: 126.4505 },
    destination: { iata: 'LAX', lat: 33.9416, lon: -118.4085 }
  };

  const exported = estA.exportState(t0 + 600_000);
  assert.equal(exported.entries.length, 1);

  const estB = new OceanicEstimator();
  const restoredCount = estB.importState(exported, t0 + 3600_000);
  assert.equal(restoredCount, 1);
  const projected = estB.getEstimatedFlights(new Set(), t0 + 2 * 3600_000);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].origin, 'ICN');
  assert.equal(projected[0].destination, 'LAX');
  assert.equal(projected[0].lastLiveLat, 36.0);
  assert.equal(projected[0].lastLiveLon, 141.0);
  estA.stop();
  estB.stop();
});
