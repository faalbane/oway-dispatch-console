'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AlertTriangle, AlertCircle, ArrowRight, FileWarning, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Pill } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, ApiClientError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useDispatch } from '@/state/dispatch-store';
import { LinkifyShipments } from './linkify-shipments';
import type { DataIssue } from '@oway/shared';

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
  const { openShipmentDetail, openShipmentEditor } = useDispatch();
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

  const editShipment = (shipmentId: string) => {
    openShipmentEditor(shipmentId);
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
                      <QuickActions issue={issue} jumpTo={jumpTo} editShipment={editShipment} onClose={() => onOpenChange(false)} />
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

/**
 * Targeted action buttons per issue type. The right action depends on the
 * code: for DUPLICATE_OF, jump to the original or cancel this duplicate.
 * For unfixable blocking issues (missing required fields, oversized), offer
 * a one-click cancel since the shipment can't be assigned otherwise.
 */
function QuickActions({
  issue,
  jumpTo,
  editShipment,
  onClose,
}: {
  issue: DataIssue & { shipmentId: string };
  jumpTo: (id: string) => void;
  editShipment: (id: string) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const cancelMutation = useMutation({
    mutationFn: () => api.overrideStatus(issue.shipmentId, 'CANCELLED'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['data-issues'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['route'] });
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.body.error.message : String(e)),
  });

  const dismissMutation = useMutation({
    mutationFn: () => api.dismissIssue(issue.shipmentId, issue.code, issue.context),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-issues'] });
      queryClient.invalidateQueries({ queryKey: ['shipment', issue.shipmentId] });
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.body.error.message : String(e)),
  });

  const duplicateOfId = (issue.context?.duplicateOf as string | undefined) ?? null;

  const buttons: React.ReactNode[] = [];

  if (issue.code === 'DUPLICATE_OF' && duplicateOfId) {
    buttons.push(
      <Button key="orig" variant="secondary" size="sm" onClick={() => { onClose(); jumpTo(duplicateOfId); }}>
        View original ({duplicateOfId})
      </Button>,
    );
    buttons.push(
      <Button key="dismiss" variant="ghost" size="sm" onClick={() => dismissMutation.mutate()} disabled={dismissMutation.isPending}>
        {dismissMutation.isPending && <Loader2 size={11} className="animate-spin" />}
        Mark intentional
      </Button>,
    );
    buttons.push(
      <Button key="cancel" variant="danger-outline" size="sm" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
        {cancelMutation.isPending && <Loader2 size={11} className="animate-spin" />}
        Cancel this duplicate
      </Button>,
    );
  } else if (issue.code === 'MISSING_ADDRESS' || issue.code === 'INVALID_ZIP' || issue.code === 'UNGEOCODABLE') {
    buttons.push(
      <Button key="edit" variant="secondary" size="sm" onClick={() => editShipment(issue.shipmentId)}>
        Edit address
      </Button>,
    );
    buttons.push(
      <Button key="cancel" variant="danger-outline" size="sm" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
        {cancelMutation.isPending && <Loader2 size={11} className="animate-spin" />}
        Cancel shipment
      </Button>,
    );
  } else if (issue.code === 'ZERO_PALLETS' || issue.code === 'ZERO_WEIGHT' || issue.code === 'OVERSIZED' || issue.code === 'MISSING_DESCRIPTION') {
    buttons.push(
      <Button key="edit" variant="secondary" size="sm" onClick={() => editShipment(issue.shipmentId)}>
        Edit shipment
      </Button>,
    );
    if (issue.severity === 'blocking') {
      buttons.push(
        <Button key="cancel" variant="danger-outline" size="sm" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
          {cancelMutation.isPending && <Loader2 size={11} className="animate-spin" />}
          Cancel shipment
        </Button>,
      );
    }
  }

  if (buttons.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {buttons}
      {error && <span className="text-[11px] text-red-600 ml-1">{error}</span>}
    </div>
  );
}
