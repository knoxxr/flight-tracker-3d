const ADSBDB_BASE = 'https://api.adsbdb.com/v0';
const HEXDB_BASE = 'https://hexdb.io/api/v1';
const PLANESPOTTERS_BASE = 'https://api.planespotters.net/pub/photos/hex';
const USER_AGENT = 'AeroGlobe3D/1.5 (+https://github.com/knoxxr/flight-tracker-3d)';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_ENTRIES = 1000;

/**
 * Normalize an adsbdb.com /v0/aircraft/{hex}?callsign={callsign} response into a clean enrichment object.
 */
export function parseAdsbDbResponse(data) {
  const resp = data?.response;
  if (!resp || typeof resp !== 'object') return null;

  const ac = resp.aircraft && typeof resp.aircraft === 'object' ? resp.aircraft : null;
  const route = resp.flightroute && typeof resp.flightroute === 'object' ? resp.flightroute : null;

  const aircraft = ac ? {
    type: ac.type || null,
    icaoType: ac.icao_type || null,
    manufacturer: ac.manufacturer || null,
    registration: ac.registration || null,
    owner: ac.registered_owner || null,
    ownerCountry: ac.registered_owner_country_name || null,
    ownerCountryIso: ac.registered_owner_country_iso_name || null,
    photoUrl: ac.url_photo || null,
    photoThumbUrl: ac.url_photo_thumbnail || null
  } : null;

  const origin = route?.origin && typeof route.origin === 'object' ? {
    iata: route.origin.iata_code || route.origin.icao_code || null,
    icao: route.origin.icao_code || null,
    name: route.origin.name || null,
    city: route.origin.municipality || null,
    country: route.origin.country_name || null,
    countryIso: route.origin.country_iso_name || null,
    lat: typeof route.origin.latitude === 'number' ? route.origin.latitude : null,
    lon: typeof route.origin.longitude === 'number' ? route.origin.longitude : null
  } : null;

  const destination = route?.destination && typeof route.destination === 'object' ? {
    iata: route.destination.iata_code || route.destination.icao_code || null,
    icao: route.destination.icao_code || null,
    name: route.destination.name || null,
    city: route.destination.municipality || null,
    country: route.destination.country_name || null,
    countryIso: route.destination.country_iso_name || null,
    lat: typeof route.destination.latitude === 'number' ? route.destination.latitude : null,
    lon: typeof route.destination.longitude === 'number' ? route.destination.longitude : null
  } : null;

  const airline = route?.airline && typeof route.airline === 'object' ? {
    name: route.airline.name || null,
    iata: route.airline.iata || null,
    icao: route.airline.icao || null,
    country: route.airline.country || null
  } : null;

  return {
    aircraft,
    flightroute: (origin || destination || airline) ? {
      callsignIata: route.callsign_iata || null,
      airline,
      origin,
      destination
    } : null
  };
}

/**
 * Parse a hexdb.io route string like "RKSI-KJFK" or multi-leg "ZYHE-ZYHB-ZSPD".
 */
export function parseHexDbRoute(routeStr) {
  if (!routeStr || typeof routeStr !== 'string') return null;
  const legs = routeStr.trim().toUpperCase().split('-').map((s) => s.trim()).filter((s) => /^[A-Z0-9]{3,4}$/.test(s));
  if (legs.length < 2) return null;
  return {
    originIcao: legs[0],
    destinationIcao: legs[legs.length - 1],
    via: legs.length > 2 ? legs.slice(1, -1) : []
  };
}

export class AircraftEnrichmentService {
  constructor() {
    this.cache = new Map();
    this.airportCache = new Map();
  }

  _getCached(key) {
    const hit = this.cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return hit.value;
  }

  _setCached(key, value) {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { value, at: Date.now() });
  }

  async _lookupHexDbAirport(icao) {
    const code = String(icao || '').trim().toUpperCase();
    if (!code) return null;
    if (this.airportCache.has(code)) return this.airportCache.get(code);
    try {
      const res = await fetch(`${HEXDB_BASE}/airport/icao/${encodeURIComponent(code)}`, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(4000)
      });
      if (!res.ok) return { iata: code, icao: code, name: code, city: null, country: null, countryIso: null, lat: null, lon: null };
      const ap = await res.json();
      const normalized = {
        iata: ap.iata || ap.icao || code,
        icao: ap.icao || code,
        name: ap.airport || code,
        city: ap.region_name || ap.airport || null,
        country: ap.country_code || null,
        countryIso: ap.country_code || null,
        lat: typeof ap.latitude === 'number' ? ap.latitude : null,
        lon: typeof ap.longitude === 'number' ? ap.longitude : null
      };
      if (this.airportCache.size < 2000) this.airportCache.set(code, normalized);
      return normalized;
    } catch {
      return { iata: code, icao: code, name: code, city: null, country: null, countryIso: null, lat: null, lon: null };
    }
  }

  async lookup(icao24, callsign = '') {
    const cleanHex = String(icao24 || '').trim().toUpperCase();
    const cleanCall = String(callsign || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleanHex) {
      return { ok: false, aircraft: null, flightroute: null, photo: null };
    }

    const cacheKey = `${cleanHex}:${cleanCall}`;
    const cached = this._getCached(cacheKey);
    if (cached) return { ...cached, cached: true };

    let aircraft = null;
    let flightroute = null;
    let photo = null;

    // 1) Primary: adsbdb.com for aircraft specs, owner, photo, AND live callsign route
    try {
      const url = cleanCall && cleanCall !== cleanHex
        ? `${ADSBDB_BASE}/aircraft/${encodeURIComponent(cleanHex)}?callsign=${encodeURIComponent(cleanCall)}`
        : `${ADSBDB_BASE}/aircraft/${encodeURIComponent(cleanHex)}`;

      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(5500)
      });
      if (res.ok) {
        const json = await res.json();
        const parsed = parseAdsbDbResponse(json);
        if (parsed) {
          aircraft = parsed.aircraft;
          flightroute = parsed.flightroute;
          if (aircraft?.photoUrl || aircraft?.photoThumbUrl) {
            photo = {
              url: aircraft.photoUrl || aircraft.photoThumbUrl,
              thumbnailUrl: aircraft.photoThumbUrl || aircraft.photoUrl,
              credit: 'adsbdb / PlaneBase',
              link: null
            };
          }
        }
      }
    } catch {
      // Optional enrichment failure is non-fatal
    }

    // 2) Fallback route lookup on adsbdb /callsign endpoint
    if (!flightroute && cleanCall && cleanCall !== cleanHex) {
      try {
        const res = await fetch(`${ADSBDB_BASE}/callsign/${encodeURIComponent(cleanCall)}`, {
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(4500)
        });
        if (res.ok) {
          const json = await res.json();
          const parsed = parseAdsbDbResponse(json);
          if (parsed?.flightroute) flightroute = parsed.flightroute;
        }
      } catch {
        // Ignore
      }
    }

    // 3) Secondary fallback: hexdb.io route + airport coordinates (catches flights missing from adsbdb)
    if (!flightroute && cleanCall && cleanCall !== cleanHex) {
      try {
        const candidates = [cleanCall];
        // Also try unpadded numeric suffix (e.g. KAL081 -> KAL81)
        const unpadded = cleanCall.replace(/^([A-Z]{3})0+(\d+)/, '$1$2');
        if (unpadded !== cleanCall) candidates.push(unpadded);

        for (const cand of candidates) {
          const res = await fetch(`${HEXDB_BASE}/route/icao/${encodeURIComponent(cand)}`, {
            headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(4500)
          });
          if (res.ok) {
            const json = await res.json();
            const parsedRoute = parseHexDbRoute(json?.route);
            if (parsedRoute) {
              const [origin, destination] = await Promise.all([
                this._lookupHexDbAirport(parsedRoute.originIcao),
                this._lookupHexDbAirport(parsedRoute.destinationIcao)
              ]);
              flightroute = {
                callsignIata: null,
                airline: null,
                origin,
                destination,
                source: 'hexdb'
              };
              break;
            }
          }
        }
      } catch {
        // Ignore
      }
    }

    // 4) Secondary fallback: hexdb.io aircraft registry when adsbdb lacks the hex
    if (!aircraft) {
      try {
        const res = await fetch(`${HEXDB_BASE}/aircraft/${encodeURIComponent(cleanHex)}`, {
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(4500)
        });
        if (res.ok) {
          const ac = await res.json();
          if (ac && (ac.Type || ac.Manufacturer || ac.RegisteredOwners || ac.Registration)) {
            aircraft = {
              type: ac.Type || null,
              icaoType: ac.ICAOTypeCode || null,
              manufacturer: ac.Manufacturer || null,
              registration: ac.Registration || null,
              owner: ac.RegisteredOwners || null,
              ownerCountry: null,
              ownerCountryIso: null,
              photoUrl: null,
              photoThumbUrl: null
            };
          }
        }
      } catch {
        // Ignore
      }
    }

    // 5) Planespotters.net public photo API for real aircraft photo + photographer credit
    if (!photo) {
      try {
        const res = await fetch(`${PLANESPOTTERS_BASE}/${encodeURIComponent(cleanHex.toLowerCase())}`, {
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(5000)
        });
        if (res.ok) {
          const json = await res.json();
          const p = Array.isArray(json?.photos) ? json.photos[0] : null;
          if (p && (p.thumbnail_large?.src || p.thumbnail?.src)) {
            photo = {
              url: p.thumbnail_large?.src || p.thumbnail.src,
              thumbnailUrl: p.thumbnail?.src || p.thumbnail_large.src,
              credit: p.photographer ? `Photo: ${p.photographer} (Planespotters.net)` : 'Planespotters.net',
              link: p.link || null
            };
          }
        }
      } catch {
        // Ignore
      }
    }

    const result = {
      ok: Boolean(aircraft || flightroute || photo),
      icao24: cleanHex.toLowerCase(),
      callsign: cleanCall || null,
      aircraft,
      flightroute,
      photo
    };

    this._setCached(cacheKey, result);
    return result;
  }
}
