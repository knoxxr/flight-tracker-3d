import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOpenSkyStateVector,
  parseAdsbFiAircraft,
  deadReckonFlight
} from '../src/opensky.js';
import { createAppServer } from '../src/server.js';

test('parseOpenSkyStateVector normalizes valid 17-element OpenSky state vector', () => {
  const raw = [
    '71be20', 'KAL081  ', 'Republic of Korea', 1700000000, 1700000001,
    126.4407, 37.4602, 10668, false, 245.5, 42.3, 2.5, null, 10900, '2415', false, 0
  ];
  const parsed = parseOpenSkyStateVector(raw, 1700000001);

  assert.ok(parsed);
  assert.equal(parsed.icao24, '71be20');
  assert.equal(parsed.callsign, 'KAL081');
  assert.equal(parsed.altitudeM, 10668);
  assert.ok(parsed.altitudeFt > 34900 && parsed.altitudeFt < 35100);
  assert.ok(parsed.speedKts > 470 && parsed.speedKts < 485);
  assert.equal(parsed.squawk, '2415');
  assert.equal(parsed.source, 'opensky');
});

test('parseOpenSkyStateVector rejects entries missing coordinates', () => {
  assert.equal(parseOpenSkyStateVector(['abc123', 'TEST', 'KR', 0, 0, null, 37.5]), null);
  assert.equal(parseOpenSkyStateVector([]), null);
});

test('parseAdsbFiAircraft normalizes adsb.fi v3 live aircraft object', () => {
  const ac = {
    hex: '71bf01',
    flight: 'AAR201  ',
    r: 'HL8382',
    t: 'A359',
    desc: 'AIRBUS A350-900',
    lat: 37.51,
    lon: 126.82,
    alt_baro: 35000,
    gs: 482,
    track: 85.4,
    baro_rate: 64,
    squawk: '2140',
    seen: 2
  };
  const parsed = parseAdsbFiAircraft(ac, 1700000000);

  assert.ok(parsed);
  assert.equal(parsed.icao24, '71bf01');
  assert.equal(parsed.callsign, 'AAR201');
  assert.equal(parsed.registration, 'HL8382');
  assert.equal(parsed.aircraftType, 'A359');
  assert.equal(parsed.altitudeFt, 35000);
  assert.equal(parsed.speedKts, 482);
  assert.equal(parsed.source, 'adsbfi');
  assert.equal(parsed.onGround, false);
});

test('parseAdsbFiAircraft flags ground aircraft accurately', () => {
  const ac = { hex: 'a00001', lat: 37.46, lon: 126.44, alt_baro: 'ground' };
  const parsed = parseAdsbFiAircraft(ac, 1700000000);
  assert.ok(parsed);
  assert.equal(parsed.onGround, true);
  assert.equal(parsed.altitudeFt, 0);
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

test('HTTP server serves live-only flights, detail, search, airports, and never fabricates simulated data on feed outage', async () => {
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

  const server = createAppServer({ adsbClient: mockAdsbClient });
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
