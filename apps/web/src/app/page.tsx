'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DispatchProvider, useDispatch } from '@/state/dispatch-store';
import { TopBar } from '@/components/dashboard/top-bar';
import { VehicleRail } from '@/components/dashboard/vehicle-rail';
import { ShipmentTable } from '@/components/dashboard/shipment-table';
import { ContextPanel } from '@/components/dashboard/context-panel';
import { ShipmentDetailDrawer } from '@/components/dashboard/shipment-detail-drawer';
import { api } from '@/lib/api';

export default function Page() {
  return (
    <DispatchProvider>
      <Dashboard />
    </DispatchProvider>
  );
}

function Dashboard() {
  const { selectedShipmentIds } = useDispatch();
  const [detailId, setDetailId] = useState<string | null>(null);

  // Pull all shipments once so the rail/context can resolve selections without
  // refetching per-id (we already poll the table). Keep fresh enough for UI.
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
        <ShipmentTable onSelectShipment={setDetailId} />
        <aside className="w-[480px] shrink-0 border-l border-line bg-white h-full">
          <ContextPanel selectedShipments={selectedShipments} />
        </aside>
      </main>
      <ShipmentDetailDrawer shipmentId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
