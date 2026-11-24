import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOpenSkyStateVector,
  parseAdsbFiAircraft,
  deadReckonFlight
} from '../src/opensky.js';
import { parseAdsbDbResponse, parseHexDbRoute } from '../src/enrichment.js';
import { resolveAircraftCountry, decodeCallsign } from '../public/aviation-meta.js';
import { createAppServer } from '../src/server.js';

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
