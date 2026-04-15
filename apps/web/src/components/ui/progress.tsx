import { cn } from '@/lib/cn';

/** Compact load progress bar with current/max label. */
export function CapacityBar({
  label,
  current,
  max,
  unit,
  projected,
  className,
}: {
  label: string;
  current: number;
  max: number;
  unit: string;
  /** If provided (>= current), shows a hatched preview overlay above current load. */
  projected?: number;
  className?: string;
}) {
  const pct = Math.min(100, (current / max) * 100);
  const projPct = projected !== undefined ? Math.min(100, (projected / max) * 100) : null;
  const over = projected !== undefined && projected > max;
  const projOver = projected !== undefined && projected > max;

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex justify-between items-baseline text-[11px]">
        <span className="text-ink-muted">{label}</span>
        <span className="font-mono tabular-nums text-ink">
          {projected !== undefined && projected !== current ? (
            <>
              <span className={cn('font-semibold', projOver ? 'text-red-600' : 'text-indigo-600')}>
                {projected.toLocaleString()}
              </span>{' '}
              <span className="text-ink-subtle">/ {max.toLocaleString()} {unit}</span>
            </>
          ) : (
            <>
              <span className="font-semibold">{current.toLocaleString()}</span>{' '}
              <span className="text-ink-subtle">/ {max.toLocaleString()} {unit}</span>
            </>
          )}
        </span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className={cn(
            'absolute left-0 top-0 h-full transition-all',
            pct > 90 ? 'bg-amber-500' : 'bg-slate-700',
          )}
          style={{ width: `${pct}%` }}
        />
        {projPct !== null && projPct > pct && (
          <div
            className={cn(
              'absolute top-0 h-full transition-all opacity-70',
              over ? 'bg-red-500' : 'bg-indigo-500',
            )}
            style={{ left: `${pct}%`, width: `${projPct - pct}%` }}
          />
        )}
      </div>
    </div>
  );
}
