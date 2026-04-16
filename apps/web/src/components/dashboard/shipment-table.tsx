'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpDown, Search } from 'lucide-react';
import { api, type ListShipmentsOptions } from '@/lib/api';
import { useDispatch } from '@/state/dispatch-store';
import { StatusBadge, Pill } from '@/components/ui/badge';
import { fmtAddress, fmtLbs, fmtPallets } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Shipment, ShipmentStatus } from '@oway/shared';
import { SHIPMENT_STATUSES } from '@oway/shared';

const STATUS_FILTERS: Array<{ value: ShipmentStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  ...SHIPMENT_STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') })),
];

interface Props {
  onSelectShipment: (id: string | null) => void;
}

export function ShipmentTable({ onSelectShipment }: Props) {
  const [statusFilter, setStatusFilter] = useState<ShipmentStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<NonNullable<ListShipmentsOptions['sort']>>('id');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const { selectedShipmentIds, toggleShipment, selectShipments, clearSelection } = useDispatch();

  const queryOpts: ListShipmentsOptions = useMemo(
    () => ({
      ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
      sort,
      order,
    }),
    [statusFilter, search, sort, order],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['shipments', queryOpts],
    queryFn: () => api.listShipments(queryOpts),
    refetchInterval: 5_000,
  });

  const shipments = data ?? [];
  const allSelected = shipments.length > 0 && shipments.every((s) => selectedShipmentIds.has(s.id));

  const toggleAll = () => {
    if (allSelected) clearSelection();
    else selectShipments(shipments.map((s) => s.id));
  };

  const toggleSort = (field: NonNullable<ListShipmentsOptions['sort']>) => {
    if (sort === field) setOrder(order === 'asc' ? 'desc' : 'asc');
    else {
      setSort(field);
      setOrder('asc');
    }
  };

  return (
    <section className="flex-1 min-w-0 flex flex-col bg-white">
      {/* Filter bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-line">
        <div className="flex items-center gap-1 text-[11px]">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                'px-2.5 py-1 rounded-md uppercase tracking-wider font-semibold transition-colors',
                statusFilter === f.value
                  ? 'bg-slate-900 text-white'
                  : 'text-ink-muted hover:bg-surface-muted',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ID or description"
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-line bg-surface-subtle focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
          />
        </div>
        <span className="text-[11px] text-ink-subtle whitespace-nowrap">
          {selectedShipmentIds.size > 0
            ? `${selectedShipmentIds.size} selected`
            : `${shipments.length} ${shipments.length === 1 ? 'shipment' : 'shipments'}`}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-ink-subtle">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface-subtle border-b border-line">
              <tr>
                <th className="w-10 px-3 py-2.5 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded border-line-strong"
                  />
                </th>
                <SortableHeader label="ID" field="id" current={sort} order={order} onClick={toggleSort} />
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                  Status
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                  Origin → Destination
                </th>
                <SortableHeader label="Pallets" field="palletCount" current={sort} order={order} onClick={toggleSort} align="right" />
                <SortableHeader label="Weight" field="weightLbs" current={sort} order={order} onClick={toggleSort} align="right" />
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                  Flags
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                  Vehicle
                </th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((s) => (
                <ShipmentRow
                  key={s.id}
                  shipment={s}
                  selected={selectedShipmentIds.has(s.id)}
                  onToggle={() => toggleShipment(s.id)}
                  onClick={() => onSelectShipment(s.id)}
                />
              ))}
              {shipments.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-sm text-ink-subtle">
                    No shipments match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function SortableHeader({
  label,
  field,
  current,
  order,
  onClick,
  align = 'left',
}: {
  label: string;
  field: NonNullable<ListShipmentsOptions['sort']>;
  current: string;
  order: 'asc' | 'desc';
  onClick: (f: NonNullable<ListShipmentsOptions['sort']>) => void;
  align?: 'left' | 'right';
}) {
  const active = current === field;
  return (
    <th
      className={cn(
        'px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      <button
        type="button"
        onClick={() => onClick(field)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-ink',
          active && 'text-ink',
          align === 'right' && 'flex-row-reverse',
        )}
      >
        {label}
        <ArrowUpDown size={11} className={cn(active && (order === 'asc' ? 'rotate-0' : 'rotate-180'))} />
      </button>
    </th>
  );
}

function ShipmentRow({
  shipment,
  selected,
  onToggle,
  onClick,
}: {
  shipment: Shipment;
  selected: boolean;
  onToggle: () => void;
  onClick: () => void;
}) {
  const isTerminal = shipment.status === 'DELIVERED' || shipment.status === 'CANCELLED';
  const blocking = shipment.dataIssues.some((i) => i.severity === 'blocking');
  const warning = shipment.dataIssues.some((i) => i.severity === 'warning');

  return (
    <tr
      className={cn(
        'border-b border-line/60 hover:bg-surface-subtle cursor-pointer transition-colors',
        selected && 'bg-indigo-50/40 hover:bg-indigo-50/60',
        isTerminal && 'opacity-50',
      )}
      onClick={onClick}
    >
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="rounded border-line-strong"
          disabled={isTerminal || blocking}
          title={blocking ? 'Cannot assign — has blocking data issues' : isTerminal ? 'Terminal status' : ''}
        />
      </td>
      <td className="px-3 py-2.5 font-mono text-xs">
        <span className={cn(isTerminal && 'line-through')}>{shipment.id}</span>
      </td>
      <td className="px-3 py-2.5">
        <StatusBadge status={shipment.status} />
      </td>
      <td className="px-3 py-2.5">
        <div className="text-xs text-ink truncate max-w-[280px]">
          <span className="font-medium">{fmtAddress(shipment.origin)}</span>
          <span className="text-ink-subtle"> → </span>
          <span className="font-medium">{fmtAddress(shipment.destination)}</span>
        </div>
        <div className="text-[11px] text-ink-subtle truncate max-w-[280px]">{shipment.description}</div>
      </td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-xs">{fmtPallets(shipment.palletCount)}</td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-xs">{fmtLbs(shipment.weightLbs)}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1 flex-wrap">
          {blocking && (
            <Pill tone="danger" className="gap-1">
              <AlertTriangle size={9} /> {shipment.dataIssues.filter((i) => i.severity === 'blocking').length} blocking
            </Pill>
          )}
          {!blocking && warning && (
            <Pill tone="warn" className="gap-1">
              <AlertTriangle size={9} /> warning
            </Pill>
          )}
          {shipment.accessorials.map((a) => (
            <Pill key={a} tone={a === 'hazmat' ? 'danger' : 'neutral'}>
              {a}
            </Pill>
          ))}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right">
        {shipment.vehicleId ? (
          <span className="font-mono text-xs text-indigo-700">{shipment.vehicleId}</span>
        ) : (
          <span className="text-[11px] text-ink-subtle">—</span>
        )}
      </td>
    </tr>
  );
}
