'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api, ApiClientError } from '@/lib/api';
import { ACCESSORIALS, type Accessorial } from '@oway/shared';
import { cn } from '@/lib/cn';

const blankAddress = () => ({
  name: '',
  address1: '',
  city: '',
  state: 'CA',
  zipCode: '',
  contactPerson: '',
  phoneNumber: '',
  openTime: '08:00',
  closeTime: '17:00',
});

function defaultForm() {
  return {
    origin: blankAddress(),
    destination: blankAddress(),
    palletCount: 1,
    weightLbs: 500,
    description: '',
  };
}

// Type alias used by AddressFieldset (formerly inferred from PREFILLS).
type AddressFieldsetValue = ReturnType<typeof blankAddress>;

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
  const [autoAssignTo, setAutoAssignTo] = useState<string | null>(null);

  const reset = () => {
    const next = defaultForm();
    setOrigin(next.origin);
    setDestination(next.destination);
    setPalletCount(next.palletCount);
    setWeightLbs(next.weightLbs);
    setDescription(next.description);
    setAccessorials([]);
    setAutoAssignTo(null);
    setError(null);
  };

  const create = useMutation({
    mutationFn: async () => {
      const created = await api.createShipment({
        origin,
        destination,
        palletCount,
        weightLbs,
        description,
        accessorials,
      });
      if (autoAssignTo) {
        await api.assign({ vehicleId: autoAssignTo, shipmentIds: [created.id] });
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['data-issues'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-workload'] });
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

          <EligibleVehicles
            palletCount={palletCount}
            weightLbs={weightLbs}
            accessorials={accessorials}
            selected={autoAssignTo}
            onSelect={setAutoAssignTo}
          />

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
            {autoAssignTo ? `Create & assign to ${autoAssignTo}` : 'Create'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type VerifyState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'verified'; lat: number; lng: number; source?: 'google' | 'nominatim' | 'cache'; formattedAddress?: string }
  | { state: 'failed'; reason?: string };

function AddressFieldset({
  label,
  value,
  onChange,
}: {
  label: string;
  value: AddressFieldsetValue;
  onChange: (v: AddressFieldsetValue) => void;
}) {
  const set = <K extends keyof typeof value>(k: K, v: (typeof value)[K]) => onChange({ ...value, [k]: v });
  const [verify, setVerify] = useState<VerifyState>({ state: 'idle' });

  // Debounced live address verification. Fires 600ms after the user stops
  // typing, but only when all 4 required fields look valid. Calls Nominatim
  // via our /geocodes/verify endpoint and surfaces the resolved lat/lng.
  useEffect(() => {
    const ready =
      value.address1.trim().length >= 3 &&
      value.city.trim().length >= 2 &&
      value.state.length === 2 &&
      /^\d{5}(-\d{4})?$/.test(value.zipCode);
    if (!ready) {
      setVerify({ state: 'idle' });
      return;
    }
    setVerify({ state: 'loading' });
    const handle = setTimeout(async () => {
      try {
        const res = await api.verifyAddress({
          address1: value.address1,
          city: value.city,
          state: value.state,
          zipCode: value.zipCode,
        });
        if (res.verified && res.lat !== undefined && res.lng !== undefined) {
          setVerify({
            state: 'verified',
            lat: res.lat,
            lng: res.lng,
            source: res.source,
            formattedAddress: res.formattedAddress,
          });
        } else {
          setVerify({ state: 'failed', reason: res.reason });
        }
      } catch (err) {
        setVerify({ state: 'failed', reason: String(err) });
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [value.address1, value.city, value.state, value.zipCode]);

  return (
    <fieldset className="space-y-2 border border-line rounded-md p-3">
      <legend className="px-1 text-[11px] uppercase tracking-wider font-semibold text-ink-muted">{label}</legend>
      <PlacesAutocomplete
        label="Name"
        value={value.name}
        onChange={(v) => set('name', v)}
        onSelect={(details) => {
          onChange({
            ...value,
            name: details.name ?? value.name,
            address1: details.address1 || value.address1,
            city: details.city || value.city,
            state: details.state || value.state,
            zipCode: details.zipCode || value.zipCode,
          });
        }}
        renderSuggestion={(s) => ({ main: s.mainText, secondary: s.secondaryText })}
      />
      <PlacesAutocomplete
        label="Address"
        value={value.address1}
        onChange={(v) => set('address1', v)}
        onSelect={(details) => {
          onChange({
            ...value,
            address1: details.address1 || value.address1,
            city: details.city || value.city,
            state: details.state || value.state,
            zipCode: details.zipCode || value.zipCode,
          });
        }}
        renderSuggestion={(s) => ({ main: s.mainText, secondary: s.secondaryText })}
      />
      <div className="grid grid-cols-3 gap-2">
        <TextField label="City" value={value.city} onChange={(v) => set('city', v)} />
        <TextField label="State" value={value.state} onChange={(v) => set('state', v)} maxLength={2} />
        <TextField label="Zip" value={value.zipCode} onChange={(v) => set('zipCode', v)} maxLength={5} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Open" value={value.openTime} onChange={(v) => set('openTime', v)} />
        <TextField label="Close" value={value.closeTime} onChange={(v) => set('closeTime', v)} />
      </div>
      <VerifyIndicator state={verify} />
    </fieldset>
  );
}

function VerifyIndicator({ state }: { state: VerifyState }) {
  if (state.state === 'idle') {
    return (
      <div className="text-[10px] text-ink-subtle italic">
        Fill the address to verify with OpenStreetMap.
      </div>
    );
  }
  if (state.state === 'loading') {
    return (
      <div className="text-[10px] text-ink-subtle flex items-center gap-1.5">
        <Loader2 size={11} className="animate-spin" />
        Verifying address…
      </div>
    );
  }
  if (state.state === 'verified') {
    const sourceLabel =
      state.source === 'google' ? 'Google Maps'
      : state.source === 'nominatim' ? 'OpenStreetMap'
      : state.source === 'cache' ? 'cache'
      : '';
    return (
      <div className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <Check size={11} className="shrink-0" />
          <span>
            Verified{sourceLabel ? ` by ${sourceLabel}` : ''} ·{' '}
            <span className="font-mono">{state.lat.toFixed(4)}, {state.lng.toFixed(4)}</span>
          </span>
        </div>
        {state.formattedAddress && (
          <div className="text-[10px] text-emerald-800 pl-4">
            Resolved to: <span className="italic">{state.formattedAddress}</span>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="text-[10px] text-amber-800 flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded px-2 py-1">
      <AlertCircle size={11} className="shrink-0" />
      <span>Address not found. You can still save — routes will flag it as ungeocodable.</span>
    </div>
  );
}

/**
 * Live eligibility checker. Pulls the current fleet, computes which vehicles
 * have room (pallets + weight) for the proposed shipment, and which have the
 * accessorial capabilities the shipment needs. User can pick one to auto-assign
 * on create.
 */
function EligibleVehicles({
  palletCount,
  weightLbs,
  accessorials,
  selected,
  onSelect,
}: {
  palletCount: number;
  weightLbs: number;
  accessorials: Accessorial[];
  selected: string | null;
  onSelect: (vehicleId: string | null) => void;
}) {
  const { data: vehicles } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.listVehicles(),
    refetchInterval: 5_000,
  });

  if (!vehicles) return null;

  const evaluations = vehicles.map((v) => {
    const projP = v.loadPallets + palletCount;
    const projW = v.loadWeightLbs + weightLbs;
    const palletsOk = projP <= v.maxPallets;
    const weightOk = projW <= v.maxWeightLbs;
    const missingCaps = accessorials.filter((a) => !v.capabilities.includes(a));
    return { v, projP, projW, palletsOk, weightOk, missingCaps, fits: palletsOk && weightOk };
  });

  const fitting = evaluations.filter((e) => e.fits);
  const noneFit = fitting.length === 0;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="block text-[11px] uppercase tracking-wider font-semibold text-ink-muted">
          Auto-assign on create (optional)
        </label>
        {selected && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-[10px] text-ink-subtle hover:text-ink-muted underline"
          >
            Clear
          </button>
        )}
      </div>
      {noneFit ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <div className="font-semibold mb-1">No trucks have capacity for this shipment.</div>
          <div className="text-[11px]">
            Adjust pallets ({palletCount}) or weight ({weightLbs.toLocaleString()} lbs), or wait for a delivery to free up capacity. The shipment can still be created and assigned later.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {evaluations.map(({ v, projP, projW, palletsOk, weightOk, missingCaps, fits }) => {
            const isSelected = selected === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onSelect(isSelected ? null : v.id)}
                disabled={!fits}
                className={cn(
                  'rounded-md border p-2.5 text-left text-xs transition-colors',
                  isSelected ? 'border-indigo-400 bg-indigo-50/70 ring-1 ring-indigo-300' :
                  fits ? 'border-line hover:border-line-strong' :
                  'border-line/60 bg-surface-subtle opacity-60 cursor-not-allowed',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold">{v.id}</span>
                    <span className="text-[10px] uppercase tracking-wider text-ink-subtle">
                      {v.type.replace('_', ' ')}
                    </span>
                  </div>
                  {isSelected && <span className="text-[10px] font-semibold text-indigo-600">Selected</span>}
                </div>
                <div className="mt-1 space-y-0.5">
                  <div className={cn('flex items-center gap-1', !palletsOk && 'text-red-600')}>
                    {palletsOk ? <Check size={10} /> : <AlertCircle size={10} />}
                    <span className="font-mono tabular-nums">
                      {projP}/{v.maxPallets} pallets {!palletsOk && `(over by ${projP - v.maxPallets})`}
                    </span>
                  </div>
                  <div className={cn('flex items-center gap-1', !weightOk && 'text-red-600')}>
                    {weightOk ? <Check size={10} /> : <AlertCircle size={10} />}
                    <span className="font-mono tabular-nums">
                      {Math.round(projW / 1000)}k/{Math.round(v.maxWeightLbs / 1000)}k lbs {!weightOk && `(over by ${(projW - v.maxWeightLbs).toLocaleString()})`}
                    </span>
                  </div>
                  {missingCaps.length > 0 && fits && (
                    <div className="text-amber-700 text-[10px] flex items-center gap-1 mt-0.5">
                      <AlertCircle size={10} />
                      Missing: {missingCaps.join(', ')}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PlacesAutocomplete({
  label,
  value,
  onChange,
  onSelect,
  renderSuggestion,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSelect: (details: { name?: string; address1?: string; city?: string; state?: string; zipCode?: string }) => void;
  renderSuggestion: (s: { placeId: string; text: string; mainText: string; secondaryText: string }) => { main: string; secondary: string };
}) {
  const [suggestions, setSuggestions] = useState<Array<{ placeId: string; text: string; mainText: string; secondaryText: string }>>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (value.length < 3) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await api.autocompleteAddress(value);
        setSuggestions(res.suggestions.slice(0, 6));
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [value]);

  const pickSuggestion = async (placeId: string) => {
    setOpen(false);
    setSuggestions([]);
    try {
      const details = await api.placeDetails(placeId);
      if (details.found) onSelect(details);
    } catch {
      // No-op; user can continue typing
    }
  };

  return (
    <label className="block relative">
      <span className="block text-[10px] uppercase tracking-wider font-semibold text-ink-subtle mb-0.5">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || suggestions.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault();
            pickSuggestion(suggestions[activeIndex]!.placeId);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className="w-full px-2 py-1 text-xs rounded border border-line focus:ring-1 focus:ring-slate-900 focus:outline-none"
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-line rounded-md shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={s.placeId}
              type="button"
              onMouseDown={(e) => e.preventDefault()} // prevent blur before click
              onClick={() => pickSuggestion(s.placeId)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`w-full text-left px-3 py-2 border-b border-line/60 last:border-0 transition-colors ${
                activeIndex === i ? 'bg-indigo-50' : 'hover:bg-surface-subtle'
              }`}
            >
              <div className="text-xs font-medium text-ink leading-snug">{renderSuggestion(s).main}</div>
              <div className="text-[11px] text-ink-subtle leading-snug mt-0.5">{renderSuggestion(s).secondary}</div>
            </button>
          ))}
        </div>
      )}
    </label>
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
