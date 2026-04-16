'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, AlertCircle, ArrowRight, FileWarning } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Pill } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useDispatch } from '@/state/dispatch-store';
import { LinkifyShipments } from './linkify-shipments';

const ICONS = {
  MISSING_ADDRESS: AlertCircle,
  MISSING_DESCRIPTION: FileWarning,
  ZERO_PALLETS: AlertCircle,
  ZERO_WEIGHT: AlertCircle,
  INVALID_ZIP: AlertTriangle,
  DUPLICATE_OF: FileWarning,
  UNGEOCODABLE: AlertTriangle,
  OVERSIZED: AlertCircle,
} as const;

export function DataIssuesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { openShipmentDetail } = useDispatch();
  const { data } = useQuery({
    queryKey: ['data-issues'],
    queryFn: () => api.listDataIssues(),
    enabled: open,
  });

  const all = (data ?? []).flatMap((s) =>
    s.issues.map((i) => ({ shipmentId: s.shipmentId, ...i })),
  );

  const jumpTo = (shipmentId: string) => {
    openShipmentDetail(shipmentId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Data Quality Issues</DialogTitle>
          <DialogDescription>
            Surfaced from validation at seed time and on every shipment create.
            Blocking issues prevent assignment until resolved.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {all.length === 0 ? (
            <div className="p-8 text-center text-sm text-ink-subtle">No data issues detected.</div>
          ) : (
            <ul className="divide-y divide-line">
              {all.map((issue, idx) => {
                const Icon = ICONS[issue.code as keyof typeof ICONS] ?? AlertTriangle;
                return (
                  <li key={idx} className="px-5 py-3 flex items-start gap-3 hover:bg-surface-subtle transition-colors group">
                    <Icon
                      size={16}
                      className={cn(
                        'shrink-0 mt-0.5',
                        issue.severity === 'blocking' ? 'text-red-600' : 'text-amber-600',
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => jumpTo(issue.shipmentId)}
                          className="font-mono text-xs font-semibold text-indigo-700 hover:text-indigo-900 hover:underline underline-offset-2"
                        >
                          {issue.shipmentId}
                        </button>
                        <Pill tone={issue.severity === 'blocking' ? 'danger' : 'warn'}>
                          {issue.severity}
                        </Pill>
                        <Pill tone="neutral">{issue.code.replace(/_/g, ' ').toLowerCase()}</Pill>
                      </div>
                      <div className="text-xs text-ink-muted mt-0.5"><LinkifyShipments text={issue.message} /></div>
                      {issue.field && (
                        <div className="text-[11px] text-ink-subtle mt-0.5 font-mono">
                          field: {issue.field}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => jumpTo(issue.shipmentId)}
                      title={`Jump to ${issue.shipmentId}`}
                      className="shrink-0 mt-1 p-1 rounded text-ink-subtle hover:bg-surface-muted hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ArrowRight size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
