import { describe, expect, it } from 'vitest';
import { COST_ESTIMATES, VEHICLE_MPG, type Route } from '@oway/shared';
import { estimateRouteCost } from './cost';

function route(stopCount: number, miles: number): Pick<Route, 'stops' | 'score'> {
  return {
    stops: Array.from({ length: stopCount }, (_, i) => ({
      order: i,
      kind: i % 2 === 0 ? ('pickup' as const) : ('delivery' as const),
      shipmentId: `S${i}`,
      address: {
        name: '',
        address1: '',
        city: '',
        state: 'CA',
        zipCode: '90000',
        contactPerson: '',
        phoneNumber: '',
        openTime: '06:00',
        closeTime: '20:00',
      },
      lat: 0,
      lng: 0,
      etaArrival: '06:00',
      etaDeparture: '06:20',
      windowStatus: 'ok' as const,
    })),
    score: {
      totalDistanceMi: miles,
      totalDurationMin: 0,
      windowViolations: 0,
      windowViolationMinutes: 0,
      hazmatAdjacentPairs: 0,
      score: 0,
    },
  };
}

describe('estimateRouteCost', () => {
  it('returns zero on an empty route', () => {
    const c = estimateRouteCost(route(0, 0), 'dry_van');
    expect(c.total).toBe(0);
    expect(c.stopFees).toBe(0);
    expect(c.distanceCost).toBe(0);
    expect(c.fuelCost).toBe(0);
    expect(c.gallonsUsed).toBe(0);
    expect(c.mpgUsed).toBe(VEHICLE_MPG.dry_van);
  });

  it('computes a known-value breakdown for a dry_van', () => {
    // 2 stops, 30 mi. dry_van mpg = 6.
    // stopFees  = 2 × 75         = 150
    // distance  = 30 × 3.53      = 105.90
    // fuel      = (30 / 6) × 6   = 30
    // total                      = 285.90
    const c = estimateRouteCost(route(2, 30), 'dry_van');
    expect(c.stopFees).toBe(150);
    expect(c.distanceCost).toBeCloseTo(105.9, 5);
    expect(c.gallonsUsed).toBeCloseTo(5, 5);
    expect(c.fuelCost).toBeCloseTo(30, 5);
    expect(c.total).toBeCloseTo(285.9, 5);
    expect(c.mpgUsed).toBe(6);
  });

  it('computes a known-value breakdown for a box_truck (higher mpg)', () => {
    // 4 stops, 50 mi. box_truck mpg = 10.
    // stopFees  = 4 × 75          = 300
    // distance  = 50 × 3.53       = 176.50
    // fuel      = (50 / 10) × 6   = 30
    // total                       = 506.50
    const c = estimateRouteCost(route(4, 50), 'box_truck');
    expect(c.stopFees).toBe(300);
    expect(c.distanceCost).toBeCloseTo(176.5, 5);
    expect(c.gallonsUsed).toBeCloseTo(5, 5);
    expect(c.fuelCost).toBeCloseTo(30, 5);
    expect(c.total).toBeCloseTo(506.5, 5);
    expect(c.mpgUsed).toBe(10);
  });

  it('total equals the sum of its parts (float stability)', () => {
    const c = estimateRouteCost(route(6, 127.4), 'box_truck');
    expect(c.total).toBeCloseTo(c.stopFees + c.distanceCost + c.fuelCost, 10);
  });

  it('box_truck is cheaper than dry_van per mile on fuel (sanity check on mpg mapping)', () => {
    const vanOnSame = estimateRouteCost(route(0, 100), 'dry_van').fuelCost;
    const truckOnSame = estimateRouteCost(route(0, 100), 'box_truck').fuelCost;
    expect(truckOnSame).toBeLessThan(vanOnSame);
  });

  it('uses constants from the shared package (no hardcoded magic numbers)', () => {
    // Guards against someone silently changing rates — the test pins formula,
    // not numeric literals, so updates to COST_ESTIMATES flow through.
    const stops = 3;
    const miles = 40;
    const c = estimateRouteCost(route(stops, miles), 'dry_van');
    expect(c.stopFees).toBe(stops * COST_ESTIMATES.stopFee);
    expect(c.distanceCost).toBeCloseTo(miles * COST_ESTIMATES.perMileRate, 10);
    expect(c.fuelCost).toBeCloseTo(
      (miles / VEHICLE_MPG.dry_van) * COST_ESTIMATES.fuelPricePerGallon,
      10,
    );
  });
});
