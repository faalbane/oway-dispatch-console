'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge, Pill } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, ApiClientError } from '@/lib/api';
import { fmtAddressFull } from '@/lib/format';
import { nextStatuses, type ShipmentStatus } from '@oway/shared';
import { useState } from 'react';

interface Props {
  shipmentId: string | null;
  onClose: () => void;
}

export function ShipmentDetailDrawer({ shipmentId, onClose }: Props) {
  const queryClient = useQueryClient();
  const { data: shipment } = useQuery({
    queryKey: ['shipment', shipmentId],
    queryFn: () => api.getShipment(shipmentId!),
    enabled: !!shipmentId,
  });
  const [error, setError] = useState<string | null>(null);

  const transitionMutation = useMutation({
    mutationFn: (to: ShipmentStatus) => api.transitionStatus(shipmentId!, to),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment', shipmentId] });
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      setError(null);
    },
    onError: (err) => {
      if (err instanceof ApiClientError) setError(err.body.error.message);
      else setError(String(err));
    },
  });

  return (
    <Dialog open={!!shipmentId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>
                <span className="font-mono">{shipment?.id ?? shipmentId}</span>
              </DialogTitle>
              {shipment && (
                <div className="flex items-center gap-2 mt-1.5">
                  <StatusBadge status={shipment.status} />
                  {shipment.vehicleId && (
                    <span className="text-[11px] text-ink-muted font-mono">→ {shipment.vehicleId}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogHeader>
        {shipment && (
          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            <Section label="Description">
              <div className="text-sm">{shipment.description || <em className="text-ink-subtle">none</em>}</div>
            </Section>
            <div className="grid grid-cols-2 gap-4">
              <Section label="Origin">
                <AddressBlock a={shipment.origin} />
              </Section>
              <Section label="Destination">
                <AddressBlock a={shipment.destination} />
              </Section>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Section label="Pallets">
                <div className="font-mono text-lg">{shipment.palletCount}</div>
              </Section>
              <Section label="Weight">
                <div className="font-mono text-lg">{shipment.weightLbs.toLocaleString()} lbs</div>
              </Section>
              <Section label="Accessorials">
                <div className="flex flex-wrap gap-1 mt-1">
                  {shipment.accessorials.length === 0 ? (
                    <span className="text-xs text-ink-subtle">none</span>
                  ) : (
                    shipment.accessorials.map((a) => (
                      <Pill key={a} tone={a === 'hazmat' ? 'danger' : 'neutral'}>
                        {a}
                      </Pill>
                    ))
                  )}
                </div>
              </Section>
            </div>

            {shipment.dataIssues.length > 0 && (
              <Section label="Data Quality">
                <ul className="space-y-1.5">
                  {shipment.dataIssues.map((i, idx) => (
                    <li key={idx} className="text-xs flex items-start gap-2">
                      <Pill tone={i.severity === 'blocking' ? 'danger' : 'warn'}>{i.severity}</Pill>
                      <span>{i.message}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>
            )}

            <div className="flex items-center gap-2 pt-2 border-t border-line">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-ink-muted mr-2">
                Progress
              </span>
              {nextStatuses(shipment.status).map((to) => (
                <Button
                  key={to}
                  variant={to === 'CANCELLED' ? 'danger' : 'primary'}
                  size="sm"
                  onClick={() => transitionMutation.mutate(to)}
                  disabled={transitionMutation.isPending}
                >
                  {transitionMutation.isPending && <Loader2 size={12} className="animate-spin" />}
                  Mark {to.replace('_', ' ')}
                </Button>
              ))}
              {nextStatuses(shipment.status).length === 0 && (
                <span className="text-xs text-ink-subtle">Terminal status — no further transitions</span>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-muted mb-1">{label}</div>
      {children}
    </div>
  );
}

function AddressBlock({
  a,
}: {
  a: { name: string; address1: string; city: string; state: string; zipCode: string; openTime: string; closeTime: string; contactPerson?: string; phoneNumber?: string };
}) {
  return (
    <div className="text-xs leading-relaxed">
      <div className="font-medium">{a.name}</div>
      <div className="text-ink-muted">{fmtAddressFull(a)}</div>
      {a.contactPerson && <div className="text-ink-subtle">{a.contactPerson}</div>}
      <div className="text-ink-subtle mt-1">
        Window {a.openTime}–{a.closeTime}
      </div>
    </div>
  );
}
