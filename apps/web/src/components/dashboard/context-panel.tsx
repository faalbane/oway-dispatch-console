'use client';

import dynamic from 'next/dynamic';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Compass, DollarSign, Info, Loader2, Pencil, RotateCcw, Sparkles, X } from 'lucide-react';
import { api, ApiClientError } from '@/lib/api';
import { useDispatch } from '@/state/dispatch-store';
import { Button } from '@/components/ui/button';
import { StatusBadge, Pill } from '@/components/ui/badge';
import { LinkifyShipments } from './linkify-shipments';
import { fmtAddressFull, fmtTime, fmtTimeRange, fmtUSD, fmtUSDPrecise } from '@/lib/format';
import { CapacityBar } from '@/components/ui/progress';
import { useState } from 'react';
import type { Shipment, ShipmentStatus } from '@oway/shared';
import { nextStatuses, SHIPMENT_STATUSES } from '@oway/shared';
import { cn } from '@/lib/cn';

const RouteMap = dynamic(() => import('./route-map').then((m) => m.RouteMap), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-xs text-ink-subtle">
      Loading map…
    </div>
  ),
});

const ShipmentMap = dynamic(() => import('./shipment-map').then((m) => m.ShipmentMap), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-xs text-ink-subtle">
      Loading map…
    </div>
  ),
});

interface Props {
  selectedShipments: Shipment[];
  detailShipmentId: string | null;
  onCloseDetail: () => void;
}

export function ContextPanel({ selectedShipments, detailShipmentId, onCloseDetail }: Props) {
  const { focusedVehicleId, focusVehicle, clearSelection } = useDispatch();

  // Priority: shipment detail > vehicle focus > selection > empty
  if (detailShipmentId) {
    return <ShipmentDetail shipmentId={detailShipmentId} onClose={onCloseDetail} />;
  }
  if (focusedVehicleId) {
    return <VehicleContext vehicleId={focusedVehicleId} onClose={() => focusVehicle(null)} />;
  }
  if (selectedShipments.length > 0) {
    return <SelectionContext shipments={selectedShipments} onClear={clearSelection} />;
  }
  return <EmptyContext />;
}

function NavButtons() {
  const { goBack, goForward, canGoBack, canGoForward } = useDispatch();
  return (
    <div className="flex items-center gap-0.5 mr-1">
      <button
        type="button"
        onClick={goBack}
        disabled={!canGoBack}
        title="Back"
        className={cn(
          'w-7 h-7 rounded-md flex items-center justify-center transition-colors',
          canGoBack ? 'text-ink-muted hover:bg-surface-muted hover:text-ink' : 'text-line-strong cursor-not-allowed',
        )}
      >
        <ArrowLeft size={14} />
      </button>
      <button
        type="button"
        onClick={goForward}
        disabled={!canGoForward}
        title="Forward"
        className={cn(
          'w-7 h-7 rounded-md flex items-center justify-center transition-colors',
          canGoForward ? 'text-ink-muted hover:bg-surface-muted hover:text-ink' : 'text-line-strong cursor-not-allowed',
        )}
      >
        <ArrowRight size={14} />
      </button>
    </div>
  );
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

  const [warnings, setWarnings] = useState<Array<{ shipmentId: string; missing: string[] }>>([]);

  const assignMutation = useMutation({
    mutationFn: () => api.assign({ vehicleId: pickedVehicle!, shipmentIds: shipments.map((s) => s.id) }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-workload'] });
      queryClient.invalidateQueries({ queryKey: ['route'] });
      if (data.accessorialWarnings?.length > 0) {
        setWarnings(data.accessorialWarnings);
      }
      onClear();
      setError(null);
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
      {/* Pinned header — close button always visible */}
      <div className="shrink-0 p-4 border-b border-line flex items-start justify-between">
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
        <div className="flex items-center">
          <NavButtons />
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={14} />
          </Button>
        </div>
      </div>

      {/* Single scrollable content area — one scrollbar for the whole panel */}
      <div className="flex-1 min-h-0 overflow-y-auto">
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
            {route.costEstimate && (
              <div className="flex justify-between pt-1 mt-1 border-t border-line/60">
                <span className="font-semibold text-ink">Est. cost</span>
                <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                  {fmtUSD(route.costEstimate.total)}
                </span>
              </div>
            )}
            {route.unroutableShipmentIds.length > 0 && (
              <div className="text-amber-700">
                Skipped (ungeocodable): <LinkifyShipments text={route.unroutableShipmentIds.join(', ')} />
              </div>
            )}
            {route.costEstimate && <CostBreakdownPanel cost={route.costEstimate} miles={route.score.totalDistanceMi} stopCount={route.stops.length} />}
            <RationalePanel rationale={route.rationale} />
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

      {/* Stops list — part of the outer scroll container, not its own */}
      <div>
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
                      <LinkifyShipments text={s.shipmentId} />
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-ink-subtle">{fmtTime(s.etaArrival)}</span>
                  </div>
                  <div className="text-[11px] text-ink-muted truncate">{s.address.name}</div>
                  <div className="text-[11px] text-ink-subtle truncate">{fmtAddressFull(s.address)}</div>
                  <div className="text-[10px] text-ink-subtle mt-0.5">
                    Window {fmtTimeRange(s.address.openTime, s.address.closeTime)}
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
    </div>
  );
}

/* ============================================================================
 * Shipment detail — inline in the right rail (replaces the old modal dialog)
 * ==========================================================================*/

function addressKey(a: { address1: string; city: string; state: string; zipCode: string }): string {
  return `${a.address1}|${a.city}|${a.state}|${a.zipCode}`.toLowerCase().trim();
}

function ShipmentDetail({ shipmentId, onClose }: { shipmentId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { focusVehicle, openShipmentEditor } = useDispatch();
  const { data: shipment, isLoading } = useQuery({
    queryKey: ['shipment', shipmentId],
    queryFn: () => api.getShipment(shipmentId),
  });

  const geocodeKeys = shipment
    ? [addressKey(shipment.origin), addressKey(shipment.destination)]
    : [];
  const { data: geocodes } = useQuery({
    queryKey: ['geocodes', geocodeKeys],
    queryFn: () => api.getGeocodes(geocodeKeys),
    enabled: geocodeKeys.length > 0,
  });

  const originGeo = geocodes?.find((g) => g.key === geocodeKeys[0] && g.lat !== null);
  const destGeo = geocodes?.find((g) => g.key === geocodeKeys[1] && g.lat !== null);

  const [error, setError] = useState<string | null>(null);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['shipment', shipmentId] });
    queryClient.invalidateQueries({ queryKey: ['shipments'] });
    queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    queryClient.invalidateQueries({ queryKey: ['vehicle-workload'] });
    queryClient.invalidateQueries({ queryKey: ['route'] });
  };

  const transitionMutation = useMutation({
    mutationFn: (to: ShipmentStatus) => api.transitionStatus(shipmentId, to),
    onSuccess: () => { invalidateAll(); setError(null); },
    onError: (err) => setError(err instanceof ApiClientError ? err.body.error.message : String(err)),
  });

  const overrideMutation = useMutation({
    mutationFn: (to: ShipmentStatus) => api.overrideStatus(shipmentId, to),
    onSuccess: () => { invalidateAll(); setError(null); },
    onError: (err) => setError(err instanceof ApiClientError ? err.body.error.message : String(err)),
  });

  const [showOverride, setShowOverride] = useState(false);

  if (isLoading || !shipment) {
    return <div className="p-8 text-sm text-ink-subtle">Loading…</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="p-4 border-b border-line flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{shipment.id}</span>
            <StatusBadge status={shipment.status} />
          </div>
          {shipment.vehicleId && (
            <div className="text-[11px] text-ink-muted mt-1 font-mono">Vehicle: {shipment.vehicleId}</div>
          )}
        </div>
        <div className="flex items-center">
          <NavButtons />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => openShipmentEditor(shipment.id)}
            title="Edit shipment"
          >
            <Pencil size={13} />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={14} />
          </Button>
        </div>
      </div>

      {/* Mini-map showing pickup → delivery */}
      <div className="h-[220px] border-b border-line">
        <ShipmentMap
          origin={originGeo ? { lat: originGeo.lat!, lng: originGeo.lng!, name: shipment.origin.name, address1: shipment.origin.address1, city: shipment.origin.city, state: shipment.origin.state, zipCode: shipment.origin.zipCode } : null}
          destination={destGeo ? { lat: destGeo.lat!, lng: destGeo.lng!, name: shipment.destination.name, address1: shipment.destination.address1, city: shipment.destination.city, state: shipment.destination.state, zipCode: shipment.destination.zipCode } : null}
        />
      </div>

      {/* Quick-nav to vehicle route if assigned */}
      {shipment.vehicleId && (
        <button
          type="button"
          onClick={() => { onClose(); focusVehicle(shipment.vehicleId!); }}
          className="w-full px-4 py-2 text-xs text-indigo-700 bg-indigo-50 border-b border-line hover:bg-indigo-100 transition-colors text-left"
        >
          View full route for <span className="font-mono font-semibold">{shipment.vehicleId}</span> →
        </button>
      )}

      <div className="p-4 space-y-4">
        <DetailSection label="Description">
          <div className="text-sm">{shipment.description || <em className="text-ink-subtle">none</em>}</div>
        </DetailSection>

        <div className="grid grid-cols-2 gap-4">
          <DetailSection label="Origin">
            <DetailAddress a={shipment.origin} />
          </DetailSection>
          <DetailSection label="Destination">
            <DetailAddress a={shipment.destination} />
          </DetailSection>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <DetailSection label="Pallets">
            <div className="font-mono text-lg">{shipment.palletCount}</div>
          </DetailSection>
          <DetailSection label="Weight">
            <div className="font-mono text-lg">{shipment.weightLbs.toLocaleString()} lbs</div>
          </DetailSection>
          <DetailSection label="Accessorials">
            <div className="flex flex-wrap gap-1 mt-1">
              {shipment.accessorials.length === 0 ? (
                <span className="text-xs text-ink-subtle">none</span>
              ) : (
                shipment.accessorials.map((a) => (
                  <Pill key={a} tone={a === 'hazmat' ? 'danger' : 'neutral'}>{a}</Pill>
                ))
              )}
            </div>
          </DetailSection>
        </div>

        {shipment.dataIssues.length > 0 && (
          <DetailSection label="Data Quality">
            <ul className="space-y-1.5">
              {shipment.dataIssues.map((i, idx) => (
                <li key={idx} className="text-xs flex items-start gap-2">
                  <Pill tone={i.severity === 'blocking' ? 'danger' : 'warn'}>{i.severity}</Pill>
                  <span><LinkifyShipments text={i.message} /></span>
                </li>
              ))}
            </ul>
          </DetailSection>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>
        )}

        {/* Inline vehicle assignment for unassigned shipments */}
        {shipment.status === 'INITIALIZED' && <InlineAssign shipment={shipment} onAssigned={(vid) => {
          queryClient.invalidateQueries({ queryKey: ['shipment', shipmentId] });
          queryClient.invalidateQueries({ queryKey: ['shipments'] });
          queryClient.invalidateQueries({ queryKey: ['vehicles'] });
          queryClient.invalidateQueries({ queryKey: ['route'] });
          setError(null);
          onClose();
          focusVehicle(vid);
        }} />}

        <div className="flex items-center gap-2 pt-3 border-t border-line">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-ink-muted mr-2">
            Progress
          </span>
          {nextStatuses(shipment.status)
            .filter((to) => to !== 'ASSIGNED')
            .map((to) => (
              <Button
                key={to}
                variant={to === 'CANCELLED' ? 'danger-outline' : 'primary'}
                size="sm"
                onClick={() => transitionMutation.mutate(to)}
                disabled={transitionMutation.isPending}
              >
                {transitionMutation.isPending && <Loader2 size={12} className="animate-spin" />}
                Mark {to.replace('_', ' ')}
              </Button>
            ))}
          {nextStatuses(shipment.status).filter((to) => to !== 'ASSIGNED').length === 0 && (
            <span className="text-xs text-ink-subtle">
              {nextStatuses(shipment.status).length === 0
                ? 'Terminal status — no further transitions'
                : null}
            </span>
          )}
        </div>

        {/* Override: change status to anything (admin escape hatch for mistakes) */}
        <div className="pt-2 border-t border-line/60">
          {!showOverride ? (
            <button
              type="button"
              onClick={() => setShowOverride(true)}
              className="text-[11px] text-ink-subtle hover:text-ink-muted underline underline-offset-2"
            >
              Override status (mistake fix)
            </button>
          ) : (
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-amber-700">
                Override status
              </div>
              <div className="text-[10px] text-ink-subtle">
                Bypasses normal lifecycle. Use only to correct mistakes.
                {shipment.vehicleId && ' Will invalidate the vehicle\'s computed route.'}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SHIPMENT_STATUSES.filter((s) => s !== shipment.status && !(s === 'ASSIGNED' && !shipment.vehicleId)).map((s) => (
                  <Button
                    key={s}
                    variant="secondary"
                    size="sm"
                    onClick={() => overrideMutation.mutate(s)}
                    disabled={overrideMutation.isPending}
                  >
                    {s.replace('_', ' ')}
                  </Button>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setShowOverride(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InlineAssign({ shipment, onAssigned }: { shipment: Shipment; onAssigned: (vehicleId: string) => void }) {
  const { data: vehicles } = useQuery({ queryKey: ['vehicles'], queryFn: () => api.listVehicles() });
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assignMutation = useMutation({
    mutationFn: () => api.assign({ vehicleId: picked!, shipmentIds: [shipment.id] }),
    onSuccess: (data) => {
      if (data.accessorialWarnings?.length > 0) {
        const warns = data.accessorialWarnings.map(
          (w) => `${w.shipmentId} needs ${w.missing.join(', ')}`,
        ).join('; ');
        console.warn('Accessorial warnings:', warns);
      }
      onAssigned(data.vehicleId);
    },
    onError: (err) => {
      if (err instanceof ApiClientError) setError(err.body.error.message);
      else setError(String(err));
    },
  });

  const hasBlocking = shipment.dataIssues.some((i) => i.severity === 'blocking');

  return (
    <div className="pt-3 border-t border-line space-y-2">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-muted">
        Assign to vehicle
      </div>
      {hasBlocking ? (
        <div className="text-xs text-red-600">Resolve blocking data issues before assigning.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {vehicles?.map((v) => {
              const projP = v.loadPallets + shipment.palletCount;
              const projW = v.loadWeightLbs + shipment.weightLbs;
              const overflow = projP > v.maxPallets || projW > v.maxWeightLbs;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setPicked(v.id)}
                  disabled={overflow}
                  className={cn(
                    'rounded-md border p-2 text-left text-xs transition-colors',
                    picked === v.id ? 'border-indigo-400 bg-indigo-50' : 'border-line hover:border-line-strong',
                    overflow && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  <div className="font-mono font-semibold">{v.id}</div>
                  <div className="text-[10px] text-ink-subtle mt-0.5">
                    {v.loadPallets}/{v.maxPallets}p · {Math.round(v.loadWeightLbs / 1000)}k/{Math.round(v.maxWeightLbs / 1000)}k lbs
                  </div>
                  {overflow && <div className="text-[10px] text-red-500 mt-0.5">No room</div>}
                </button>
              );
            })}
          </div>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>
          )}
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            disabled={!picked || assignMutation.isPending}
            onClick={() => assignMutation.mutate()}
          >
            {assignMutation.isPending && <Loader2 size={12} className="animate-spin" />}
            Assign to {picked ?? '...'}
          </Button>
        </>
      )}
    </div>
  );
}

function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-muted mb-1">{label}</div>
      {children}
    </div>
  );
}

function DetailAddress({
  a,
}: {
  a: {
    name: string;
    address1: string;
    city: string;
    state: string;
    zipCode: string;
    openTime: string;
    closeTime: string;
    contactPerson?: string;
    phoneNumber?: string;
    notes?: string;
  };
}) {
  return (
    <div className="text-xs leading-relaxed">
      <div className="font-medium">{a.name}</div>
      <div className="text-ink-muted">{fmtAddressFull(a)}</div>
      {a.contactPerson && <div className="text-ink-subtle">{a.contactPerson}</div>}
      <div className="text-ink-subtle mt-1">Window {fmtTimeRange(a.openTime, a.closeTime)}</div>
      {a.notes && (
        <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5 text-amber-800 flex items-start gap-1.5">
          <Info size={12} className="shrink-0 mt-0.5" />
          <span className="leading-snug">{a.notes}</span>
        </div>
      )}
    </div>
  );
}

function CostBreakdownPanel({
  cost,
  miles,
  stopCount,
}: {
  cost: import('@oway/shared').CostEstimate;
  miles: number;
  stopCount: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2 pt-2 border-t border-line/60">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <DollarSign size={11} />
        How is this cost calculated?
      </button>
      {expanded && (
        <div className="mt-2 text-[11px] text-ink-muted">
          <div className="rounded-md bg-emerald-50/70 border border-emerald-200/70 p-2.5 space-y-1.5 text-emerald-900">
            <BreakdownRow
              label={`Stops (${stopCount} × $75)`}
              value={fmtUSDPrecise(cost.stopFees)}
            />
            <BreakdownRow
              label={`Distance (${miles.toFixed(1)} mi × $3.53)`}
              value={fmtUSDPrecise(cost.distanceCost)}
            />
            <BreakdownRow
              label={`Fuel (${cost.gallonsUsed.toFixed(2)} gal × $6 @ ${cost.mpgUsed} mpg)`}
              value={fmtUSDPrecise(cost.fuelCost)}
            />
            <div className="flex justify-between pt-1 mt-1 border-t border-emerald-200/70 font-semibold">
              <span>Total</span>
              <span className="font-mono tabular-nums">{fmtUSDPrecise(cost.total)}</span>
            </div>
          </div>
          <div className="mt-1.5 text-[10px] text-ink-subtle leading-snug">
            Recomputes when the route is recomputed. Rates live in <code className="font-mono">COST_ESTIMATES</code>.
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="leading-snug">{label}</span>
      <span className="font-mono tabular-nums shrink-0">{value}</span>
    </div>
  );
}

function RationalePanel({ rationale }: { rationale?: import('@oway/shared').RouteRationale }) {
  const [expanded, setExpanded] = useState(false);

  // Old cached routes (computed before rationale was added) won't have this field.
  if (!rationale) {
    return (
      <div className="mt-2 pt-2 border-t border-line/60 text-[11px] text-ink-subtle italic">
        Recompute the route to see the ordering rationale.
      </div>
    );
  }

  return (
    <div className="mt-2 pt-2 border-t border-line/60">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Sparkles size={11} />
        Why this ordering?
      </button>
      {expanded && (
        <div className="mt-2 space-y-2 text-[11px] text-ink-muted">
          <div className="rounded-md bg-indigo-50/70 border border-indigo-200/70 p-2.5 text-indigo-900">
            <div className="font-semibold text-[10px] uppercase tracking-wider mb-1">Objective</div>
            <div className="leading-snug">{rationale.objective}</div>
          </div>
          <div className="rounded-md bg-surface-muted border border-line/70 p-2.5">
            <div className="font-semibold text-[10px] uppercase tracking-wider mb-1 text-ink-muted">Formula</div>
            <code className="text-[11px] font-mono text-ink">{rationale.formula}</code>
          </div>
          <div>
            <div className="font-semibold text-[10px] uppercase tracking-wider mb-1.5 text-ink-muted">Decisions</div>
            <ul className="space-y-1.5">
              {rationale.decisions.map((d, i) => (
                <li key={i} className="flex gap-2 leading-snug">
                  <span className="shrink-0 text-indigo-600 font-bold">•</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
