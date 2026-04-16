import type { DataIssue } from '@oway/shared';
import { prisma } from '../db.js';
import { ApiError } from '../lib/api-error.js';

export interface ShipmentDataIssue {
  shipmentId: string;
  issues: DataIssue[];
}

interface DismissedRecord {
  code: string;
  /** Optional context value that scopes the dismissal — e.g. duplicateOf=SHP002. */
  contextHash?: string;
}

function isDismissed(issue: DataIssue, dismissed: DismissedRecord[]): boolean {
  return dismissed.some(
    (d) =>
      d.code === issue.code &&
      (!d.contextHash || d.contextHash === stringifyContext(issue.context)),
  );
}

function stringifyContext(ctx?: Record<string, unknown>): string {
  if (!ctx) return '';
  // Stable key order for hash equality
  return Object.keys(ctx).sort().map((k) => `${k}=${ctx[k]}`).join('|');
}

export async function listAllDataIssues(): Promise<ShipmentDataIssue[]> {
  const rows = await prisma.shipment.findMany({
    select: { id: true, dataIssues: true, dismissedIssues: true },
  });
  return rows
    .map((r) => {
      const all = JSON.parse(r.dataIssues) as DataIssue[];
      const dismissed = JSON.parse(r.dismissedIssues) as DismissedRecord[];
      const visible = all.filter((i) => !isDismissed(i, dismissed));
      return { shipmentId: r.id, issues: visible };
    })
    .filter((r) => r.issues.length > 0);
}

export async function dismissIssue(
  shipmentId: string,
  code: string,
  context?: Record<string, unknown>,
): Promise<void> {
  const row = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: { dismissedIssues: true },
  });
  if (!row) throw new ApiError(404, 'NOT_FOUND', `Shipment ${shipmentId} not found`);

  const dismissed = JSON.parse(row.dismissedIssues) as DismissedRecord[];
  const contextHash = stringifyContext(context);
  const exists = dismissed.some((d) => d.code === code && d.contextHash === contextHash);
  if (!exists) {
    dismissed.push({ code, contextHash });
    await prisma.shipment.update({
      where: { id: shipmentId },
      data: { dismissedIssues: JSON.stringify(dismissed) },
    });
  }
}
