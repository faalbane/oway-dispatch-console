/**
 * Typed API client. Talks to the Fastify backend through Next.js rewrites
 * (so the browser sees same-origin requests, no CORS headache in prod).
 */

import type {
  AssignmentRequest,
  CreateShipmentInput,
  Depot,
  Route,
  Shipment,
  ShipmentStatus,
  VehicleWithLoad,
} from '@oway/shared';
import type { ApiErrorEnvelope } from '@oway/shared';

const BASE = '/api/v1';

export class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly body: ApiErrorEnvelope) {
    super(body.error.message);
    this.name = 'ApiClientError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: { code: 'INTERNAL_ERROR', message: res.statusText } }))) as ApiErrorEnvelope;
    throw new ApiClientError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface ListShipmentsOptions {
  status?: ShipmentStatus;
  search?: string;
  vehicleId?: string | 'unassigned';
  sort?: 'createdAt' | 'palletCount' | 'weightLbs' | 'id';
  order?: 'asc' | 'desc';
}

export const api = {
  listShipments: (opts: ListShipmentsOptions = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts)) if (v) qs.set(k, String(v));
    return request<Shipment[]>(`/shipments${qs.toString() ? `?${qs}` : ''}`);
  },
  getShipment: (id: string) => request<Shipment>(`/shipments/${id}`),
  createShipment: (input: CreateShipmentInput) =>
    request<Shipment>('/shipments', { method: 'POST', body: JSON.stringify(input) }),
  transitionStatus: (id: string, to: ShipmentStatus) =>
    request<Shipment>(`/shipments/${id}/status`, { method: 'PATCH', body: JSON.stringify({ to }) }),

  listVehicles: () => request<VehicleWithLoad[]>('/vehicles'),
  getVehicleWorkload: (id: string) =>
    request<{ vehicle: VehicleWithLoad; shipments: Shipment[] }>(`/vehicles/${id}/workload`),
  computeRoute: (vehicleId: string) => request<Route>(`/vehicles/${vehicleId}/route`, { method: 'POST' }),
  getRoute: (vehicleId: string) => request<Route | null>(`/vehicles/${vehicleId}/route`).catch((e) => {
    if (e instanceof ApiClientError && e.status === 404) return null;
    throw e;
  }),

  assign: (req: AssignmentRequest) =>
    request<{
      vehicleId: string;
      shipments: Shipment[];
      accessorialWarnings: Array<{ shipmentId: string; missing: string[] }>;
    }>('/assignments', {
      method: 'POST',
      body: JSON.stringify(req),
    }),
  unassign: (shipmentId: string) =>
    request<Shipment>(`/assignments/${shipmentId}`, { method: 'DELETE' }),

  listDataIssues: () => request<{ shipmentId: string; issues: Shipment['dataIssues'] }[]>('/data-issues'),

  getDepot: () => request<Depot>('/depot'),

  getGeocodes: (keys: string[]) =>
    request<Array<{ key: string; lat: number | null; lng: number | null; source: string }>>(
      `/geocodes?keys=${encodeURIComponent(keys.join(','))}`,
    ),
};
