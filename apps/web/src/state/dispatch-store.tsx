'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface DispatchState {
  selectedShipmentIds: Set<string>;
  focusedVehicleId: string | null;
  detailShipmentId: string | null;
  toggleShipment: (id: string) => void;
  selectShipments: (ids: string[]) => void;
  clearSelection: () => void;
  focusVehicle: (id: string | null) => void;
  openShipmentDetail: (id: string | null) => void;
}

const DispatchContext = createContext<DispatchState | null>(null);

export function DispatchProvider({ children }: { children: React.ReactNode }) {
  const [selectedShipmentIds, setSelected] = useState<Set<string>>(new Set());
  const [focusedVehicleId, setFocused] = useState<string | null>(null);
  const [detailShipmentId, setDetail] = useState<string | null>(null);

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

  const focusVehicle = useCallback((id: string | null) => {
    setFocused(id);
    if (id) setDetail(null);
  }, []);

  const openShipmentDetail = useCallback((id: string | null) => {
    setDetail(id);
    if (id) setFocused(null);
  }, []);

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
    }),
    [selectedShipmentIds, focusedVehicleId, detailShipmentId, toggleShipment, selectShipments, clearSelection, focusVehicle, openShipmentDetail],
  );

  return <DispatchContext.Provider value={value}>{children}</DispatchContext.Provider>;
}

export function useDispatch() {
  const ctx = useContext(DispatchContext);
  if (!ctx) throw new Error('useDispatch must be used inside DispatchProvider');
  return ctx;
}
