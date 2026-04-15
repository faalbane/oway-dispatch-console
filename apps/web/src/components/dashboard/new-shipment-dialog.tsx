'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api, ApiClientError } from '@/lib/api';
import { ACCESSORIALS, type Accessorial } from '@oway/shared';
import { cn } from '@/lib/cn';

const blank = (kind: 'origin' | 'destination') => ({
  name: kind === 'origin' ? 'New Origin' : 'New Destination',
  address1: '',
  city: '',
  state: 'CA',
  zipCode: '',
  contactPerson: '',
  phoneNumber: '',
  openTime: '08:00',
  closeTime: '17:00',
});

export function NewShipmentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [origin, setOrigin] = useState(blank('origin'));
  const [destination, setDestination] = useState(blank('destination'));
  const [palletCount, setPalletCount] = useState<number>(1);
  const [weightLbs, setWeightLbs] = useState<number>(500);
  const [description, setDescription] = useState('');
  const [accessorials, setAccessorials] = useState<Accessorial[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setOrigin(blank('origin'));
    setDestination(blank('destination'));
    setPalletCount(1);
    setWeightLbs(500);
    setDescription('');
    setAccessorials([]);
    setError(null);
  };

  const create = useMutation({
    mutationFn: () =>
      api.createShipment({
        origin,
        destination,
        palletCount,
        weightLbs,
        description,
        accessorials,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['data-issues'] });
      onOpenChange(false);
      reset();
    },
    onError: (err) => {
      if (err instanceof ApiClientError) setError(err.body.error.message);
      else setError(String(err));
    },
  });

  const toggleAccess = (a: Accessorial) => {
    setAccessorials((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New Shipment</DialogTitle>
          <DialogDescription>
            Validation runs server-side. Blocking issues will reject the create; warnings are recorded.
          </DialogDescription>
        </DialogHeader>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <AddressFieldset label="Origin" value={origin} onChange={setOrigin} />
            <AddressFieldset label="Destination" value={destination} onChange={setDestination} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <NumberField label="Pallets" value={palletCount} onChange={setPalletCount} min={1} />
            <NumberField label="Weight (lbs)" value={weightLbs} onChange={setWeightLbs} min={1} step={50} />
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-semibold text-ink-muted mb-1">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm rounded-md border border-line"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-ink-muted mb-1.5">
              Accessorials
            </label>
            <div className="flex flex-wrap gap-2">
              {ACCESSORIALS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleAccess(a)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs border',
                    accessorials.includes(a)
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-ink-muted border-line hover:border-line-strong',
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line bg-surface-subtle rounded-b-lg">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending && <Loader2 size={12} className="animate-spin" />}
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddressFieldset({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ReturnType<typeof blank>;
  onChange: (v: ReturnType<typeof blank>) => void;
}) {
  const set = <K extends keyof typeof value>(k: K, v: (typeof value)[K]) => onChange({ ...value, [k]: v });
  return (
    <fieldset className="space-y-2 border border-line rounded-md p-3">
      <legend className="px-1 text-[11px] uppercase tracking-wider font-semibold text-ink-muted">{label}</legend>
      <TextField label="Name" value={value.name} onChange={(v) => set('name', v)} />
      <TextField label="Address" value={value.address1} onChange={(v) => set('address1', v)} />
      <div className="grid grid-cols-3 gap-2">
        <TextField label="City" value={value.city} onChange={(v) => set('city', v)} />
        <TextField label="State" value={value.state} onChange={(v) => set('state', v)} maxLength={2} />
        <TextField label="Zip" value={value.zipCode} onChange={(v) => set('zipCode', v)} maxLength={5} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Open" value={value.openTime} onChange={(v) => set('openTime', v)} />
        <TextField label="Close" value={value.closeTime} onChange={(v) => set('closeTime', v)} />
      </div>
    </fieldset>
  );
}

function TextField({
  label,
  value,
  onChange,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider font-semibold text-ink-subtle mb-0.5">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        className="w-full px-2 py-1 text-xs rounded border border-line focus:ring-1 focus:ring-slate-900 focus:outline-none"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider font-semibold text-ink-muted mb-1">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(e) => onChange(parseInt(e.target.value || '0', 10))}
        className="w-full px-2.5 py-1.5 text-sm rounded-md border border-line"
      />
    </label>
  );
}
