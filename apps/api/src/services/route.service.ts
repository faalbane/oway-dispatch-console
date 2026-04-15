import type { Route } from '@oway/shared';
import { prisma } from '../db.js';
import { ApiError } from '../lib/api-error.js';
import { generateRoute, type RouteableShipment } from '../domain/routing.js';
import { addressKey } from '../lib/address-key.js';
import { deserializeShipment } from '../lib/serialize.js';

export async function computeRouteForVehicle(vehicleId: string): Promise<Route> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: { shipments: true },
  });
  if (!vehicle) throw new ApiError(404, 'NOT_FOUND', `Vehicle ${vehicleId} not found`);
  if (vehicle.shipments.length === 0) {
    throw new ApiError(400, 'ROUTE_INFEASIBLE', `Vehicle ${vehicleId} has no assigned shipments`);
  }

  const depot = await prisma.depot.findUnique({ where: { id: 'depot' } });
  if (!depot) throw new ApiError(500, 'INTERNAL_ERROR', 'Depot not configured');

  // Load geocodes for every address
  const allKeys = vehicle.shipments.flatMap((s) => [
    addressKey(JSON.parse(s.origin)),
    addressKey(JSON.parse(s.destination)),
  ]);
  const geocodes = await prisma.geocode.findMany({ where: { key: { in: allKeys } } });
  const geoMap = new Map(geocodes.map((g) => [g.key, g]));

  const routeable: RouteableShipment[] = vehicle.shipments.map((s) => {
    const ship = deserializeShipment(s);
    const oKey = addressKey(ship.origin);
    const dKey = addressKey(ship.destination);
    const o = geoMap.get(oKey);
    const d = geoMap.get(dKey);
    return {
      shipment: ship,
      originLatLng: o && o.lat !== null && o.lng !== null ? { lat: o.lat, lng: o.lng } : null,
      destLatLng: d && d.lat !== null && d.lng !== null ? { lat: d.lat, lng: d.lng } : null,
    };
  });

  const route = generateRoute(vehicleId, routeable, {
    depot: { lat: depot.latitude, lng: depot.longitude },
  });

  // Persist
  await prisma.route.create({
    data: {
      vehicleId,
      payload: JSON.stringify(route),
    },
  });

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
