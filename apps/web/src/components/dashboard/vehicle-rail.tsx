'use client';

import { useQuery } from '@tanstack/react-query';
import { Truck, Box } from 'lucide-react';
import { api } from '@/lib/api';
import { useDispatch } from '@/state/dispatch-store';
import { Card } from '@/components/ui/card';
import { CapacityBar } from '@/components/ui/progress';
import { cn } from '@/lib/cn';
import type { Shipment } from '@oway/shared';

interface Props {
  selectedShipments: Shipment[];
}

export function VehicleRail({ selectedShipments }: Props) {
  const { data: vehicles, isLoading } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.listVehicles(),
    refetchInterval: 5_000,
  });

  const { focusedVehicleId, focusVehicle } = useDispatch();

  const additions = selectedShipments.reduce(
    (acc, s) => ({ pallets: acc.pallets + s.palletCount, weight: acc.weight + s.weightLbs }),
    { pallets: 0, weight: 0 },
  );

  return (
    <aside className="w-[320px] shrink-0 border-r border-line bg-surface-subtle h-full overflow-y-auto">
      <div className="p-4 border-b border-line bg-white">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Fleet</h2>
        <p className="text-[11px] text-ink-subtle mt-0.5">
          {selectedShipments.length > 0
            ? `Preview shows projected load with ${selectedShipments.length} selected`
            : 'Click a vehicle to view workload & route'}
        </p>
      </div>
      <div className="p-3 space-y-2">
        {isLoading && <div className="text-xs text-ink-subtle">Loading…</div>}
        {vehicles?.map((v) => {
          const focused = v.id === focusedVehicleId;
          const projPallets = v.loadPallets + additions.pallets;
          const projWeight = v.loadWeightLbs + additions.weight;
          const previewing = selectedShipments.length > 0;
          const wouldOverflow =
            previewing && (projPallets > v.maxPallets || projWeight > v.maxWeightLbs);

          return (
            <Card
              key={v.id}
              onClick={() => focusVehicle(focused ? null : v.id)}
              className={cn(
                'cursor-pointer transition-all hover:border-line-strong',
                focused && 'border-indigo-400 ring-2 ring-indigo-100',
                wouldOverflow && 'border-red-300 bg-red-50/30',
              )}
            >
              <div className="p-3 space-y-2.5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {v.type === 'box_truck' ? (
                      <Box size={14} className="text-ink-muted" />
                    ) : (
                      <Truck size={14} className="text-ink-muted" />
                    )}
                    <span className="font-mono text-sm font-semibold text-ink">{v.id}</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-ink-subtle">
                    {v.type.replace('_', ' ')}
                  </span>
                </div>
                {v.capabilities.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {v.capabilities.map((c) => (
                      <span key={c} className="inline-block px-1.5 py-0.5 rounded text-[9px] bg-surface-muted text-ink-subtle border border-line/60">
                        {c}
                      </span>
                    ))}
                  </div>
                )}

                <CapacityBar
                  label="Pallets"
                  current={v.loadPallets}
                  max={v.maxPallets}
                  unit="pallets"
                  projected={previewing ? projPallets : undefined}
                />
                <CapacityBar
                  label="Weight"
                  current={v.loadWeightLbs}
                  max={v.maxWeightLbs}
                  unit="lbs"
                  projected={previewing ? projWeight : undefined}
                />

                <div className="flex items-center justify-between pt-1 text-[11px]">
                  <span className="text-ink-subtle">
                    {v.assignedShipmentIds.length} shipment
                    {v.assignedShipmentIds.length === 1 ? '' : 's'} assigned
                  </span>
                  {wouldOverflow && (
                    <span className="text-red-600 font-medium">Would overflow</span>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </aside>
  );
}
