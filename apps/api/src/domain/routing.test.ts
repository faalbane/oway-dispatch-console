import { describe, expect, it } from 'vitest';
import { generateRoute, type RouteableShipment } from './routing';
import type { Shipment } from '@oway/shared';

// Depot near downtown LA
const depot = { lat: 33.83, lng: -118.235 };

function ship(
  id: string,
  origin: { lat: number; lng: number; openTime?: string; closeTime?: string },
  dest: { lat: number; lng: number; openTime?: string; closeTime?: string },
  opts: Partial<Shipment> = {},
): RouteableShipment {
  const addr = (lat: number, lng: number, openTime = '06:00', closeTime = '20:00') => ({
    name: `addr-${lat}-${lng}`,
    address1: '1 Test St',
    city: 'Test',
    state: 'CA',
    zipCode: '90000',
    contactPerson: '',
    phoneNumber: '',
    openTime,
    closeTime,
  });

  return {
    shipment: {
      id,
      origin: addr(origin.lat, origin.lng, origin.openTime, origin.closeTime),
      destination: addr(dest.lat, dest.lng, dest.openTime, dest.closeTime),
      palletCount: 1,
      weightLbs: 100,
      description: 'test',
      status: 'ASSIGNED',
      accessorials: [],
      vehicleId: 'VH-T',
      dataIssues: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...opts,
    },
    originLatLng: { lat: origin.lat, lng: origin.lng },
    destLatLng: { lat: dest.lat, lng: dest.lng },
  };
}

describe('routing engine', () => {
  it('returns empty route for empty input', () => {
    const r = generateRoute('VH-T', [], { depot });
    expect(r.stops).toEqual([]);
    expect(r.unroutableShipmentIds).toEqual([]);
    expect(r.score.totalDistanceMi).toBe(0);
  });

  it('preserves pickup-before-delivery for every shipment', () => {
    const shipments = [
      ship('A', { lat: 33.9, lng: -118.3 }, { lat: 34.0, lng: -118.1 }),
      ship('B', { lat: 33.85, lng: -118.4 }, { lat: 34.05, lng: -118.2 }),
      ship('C', { lat: 33.7, lng: -118.25 }, { lat: 34.1, lng: -118.0 }),
    ];
    const r = generateRoute('VH-T', shipments, { depot });
    expect(r.stops).toHaveLength(6);

    for (const id of ['A', 'B', 'C']) {
      const pickupIdx = r.stops.findIndex((s) => s.shipmentId === id && s.kind === 'pickup');
      const deliveryIdx = r.stops.findIndex((s) => s.shipmentId === id && s.kind === 'delivery');
      expect(pickupIdx).toBeGreaterThanOrEqual(0);
      expect(deliveryIdx).toBeGreaterThan(pickupIdx);
    }
  });

  it('marks shipments without coordinates as unroutable, not in route', () => {
    const good = ship('A', { lat: 33.9, lng: -118.3 }, { lat: 34.0, lng: -118.1 });
    const bad = ship('BAD', { lat: 0, lng: 0 }, { lat: 0, lng: 0 });
    bad.originLatLng = null;
    bad.destLatLng = null;
    const r = generateRoute('VH-T', [good, bad], { depot });
    expect(r.unroutableShipmentIds).toEqual(['BAD']);
    expect(r.stops.every((s) => s.shipmentId !== 'BAD')).toBe(true);
  });

  it('flags time window violations rather than refusing the stop', () => {
    // Tight delivery window: must arrive by 06:30, but pickup is far away
    const tight = ship(
      'TIGHT',
      { lat: 35.5, lng: -119.0, openTime: '06:00', closeTime: '20:00' }, // far north (Bakersfield-ish)
      { lat: 33.5, lng: -117.5, openTime: '06:00', closeTime: '06:30' }, // far south, tight
    );
    const r = generateRoute('VH-T', [tight], { depot });
    expect(r.stops).toHaveLength(2);
    const delivery = r.stops.find((s) => s.kind === 'delivery')!;
    expect(['violated', 'tight']).toContain(delivery.windowStatus);
    if (delivery.windowStatus === 'violated') {
      expect(r.score.windowViolations).toBeGreaterThan(0);
      expect(r.score.windowViolationMinutes).toBeGreaterThan(0);
    }
  });

  it('produces non-decreasing arrival times respecting the depot departure', () => {
    const shipments = [
      ship('A', { lat: 33.9, lng: -118.3 }, { lat: 34.0, lng: -118.1 }),
      ship('B', { lat: 33.85, lng: -118.4 }, { lat: 34.05, lng: -118.2 }),
    ];
    const r = generateRoute('VH-T', shipments, { depot, departureTime: '06:00' });
    const minutes = r.stops.map((s) => parseInt(s.etaArrival.split(':')[0]!) * 60 + parseInt(s.etaArrival.split(':')[1]!));
    for (let i = 1; i < minutes.length; i++) {
      expect(minutes[i]).toBeGreaterThanOrEqual(minutes[i - 1]!);
    }
    expect(minutes[0]).toBeGreaterThanOrEqual(6 * 60); // first arrival no earlier than departure
  });

  it('computes a positive total distance for non-trivial routes', () => {
    const shipments = [ship('A', { lat: 33.9, lng: -118.3 }, { lat: 34.0, lng: -118.1 })];
    const r = generateRoute('VH-T', shipments, { depot });
    expect(r.score.totalDistanceMi).toBeGreaterThan(0);
    expect(r.score.score).toBeGreaterThan(0);
  });

  it('rewards adjacent hazmat pairs in scoring (clustering bonus)', () => {
    // Two hazmat shipments — generator should prefer ordering where they're adjacent
    const shipments = [
      ship('H1', { lat: 33.9, lng: -118.3 }, { lat: 33.95, lng: -118.25 }, { accessorials: ['hazmat'] }),
      ship('H2', { lat: 33.92, lng: -118.28 }, { lat: 33.97, lng: -118.22 }, { accessorials: ['hazmat'] }),
    ];
    const r = generateRoute('VH-T', shipments, { depot });
    expect(r.score.hazmatAdjacentPairs).toBeGreaterThanOrEqual(1);
  });
});
