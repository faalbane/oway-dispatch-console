/**
 * Prisma stores JSON columns as strings on SQLite. These helpers parse them
 * into the strict types the API contract promises.
 */

import type { Shipment as PrismaShipment } from '@prisma/client';
import type { Address, DataIssue, Shipment, ShipmentStatus } from '@oway/shared';
import { ACCESSORIALS } from '@oway/shared';
import type { Accessorial } from '@oway/shared';

export function deserializeShipment(row: PrismaShipment): Shipment {
  const accessorials = (JSON.parse(row.accessorials) as string[]).filter(
    (a): a is Accessorial => (ACCESSORIALS as readonly string[]).includes(a),
  );
  return {
    id: row.id,
    origin: JSON.parse(row.origin) as Address,
    destination: JSON.parse(row.destination) as Address,
    palletCount: row.palletCount,
    weightLbs: row.weightLbs,
    description: row.description,
    status: row.status as ShipmentStatus,
    accessorials,
    vehicleId: row.vehicleId,
    dataIssues: JSON.parse(row.dataIssues) as DataIssue[],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
