import type { Shipment, Vehicle, VehicleType, VehicleWithLoad } from '@oway/shared';
import { prisma } from '../db.js';
import { ApiError } from '../lib/api-error.js';
import { deserializeShipment } from '../lib/serialize.js';

export async function listVehiclesWithLoad(): Promise<VehicleWithLoad[]> {
  const vehicles = await prisma.vehicle.findMany({
    include: { shipments: true },
    orderBy: { id: 'asc' },
  });

  return vehicles.map((v) => {
    const loadPallets = v.shipments.reduce((sum, s) => sum + s.palletCount, 0);
    const loadWeightLbs = v.shipments.reduce((sum, s) => sum + s.weightLbs, 0);
    return {
      id: v.id,
      type: v.type as VehicleType,
      maxPallets: v.maxPallets,
      maxWeightLbs: v.maxWeightLbs,
      assignedShipmentIds: v.shipments.map((s) => s.id),
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

  const loadPallets = v.shipments.reduce((sum, s) => sum + s.palletCount, 0);
  const loadWeightLbs = v.shipments.reduce((sum, s) => sum + s.weightLbs, 0);

  return {
    vehicle: {
      id: v.id,
      type: v.type as VehicleType,
      maxPallets: v.maxPallets,
      maxWeightLbs: v.maxWeightLbs,
      assignedShipmentIds: v.shipments.map((s) => s.id),
      loadPallets,
      loadWeightLbs,
      remainingPallets: v.maxPallets - loadPallets,
      remainingWeightLbs: v.maxWeightLbs - loadWeightLbs,
    },
    shipments: v.shipments.map(deserializeShipment),
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
