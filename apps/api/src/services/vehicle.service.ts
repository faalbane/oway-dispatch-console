import type { Shipment, Vehicle, VehicleType, VehicleWithLoad, ShipmentStatus } from '@oway/shared';
import { isActiveAssignment } from '@oway/shared';
import { prisma } from '../db.js';
import { ApiError } from '../lib/api-error.js';
import { deserializeShipment } from '../lib/serialize.js';

/**
 * Capacity accounting: only ACTIVE (ASSIGNED | PICKED_UP) shipments count
 * toward a vehicle's current load. A DELIVERED shipment is off the truck; a
 * CANCELLED one was never picked up (or was returned). Both free the slot.
 */
function activeLoad(shipments: { status: string; palletCount: number; weightLbs: number; id: string }[]) {
  const active = shipments.filter((s) => isActiveAssignment(s.status as ShipmentStatus));
  return {
    loadPallets: active.reduce((sum, s) => sum + s.palletCount, 0),
    loadWeightLbs: active.reduce((sum, s) => sum + s.weightLbs, 0),
    activeIds: active.map((s) => s.id),
  };
}

export async function listVehiclesWithLoad(): Promise<VehicleWithLoad[]> {
  const vehicles = await prisma.vehicle.findMany({
    include: { shipments: true },
    orderBy: { id: 'asc' },
  });

  return vehicles.map((v) => {
    const { loadPallets, loadWeightLbs, activeIds } = activeLoad(v.shipments);
    return {
      id: v.id,
      type: v.type as VehicleType,
      maxPallets: v.maxPallets,
      maxWeightLbs: v.maxWeightLbs,
      assignedShipmentIds: activeIds,
      loadPallets,
      loadWeightLbs,
      remainingPallets: v.maxPallets - loadPallets,
      remainingWeightLbs: v.maxWeightLbs - loadWeightLbs,
    };
  });
}

export async function getVehicleWorkload(vehicleId: string): Promise<{ vehicle: VehicleWithLoad; shipments: Shipment[] }> {
  const v = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: { shipments: true },
  });
  if (!v) throw new ApiError(404, 'NOT_FOUND', `Vehicle ${vehicleId} not found`);

  const { loadPallets, loadWeightLbs, activeIds } = activeLoad(v.shipments);

  // The workload endpoint returns *active* shipments only — what's currently
  // on the truck. Historical (delivered/cancelled) shipments can be found via
  // GET /shipments?vehicleId=X instead.
  const active = v.shipments.filter((s) => isActiveAssignment(s.status as ShipmentStatus));

  return {
    vehicle: {
      id: v.id,
      type: v.type as VehicleType,
      maxPallets: v.maxPallets,
      maxWeightLbs: v.maxWeightLbs,
      assignedShipmentIds: activeIds,
      loadPallets,
      loadWeightLbs,
      remainingPallets: v.maxPallets - loadPallets,
      remainingWeightLbs: v.maxWeightLbs - loadWeightLbs,
    },
    shipments: active.map(deserializeShipment),
  };
}

export async function listVehicles(): Promise<Vehicle[]> {
  const rows = await prisma.vehicle.findMany({ orderBy: { id: 'asc' } });
  return rows.map((v) => ({
    id: v.id,
    type: v.type as VehicleType,
    maxPallets: v.maxPallets,
    maxWeightLbs: v.maxWeightLbs,
  }));
}
