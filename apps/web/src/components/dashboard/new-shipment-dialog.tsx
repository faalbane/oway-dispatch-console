'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api, ApiClientError } from '@/lib/api';
import { ACCESSORIALS, type Accessorial } from '@oway/shared';
import { cn } from '@/lib/cn';

const PREFILLS = [
  {
    origin: { name: 'LA Cold Storage', address1: '1100 E 6th St', city: 'Los Angeles', state: 'CA', zipCode: '90021', contactPerson: 'Mike Chen', phoneNumber: '+12135559001', openTime: '06:00', closeTime: '14:00' },
    destination: { name: 'Whole Foods Pasadena', address1: '3751 E Foothill Blvd', city: 'Pasadena', state: 'CA', zipCode: '91107', contactPerson: 'Sarah Lin', phoneNumber: '+16265559002', openTime: '07:00', closeTime: '15:00' },
    palletCount: 4, weightLbs: 2400, description: 'Organic Produce',
  },
  {
    origin: { name: 'Torrance Warehouse', address1: '2510 W 237th St', city: 'Torrance', state: 'CA', zipCode: '90505', contactPerson: 'Dave Park', phoneNumber: '+13105559003', openTime: '07:00', closeTime: '16:00' },
    destination: { name: 'Target Costa Mesa', address1: '3030 Harbor Blvd', city: 'Costa Mesa', state: 'CA', zipCode: '92626', contactPerson: 'Lisa Tran', phoneNumber: '+17145559004', openTime: '08:00', closeTime: '18:00' },
    palletCount: 6, weightLbs: 3600, description: 'Household Goods',
  },
  {
    origin: { name: 'Sun Valley Auto Parts', address1: '8939 Glenoaks Blvd', city: 'Sun Valley', state: 'CA', zipCode: '91352', contactPerson: 'Carlos Ruiz', phoneNumber: '+18185559005', openTime: '07:00', closeTime: '15:00' },
    destination: { name: 'Pep Boys Riverside', address1: '3560 Central Ave', city: 'Riverside', state: 'CA', zipCode: '92506', contactPerson: 'James Wu', phoneNumber: '+19515559006', openTime: '09:00', closeTime: '17:00' },
    palletCount: 3, weightLbs: 1800, description: 'Brake Pads & Rotors',
  },
];

let prefillIdx = 0;

function nextPrefill() {
  const p = PREFILLS[prefillIdx % PREFILLS.length]!;
  prefillIdx++;
  return p;
}

function defaultForm() {
  const p = nextPrefill();
  return {
    origin: { ...p.origin },
    destination: { ...p.destination },
    palletCount: p.palletCount,
    weightLbs: p.weightLbs,
    description: p.description,
  };
}

export function NewShipmentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [initial] = useState(defaultForm);
  const [origin, setOrigin] = useState(initial.origin);
  const [destination, setDestination] = useState(initial.destination);
  const [palletCount, setPalletCount] = useState<number>(initial.palletCount);
  const [weightLbs, setWeightLbs] = useState<number>(initial.weightLbs);
  const [description, setDescription] = useState(initial.description);
  const [accessorials, setAccessorials] = useState<Accessorial[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    const next = defaultForm();
    setOrigin(next.origin);
    setDestination(next.destination);
    setPalletCount(next.palletCount);
    setWeightLbs(next.weightLbs);
    setDescription(next.description);
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
      if (err instanceof ApiClientError) {
        const details = err.body.error.details;
        if (details && 'issues' in details && Array.isArray(details.issues)) {
          const lines = (details.issues as Array<{ path: (string | number)[]; message: string }>)
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('\n');
          setError(lines);
        } else {
          setError(err.body.error.message);
        }
      } else setError(String(err));
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
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 whitespace-pre-line">{error}</div>
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
  value: typeof PREFILLS[0]['origin'];
  onChange: (v: typeof PREFILLS[0]['origin']) => void;
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
