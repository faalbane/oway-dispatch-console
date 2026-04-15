'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, MapPin, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { DataIssuesDialog } from './data-issues-dialog';
import { NewShipmentDialog } from './new-shipment-dialog';

export function TopBar() {
  const { data: depot } = useQuery({ queryKey: ['depot'], queryFn: () => api.getDepot() });
  const { data: issues } = useQuery({
    queryKey: ['data-issues'],
    queryFn: () => api.listDataIssues(),
    refetchInterval: 10_000,
  });
  const [showIssues, setShowIssues] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const blockingCount = (issues ?? []).reduce(
    (sum, x) => sum + x.issues.filter((i) => i.severity === 'blocking').length,
    0,
  );
  const warningCount = (issues ?? []).reduce(
    (sum, x) => sum + x.issues.filter((i) => i.severity === 'warning').length,
    0,
  );

  return (
    <header className="h-14 px-5 border-b border-line bg-white flex items-center justify-between shrink-0">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 grid place-items-center text-white font-bold text-xs">
            O
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">Oway Dispatch</div>
            <div className="text-[10px] text-ink-subtle leading-tight">LA Metro · Live</div>
          </div>
        </div>
        {depot && (
          <div className="hidden md:flex items-center gap-1.5 text-[11px] text-ink-muted">
            <MapPin size={12} />
            <span>Depot:</span>
            <span className="font-medium text-ink">{depot.name}</span>
            <span className="text-ink-subtle">· {depot.city}, {depot.state}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowIssues(true)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-line hover:bg-surface-muted text-xs"
        >
          <AlertTriangle size={12} className={blockingCount > 0 ? 'text-red-600' : warningCount > 0 ? 'text-amber-600' : 'text-ink-subtle'} />
          <span className="font-medium">
            {blockingCount + warningCount === 0
              ? 'No data issues'
              : `${blockingCount} blocking, ${warningCount} warnings`}
          </span>
        </button>
        <Button variant="primary" size="sm" onClick={() => setShowNew(true)}>
          <Plus size={12} /> New shipment
        </Button>
      </div>

      <DataIssuesDialog open={showIssues} onOpenChange={setShowIssues} />
      <NewShipmentDialog open={showNew} onOpenChange={setShowNew} />
    </header>
  );
}
