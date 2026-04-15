import type { DataIssue } from '@oway/shared';
import { prisma } from '../db.js';

export interface ShipmentDataIssue {
  shipmentId: string;
  issues: DataIssue[];
}

export async function listAllDataIssues(): Promise<ShipmentDataIssue[]> {
  const rows = await prisma.shipment.findMany({
    select: { id: true, dataIssues: true },
  });
  return rows
    .map((r) => ({
      shipmentId: r.id,
      issues: JSON.parse(r.dataIssues) as DataIssue[],
    }))
    .filter((r) => r.issues.length > 0);
}
