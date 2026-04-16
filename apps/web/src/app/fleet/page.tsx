'use client';

import { useQueries, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Truck, Box, DollarSign, Package, Weight, MapPin, LayoutDashboard } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Pill, StatusBadge } from '@/components/ui/badge';
import { fmtAddress, fmtUSD } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Route, Shipment, VehicleWithLoad } from '@oway/shared';

export default function FleetPage() {
  const { data: vehicles } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.listVehicles(),
    refetchInterval: 5_000,
  });
  const { data: shipments } = useQuery({
    queryKey: ['shipments', { __all: true }],
    queryFn: () => api.listShipments(),
    refetchInterval: 5_000,
  });
  const { data: depot } = useQuery({ queryKey: ['depot'], queryFn: () => api.getDepot() });

  // One query per vehicle route; react-query parallelizes. Invalidated by the
  // same ['route', vehicleId] key that the dispatch view uses, so reassignments
  // anywhere in the app flow through here automatically.
  const routeQueries = useQueries({
    queries: (vehicles ?? []).map((v) => ({
      queryKey: ['route', v.id],
      queryFn: () => api.getRoute(v.id),
    })),
  });
  const routeByVehicleId = new Map<string, Route | null>();
  (vehicles ?? []).forEach((v, i) => {
    routeByVehicleId.set(v.id, routeQueries[i]?.data ?? null);
  });
  const fleetCost = Array.from(routeByVehicleId.values()).reduce(
    (sum, r) => sum + (r?.costEstimate?.total ?? 0),
    0,
  );
  const routedVehicleCount = Array.from(routeByVehicleId.values()).filter(
    (r) => r?.costEstimate,
  ).length;

  const totals = (vehicles ?? []).reduce(
    (acc, v) => ({
      maxP: acc.maxP + v.maxPallets,
      loadP: acc.loadP + v.loadPallets,
      maxW: acc.maxW + v.maxWeightLbs,
      loadW: acc.loadW + v.loadWeightLbs,
      activeShipments: acc.activeShipments + v.assignedShipmentIds.length,
    }),
    { maxP: 0, loadP: 0, maxW: 0, loadW: 0, activeShipments: 0 },
  );

  const activeTrucks = (vehicles ?? []).filter((v) => v.assignedShipmentIds.length > 0).length;

  return (
    <div className="min-h-screen bg-surface-subtle">
      {/* Header */}
      <header className="h-14 px-5 border-b border-line bg-white flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 grid place-items-center text-white font-bold text-xs">
              O
            </div>
            <div>
              <div className="text-sm font-bold leading-tight">Fleet Overview</div>
              <div className="text-[10px] text-ink-subtle leading-tight">{vehicles?.length ?? 0} vehicles · LA Metro</div>
            </div>
          </div>
          {depot && (
            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-ink-muted ml-4">
              <MapPin size={12} />
              Depot: {depot.name} · {depot.city}, {depot.state}
            </div>
          )}
          <nav className="flex items-center gap-1 ml-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-ink-muted hover:bg-surface-muted transition-colors"
            >
              <LayoutDashboard size={12} />
              Dispatch
            </Link>
            <Link
              href="/fleet"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-900 text-white"
            >
              <Truck size={12} />
              Fleet
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard
            label="Fleet utilization"
            value={`${totals.maxP > 0 ? Math.round((totals.loadP / totals.maxP) * 100) : 0}%`}
            sub={`${totals.loadP} of ${totals.maxP} pallets loaded`}
            tone={totals.loadP / totals.maxP > 0.9 ? 'warn' : 'neutral'}
          />
          <KpiCard
            label="Trucks in service"
            value={`${activeTrucks} / ${vehicles?.length ?? 0}`}
            sub={`${(vehicles?.length ?? 0) - activeTrucks} idle`}
            tone="neutral"
          />
          <KpiCard
            label="Active shipments"
            value={totals.activeShipments}
            sub={`${(shipments ?? []).filter((s) => s.status === 'PICKED_UP').length} in transit`}
            tone="neutral"
          />
          <KpiCard
            label="Total weight"
            value={`${Math.round(totals.loadW / 1000)}k lbs`}
            sub={`of ${Math.round(totals.maxW / 1000)}k lbs capacity`}
            tone={totals.loadW / totals.maxW > 0.9 ? 'warn' : 'neutral'}
          />
          <KpiCard
            label="Est. cost (today)"
            value={fmtUSD(fleetCost)}
            sub={
              routedVehicleCount > 0
                ? `${routedVehicleCount} of ${vehicles?.length ?? 0} route${routedVehicleCount === 1 ? '' : 's'} computed`
                : 'No routes computed yet'
            }
            tone="neutral"
          />
        </div>

        {/* Vehicle grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {vehicles?.map((v) => (
            <VehicleCard
              key={v.id}
              vehicle={v}
              shipments={shipments ?? []}
              route={routeByVehicleId.get(v.id) ?? null}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub: string;
  tone: 'neutral' | 'warn';
}) {
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-muted mb-1">{label}</div>
      <div className={cn('text-2xl font-bold tabular-nums', tone === 'warn' ? 'text-amber-600' : 'text-ink')}>
        {value}
      </div>
      <div className="text-[11px] text-ink-subtle mt-1">{sub}</div>
    </Card>
  );
}

function VehicleCard({
  vehicle: v,
  shipments,
  route,
}: {
  vehicle: VehicleWithLoad;
  shipments: Shipment[];
  route: Route | null;
}) {
  const assigned = shipments.filter((s) => v.assignedShipmentIds.includes(s.id));
  const palletsPct = v.maxPallets > 0 ? (v.loadPallets / v.maxPallets) * 100 : 0;
  const weightPct = v.maxWeightLbs > 0 ? (v.loadWeightLbs / v.maxWeightLbs) * 100 : 0;
  const Icon = v.type === 'box_truck' ? Box : Truck;
  const cost = route?.costEstimate;

  return (
    <Card className="overflow-hidden">
      <div className="p-5 border-b border-line bg-gradient-to-br from-white to-surface-subtle">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Icon size={18} className="text-ink-muted" />
              <span className="font-mono text-base font-bold">{v.id}</span>
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-surface-muted text-ink-muted">
                {v.type.replace('_', ' ')}
              </span>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {v.capabilities.map((c) => (
                <Pill key={c} tone="info">{c}</Pill>
              ))}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-ink-subtle">Status</div>
            <div className={cn(
              'text-sm font-semibold',
              assigned.length === 0 ? 'text-ink-subtle' :
              palletsPct >= 100 || weightPct >= 100 ? 'text-red-600' :
              palletsPct >= 90 || weightPct >= 90 ? 'text-amber-600' :
              'text-emerald-600'
            )}>
              {assigned.length === 0 ? 'Idle' :
                palletsPct >= 100 || weightPct >= 100 ? 'Full' :
                palletsPct >= 90 || weightPct >= 90 ? 'Near full' :
                'Active'}
            </div>
          </div>
        </div>

        {/* Capacity */}
        <div className="space-y-3">
          <CapacityRow
            icon={<Package size={14} />}
            label="Pallets"
            current={v.loadPallets}
            max={v.maxPallets}
            pct={palletsPct}
          />
          <CapacityRow
            icon={<Weight size={14} />}
            label="Weight"
            current={v.loadWeightLbs}
            max={v.maxWeightLbs}
            pct={weightPct}
            unit="lbs"
          />
        </div>

        {/* Cost row — shown when a route has been computed */}
        {cost && (
          <div className="mt-3 pt-3 border-t border-line/60 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
              <DollarSign size={14} />
              Est. route cost
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold font-mono tabular-nums text-emerald-700">
                {fmtUSD(cost.total)}
              </div>
              <div className="text-[10px] text-ink-subtle">
                {route!.stops.length} stops · {route!.score.totalDistanceMi.toFixed(1)} mi · {cost.mpgUsed} mpg
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Assigned shipments list */}
      <div className="px-5 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-muted">
            Assigned shipments ({assigned.length})
          </div>
          <div className="text-[11px] text-ink-subtle">
            Remaining: <span className="font-mono tabular-nums text-ink">
              {v.remainingPallets}p · {Math.round(v.remainingWeightLbs / 1000)}k lbs
            </span>
          </div>
        </div>
        {assigned.length === 0 ? (
          <div className="text-[11px] text-ink-subtle py-2">No shipments assigned. Ready for dispatch.</div>
        ) : (
          <ul className="space-y-1.5">
            {assigned.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-xs py-1 border-b border-line/40 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-ink">{s.id}</span>
                  <StatusBadge status={s.status} />
                  <span className="text-ink-muted truncate">
                    {fmtAddress(s.origin)} → {fmtAddress(s.destination)}
                  </span>
                </div>
                <span className="font-mono tabular-nums text-ink-subtle shrink-0 ml-3">
                  {s.palletCount}p · {s.weightLbs.toLocaleString()} lbs
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function CapacityRow({
  icon,
  label,
  current,
  max,
  pct,
  unit,
}: {
  icon: React.ReactNode;
  label: string;
  current: number;
  max: number;
  pct: number;
  unit?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          {icon}
          {label}
        </div>
        <div className="text-xs font-mono tabular-nums">
          <span className="font-semibold text-ink">{current.toLocaleString()}</span>
          <span className="text-ink-subtle"> / {max.toLocaleString()}{unit ? ` ${unit}` : ''}</span>
          <span className={cn('ml-2 font-semibold', pct >= 90 ? 'text-amber-600' : pct >= 70 ? 'text-indigo-600' : 'text-emerald-600')}>
            {Math.round(pct)}%
          </span>
        </div>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className={cn(
            'absolute left-0 top-0 h-full transition-all',
            pct >= 90 ? 'bg-amber-500' : pct >= 70 ? 'bg-indigo-500' : 'bg-emerald-500',
          )}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}
