/**
 * Domain constants. Single source of truth — both apps import from here.
 */

export const ACCESSORIALS = ['liftgate', 'appointment', 'limited_access', 'hazmat'] as const;
export type Accessorial = (typeof ACCESSORIALS)[number];

export const VEHICLE_TYPES = ['dry_van', 'box_truck'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const SHIPMENT_STATUSES = [
  'INITIALIZED',
  'ASSIGNED',
  'PICKED_UP',
  'DELIVERED',
  'CANCELLED',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

/** Routing assumptions. Documented and overridable, not magic numbers. */
export const ROUTING_DEFAULTS = {
  /** Avg effective speed in LA metro (mph). Pessimistic vs. limit speeds — accounts for traffic. */
  avgSpeedMph: 25,
  /** Service time per stop in minutes (loading/unloading + paperwork). */
  serviceTimeMin: 20,
  /** Vehicles depart depot at this time (24h "HH:MM"). */
  depotDepartureTime: '06:00',
  /** Soft penalty: each minute outside a window adds this much to score. */
  windowViolationPenalty: 2.0,
  /** Bonus for adjacent hazmat stops (encourages clustering of hazmat protocol overhead). */
  hazmatClusteringBonus: 5.0,
} as const;

/**
 * Cost-estimation inputs. Same pattern as ROUTING_DEFAULTS — single source of
 * truth so the reviewer can see (and change) the numbers that drive the UI.
 */
export const COST_ESTIMATES = {
  /** $ per stop (pickup or delivery). Flat — independent of dwell time or parcel count. */
  stopFee: 75,
  /** $ per road-mile traveled. */
  perMileRate: 3.53,
  /** Fuel price in $/gallon. */
  fuelPricePerGallon: 6,
} as const;

/**
 * Fuel efficiency by vehicle type (midpoint of spec ranges: dry_van 5-8 mpg, box_truck 8-12 mpg).
 * Lives here (not on the Vehicle record) because mpg is a domain assumption, not per-instance data.
 */
export const VEHICLE_MPG: Record<VehicleType, number> = {
  dry_van: 6,
  box_truck: 10,
} as const;
