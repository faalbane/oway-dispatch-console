/**
 * Distance functions.
 *
 * The routing engine takes a `distanceFn` parameter so this is a one-file swap
 * to call OSRM/Google Maps for real road distances. Default is haversine —
 * straight-line great-circle distance between two lat/lng points.
 *
 * Why haversine for v1: deterministic, free, no external dep, fast enough that
 * we can score thousands of candidate insertions in under 100ms. The tradeoff
 * is that LA freeway geometry is far from "as the crow flies"; expect actual
 * drive distances to be 1.3-1.6x the haversine estimate.
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
