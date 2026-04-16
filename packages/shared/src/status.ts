import type { ShipmentStatus } from './constants';

/**
 * Shipment status state machine.
 *
 * INITIALIZED → ASSIGNED → PICKED_UP → DELIVERED
 * {INITIALIZED, ASSIGNED, PICKED_UP} → CANCELLED   (pre-delivery only)
 *
 * DELIVERED and CANCELLED are terminal.
 */
const TRANSITIONS: Record<ShipmentStatus, ReadonlySet<ShipmentStatus>> = {
  INITIALIZED: new Set(['ASSIGNED', 'CANCELLED']),
  ASSIGNED: new Set(['PICKED_UP', 'CANCELLED']),
  PICKED_UP: new Set(['DELIVERED', 'CANCELLED']),
  DELIVERED: new Set(),
  CANCELLED: new Set(),
};

export function canTransition(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return TRANSITIONS[from].has(to);
}

export function nextStatuses(from: ShipmentStatus): ShipmentStatus[] {
  return Array.from(TRANSITIONS[from]);
}

export function isTerminal(status: ShipmentStatus): boolean {
  return TRANSITIONS[status].size === 0;
}

/**
 * A shipment is "actively assigned" to a vehicle when it's ASSIGNED (not yet
 * picked up) or PICKED_UP (in transit). DELIVERED and CANCELLED shipments are
 * no longer occupying vehicle capacity — their `vehicleId` FK remains set for
 * audit ("which vehicle delivered this?"), but they should not count toward
 * current load or appear in future route planning.
 */
export function isActiveAssignment(status: ShipmentStatus): boolean {
  return status === 'ASSIGNED' || status === 'PICKED_UP';
}
