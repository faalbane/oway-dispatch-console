'use client';

import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect } from 'react';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function labelIcon(label: string, color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-weight:700;font-size:11px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);white-space:nowrap;">${label}</div>`,
    iconSize: [60, 24],
    iconAnchor: [30, 12],
  });
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [map, points]);
  return null;
}

function gmapsUrl(addr: { address1?: string; city?: string; state?: string; zipCode?: string }) {
  const q = [addr.address1, addr.city, addr.state, addr.zipCode].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

interface MapPoint {
  lat: number;
  lng: number;
  name: string;
  address1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

interface Props {
  origin: MapPoint | null;
  destination: MapPoint | null;
}

export function ShipmentMap({ origin, destination }: Props) {
  const points: [number, number][] = [];
  if (origin) points.push([origin.lat, origin.lng]);
  if (destination) points.push([destination.lat, destination.lng]);

  const center: [number, number] = points.length > 0
    ? [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length]
    : [33.83, -118.24];

  return (
    <div className="h-full w-full isolate relative">
      <MapContainer center={center} zoom={10} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={19}
        />
        <FitBounds points={points} />
        {origin && (
          <Marker position={[origin.lat, origin.lng]} icon={labelIcon('Pickup', '#2563eb')}>
            <Popup>
              <div className="text-xs space-y-0.5">
                <div className="font-semibold">{origin.name}</div>
                <div className="text-gray-600">{[origin.address1, origin.city, origin.state, origin.zipCode].filter(Boolean).join(', ')}</div>
                <a href={gmapsUrl(origin)} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-[11px]">Open in Google Maps</a>
              </div>
            </Popup>
          </Marker>
        )}
        {destination && (
          <Marker position={[destination.lat, destination.lng]} icon={labelIcon('Delivery', '#059669')}>
            <Popup>
              <div className="text-xs space-y-0.5">
                <div className="font-semibold">{destination.name}</div>
                <div className="text-gray-600">{[destination.address1, destination.city, destination.state, destination.zipCode].filter(Boolean).join(', ')}</div>
                <a href={gmapsUrl(destination)} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-[11px]">Open in Google Maps</a>
              </div>
            </Popup>
          </Marker>
        )}
        {origin && destination && (
          <Polyline
            positions={[[origin.lat, origin.lng], [destination.lat, destination.lng]]}
            pathOptions={{ color: '#6366f1', weight: 2, opacity: 0.6, dashArray: '6 4' }}
          />
        )}
      </MapContainer>
    </div>
  );
}
