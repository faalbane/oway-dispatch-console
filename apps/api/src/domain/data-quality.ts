/**
 * Data-quality validation. Runs at seed time and on every shipment create.
 *
 * Returns a list of DataIssue objects. The point isn't to silently filter bad
 * rows — it's to surface problems visibly so ops can fix them. Severity
 * `blocking` prevents assignment until resolved.
 */

import type { DataIssue, RawShipment } from '@oway/shared';
import { addressKey } from '../lib/address-key.js';

export interface DataQualityContext {
  /** All shipments in the seed (used for duplicate detection). */
  allShipments: RawShipment[];
  /** Geocode lookup: address key → has-coordinates? */
  geocoded: Map<string, boolean>;
  /** Vehicle capacities — used to flag oversized shipments. */
  vehicleCapacities: { maxPallets: number; maxWeightLbs: number }[];
}

export function validateShipment(s: RawShipment, ctx: DataQualityContext): DataIssue[] {
  const issues: DataIssue[] = [];

  // Empty address
  if (!s.origin.address1) {
    issues.push({
      code: 'MISSING_ADDRESS',
      severity: 'blocking',
      field: 'origin.address1',
      message: 'Origin address is empty',
    });
  }
  if (!s.destination.address1) {
    issues.push({
      code: 'MISSING_ADDRESS',
      severity: 'blocking',
      field: 'destination.address1',
      message: 'Destination address is empty',
    });
  }

  // Missing description
  if (!s.description.trim()) {
    issues.push({
      code: 'MISSING_DESCRIPTION',
      severity: 'warning',
      field: 'description',
      message: 'Description is empty',
    });
  }

  // Zero pallets / weight
  if (s.palletCount <= 0) {
    issues.push({
      code: 'ZERO_PALLETS',
      severity: 'blocking',
      field: 'palletCount',
      message: `palletCount is ${s.palletCount}; must be > 0`,
    });
  }
  if (s.weightLbs <= 0) {
    issues.push({
      code: 'ZERO_WEIGHT',
      severity: 'blocking',
      field: 'weightLbs',
      message: `weightLbs is ${s.weightLbs}; must be > 0`,
    });
  }

  // Invalid zip
  for (const [side, addr] of [
    ['origin', s.origin],
    ['destination', s.destination],
  ] as const) {
    if (addr.zipCode === '00000') {
      issues.push({
        code: 'INVALID_ZIP',
        severity: 'blocking',
        field: `${side}.zipCode`,
        message: `${side} zip 00000 is invalid`,
      });
    }
    if (addr.city.toLowerCase() === 'nowhere') {
      issues.push({
        code: 'INVALID_ZIP',
        severity: 'blocking',
        field: `${side}.city`,
        message: `${side} city "Nowhere" looks like placeholder data`,
      });
    }
  }

  // Ungeocodable
  for (const [side, addr] of [
    ['origin', s.origin],
    ['destination', s.destination],
  ] as const) {
    const k = addressKey(addr);
    if (addr.address1 && ctx.geocoded.has(k) && !ctx.geocoded.get(k)) {
      issues.push({
        code: 'UNGEOCODABLE',
        severity: 'blocking',
        field: `${side}.address1`,
        message: `${side} address could not be geocoded; route generation will skip this shipment`,
      });
    }
  }

  // Duplicate detection: same origin/dest/pallets/weight/description as another shipment
  const sig = duplicateSignature(s);
  const other = ctx.allShipments.find((x) => x.id !== s.id && duplicateSignature(x) === sig);
  if (other) {
    issues.push({
      code: 'DUPLICATE_OF',
      severity: 'warning',
      message: `Looks like a duplicate of ${other.id}`,
      context: { duplicateOf: other.id },
    });
  }

  // Oversized: doesn't fit in any vehicle
  const fitsAny = ctx.vehicleCapacities.some(
    (v) => s.palletCount <= v.maxPallets && s.weightLbs <= v.maxWeightLbs,
  );
  if (!fitsAny && s.palletCount > 0 && s.weightLbs > 0) {
    issues.push({
      code: 'OVERSIZED',
      severity: 'blocking',
      message: `No vehicle has capacity for ${s.palletCount} pallets / ${s.weightLbs} lbs`,
    });
  }

  return issues;
}

function duplicateSignature(s: RawShipment): string {
  return [
    s.origin.address1,
    s.origin.zipCode,
    s.destination.address1,
    s.destination.zipCode,
    s.palletCount,
    s.weightLbs,
    s.description,
  ]
    .join('|')
    .toLowerCase();
}

export function isBlocking(issues: DataIssue[]): boolean {
  return issues.some((i) => i.severity === 'blocking');
}
