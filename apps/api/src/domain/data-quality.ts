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

  // Duplicate detection: same origin/dest/pallets/weight/description as another
  // shipment. We *always* flag content-equal duplicates so ops can confirm —
  // some are accidental, some are real recurring orders, and the system can't
  // tell which without ops input. Timestamp delta helps ops decide:
  //   - within 60 min → likely accidental double-entry
  //   - hours/days apart → probably intentional (recurring order, split haul)
  const sig = duplicateSignature(s);
  const other = ctx.allShipments.find((x) => x.id !== s.id && duplicateSignature(x) === sig);
  if (other) {
    const minutesApart = timestampDeltaMinutes(s.createdAt, other.createdAt);
    const likelyAccidental = minutesApart !== null && minutesApart <= 60;
    const message = likelyAccidental
      ? `Identical content to ${other.id}, created ${minutesApart} min apart — likely accidental double-entry`
      : minutesApart !== null
        ? `Identical content to ${other.id} (created ${describeDelta(minutesApart)} apart) — confirm if intentional`
        : `Identical content to ${other.id} — confirm if intentional`;
    issues.push({
      code: 'DUPLICATE_OF',
      severity: likelyAccidental ? 'warning' : 'warning', // both warnings; phrasing differentiates
      message,
      context: { duplicateOf: other.id, minutesApart, likelyAccidental },
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

function timestampDeltaMinutes(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (isNaN(da) || isNaN(db)) return null;
  return Math.abs(Math.round((da - db) / 60_000));
}

function describeDelta(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / (60 * 24))}d`;
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
