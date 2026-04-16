import { prisma } from '../db.js';
import { addressKey } from './address-key.js';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const GOOGLE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const USER_AGENT = 'oway-dispatch-console/0.1 (take-home)';

interface AddressLike {
  address1: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface GeocodeHit {
  lat: number;
  lng: number;
  source: 'google' | 'nominatim' | 'cache';
  formattedAddress?: string;
}

/**
 * Geocode an address, preferring Google Maps when a GOOGLE_MAPS_API_KEY is
 * present, falling back to Nominatim/OSM. Results are cached in the Geocode
 * table so we never re-call for the same address.
 */
export async function ensureGeocoded(address: AddressLike): Promise<GeocodeHit | null> {
  const key = addressKey(address);

  const cached = await prisma.geocode.findUnique({ where: { key } });
  if (cached && cached.lat !== null && cached.lng !== null) {
    return { lat: cached.lat, lng: cached.lng, source: 'cache' };
  }
  if (cached && cached.source === 'failed') {
    return null;
  }

  const query = `${address.address1}, ${address.city}, ${address.state} ${address.zipCode}, USA`;

  // Try Google first if key is present.
  const key_env = process.env.GOOGLE_MAPS_API_KEY;
  if (key_env) {
    const google = await tryGoogle(query, key_env);
    if (google) {
      await cacheResult(key, google.lat, google.lng, 'google');
      return { ...google, source: 'google' };
    }
  }

  // Fall back to Nominatim (or use it as primary if no Google key).
  const nomi = await tryNominatim(query);
  if (nomi) {
    await cacheResult(key, nomi.lat, nomi.lng, 'nominatim');
    return { ...nomi, source: 'nominatim' };
  }

  await cacheResult(key, null, null, 'failed', 'no results');
  return null;
}

async function tryGoogle(
  query: string,
  apiKey: string,
): Promise<{ lat: number; lng: number; formattedAddress: string } | null> {
  try {
    const res = await fetch(
      `${GOOGLE_URL}?address=${encodeURIComponent(query)}&key=${apiKey}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status: string;
      results: Array<{
        geometry: { location: { lat: number; lng: number } };
        formatted_address: string;
      }>;
    };
    if (json.status !== 'OK' || json.results.length === 0) return null;
    const r = json.results[0]!;
    return {
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      formattedAddress: r.formatted_address,
    };
  } catch {
    return null;
  }
}

async function tryNominatim(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`,
      { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (json.length === 0) return null;
    return {
      lat: parseFloat(json[0]!.lat),
      lng: parseFloat(json[0]!.lon),
    };
  } catch {
    return null;
  }
}

async function cacheResult(key: string, lat: number | null, lng: number | null, source: string, reason?: string) {
  await prisma.geocode.upsert({
    where: { key },
    create: { key, lat, lng, source, reason: reason ?? null },
    update: { lat, lng, source, reason: reason ?? null },
  });
}
