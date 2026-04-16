'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DispatchProvider, useDispatch } from '@/state/dispatch-store';
import { TopBar } from '@/components/dashboard/top-bar';
import { VehicleRail } from '@/components/dashboard/vehicle-rail';
import { ShipmentTable } from '@/components/dashboard/shipment-table';
import { ContextPanel } from '@/components/dashboard/context-panel';
import { api } from '@/lib/api';

export default function Page() {
  return (
    <DispatchProvider>
      <Dashboard />
    </DispatchProvider>
  );
}

function Dashboard() {
  const { selectedShipmentIds, focusedVehicleId, focusVehicle } = useDispatch();
  const [detailId, setDetailId] = useState<string | null>(null);

  // Last-click-wins: clicking a shipment row clears vehicle focus;
  // clicking a vehicle clears shipment detail.
  const handleSelectShipment = useCallback(
    (id: string) => {
      setDetailId(id);
      focusVehicle(null);
    },
    [focusVehicle],
  );

  // Vehicle click clears shipment detail
  useEffect(() => {
    if (focusedVehicleId) setDetailId(null);
  }, [focusedVehicleId]);

  // Checking boxes = entering assignment mode — clear detail so
  // the assignment form surfaces immediately.
  useEffect(() => {
    if (selectedShipmentIds.size > 0) setDetailId(null);
  }, [selectedShipmentIds]);

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
        <ShipmentTable onSelectShipment={handleSelectShipment} />
        <aside className="w-[480px] shrink-0 border-l border-line bg-white h-full">
          <ContextPanel
            selectedShipments={selectedShipments}
            detailShipmentId={detailId}
            onCloseDetail={() => setDetailId(null)}
          />
        </aside>
      </main>
    </div>
  );
}
