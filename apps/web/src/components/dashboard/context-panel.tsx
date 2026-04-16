'use client';

import dynamic from 'next/dynamic';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Compass, Info, Loader2, RotateCcw, X } from 'lucide-react';
import { api, ApiClientError } from '@/lib/api';
import { useDispatch } from '@/state/dispatch-store';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/badge';
import { fmtAddressFull } from '@/lib/format';
import { CapacityBar } from '@/components/ui/progress';
import { useState } from 'react';
import type { Shipment } from '@oway/shared';
import { cn } from '@/lib/cn';

const RouteMap = dynamic(() => import('./route-map').then((m) => m.RouteMap), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-xs text-ink-subtle">
      Loading map…
    </div>
  ),
});

interface Props {
  selectedShipments: Shipment[];
}

export function ContextPanel({ selectedShipments }: Props) {
  const { focusedVehicleId, focusVehicle, clearSelection } = useDispatch();

  if (focusedVehicleId) {
    return <VehicleContext vehicleId={focusedVehicleId} onClose={() => focusVehicle(null)} />;
  }
  if (selectedShipments.length > 0) {
    return <SelectionContext shipments={selectedShipments} onClear={clearSelection} />;
  }
  return <EmptyContext />;
}

function EmptyContext() {
  return (
    <div className="h-full flex flex-col items-center justify-center px-8 text-center text-ink-subtle">
      <Compass size={32} className="mb-3 text-line-strong" />
      <div className="text-sm font-medium text-ink-muted">Select a vehicle or shipment</div>
      <div className="text-xs mt-1 max-w-[280px]">
        Click a vehicle on the left to see its workload and compute a route.
        Select shipments in the table to preview an assignment.
      </div>
    </div>
  );
}

function SelectionContext({ shipments, onClear }: { shipments: Shipment[]; onClear: () => void }) {
  const { focusedVehicleId, focusVehicle } = useDispatch();
  const queryClient = useQueryClient();
  const { data: vehicles } = useQuery({ queryKey: ['vehicles'], queryFn: () => api.listVehicles() });
  const [pickedVehicle, setPickedVehicle] = useState<string | null>(focusedVehicleId);
  const [error, setError] = useState<string | null>(null);

  const totalPallets = shipments.reduce((sum, s) => sum + s.palletCount, 0);
  const totalWeight = shipments.reduce((sum, s) => sum + s.weightLbs, 0);

  const assignMutation = useMutation({
    mutationFn: () => api.assign({ vehicleId: pickedVehicle!, shipmentIds: shipments.map((s) => s.id) }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-workload'] });
      // Route is invalidated server-side on any assignment change; refetch so
      // the map clears rather than showing stale stops from the old plan.
      queryClient.invalidateQueries({ queryKey: ['route'] });
      onClear();
      setError(null);
      // Focus the vehicle the user just assigned to — prevents the right rail
      // from snapping to the empty state after a successful assignment.
      focusVehicle(data.vehicleId);
    },
    onError: (err) => {
      if (err instanceof ApiClientError) setError(err.body.error.message);
      else setError(String(err));
    },
  });

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="p-5 border-b border-line flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Assign selection</div>
          <div className="text-sm mt-0.5">
            {shipments.length} shipments · {totalPallets} pallets · {totalWeight.toLocaleString()} lbs
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClear} title="Clear selection">
          <X size={14} />
        </Button>
      </div>

      <div className="p-5 space-y-3">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-muted">
          Pick a vehicle
        </div>
        {vehicles?.map((v) => {
          const projP = v.loadPallets + totalPallets;
          const projW = v.loadWeightLbs + totalWeight;
          const overflow = projP > v.maxPallets || projW > v.maxWeightLbs;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setPickedVehicle(v.id)}
              disabled={overflow}
              className={cn(
                'w-full text-left rounded-md border p-3 transition-colors',
                pickedVehicle === v.id ? 'border-indigo-400 bg-indigo-50/50' : 'border-line hover:border-line-strong',
                overflow && 'opacity-50 cursor-not-allowed',
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm font-semibold">{v.id}</span>
                <span className="text-[10px] uppercase tracking-wider text-ink-subtle">
                  {v.type.replace('_', ' ')}
                </span>
              </div>
              <div className="space-y-1.5">
                <CapacityBar label="Pallets" current={v.loadPallets} max={v.maxPallets} unit="" projected={projP} />
                <CapacityBar label="Weight" current={v.loadWeightLbs} max={v.maxWeightLbs} unit="" projected={projW} />
              </div>
              {overflow && <div className="mt-2 text-[11px] text-red-600 font-medium">Exceeds capacity</div>}
            </button>
          );
        })}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>
        )}

        <Button
          variant="primary"
          className="w-full"
          disabled={!pickedVehicle || assignMutation.isPending}
          onClick={() => assignMutation.mutate()}
        >
          {assignMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
          Assign to {pickedVehicle ?? 'vehicle'}
        </Button>
      </div>
    </div>
  );
}

function VehicleContext({ vehicleId, onClose }: { vehicleId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: workload, isLoading } = useQuery({
    queryKey: ['vehicle-workload', vehicleId],
    queryFn: () => api.getVehicleWorkload(vehicleId),
    refetchInterval: 5_000,
  });
  const { data: depot } = useQuery({ queryKey: ['depot'], queryFn: () => api.getDepot() });
  const { data: route } = useQuery({
    queryKey: ['route', vehicleId],
    queryFn: () => api.getRoute(vehicleId),
  });

  const computeMutation = useMutation({
    mutationFn: () => api.computeRoute(vehicleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route', vehicleId] });
    },
  });

  const unassignMutation = useMutation({
    mutationFn: (shipmentId: string) => api.unassign(shipmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-workload', vehicleId] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      // Unassignment invalidates the route server-side; refetch.
      queryClient.invalidateQueries({ queryKey: ['route', vehicleId] });
    },
  });

  if (isLoading || !workload) {
    return <div className="p-8 text-sm text-ink-subtle">Loading workload…</div>;
  }

  const v = workload.vehicle;
  const hasShipments = v.assignedShipmentIds.length > 0;

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="p-4 border-b border-line flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{v.id}</span>
            <span className="text-[10px] uppercase tracking-wider text-ink-subtle">
              {v.type.replace('_', ' ')}
            </span>
          </div>
          <div className="text-[11px] text-ink-subtle mt-0.5">
            {v.assignedShipmentIds.length} shipment{v.assignedShipmentIds.length === 1 ? '' : 's'}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X size={14} />
        </Button>
      </div>

      <div className="px-4 py-3 border-b border-line space-y-2">
        <CapacityBar label="Pallets" current={v.loadPallets} max={v.maxPallets} unit="pallets" />
        <CapacityBar label="Weight" current={v.loadWeightLbs} max={v.maxWeightLbs} unit="lbs" />
      </div>

      {/* Route summary + compute button */}
      <div className="px-4 py-3 border-b border-line">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-ink-muted">Route</span>
          <Button
            variant={route ? 'secondary' : 'primary'}
            size="sm"
            disabled={!hasShipments || computeMutation.isPending}
            onClick={() => computeMutation.mutate()}
          >
            {computeMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : route ? <RotateCcw size={12} /> : null}
            {route ? 'Recompute' : 'Compute route'}
          </Button>
        </div>
        {route ? (
          <div className="text-xs text-ink-muted space-y-1">
            <div className="flex justify-between">
              <span>Distance</span>
              <span className="font-mono text-ink">{route.score.totalDistanceMi} mi</span>
            </div>
            <div className="flex justify-between">
              <span>Duration</span>
              <span className="font-mono text-ink">
                {Math.floor(route.score.totalDurationMin / 60)}h {Math.round(route.score.totalDurationMin % 60)}m
              </span>
            </div>
            <div className="flex justify-between">
              <span>Window violations</span>
              <span className={cn('font-mono', route.score.windowViolations > 0 ? 'text-red-600' : 'text-emerald-600')}>
                {route.score.windowViolations}
                {route.score.windowViolations > 0 ? ` (+${route.score.windowViolationMinutes}min)` : ''}
              </span>
            </div>
            {route.unroutableShipmentIds.length > 0 && (
              <div className="text-amber-700">
                Skipped (ungeocodable): {route.unroutableShipmentIds.join(', ')}
              </div>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-ink-subtle">
            {hasShipments
              ? 'Click "Compute route" to generate optimized stop sequence.'
              : 'Assign shipments to this vehicle first.'}
          </div>
        )}
      </div>

      {/* Map */}
      {depot && (
        <div className="h-[280px] border-b border-line">
          <RouteMap route={route ?? null} depot={depot} />
        </div>
      )}

      {/* Stops list */}
      <div className="flex-1 overflow-y-auto">
        {route && route.stops.length > 0 ? (
          <ol className="divide-y divide-line/60">
            {route.stops.map((s) => (
              <li key={`${s.shipmentId}-${s.kind}`} className="px-4 py-2.5 flex gap-3 items-start">
                <div
                  className={cn(
                    'shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white',
                    s.windowStatus === 'violated'
                      ? 'bg-red-600'
                      : s.windowStatus === 'tight'
                        ? 'bg-amber-600'
                        : s.kind === 'pickup'
                          ? 'bg-blue-600'
                          : 'bg-emerald-600',
                  )}
                >
                  {s.order + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium">
                      {s.kind === 'pickup' ? 'Pickup' : 'Delivery'}{' '}
                      <span className="font-mono text-ink-subtle">{s.shipmentId}</span>
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-ink-subtle">{s.etaArrival}</span>
                  </div>
                  <div className="text-[11px] text-ink-muted truncate">{s.address.name}</div>
                  <div className="text-[11px] text-ink-subtle truncate">{fmtAddressFull(s.address)}</div>
                  <div className="text-[10px] text-ink-subtle mt-0.5">
                    Window {s.address.openTime}–{s.address.closeTime}
                    {s.windowStatus === 'violated' && (
                      <span className="ml-2 text-red-600 font-medium">VIOLATED</span>
                    )}
                    {s.windowStatus === 'tight' && (
                      <span className="ml-2 text-amber-600 font-medium">TIGHT</span>
                    )}
                  </div>
                  {s.address.notes && (
                    <div className="mt-1.5 rounded-md bg-amber-50 border border-amber-200 px-2 py-1 text-[11px] text-amber-800 flex items-start gap-1.5">
                      <Info size={11} className="shrink-0 mt-0.5" />
                      <span>{s.address.notes}</span>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : hasShipments ? (
          <div>
            <div className="px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-ink-muted border-b border-line">
              Assigned shipments
            </div>
            <ul className="divide-y divide-line/60">
              {workload.shipments.map((s) => (
                <li key={s.id} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-xs font-medium font-mono">{s.id}</div>
                    <div className="text-[11px] text-ink-subtle truncate max-w-[280px]">
                      {s.origin.city} → {s.destination.city}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => unassignMutation.mutate(s.id)}
                    disabled={s.status !== 'ASSIGNED' || unassignMutation.isPending}
                  >
                    Unassign
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-xs text-ink-subtle">No shipments assigned.</div>
        )}
      </div>
    </div>
  );
}
