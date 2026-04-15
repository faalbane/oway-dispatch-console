/**
 * Structured API error envelope. Every non-2xx response uses this shape.
 */
export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'INVALID_STATUS_TRANSITION'
  | 'CAPACITY_EXCEEDED'
  | 'SHIPMENT_BLOCKED'
  | 'ALREADY_ASSIGNED'
  | 'GEOCODING_FAILED'
  | 'ROUTE_INFEASIBLE'
  | 'INTERNAL_ERROR';

export interface ApiErrorEnvelope {
  error: ApiError;
}
