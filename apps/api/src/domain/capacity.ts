/**
 * Capacity validation. Pure function — no DB, no HTTP.
 *
 * Used by the assignment service before writing, and by the UI before submitting,
 * so users see "would be 13/12 pallets" warnings *before* they click assign.
 */

export interface CapacitySnapshot {
  vehicleId: string;
  maxPallets: number;
  maxWeightLbs: number;
  /** Currently-assigned shipments on this vehicle, excluding the ones being added. */
  currentPallets: number;
  currentWeightLbs: number;
}

export interface ShipmentLoad {
  id: string;
  palletCount: number;
  weightLbs: number;
}

export interface CapacityResult {
  ok: boolean;
  /** Projected totals after the proposed assignment. */
  projectedPallets: number;
  projectedWeightLbs: number;
  /** Negative if over capacity; positive if room remains. */
  remainingPallets: number;
  remainingWeightLbs: number;
  violations: Array<{
    constraint: 'pallets' | 'weight';
    over: number;
    limit: number;
    projected: number;
  }>;
}

export function validateCapacity(snapshot: CapacitySnapshot, additions: ShipmentLoad[]): CapacityResult {
  const addPallets = additions.reduce((sum, s) => sum + s.palletCount, 0);
  const addWeight = additions.reduce((sum, s) => sum + s.weightLbs, 0);

  const projectedPallets = snapshot.currentPallets + addPallets;
  const projectedWeightLbs = snapshot.currentWeightLbs + addWeight;
  const remainingPallets = snapshot.maxPallets - projectedPallets;
  const remainingWeightLbs = snapshot.maxWeightLbs - projectedWeightLbs;

  const violations: CapacityResult['violations'] = [];
  if (projectedPallets > snapshot.maxPallets) {
    violations.push({
      constraint: 'pallets',
      over: projectedPallets - snapshot.maxPallets,
      limit: snapshot.maxPallets,
      projected: projectedPallets,
    });
  }
  if (projectedWeightLbs > snapshot.maxWeightLbs) {
    violations.push({
      constraint: 'weight',
      over: projectedWeightLbs - snapshot.maxWeightLbs,
      limit: snapshot.maxWeightLbs,
      projected: projectedWeightLbs,
    });
  }

  return {
    ok: violations.length === 0,
    projectedPallets,
    projectedWeightLbs,
    remainingPallets,
    remainingWeightLbs,
    violations,
  };
}
