import { describe, expect, it } from 'vitest';
import { canTransition, isTerminal, nextStatuses } from '@oway/shared';

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
