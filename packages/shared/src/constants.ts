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
