'use client';

import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect } from 'react';
import type { Depot, Route } from '@oway/shared';

// Fix Leaflet's default icon URLs (Next.js bundling issue)
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function numberedIcon(n: number, kind: 'pickup' | 'delivery', windowStatus: 'ok' | 'tight' | 'violated') {
  const color = windowStatus === 'violated' ? '#dc2626' : windowStatus === 'tight' ? '#d97706' : kind === 'pickup' ? '#2563eb' : '#059669';
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);">${n + 1}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function depotIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="background:#0f172a;color:#fff;width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);">D</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, points]);
  return null;
}

interface Props {
  route: Route | null;
  depot: Depot;
}

export function RouteMap({ route, depot }: Props) {
  const points: [number, number][] = [
    [depot.latitude, depot.longitude],
    ...(route?.stops.map((s): [number, number] => [s.lat, s.lng]) ?? []),
    [depot.latitude, depot.longitude],
  ];

  return (
    <div className="h-full w-full isolate relative">
      <MapContainer
        center={[depot.latitude, depot.longitude]}
        zoom={10}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png"
        />
        <FitBounds points={points} />

        {/* Depot */}
        <Marker position={[depot.latitude, depot.longitude]} icon={depotIcon()}>
          <Popup>
            <div className="text-xs">
              <div className="font-semibold">{depot.name} (Depot)</div>
              <div>{depot.address1}</div>
              <div>{depot.city}, {depot.state} {depot.zipCode}</div>
            </div>
          </Popup>
        </Marker>

        {/* Stops */}
        {route?.stops.map((s) => (
          <Marker key={`${s.shipmentId}-${s.kind}`} position={[s.lat, s.lng]} icon={numberedIcon(s.order, s.kind, s.windowStatus)}>
            <Popup>
              <div className="text-xs space-y-0.5">
                <div className="font-semibold">
                  {s.order + 1}. {s.kind.toUpperCase()} — {s.shipmentId}
                </div>
                <div>{s.address.name}</div>
                <div>{s.address.address1}, {s.address.city}</div>
                <div className="pt-1 border-t border-slate-200 mt-1">
                  Arrive {s.etaArrival} · Window {s.address.openTime}–{s.address.closeTime}
                </div>
                {s.address.notes && (
                  <div
                    className="mt-1.5 rounded bg-amber-50 border border-amber-200 px-1.5 py-1 text-amber-800"
                    style={{ fontSize: 11 }}
                  >
                    ⚠ {s.address.notes}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Route polyline */}
        {route && route.stops.length > 0 && (
          <Polyline
            positions={points}
            pathOptions={{ color: '#6366f1', weight: 3, opacity: 0.8, dashArray: '6 4' }}
          />
        )}
      </MapContainer>
    </div>
  );
}
