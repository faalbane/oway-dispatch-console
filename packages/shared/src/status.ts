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

/**
 * Revert transitions — explicit overrides for the rare case ops marks a
 * status by mistake. Kept separate from `nextStatuses` so the UI can present
 * them as a distinct "undo" affordance, not a normal forward step.
 *
 *   DELIVERED → PICKED_UP   ("I marked it delivered too early")
 *   CANCELLED → INITIALIZED ("I cancelled it by mistake")
 *
 * No revert from PICKED_UP — there's no "un-pickup" gesture in real ops; the
 * truck either has it or doesn't. PICKED_UP can still be CANCELLED forward.
 */
export function revertStatus(from: ShipmentStatus): ShipmentStatus | null {
  if (from === 'DELIVERED') return 'PICKED_UP';
  if (from === 'CANCELLED') return 'INITIALIZED';
  return null;
}
