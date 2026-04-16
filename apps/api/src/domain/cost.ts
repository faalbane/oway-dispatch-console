import {
  COST_ESTIMATES,
  VEHICLE_MPG,
  type CostEstimate,
  type Route,
  type VehicleType,
} from '@oway/shared';

/**
 * Pure cost estimator. Given a computed route + the vehicle's type, produce the
 * dollar breakdown ops cares about: stop fees, per-mile distance cost, and fuel.
 *
 * Formula:
 *   total = stops × stopFee + miles × perMileRate + (miles / mpg) × fuelPricePerGallon
 *
 * Kept as a pure function (no I/O, no DB) so it is trivial to unit-test and
 * re-use anywhere a route + vehicle type is in hand.
 */
export function estimateRouteCost(
  route: Pick<Route, 'stops' | 'score'>,
  vehicleType: VehicleType,
): CostEstimate {
  const miles = route.score.totalDistanceMi;
  const stopCount = route.stops.length;
  const mpg = VEHICLE_MPG[vehicleType];

  const stopFees = stopCount * COST_ESTIMATES.stopFee;
  const distanceCost = miles * COST_ESTIMATES.perMileRate;
  const gallonsUsed = mpg > 0 ? miles / mpg : 0;
  const fuelCost = gallonsUsed * COST_ESTIMATES.fuelPricePerGallon;

  return {
    total: stopFees + distanceCost + fuelCost,
    stopFees,
    distanceCost,
    fuelCost,
    gallonsUsed,
    mpgUsed: mpg,
  };
}
