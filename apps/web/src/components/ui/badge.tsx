import { cn } from '@/lib/cn';
import type { ShipmentStatus } from '@oway/shared';

const STATUS_STYLES: Record<ShipmentStatus, string> = {
  INITIALIZED: 'bg-slate-100 text-slate-700 border-slate-200',
  ASSIGNED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  PICKED_UP: 'bg-sky-50 text-sky-700 border-sky-200',
  DELIVERED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-red-50 text-red-700 border-red-200',
};

export function StatusBadge({ status, className }: { status: ShipmentStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        STATUS_STYLES[status],
        className,
      )}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

export function Pill({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'warn' | 'danger' | 'info' | 'success';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    warn: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
