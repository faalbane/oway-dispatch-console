import { describe, expect, it } from 'vitest';
import { isBlocking, validateShipment } from './data-quality';
import type { RawShipment } from '@oway/shared';

const baseAddress = {
  name: 'Test',
  address1: '1 Main St',
  city: 'Los Angeles',
  state: 'CA',
  zipCode: '90001',
  contactPerson: 'Test',
  phoneNumber: '+10000000000',
  openTime: '08:00',
  closeTime: '17:00',
};

const baseShip = (overrides: Partial<RawShipment> = {}): RawShipment => ({
  id: 'SHP_TEST',
  origin: { ...baseAddress },
  destination: { ...baseAddress, zipCode: '90002' },
  palletCount: 5,
  weightLbs: 1000,
  description: 'Test',
  status: 'INITIALIZED',
  accessorials: [],
  ...overrides,
});

const ctx = (overrides: Parameters<typeof validateShipment>[1] | Partial<Parameters<typeof validateShipment>[1]> = {}) => ({
  allShipments: [],
  geocoded: new Map([
    ['1 main st|los angeles|ca|90001', true],
    ['1 main st|los angeles|ca|90002', true],
  ]),
  vehicleCapacities: [{ maxPallets: 18, maxWeightLbs: 24000 }],
  ...overrides,
});

describe('validateShipment', () => {
  it('clean shipment produces no issues', () => {
    const issues = validateShipment(baseShip(), ctx());
    expect(issues).toEqual([]);
    expect(isBlocking(issues)).toBe(false);
  });

  it('detects empty origin address', () => {
    const issues = validateShipment(
      baseShip({ origin: { ...baseAddress, address1: '' } }),
      ctx(),
    );
    expect(issues).toContainEqual(expect.objectContaining({ code: 'MISSING_ADDRESS', severity: 'blocking' }));
    expect(isBlocking(issues)).toBe(true);
  });

  it('detects zero pallets and zero weight as blocking', () => {
    const issues = validateShipment(baseShip({ palletCount: 0, weightLbs: 0 }), ctx());
    expect(issues.some((i) => i.code === 'ZERO_PALLETS' && i.severity === 'blocking')).toBe(true);
    expect(issues.some((i) => i.code === 'ZERO_WEIGHT' && i.severity === 'blocking')).toBe(true);
  });

  it('detects invalid zip 00000 (SHP035 case)', () => {
    const issues = validateShipment(
      baseShip({ destination: { ...baseAddress, zipCode: '00000' } }),
      ctx(),
    );
    expect(issues.some((i) => i.code === 'INVALID_ZIP' && i.field === 'destination.zipCode')).toBe(true);
  });

  it('detects "Nowhere" placeholder city', () => {
    const issues = validateShipment(
      baseShip({ destination: { ...baseAddress, city: 'Nowhere' } }),
      ctx(),
    );
    expect(issues.some((i) => i.code === 'INVALID_ZIP' && i.field === 'destination.city')).toBe(true);
  });

  it('detects ungeocodable destinations', () => {
    const issues = validateShipment(
      baseShip(),
      ctx({
        allShipments: [],
        geocoded: new Map([
          ['1 main st|los angeles|ca|90001', true],
          ['1 main st|los angeles|ca|90002', false],
        ]),
        vehicleCapacities: [{ maxPallets: 18, maxWeightLbs: 24000 }],
      }),
    );
    expect(issues.some((i) => i.code === 'UNGEOCODABLE')).toBe(true);
  });

  it('detects duplicates by content signature (SHP002 vs SHP031)', () => {
    const a = baseShip({ id: 'SHP002' });
    const b = baseShip({ id: 'SHP031' }); // identical content, different id
    const issues = validateShipment(b, ctx({
      allShipments: [a, b],
      geocoded: new Map([['1 main st|los angeles|ca|90001', true], ['1 main st|los angeles|ca|90002', true]]),
      vehicleCapacities: [{ maxPallets: 18, maxWeightLbs: 24000 }],
    }));
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'DUPLICATE_OF', severity: 'warning' }),
    );
  });

  it('detects oversized shipments that fit no vehicle', () => {
    const issues = validateShipment(
      baseShip({ palletCount: 25, weightLbs: 30000 }),
      ctx({
        allShipments: [],
        geocoded: new Map([
          ['1 main st|los angeles|ca|90001', true],
          ['1 main st|los angeles|ca|90002', true],
        ]),
        vehicleCapacities: [{ maxPallets: 18, maxWeightLbs: 24000 }],
      }),
    );
    expect(issues.some((i) => i.code === 'OVERSIZED' && i.severity === 'blocking')).toBe(true);
  });
});
