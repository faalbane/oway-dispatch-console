import { z } from 'zod';
import { ACCESSORIALS, SHIPMENT_STATUSES, VEHICLE_TYPES } from './constants';

/* ============================================================================
 * Address
 * ==========================================================================*/

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const AddressSchema = z.object({
  name: z.string().min(1, 'name required'),
  address1: z.string().min(1, 'address1 required'),
  address2: z.string().optional(),
  city: z.string().min(1, 'city required'),
  state: z.string().length(2, 'state must be 2-letter code'),
  zipCode: z
    .string()
    .regex(/^\d{5}(-\d{4})?$/, 'zip must be 5 digits or 5+4')
    .refine((z) => z !== '00000', 'zip 00000 is invalid'),
  contactPerson: z.string().optional().default(''),
  phoneNumber: z.string().optional().default(''),
  openTime: z.string().regex(TIME_HHMM, 'openTime must be HH:MM'),
  closeTime: z.string().regex(TIME_HHMM, 'closeTime must be HH:MM'),
  notes: z.string().optional(),
});

/** Same shape as AddressSchema but tolerates the seed-data's bad rows for ingestion. */
export const RawAddressSchema = z.object({
  name: z.string().default(''),
  address1: z.string().default(''),
  address2: z.string().optional(),
  city: z.string().default(''),
  state: z.string().default(''),
  zipCode: z.string().default(''),
  contactPerson: z.string().default(''),
  phoneNumber: z.string().default(''),
  openTime: z.string().default('00:00'),
  closeTime: z.string().default('23:59'),
  notes: z.string().optional(),
});

export type Address = z.infer<typeof AddressSchema>;

/* ============================================================================
 * Shipment
 * ==========================================================================*/

export const ShipmentStatusSchema = z.enum(SHIPMENT_STATUSES);
export const AccessorialSchema = z.enum(ACCESSORIALS);

/** Used by API on create. Strict — errors out for bad data. */
export const CreateShipmentSchema = z.object({
  origin: AddressSchema,
  destination: AddressSchema,
  palletCount: z.number().int().positive('palletCount must be positive'),
  weightLbs: z.number().positive('weightLbs must be positive'),
  description: z.string().min(1, 'description required'),
  accessorials: z.array(AccessorialSchema).default([]),
});
export type CreateShipmentInput = z.infer<typeof CreateShipmentSchema>;

/** Used at seed time. Tolerant — captures bad data as DataIssues. */
export const RawShipmentSchema = z.object({
  id: z.string(),
  origin: RawAddressSchema,
  destination: RawAddressSchema,
  palletCount: z.number(),
  weightLbs: z.number(),
  description: z.string().default(''),
  status: ShipmentStatusSchema.default('INITIALIZED'),
  accessorials: z.array(z.string()).default([]),
  createdAt: z.string().datetime().optional(),
});
export type RawShipment = z.infer<typeof RawShipmentSchema>;

export const DataIssueSeveritySchema = z.enum(['warning', 'blocking']);
export type DataIssueSeverity = z.infer<typeof DataIssueSeveritySchema>;

export const DataIssueSchema = z.object({
  code: z.enum([
    'MISSING_ADDRESS',
    'MISSING_DESCRIPTION',
    'ZERO_PALLETS',
    'ZERO_WEIGHT',
    'INVALID_ZIP',
    'DUPLICATE_OF',
    'UNGEOCODABLE',
    'OVERSIZED',
  ]),
  severity: DataIssueSeveritySchema,
  field: z.string().optional(),
  message: z.string(),
  context: z.record(z.unknown()).optional(),
});
export type DataIssue = z.infer<typeof DataIssueSchema>;

export const ShipmentSchema = z.object({
  id: z.string(),
  origin: AddressSchema,
  destination: AddressSchema,
  palletCount: z.number().int().nonnegative(),
  weightLbs: z.number().nonnegative(),
  description: z.string(),
  status: ShipmentStatusSchema,
  accessorials: z.array(AccessorialSchema),
  vehicleId: z.string().nullable(),
  dataIssues: z.array(DataIssueSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Shipment = z.infer<typeof ShipmentSchema>;

export const UpdateStatusSchema = z.object({
  to: ShipmentStatusSchema,
});

/* ============================================================================
 * Vehicle
 * ==========================================================================*/

export const VehicleTypeSchema = z.enum(VEHICLE_TYPES);

export const VehicleSchema = z.object({
  id: z.string(),
  type: VehicleTypeSchema,
  maxPallets: z.number().int().positive(),
  maxWeightLbs: z.number().positive(),
});
export type Vehicle = z.infer<typeof VehicleSchema>;

export const VehicleWithLoadSchema = VehicleSchema.extend({
  assignedShipmentIds: z.array(z.string()),
  loadPallets: z.number().int().nonnegative(),
  loadWeightLbs: z.number().nonnegative(),
  remainingPallets: z.number().int(),
  remainingWeightLbs: z.number(),
});
export type VehicleWithLoad = z.infer<typeof VehicleWithLoadSchema>;

/* ============================================================================
 * Assignment
 * ==========================================================================*/

export const AssignmentRequestSchema = z.object({
  vehicleId: z.string(),
  shipmentIds: z.array(z.string()).min(1, 'at least one shipment required'),
});
export type AssignmentRequest = z.infer<typeof AssignmentRequestSchema>;

/* ============================================================================
 * Routing
 * ==========================================================================*/

export const RouteStopSchema = z.object({
  /** Stop sequence number (0-indexed; depot is implicit at start/end). */
  order: z.number().int().nonnegative(),
  /** Whether this stop is a pickup or delivery. */
  kind: z.enum(['pickup', 'delivery']),
  shipmentId: z.string(),
  address: AddressSchema,
  lat: z.number(),
  lng: z.number(),
  /** Estimated arrival in HH:MM. */
  etaArrival: z.string(),
  /** Estimated departure (after service time) in HH:MM. */
  etaDeparture: z.string(),
  /** Window status. ok=inside window, tight=within 15min of close, violated=outside. */
  windowStatus: z.enum(['ok', 'tight', 'violated']),
});
export type RouteStop = z.infer<typeof RouteStopSchema>;

export const RouteScoreSchema = z.object({
  totalDistanceMi: z.number(),
  totalDurationMin: z.number(),
  windowViolations: z.number().int().nonnegative(),
  windowViolationMinutes: z.number().nonnegative(),
  hazmatAdjacentPairs: z.number().int().nonnegative(),
  /** Weighted score (lower is better). */
  score: z.number(),
});
export type RouteScore = z.infer<typeof RouteScoreSchema>;

export const RouteSchema = z.object({
  vehicleId: z.string(),
  computedAt: z.string(),
  stops: z.array(RouteStopSchema),
  score: RouteScoreSchema,
  /** Shipments that couldn't be inserted feasibly (e.g. ungeocodable). */
  unroutableShipmentIds: z.array(z.string()),
});
export type Route = z.infer<typeof RouteSchema>;

/* ============================================================================
 * Depot & Geocoding
 * ==========================================================================*/

export const DepotSchema = z.object({
  name: z.string(),
  address1: z.string(),
  city: z.string(),
  state: z.string(),
  zipCode: z.string(),
  latitude: z.number(),
  longitude: z.number(),
});
export type Depot = z.infer<typeof DepotSchema>;

export const GeocodeResultSchema = z.object({
  key: z.string(),
  lat: z.number(),
  lng: z.number(),
  source: z.enum(['nominatim', 'manual', 'depot']),
});
export type GeocodeResult = z.infer<typeof GeocodeResultSchema>;
