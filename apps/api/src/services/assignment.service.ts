/**
 * Assignment service.
 *
 * Atomically:
 *  1. Validates capacity (pallets + weight)
 *  2. Validates each shipment is in a state where assignment is allowed
 *     (INITIALIZED only; ASSIGNED can be reassigned)
 *  3. Validates none has blocking data issues
 *  4. Updates vehicleId + status to ASSIGNED on all selected shipments
 *
 * If any check fails, the entire transaction rolls back.
 */

import type { Shipment } from '@oway/shared';
import { prisma } from '../db.js';
import { ApiError } from '../lib/api-error.js';
import { validateCapacity } from '../domain/capacity.js';
import { isBlocking } from '../domain/data-quality.js';
import { deserializeShipment } from '../lib/serialize.js';
import type { DataIssue } from '@oway/shared';

export async function assignShipments(vehicleId: string, shipmentIds: string[]): Promise<Shipment[]> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: { shipments: true },
  });
  if (!vehicle) throw new ApiError(404, 'NOT_FOUND', `Vehicle ${vehicleId} not found`);

  const shipments = await prisma.shipment.findMany({ where: { id: { in: shipmentIds } } });
  const found = new Set(shipments.map((s) => s.id));
  const missing = shipmentIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new ApiError(404, 'NOT_FOUND', `Shipments not found: ${missing.join(', ')}`, { missing });
  }

  // Status check: only INITIALIZED or already-ASSIGNED-to-this-vehicle can be assigned
  const wrongStatus = shipments.filter((s) => {
    if (s.status === 'INITIALIZED') return false;
    if (s.status === 'ASSIGNED' && s.vehicleId === vehicleId) return false;
    return true;
  });
  if (wrongStatus.length > 0) {
    throw new ApiError(409, 'ALREADY_ASSIGNED', `Some shipments are not in an assignable state`, {
      shipments: wrongStatus.map((s) => ({ id: s.id, status: s.status, vehicleId: s.vehicleId })),
    });
  }

  // Blocking data issues
  const blocked = shipments.filter((s) => isBlocking(JSON.parse(s.dataIssues) as DataIssue[]));
  if (blocked.length > 0) {
    throw new ApiError(400, 'SHIPMENT_BLOCKED', `Some shipments have blocking data issues`, {
      shipments: blocked.map((s) => ({ id: s.id, issues: JSON.parse(s.dataIssues) })),
    });
  }

  // Capacity check — exclude any of the proposed shipments that are *already*
  // on this vehicle (no double-counting on reassign within the same vehicle).
  const existingOnVehicle = vehicle.shipments.filter((s) => !shipmentIds.includes(s.id));
  const currentPallets = existingOnVehicle.reduce((sum, s) => sum + s.palletCount, 0);
  const currentWeight = existingOnVehicle.reduce((sum, s) => sum + s.weightLbs, 0);

  const cap = validateCapacity(
    {
      vehicleId,
      maxPallets: vehicle.maxPallets,
      maxWeightLbs: vehicle.maxWeightLbs,
      currentPallets,
      currentWeightLbs: currentWeight,
    },
    shipments.map((s) => ({ id: s.id, palletCount: s.palletCount, weightLbs: s.weightLbs })),
  );

  if (!cap.ok) {
    throw new ApiError(409, 'CAPACITY_EXCEEDED', `Assignment would exceed vehicle capacity`, {
      vehicleId,
      violations: cap.violations,
      projectedPallets: cap.projectedPallets,
      projectedWeightLbs: cap.projectedWeightLbs,
    });
  }

  // Atomic write
  const updated = await prisma.$transaction(
    shipmentIds.map((id) =>
      prisma.shipment.update({
        where: { id },
        data: { vehicleId, status: 'ASSIGNED' },
      }),
    ),
  );

  return updated.map(deserializeShipment);
}

export async function unassignShipment(shipmentId: string): Promise<Shipment> {
  const s = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!s) throw new ApiError(404, 'NOT_FOUND', `Shipment ${shipmentId} not found`);
  if (s.status !== 'ASSIGNED') {
    throw new ApiError(409, 'INVALID_STATUS_TRANSITION', `Can only unassign ASSIGNED shipments (this is ${s.status})`);
  }
  const updated = await prisma.shipment.update({
    where: { id: shipmentId },
    data: { vehicleId: null, status: 'INITIALIZED' },
  });
  return deserializeShipment(updated);
}
