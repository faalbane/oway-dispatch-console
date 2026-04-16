import { canTransition, type Shipment, type ShipmentStatus, type CreateShipmentInput } from '@oway/shared';
import { prisma } from '../db.js';
import { ApiError } from '../lib/api-error.js';
import { deserializeShipment } from '../lib/serialize.js';
import { addressKey } from '../lib/address-key.js';
import { isBlocking, validateShipment } from '../domain/data-quality.js';
import { ensureGeocoded } from '../lib/geocode-on-demand.js';

interface ListFilters {
  status?: ShipmentStatus;
  search?: string;
  vehicleId?: string | 'unassigned';
  sort?: 'createdAt' | 'palletCount' | 'weightLbs' | 'id';
  order?: 'asc' | 'desc';
}

export async function listShipments(filters: ListFilters = {}): Promise<Shipment[]> {
  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;
  if (filters.vehicleId === 'unassigned') where.vehicleId = null;
  else if (filters.vehicleId) where.vehicleId = filters.vehicleId;
  if (filters.search) {
    where.OR = [
      { id: { contains: filters.search } },
      { description: { contains: filters.search } },
    ];
  }

  const sortField = filters.sort ?? 'id';
  const order = filters.order ?? 'asc';

  const rows = await prisma.shipment.findMany({
    where,
    orderBy: { [sortField]: order },
  });
  return rows.map(deserializeShipment);
}

export async function getShipment(id: string): Promise<Shipment> {
  const row = await prisma.shipment.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, 'NOT_FOUND', `Shipment ${id} not found`);
  return deserializeShipment(row);
}

export async function transitionStatus(id: string, to: ShipmentStatus): Promise<Shipment> {
  const row = await prisma.shipment.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, 'NOT_FOUND', `Shipment ${id} not found`);

  const from = row.status as ShipmentStatus;
  if (!canTransition(from, to)) {
    throw new ApiError(409, 'INVALID_STATUS_TRANSITION', `Cannot transition ${id} from ${from} to ${to}`, {
      from,
      to,
      shipmentId: id,
    });
  }

  // Special: ASSIGNED requires a vehicleId; PICKED_UP/DELIVERED require ASSIGNED first.
  if (to === 'ASSIGNED' && !row.vehicleId) {
    throw new ApiError(409, 'INVALID_STATUS_TRANSITION', `Cannot mark ${id} ASSIGNED without a vehicle`);
  }

  // Cancelling an assigned shipment invalidates its vehicle's computed route.
  // (DELIVERED/PICKED_UP don't — the planned stops are still correct, just some
  // have been completed.)
  const shouldInvalidateRoute = to === 'CANCELLED' && !!row.vehicleId;

  const [updated] = await prisma.$transaction([
    prisma.shipment.update({ where: { id }, data: { status: to } }),
    ...(shouldInvalidateRoute
      ? [prisma.route.deleteMany({ where: { vehicleId: row.vehicleId! } })]
      : []),
  ]);
  return deserializeShipment(updated as Parameters<typeof deserializeShipment>[0]);
}

/**
 * Override a shipment's status to any value, bypassing the forward-only
 * state machine. For ops mistakes — "I marked it delivered but it wasn't",
 * "this should never have been cancelled", etc. Distinct from transitionStatus
 * so the audit story is clear: this is a manual override, not a normal flow.
 *
 * Side effects:
 *   - to=INITIALIZED: clears vehicleId (shipment is unassigned)
 *   - to=ASSIGNED but no vehicleId: rejected (use the assignment flow)
 *   - leaving ASSIGNED/PICKED_UP on a vehicle: invalidates that vehicle's route
 */
export async function overrideStatus(id: string, to: ShipmentStatus): Promise<Shipment> {
  const row = await prisma.shipment.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, 'NOT_FOUND', `Shipment ${id} not found`);

  const from = row.status as ShipmentStatus;
  if (from === to) return deserializeShipment(row);

  if (to === 'ASSIGNED' && !row.vehicleId) {
    throw new ApiError(409, 'INVALID_STATUS_TRANSITION', `Cannot mark ${id} ASSIGNED without a vehicle — use the assignment flow`);
  }

  // INITIALIZED implies no vehicle; clear it.
  const data: { status: ShipmentStatus; vehicleId?: null } = { status: to };
  if (to === 'INITIALIZED') data.vehicleId = null;

  // Any change that affects what's on the truck invalidates its computed route.
  const shouldInvalidateRoute = !!row.vehicleId;

  const [updated] = await prisma.$transaction([
    prisma.shipment.update({ where: { id }, data }),
    ...(shouldInvalidateRoute
      ? [prisma.route.deleteMany({ where: { vehicleId: row.vehicleId! } })]
      : []),
  ]);
  return deserializeShipment(updated as Parameters<typeof deserializeShipment>[0]);
}

/**
 * Edit a shipment's content fields (origin, destination, pallets, weight,
 * description, accessorials). Status and vehicleId are owned by the
 * status/assignment flows — not editable here.
 *
 * Re-runs data quality validation, geocodes new addresses, and invalidates
 * any computed route if the shipment is currently assigned to a vehicle.
 *
 * Editing a DELIVERED/CANCELLED shipment is allowed (so ops can correct
 * historical records) but no longer affects routing.
 */
export async function updateShipment(id: string, input: CreateShipmentInput): Promise<Shipment> {
  const row = await prisma.shipment.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, 'NOT_FOUND', `Shipment ${id} not found`);

  // Geocode any new addresses.
  await Promise.all([ensureGeocoded(input.origin), ensureGeocoded(input.destination)]);

  // Re-run data quality with the proposed new values.
  const allShipments = await prisma.shipment.findMany();
  const allRaw = allShipments.map((s) => ({
    id: s.id,
    origin: JSON.parse(s.origin),
    destination: JSON.parse(s.destination),
    palletCount: s.palletCount,
    weightLbs: s.weightLbs,
    description: s.description,
    status: s.status as ShipmentStatus,
    accessorials: JSON.parse(s.accessorials),
  }));
  // Replace the current row in allRaw with the proposed update so duplicate
  // detection compares against everything else (not against the stale version).
  const idx = allRaw.findIndex((s) => s.id === id);
  const proposed = {
    id,
    origin: input.origin,
    destination: input.destination,
    palletCount: input.palletCount,
    weightLbs: input.weightLbs,
    description: input.description,
    status: row.status as ShipmentStatus,
    accessorials: input.accessorials ?? [],
  };
  if (idx >= 0) allRaw[idx] = proposed;

  const vehicles = await prisma.vehicle.findMany();
  const geocodes = await prisma.geocode.findMany({
    where: { key: { in: [addressKey(input.origin), addressKey(input.destination)] } },
  });
  const geocodedMap = new Map<string, boolean>(geocodes.map((g) => [g.key, g.lat !== null]));
  const issues = validateShipment(proposed, {
    allShipments: allRaw,
    geocoded: geocodedMap,
    vehicleCapacities: vehicles,
  });

  // If shipment is ACTIVELY assigned, the vehicle's route is now stale.
  const shouldInvalidateRoute =
    row.vehicleId && (row.status === 'ASSIGNED' || row.status === 'PICKED_UP');

  const [updated] = await prisma.$transaction([
    prisma.shipment.update({
      where: { id },
      data: {
        origin: JSON.stringify(input.origin),
        destination: JSON.stringify(input.destination),
        palletCount: input.palletCount,
        weightLbs: input.weightLbs,
        description: input.description,
        accessorials: JSON.stringify(input.accessorials ?? []),
        dataIssues: JSON.stringify(issues),
      },
    }),
    ...(shouldInvalidateRoute
      ? [prisma.route.deleteMany({ where: { vehicleId: row.vehicleId! } })]
      : []),
  ]);
  return deserializeShipment(updated as Parameters<typeof deserializeShipment>[0]);
}

export async function createShipment(input: CreateShipmentInput): Promise<Shipment> {
  // Generate a sequential-looking ID for new shipments.
  const last = await prisma.shipment.findFirst({
    where: { id: { startsWith: 'SHP' } },
    orderBy: { id: 'desc' },
  });
  const lastNum = last ? parseInt(last.id.slice(3), 10) : 0;
  const id = `SHP${String(lastNum + 1).padStart(3, '0')}`;

  // Geocode origin + destination on-demand (calls Nominatim if not cached).
  await Promise.all([ensureGeocoded(input.origin), ensureGeocoded(input.destination)]);

  const allShipments = await prisma.shipment.findMany();
  const allRaw = allShipments.map((s) => ({
    id: s.id,
    origin: JSON.parse(s.origin),
    destination: JSON.parse(s.destination),
    palletCount: s.palletCount,
    weightLbs: s.weightLbs,
    description: s.description,
    status: s.status as ShipmentStatus,
    accessorials: JSON.parse(s.accessorials),
  }));

  const vehicles = await prisma.vehicle.findMany();

  const geocodes = await prisma.geocode.findMany({
    where: {
      key: { in: [addressKey(input.origin), addressKey(input.destination)] },
    },
  });
  const geocodedMap = new Map<string, boolean>(geocodes.map((g) => [g.key, g.lat !== null]));

  const issues = validateShipment(
    {
      id,
      ...input,
      status: 'INITIALIZED',
      accessorials: input.accessorials ?? [],
    },
    { allShipments: allRaw, geocoded: geocodedMap, vehicleCapacities: vehicles },
  );

  if (isBlocking(issues)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Shipment has blocking data issues', {
      issues,
    });
  }

  const created = await prisma.shipment.create({
    data: {
      id,
      origin: JSON.stringify(input.origin),
      destination: JSON.stringify(input.destination),
      palletCount: input.palletCount,
      weightLbs: input.weightLbs,
      description: input.description,
      status: 'INITIALIZED',
      accessorials: JSON.stringify(input.accessorials ?? []),
      dataIssues: JSON.stringify(issues),
    },
  });
  return deserializeShipment(created);
}
