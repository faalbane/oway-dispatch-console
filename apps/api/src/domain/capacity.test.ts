import { describe, expect, it } from 'vitest';
import { validateCapacity } from './capacity';

const snapshot = (currentPallets = 0, currentWeightLbs = 0) => ({
  vehicleId: 'VH001',
  maxPallets: 12,
  maxWeightLbs: 15000,
  currentPallets,
  currentWeightLbs,
});

const ship = (id: string, palletCount: number, weightLbs: number) => ({ id, palletCount, weightLbs });

describe('validateCapacity', () => {
  it('accepts an empty assignment', () => {
    const r = validateCapacity(snapshot(), []);
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
    expect(r.projectedPallets).toBe(0);
    expect(r.projectedWeightLbs).toBe(0);
  });

  it('accepts an assignment that exactly fills capacity', () => {
    const r = validateCapacity(snapshot(), [ship('A', 12, 15000)]);
    expect(r.ok).toBe(true);
    expect(r.remainingPallets).toBe(0);
    expect(r.remainingWeightLbs).toBe(0);
  });

  it('rejects when pallets overflow by 1', () => {
    const r = validateCapacity(snapshot(), [ship('A', 13, 1000)]);
    expect(r.ok).toBe(false);
    expect(r.violations).toContainEqual({
      constraint: 'pallets',
      over: 1,
      limit: 12,
      projected: 13,
    });
    expect(r.violations.find((v) => v.constraint === 'weight')).toBeUndefined();
  });

  it('rejects when weight overflows but pallets are fine', () => {
    const r = validateCapacity(snapshot(), [ship('A', 5, 16000)]);
    expect(r.ok).toBe(false);
    expect(r.violations).toContainEqual({
      constraint: 'weight',
      over: 1000,
      limit: 15000,
      projected: 16000,
    });
  });

  it('reports both violations when both overflow (SHP015 case on VH001)', () => {
    // SHP015: 14 pallets / 18,200 lbs into VH001 (12 / 15000)
    const r = validateCapacity(snapshot(), [ship('SHP015', 14, 18200)]);
    expect(r.ok).toBe(false);
    expect(r.violations).toHaveLength(2);
    expect(r.violations.find((v) => v.constraint === 'pallets')?.over).toBe(2);
    expect(r.violations.find((v) => v.constraint === 'weight')?.over).toBe(3200);
  });

  it('correctly accumulates additions on top of current load', () => {
    const r = validateCapacity(snapshot(8, 10000), [ship('A', 3, 4000), ship('B', 1, 500)]);
    expect(r.ok).toBe(true);
    expect(r.projectedPallets).toBe(12);
    expect(r.projectedWeightLbs).toBe(14500);
    expect(r.remainingPallets).toBe(0);
    expect(r.remainingWeightLbs).toBe(500);
  });

  it('returns negative remaining when over capacity', () => {
    const r = validateCapacity(snapshot(10, 12000), [ship('A', 5, 5000)]);
    expect(r.ok).toBe(false);
    expect(r.remainingPallets).toBe(-3);
    expect(r.remainingWeightLbs).toBe(-2000);
  });
});
