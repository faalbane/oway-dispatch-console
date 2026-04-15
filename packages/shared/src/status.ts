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
