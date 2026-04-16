'use client';

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DispatchProvider, useDispatch } from '@/state/dispatch-store';
import { TopBar } from '@/components/dashboard/top-bar';
import { VehicleRail } from '@/components/dashboard/vehicle-rail';
import { ShipmentTable } from '@/components/dashboard/shipment-table';
import { ContextPanel } from '@/components/dashboard/context-panel';
import { NewShipmentDialog } from '@/components/dashboard/new-shipment-dialog';
import { api } from '@/lib/api';

export default function Page() {
  return (
    <DispatchProvider>
      <Dashboard />
    </DispatchProvider>
  );
}

function Dashboard() {
  const { selectedShipmentIds, detailShipmentId, openShipmentDetail, editingShipmentId, openShipmentEditor } = useDispatch();
  const { data: editingShipment } = useQuery({
    queryKey: ['shipment', editingShipmentId],
    queryFn: () => api.getShipment(editingShipmentId!),
    enabled: !!editingShipmentId,
  });

  // Checking boxes = entering assignment mode — clear detail so
  // the assignment form surfaces immediately.
  useEffect(() => {
    if (selectedShipmentIds.size > 0 && detailShipmentId) openShipmentDetail(null);
  }, [selectedShipmentIds, detailShipmentId, openShipmentDetail]);

  const { data: allShipments } = useQuery({
    queryKey: ['shipments', { __all: true }],
    queryFn: () => api.listShipments(),
    refetchInterval: 5_000,
  });

  const selectedShipments = useMemo(() => {
    if (!allShipments) return [];
    return allShipments.filter((s) => selectedShipmentIds.has(s.id));
  }, [allShipments, selectedShipmentIds]);

  return (
    <div className="h-screen flex flex-col bg-surface-subtle">
      <TopBar />
      <main className="flex-1 flex min-h-0">
        <VehicleRail selectedShipments={selectedShipments} />
        <ShipmentTable onSelectShipment={openShipmentDetail} />
        <aside className="w-[480px] shrink-0 border-l border-line bg-white h-full">
          <ContextPanel
            selectedShipments={selectedShipments}
            detailShipmentId={detailShipmentId}
            onCloseDetail={() => openShipmentDetail(null)}
          />
        </aside>
      </main>
      {/* Edit dialog opened from data-issues quick actions, detail panel, etc. */}
      <NewShipmentDialog
        open={!!editingShipmentId && !!editingShipment}
        onOpenChange={(o) => { if (!o) openShipmentEditor(null); }}
        editing={editingShipment ?? null}
      />
    </div>
  );
}
