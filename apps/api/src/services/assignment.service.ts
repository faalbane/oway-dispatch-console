/**
 * Assignment service.
 *
 * The whole read-then-validate-then-write sequence runs inside a single
 * interactive transaction. This matters because, without it, two concurrent
 * ops users each reading "current load = X" then independently deciding their
 * assignment fits would both succeed, racing a truck into overcapacity. With
 * the interactive transaction, SQLite globally serializes writes; on Postgres
 * it would need explicit row locks (see README "concurrency" note).
 *
 * Atomically:
 *  1. Validate each shipment is in an assignable state (INITIALIZED or
 *     ASSIGNED — the latter enables reassignment between vehicles).
 *     Reject PICKED_UP and later — past the point of reassignment.
 *  2. Validate none has blocking data issues.
 *  3. Validate capacity against the new vehicle, counting only *active*
 *     shipments currently on it (DELIVERED/CANCELLED don't consume capacity).
 *  4. Update vehicleId + status=ASSIGNED.
 *  5. Delete any stale Route rows on *affected* vehicles — where "affected"
 *     means a vehicle gaining or losing at least one shipment. A no-op
 *     reassignment (re-selecting the same vehicle) leaves the existing route
 *     intact.
 */

import type { Shipment, DataIssue, ShipmentStatus } from '@oway/shared';
import { isActiveAssignment } from '@oway/shared';
import { prisma } from '../db.js';
import { ApiError } from '../lib/api-error.js';
import { validateCapacity } from '../domain/capacity.js';
import { isBlocking } from '../domain/data-quality.js';
import { deserializeShipment } from '../lib/serialize.js';

interface AssignmentResult {
  shipments: Shipment[];
  accessorialWarnings: Array<{ shipmentId: string; missing: string[] }>;
}

export async function assignShipments(vehicleId: string, shipmentIds: string[]): Promise<AssignmentResult> {
  return prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.findUnique({
      where: { id: vehicleId },
      include: { shipments: true },
    });
    if (!vehicle) throw new ApiError(404, 'NOT_FOUND', `Vehicle ${vehicleId} not found`);

    const shipments = await tx.shipment.findMany({ where: { id: { in: shipmentIds } } });
    const found = new Set(shipments.map((s) => s.id));
    const missing = shipmentIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new ApiError(404, 'NOT_FOUND', `Shipments not found: ${missing.join(', ')}`, { missing });
    }

    const wrongStatus = shipments.filter(
      (s) => s.status !== 'INITIALIZED' && s.status !== 'ASSIGNED',
    );
    if (wrongStatus.length > 0) {
      throw new ApiError(409, 'ALREADY_ASSIGNED', `Some shipments are not in an assignable state`, {
        shipments: wrongStatus.map((s) => ({ id: s.id, status: s.status, vehicleId: s.vehicleId })),
      });
    }

    const blocked = shipments.filter((s) => isBlocking(JSON.parse(s.dataIssues) as DataIssue[]));
    if (blocked.length > 0) {
      throw new ApiError(400, 'SHIPMENT_BLOCKED', `Some shipments have blocking data issues`, {
        shipments: blocked.map((s) => ({ id: s.id, issues: JSON.parse(s.dataIssues) })),
      });
    }

    // Capacity check — exclude shipments already part of this request to avoid
    // double-counting a reassignment back to the same vehicle, and include
    // only active-status residents.
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

    // Accessorial compatibility: warn (but don't block) if any shipment's
    // accessorials aren't supported by the vehicle. Ops may override — e.g.,
    // a manual liftgate exists on-site.
    const vehicleCaps = JSON.parse(vehicle.capabilities) as string[];
    const capsSet = new Set(vehicleCaps);
    const accessorialWarnings: Array<{ shipmentId: string; missing: string[] }> = [];
    for (const s of shipments) {
      const needed = JSON.parse(s.accessorials) as string[];
      const missing = needed.filter((a) => !capsSet.has(a));
      if (missing.length > 0) {
        accessorialWarnings.push({ shipmentId: s.id, missing });
      }
    }

    // Which vehicles have a stale route after this assignment?
    // Only those whose *set* of assigned shipments actually changes. A
    // re-confirmation of an existing assignment (same vehicle, already
    // ASSIGNED) doesn't invalidate its route.
    const affectedVehicleIds = new Set<string>();
    for (const s of shipments) {
      if (s.vehicleId !== vehicleId) {
        affectedVehicleIds.add(vehicleId);
        if (s.vehicleId) affectedVehicleIds.add(s.vehicleId);
      }
    }

    await Promise.all(
      shipmentIds.map((id) =>
        tx.shipment.update({
          where: { id },
          data: { vehicleId, status: 'ASSIGNED' },
        }),
      ),
    );
    if (affectedVehicleIds.size > 0) {
      await Promise.all(
        Array.from(affectedVehicleIds).map((vid) =>
          tx.route.deleteMany({ where: { vehicleId: vid } }),
        ),
      );
    }

    const updatedRows = await tx.shipment.findMany({ where: { id: { in: shipmentIds } } });
    return {
      shipments: updatedRows.map(deserializeShipment),
      accessorialWarnings,
    };
  });
}

export async function unassignShipment(shipmentId: string): Promise<Shipment> {
  return prisma.$transaction(async (tx) => {
    const s = await tx.shipment.findUnique({ where: { id: shipmentId } });
    if (!s) throw new ApiError(404, 'NOT_FOUND', `Shipment ${shipmentId} not found`);
    if (s.status !== 'ASSIGNED') {
      throw new ApiError(
        409,
        'INVALID_STATUS_TRANSITION',
        `Can only unassign ASSIGNED shipments (this is ${s.status})`,
      );
    }

    const oldVehicleId = s.vehicleId;
    const updated = await tx.shipment.update({
      where: { id: shipmentId },
      data: { vehicleId: null, status: 'INITIALIZED' },
    });
    if (oldVehicleId) {
      await tx.route.deleteMany({ where: { vehicleId: oldVehicleId } });
    }
    return deserializeShipment(updated);
  });
}
