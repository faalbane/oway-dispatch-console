import { prisma } from '../db.js';
import { addressKey } from './address-key.js';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'oway-dispatch-console/0.1 (take-home)';

interface AddressLike {
  address1: string;
  city: string;
  state: string;
  zipCode: string;
}

export async function ensureGeocoded(address: AddressLike): Promise<{ lat: number; lng: number } | null> {
  const key = addressKey(address);

  const cached = await prisma.geocode.findUnique({ where: { key } });
  if (cached) {
    return cached.lat !== null && cached.lng !== null ? { lat: cached.lat, lng: cached.lng } : null;
  }

  const query = `${address.address1}, ${address.city}, ${address.state} ${address.zipCode}, USA`;
  try {
    const res = await fetch(
      `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`,
      { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) {
      await cacheResult(key, null, null, 'failed', `HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (json.length === 0) {
      await cacheResult(key, null, null, 'failed', 'no results');
      return null;
    }
    const lat = parseFloat(json[0]!.lat);
    const lng = parseFloat(json[0]!.lon);
    await cacheResult(key, lat, lng, 'nominatim');
    return { lat, lng };
  } catch {
    await cacheResult(key, null, null, 'failed', 'network error');
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
