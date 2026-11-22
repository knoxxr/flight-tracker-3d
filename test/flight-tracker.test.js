import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GlobalFlightSimulator,
  greatCircleDistanceKm,
  slerpLatLon,
  initialBearingDeg
} from '../src/simulator.js';
import { parseOpenSkyStateVector, deadReckonFlight } from '../src/opensky.js';
import { createAppServer } from '../src/server.js';

test('greatCircleDistanceKm computes accurate ICN -> JFK distance', () => {
  // Incheon (37.4602, 126.4407) to JFK (40.6413, -73.7781) is ~11,086 km
  const dist = greatCircleDistanceKm(37.4602, 126.4407, 40.6413, -73.7781);
  assert.ok(dist > 10900 && dist < 11300, `Unexpected ICN-JFK distance: ${dist}`);
});

test('slerpLatLon interpolates endpoints and midpoint cleanly', () => {
  const start = slerpLatLon(37.46, 126.44, 35.77, 140.39, 0);
  const end = slerpLatLon(37.46, 126.44, 35.77, 140.39, 1);
  const mid = slerpLatLon(37.46, 126.44, 35.77, 140.39, 0.5);

  assert.ok(Math.abs(start.lat - 37.46) < 0.01);
  assert.ok(Math.abs(end.lon - 140.39) < 0.01);
  assert.ok(mid.lon > 130 && mid.lon < 137);
});

test('initialBearingDeg returns expected cardinal bearings', () => {
  const north = initialBearingDeg(0, 0, 10, 0);
  const east = initialBearingDeg(0, 0, 0, 10);
  const south = initialBearingDeg(10, 0, 0, 0);

  assert.ok(Math.abs(north - 0) < 0.1 || Math.abs(north - 360) < 0.1);
  assert.ok(Math.abs(east - 90) < 0.1);
  assert.ok(Math.abs(south - 180) < 0.1);
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

test('deadReckonFlight advances airborne aircraft position along heading', () => {
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

test('GlobalFlightSimulator produces realistic global fleet telemetry', () => {
  const sim = new GlobalFlightSimulator();
  const snap = sim.getSnapshot(1700000000000);
  assert.ok(snap.length >= 250, `Expected at least 250 flights, got ${snap.length}`);

  const sample = snap[0];
  assert.ok(sample.icao24 && sample.callsign);
  assert.ok(sample.lat >= -90 && sample.lat <= 90);
  assert.ok(sample.lon >= -180 && sample.lon <= 180);
  assert.ok(sample.altitudeFt >= 500 && sample.altitudeFt <= 45000);
  assert.ok(sample.speedKts >= 150 && sample.speedKts <= 650);
  assert.ok(sample.origin && sample.destination);
});

test('HTTP server serves flights, detail, airports, status, and static frontend', async () => {
  const server = createAppServer({ mode: 'simulation' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.status, 'ok');

    const airportsRes = await fetch(`${baseUrl}/api/airports`);
    assert.equal(airportsRes.status, 200);
    const airportsData = await airportsRes.json();
    assert.ok(airportsData.count >= 50);

    const flightsRes = await fetch(`${baseUrl}/api/flights?mode=simulation`);
    assert.equal(flightsRes.status, 200);
    const flightsData = await flightsRes.json();
    assert.equal(flightsData.activeSource, 'simulation');
    assert.ok(flightsData.count >= 250);

    const firstIcao = flightsData.flights[0].icao24;
    const detailRes = await fetch(`${baseUrl}/api/flights/${firstIcao}?mode=simulation`);
    assert.equal(detailRes.status, 200);
    const detailData = await detailRes.json();
    assert.equal(detailData.flight.icao24, firstIcao);

    const searchRes = await fetch(`${baseUrl}/api/flights?mode=simulation&q=ICN`);
    assert.equal(searchRes.status, 200);
    const searchData = await searchRes.json();
    assert.ok(searchData.count > 0);
    assert.ok(searchData.flights.every((f) => f.origin === 'ICN' || f.destination === 'ICN'));

    const indexRes = await fetch(`${baseUrl}/`);
    assert.equal(indexRes.status, 200);
    const html = await indexRes.text();
    assert.ok(html.includes('AeroGlobe 3D'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
