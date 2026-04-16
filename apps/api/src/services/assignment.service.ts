/**
 * Assignment service.
 *
 * Atomically:
 *  1. Validates each shipment is in an assignable state
 *     (INITIALIZED, or ASSIGNED anywhere — enables reassignment between vehicles).
 *     Rejects PICKED_UP/DELIVERED/CANCELLED — those are past the point of reassignment.
 *  2. Validates none has blocking data issues
 *  3. Validates capacity against the new vehicle — counting only *active*
 *     shipments currently on it (DELIVERED/CANCELLED don't consume capacity).
 *  4. Updates vehicleId + status=ASSIGNED on all selected shipments.
 *  5. Deletes any stale Route rows on affected vehicles (both the old vehicle
 *     for reassignments AND the new target) — a computed route is invalid
 *     the moment its inputs change.
 *
 * If any check fails, the entire transaction rolls back.
 */

import type { Shipment, DataIssue, ShipmentStatus } from '@oway/shared';
import { isActiveAssignment } from '@oway/shared';
import { prisma } from '../db.js';
import { ApiError } from '../lib/api-error.js';
import { validateCapacity } from '../domain/capacity.js';
import { isBlocking } from '../domain/data-quality.js';
import { deserializeShipment } from '../lib/serialize.js';

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

  // Assignable states: INITIALIZED (first assignment) and ASSIGNED (reassignment
  // between vehicles, or re-confirmation on the same vehicle). PICKED_UP and
  // later states mean dispatch is underway — reassigning would orphan in-flight
  // freight.
  const wrongStatus = shipments.filter(
    (s) => s.status !== 'INITIALIZED' && s.status !== 'ASSIGNED',
  );
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

  // Capacity: count only *active* shipments on the target vehicle that aren't
  // part of this request (avoid double-counting reassigns-onto-same-vehicle).
  const existingActive = vehicle.shipments.filter(
    (s) =>
      !shipmentIds.includes(s.id) && isActiveAssignment(s.status as ShipmentStatus),
  );
  const currentPallets = existingActive.reduce((sum, s) => sum + s.palletCount, 0);
  const currentWeight = existingActive.reduce((sum, s) => sum + s.weightLbs, 0);

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

  // Determine which vehicles have stale routes after this assignment:
  //   - the target vehicle (gaining shipments)
  //   - any source vehicle (losing shipments via reassignment)
  const affectedVehicleIds = new Set<string>([vehicleId]);
  for (const s of shipments) {
    if (s.vehicleId && s.vehicleId !== vehicleId) affectedVehicleIds.add(s.vehicleId);
  }

  // Atomic: flip shipments + invalidate computed routes on affected vehicles.
  const updated = await prisma.$transaction([
    ...shipmentIds.map((id) =>
      prisma.shipment.update({
        where: { id },
        data: { vehicleId, status: 'ASSIGNED' },
      }),
    ),
    ...Array.from(affectedVehicleIds).map((vid) =>
      prisma.route.deleteMany({ where: { vehicleId: vid } }),
    ),
  ]);

  // The first N results are the shipment updates (same order as shipmentIds)
  return updated.slice(0, shipmentIds.length).map((row) => deserializeShipment(row as Parameters<typeof deserializeShipment>[0]));
}

export async function unassignShipment(shipmentId: string): Promise<Shipment> {
  const s = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!s) throw new ApiError(404, 'NOT_FOUND', `Shipment ${shipmentId} not found`);
  if (s.status !== 'ASSIGNED') {
    throw new ApiError(409, 'INVALID_STATUS_TRANSITION', `Can only unassign ASSIGNED shipments (this is ${s.status})`);
  }

  const oldVehicleId = s.vehicleId;
  const [updated] = await prisma.$transaction([
    prisma.shipment.update({
      where: { id: shipmentId },
      data: { vehicleId: null, status: 'INITIALIZED' },
    }),
    ...(oldVehicleId
      ? [prisma.route.deleteMany({ where: { vehicleId: oldVehicleId } })]
      : []),
  ]);
  return deserializeShipment(updated as Parameters<typeof deserializeShipment>[0]);
}
