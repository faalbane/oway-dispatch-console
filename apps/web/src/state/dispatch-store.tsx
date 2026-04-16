'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

type HistoryEntry = { kind: 'shipment' | 'vehicle'; id: string };

interface DispatchState {
  selectedShipmentIds: Set<string>;
  focusedVehicleId: string | null;
  detailShipmentId: string | null;
  toggleShipment: (id: string) => void;
  selectShipments: (ids: string[]) => void;
  clearSelection: () => void;
  focusVehicle: (id: string | null) => void;
  openShipmentDetail: (id: string | null) => void;
  /** Back/forward browsing through prior shipment/vehicle views. */
  goBack: () => void;
  goForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  historyDepth: number;
}

const DispatchContext = createContext<DispatchState | null>(null);

export function DispatchProvider({ children }: { children: React.ReactNode }) {
  const [selectedShipmentIds, setSelected] = useState<Set<string>>(new Set());
  const [focusedVehicleId, setFocused] = useState<string | null>(null);
  const [detailShipmentId, setDetail] = useState<string | null>(null);

  // Navigation history. Each entry is a past or present view. The user can
  // step back and forward with the arrow buttons in the right rail header.
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const applyEntry = useCallback((e: HistoryEntry | null) => {
    if (!e) {
      setDetail(null);
      setFocused(null);
      return;
    }
    if (e.kind === 'shipment') {
      setDetail(e.id);
      setFocused(null);
    } else {
      setFocused(e.id);
      setDetail(null);
    }
  }, []);

  const navigate = useCallback(
    (entry: HistoryEntry) => {
      setHistory((prev) => {
        const truncated = prev.slice(0, historyIndex + 1);
        // If re-selecting the same view, don't push a duplicate.
        const last = truncated[truncated.length - 1];
        if (last && last.kind === entry.kind && last.id === entry.id) {
          return truncated;
        }
        const next = [...truncated, entry];
        setHistoryIndex(next.length - 1);
        return next;
      });
      applyEntry(entry);
    },
    [historyIndex, applyEntry],
  );

  const toggleShipment = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectShipments = useCallback((ids: string[]) => {
    setSelected(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const focusVehicle = useCallback(
    (id: string | null) => {
      if (id === null) applyEntry(null);
      else navigate({ kind: 'vehicle', id });
    },
    [applyEntry, navigate],
  );

  const openShipmentDetail = useCallback(
    (id: string | null) => {
      if (id === null) applyEntry(null);
      else navigate({ kind: 'shipment', id });
    },
    [applyEntry, navigate],
  );

  const goBack = useCallback(() => {
    if (historyIndex <= 0) return;
    const i = historyIndex - 1;
    setHistoryIndex(i);
    applyEntry(history[i]!);
  }, [history, historyIndex, applyEntry]);

  const goForward = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const i = historyIndex + 1;
    setHistoryIndex(i);
    applyEntry(history[i]!);
  }, [history, historyIndex, applyEntry]);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex >= 0 && historyIndex < history.length - 1;

  const value = useMemo(
    () => ({
      selectedShipmentIds,
      focusedVehicleId,
      detailShipmentId,
      toggleShipment,
      selectShipments,
      clearSelection,
      focusVehicle,
      openShipmentDetail,
      goBack,
      goForward,
      canGoBack,
      canGoForward,
      historyDepth: history.length,
    }),
    [
      selectedShipmentIds, focusedVehicleId, detailShipmentId,
      toggleShipment, selectShipments, clearSelection,
      focusVehicle, openShipmentDetail,
      goBack, goForward, canGoBack, canGoForward,
      history.length,
    ],
  );

  return <DispatchContext.Provider value={value}>{children}</DispatchContext.Provider>;
}

export function useDispatch() {
  const ctx = useContext(DispatchContext);
  if (!ctx) throw new Error('useDispatch must be used inside DispatchProvider');
  return ctx;
}
