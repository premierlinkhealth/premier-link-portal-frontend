// Lightweight geography for the smart scheduler: a Ventura County city → lat/lng
// table plus a haversine distance. Approximate (city-centroid) — enough to rank
// nurses by travel distance without a maps API.

export const CITY_COORDS: Record<string, [number, number]> = {
  Moorpark: [34.2856, -118.882],
  "Simi Valley": [34.2694, -118.7815],
  "Thousand Oaks": [34.1706, -118.8376],
  "Newbury Park": [34.1786, -118.9123],
  "Westlake Village": [34.1461, -118.8059],
  Camarillo: [34.2164, -119.0376],
  Oxnard: [34.1975, -119.1771],
  Ventura: [34.2746, -119.229],
  "Port Hueneme": [34.1478, -119.1951],
  "Santa Paula": [34.3542, -119.0593],
  Fillmore: [34.3992, -118.9176],
  Ojai: [34.448, -119.2429],
};

export const ALL_CITIES = Object.keys(CITY_COORDS);

function norm(c: string): string {
  return c.trim().toLowerCase();
}

function lookup(city?: string | null): [number, number] | null {
  if (!city) return null;
  const n = norm(city);
  for (const k of Object.keys(CITY_COORDS)) if (norm(k) === n) return CITY_COORDS[k];
  return null;
}

/** Miles between two cities (centroid haversine), or null if either is unknown. */
export function cityDistanceMiles(a?: string | null, b?: string | null): number | null {
  const ca = lookup(a);
  const cb = lookup(b);
  if (!ca || !cb) return null;
  const [lat1, lon1] = ca;
  const [lat2, lon2] = cb;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8; // Earth radius, miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Weekday label ("Mon") for an ISO datetime string. */
export function weekdayOf(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : DAYS[d.getDay()];
}
