import type { Route, ShipmentStatus, VehicleType } from '@oway/shared';
import { isActiveAssignment } from '@oway/shared';
import { prisma } from '../db.js';
import { ApiError } from '../lib/api-error.js';
import { generateRoute, type RouteableShipment } from '../domain/routing.js';
import { getDistanceMatrix, haversineMiles, matrixDistanceFn, type LatLng } from '../domain/distance.js';
import { estimateRouteCost } from '../domain/cost.js';
import { addressKey } from '../lib/address-key.js';
import { deserializeShipment } from '../lib/serialize.js';

/**
 * Route generation includes:
 *   - ASSIGNED shipments: full pickup + delivery stops
 *   - PICKED_UP shipments: delivery stop only (pickup already happened)
 *   - DELIVERED/CANCELLED: excluded (no longer on the truck)
 *
 * Distance computation tries the OSRM public API for real road distances,
 * then falls back to haversine if the API is unreachable.
 */
export async function computeRouteForVehicle(vehicleId: string): Promise<Route> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: { shipments: true },
  });
  if (!vehicle) throw new ApiError(404, 'NOT_FOUND', `Vehicle ${vehicleId} not found`);

  const activeShipments = vehicle.shipments.filter((s) =>
    isActiveAssignment(s.status as ShipmentStatus),
  );
  if (activeShipments.length === 0) {
    throw new ApiError(400, 'ROUTE_INFEASIBLE', `Vehicle ${vehicleId} has no active shipments to route`);
  }

  const depot = await prisma.depot.findUnique({ where: { id: 'depot' } });
  if (!depot) throw new ApiError(500, 'INTERNAL_ERROR', 'Depot not configured');

  // Load geocodes
  const allKeys = activeShipments.flatMap((s) => [
    addressKey(JSON.parse(s.origin)),
    addressKey(JSON.parse(s.destination)),
  ]);
  const geocodes = await prisma.geocode.findMany({ where: { key: { in: allKeys } } });
  const geoMap = new Map(geocodes.map((g) => [g.key, g]));

  const routeable: RouteableShipment[] = activeShipments.map((s) => {
    const ship = deserializeShipment(s);
    const oKey = addressKey(ship.origin);
    const dKey = addressKey(ship.destination);
    const o = geoMap.get(oKey);
    const d = geoMap.get(dKey);

    const isPickedUp = s.status === 'PICKED_UP';

    return {
      shipment: ship,
      // For PICKED_UP shipments, null out the origin — the routing engine
      // will emit only the delivery stop when originLatLng is null.
      originLatLng: isPickedUp
        ? null
        : o && o.lat !== null && o.lng !== null
          ? { lat: o.lat, lng: o.lng }
          : null,
      destLatLng: d && d.lat !== null && d.lng !== null ? { lat: d.lat, lng: d.lng } : null,
    };
  });

  // Collect all geocoded points for the OSRM distance matrix.
  const allPoints: LatLng[] = [{ lat: depot.latitude, lng: depot.longitude }];
  for (const r of routeable) {
    if (r.originLatLng) allPoints.push(r.originLatLng);
    if (r.destLatLng) allPoints.push(r.destLatLng);
  }

  // Try real road distances; fall back to haversine.
  let distanceFn = haversineMiles;
  let distanceSource = 'haversine';
  const matrix = await getDistanceMatrix(allPoints);
  if (matrix) {
    distanceFn = matrixDistanceFn(allPoints, matrix);
    distanceSource = 'osrm';
  }

  const route = generateRoute(vehicleId, routeable, {
    depot: { lat: depot.latitude, lng: depot.longitude },
    distanceFn,
  });

  // Tag the route with which distance source was used (useful for debugging
  // and for the README claim that we try OSRM first).
  (route as Route & { distanceSource?: string }).distanceSource = distanceSource;

  // Attach dollar estimate. Computed here (not inside the routing engine) to
  // keep routing a pure graph/time problem and cost a separate concern.
  route.costEstimate = estimateRouteCost(route, vehicle.type as VehicleType);

  // Persist
  await prisma.$transaction([
    prisma.route.deleteMany({ where: { vehicleId } }),
    prisma.route.create({
      data: { vehicleId, payload: JSON.stringify(route) },
    }),
  ]);

  return route;
}

export async function getLatestRoute(vehicleId: string): Promise<Route | null> {
  const last = await prisma.route.findFirst({
    where: { vehicleId },
    orderBy: { computedAt: 'desc' },
  });
  if (!last) return null;
  return JSON.parse(last.payload) as Route;
}
