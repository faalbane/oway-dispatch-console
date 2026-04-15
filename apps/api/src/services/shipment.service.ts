import { canTransition, type Shipment, type ShipmentStatus, type CreateShipmentInput } from '@oway/shared';
import { prisma } from '../db.js';
import { ApiError } from '../lib/api-error.js';
import { deserializeShipment } from '../lib/serialize.js';
import { addressKey } from '../lib/address-key.js';
import { isBlocking, validateShipment } from '../domain/data-quality.js';

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

  const updated = await prisma.shipment.update({
    where: { id },
    data: { status: to },
  });
  return deserializeShipment(updated);
}

export async function createShipment(input: CreateShipmentInput): Promise<Shipment> {
  // Generate a sequential-looking ID for new shipments.
  const last = await prisma.shipment.findFirst({
    where: { id: { startsWith: 'SHP' } },
    orderBy: { id: 'desc' },
  });
  const lastNum = last ? parseInt(last.id.slice(3), 10) : 0;
  const id = `SHP${String(lastNum + 1).padStart(3, '0')}`;

  // Look up geocoding for both addresses (best-effort; failures captured as data issues)
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
