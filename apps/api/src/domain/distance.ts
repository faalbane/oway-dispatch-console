/**
 * Distance functions.
 *
 * The routing engine takes a `distanceFn` parameter. Two implementations:
 *
 *   haversineMiles — straight-line great-circle distance. Free, deterministic,
 *     but LA freeway geometry makes actual drive distances 1.3-1.6× higher.
 *
 *   osrmDrivingMiles — calls the public OSRM API for real road distances.
 *     Caches results in-memory per session. Falls back to haversine on error.
 *
 * The route service tries OSRM first via getDistanceMatrix (batch lookup of
 * all stop-to-stop distances), and falls back to haversine if the API is
 * unreachable.
 */

const EARTH_RADIUS_MI = 3958.8;

export type LatLng = { lat: number; lng: number };

export type DistanceFn = (a: LatLng, b: LatLng) => number;

export const haversineMiles: DistanceFn = (a, b) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(h));
};

const METERS_PER_MILE = 1609.344;
const OSRM_BASE = 'https://router.project-osrm.org';

/**
 * Fetch a full distance matrix from the public OSRM API (table service).
 * Returns a 2D array where matrix[i][j] is the driving distance in miles
 * from point i to point j. Returns null if the API is unavailable.
 */
export async function getDistanceMatrix(points: LatLng[]): Promise<number[][] | null> {
  if (points.length < 2) return null;
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `${OSRM_BASE}/table/v1/driving/${coords}?annotations=distance`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'oway-dispatch-console/0.1' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { code: string; distances?: number[][] };
    if (json.code !== 'Ok' || !json.distances) return null;
    return json.distances.map((row) => row.map((m) => m / METERS_PER_MILE));
  } catch {
    return null;
  }
}

/**
 * Build a DistanceFn backed by a pre-fetched distance matrix. Falls back to
 * haversine for any pair not in the matrix.
 */
export function matrixDistanceFn(
  points: LatLng[],
  matrix: number[][],
): DistanceFn {
  const index = new Map<string, number>();
  for (let i = 0; i < points.length; i++) {
    index.set(`${points[i]!.lat},${points[i]!.lng}`, i);
  }
  return (a, b) => {
    const ai = index.get(`${a.lat},${a.lng}`);
    const bi = index.get(`${b.lat},${b.lng}`);
    if (ai !== undefined && bi !== undefined && matrix[ai]?.[bi] !== undefined) {
      return matrix[ai]![bi]!;
    }
    return haversineMiles(a, b);
  };
}
