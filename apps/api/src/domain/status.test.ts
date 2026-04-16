import { describe, expect, it } from 'vitest';
import { canTransition, isActiveAssignment, isTerminal, nextStatuses } from '@oway/shared';

describe('status state machine', () => {
  it('allows the documented happy path', () => {
    expect(canTransition('INITIALIZED', 'ASSIGNED')).toBe(true);
    expect(canTransition('ASSIGNED', 'PICKED_UP')).toBe(true);
    expect(canTransition('PICKED_UP', 'DELIVERED')).toBe(true);
  });

  it('allows cancel from any pre-delivery state', () => {
    expect(canTransition('INITIALIZED', 'CANCELLED')).toBe(true);
    expect(canTransition('ASSIGNED', 'CANCELLED')).toBe(true);
    expect(canTransition('PICKED_UP', 'CANCELLED')).toBe(true);
  });

  it('blocks backward transitions', () => {
    expect(canTransition('PICKED_UP', 'ASSIGNED')).toBe(false);
    expect(canTransition('DELIVERED', 'PICKED_UP')).toBe(false);
    expect(canTransition('ASSIGNED', 'INITIALIZED')).toBe(false);
  });

  it('blocks transitions out of terminal states', () => {
    expect(canTransition('DELIVERED', 'CANCELLED')).toBe(false);
    expect(canTransition('CANCELLED', 'INITIALIZED')).toBe(false);
    expect(canTransition('CANCELLED', 'ASSIGNED')).toBe(false);
  });

  it('blocks transitions skipping states', () => {
    expect(canTransition('INITIALIZED', 'PICKED_UP')).toBe(false);
    expect(canTransition('INITIALIZED', 'DELIVERED')).toBe(false);
    expect(canTransition('ASSIGNED', 'DELIVERED')).toBe(false);
  });

  it('isTerminal identifies DELIVERED and CANCELLED', () => {
    expect(isTerminal('DELIVERED')).toBe(true);
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('INITIALIZED')).toBe(false);
    expect(isTerminal('ASSIGNED')).toBe(false);
    expect(isTerminal('PICKED_UP')).toBe(false);
  });

  it('nextStatuses returns the allowed transitions', () => {
    expect(new Set(nextStatuses('INITIALIZED'))).toEqual(new Set(['ASSIGNED', 'CANCELLED']));
    expect(new Set(nextStatuses('PICKED_UP'))).toEqual(new Set(['DELIVERED', 'CANCELLED']));
    expect(nextStatuses('DELIVERED')).toEqual([]);
  });
});

describe('isActiveAssignment', () => {
  it('treats ASSIGNED and PICKED_UP as actively consuming capacity', () => {
    expect(isActiveAssignment('ASSIGNED')).toBe(true);
    expect(isActiveAssignment('PICKED_UP')).toBe(true);
  });

  it('treats DELIVERED and CANCELLED as freeing capacity', () => {
    // Regression: before this fix, DELIVERED shipments kept counting toward
    // vehicle load, so a truck that had delivered its full capacity earlier
    // in the day couldn't take new freight.
    expect(isActiveAssignment('DELIVERED')).toBe(false);
    expect(isActiveAssignment('CANCELLED')).toBe(false);
  });

  it('treats INITIALIZED as not-yet-assigned (no vehicle load)', () => {
    expect(isActiveAssignment('INITIALIZED')).toBe(false);
  });
});
