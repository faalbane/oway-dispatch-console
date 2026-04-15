/**
 * One-time batch geocoder.
 *
 * Reads `data/seed.json`, extracts unique addresses, geocodes each via
 * Nominatim (OSM) with a 1.1s rate limit (their public-API policy), and
 * writes `data/geocoded.json` keyed by `address1|city|state|zipCode`.
 *
 * The output is committed to git so the app boots with no network calls.
 *
 * Run with: `npm run geocode` (from repo root).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SEED_PATH = resolve(ROOT, 'data/seed.json');
const OUT_PATH = resolve(ROOT, 'data/geocoded.json');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'oway-dispatch-console/0.1 (take-home)';
const RATE_LIMIT_MS = 1100;

interface AddressLike {
  address1: string;
  city: string;
  state: string;
  zipCode: string;
}

interface GeocodeEntry {
  key: string;
  lat: number | null;
  lng: number | null;
  source: 'nominatim' | 'manual' | 'depot' | 'failed';
  query: string;
  reason?: string;
}

function key(a: AddressLike): string {
  return `${a.address1}|${a.city}|${a.state}|${a.zipCode}`.toLowerCase().trim();
}

function isObviouslyBad(a: AddressLike): string | null {
  if (!a.address1) return 'empty address1';
  if (!a.city) return 'empty city';
  if (a.zipCode === '00000') return 'invalid zip 00000';
  if (a.city.toLowerCase() === 'nowhere') return 'placeholder city';
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function geocodeOne(a: AddressLike): Promise<GeocodeEntry> {
  const k = key(a);
  const bad = isObviouslyBad(a);
  if (bad) {
    return { key: k, lat: null, lng: null, source: 'failed', query: '', reason: bad };
  }
  const query = `${a.address1}, ${a.city}, ${a.state} ${a.zipCode}, USA`;
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) {
      return { key: k, lat: null, lng: null, source: 'failed', query, reason: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (json.length === 0) {
      return { key: k, lat: null, lng: null, source: 'failed', query, reason: 'no results' };
    }
    return {
      key: k,
      lat: parseFloat(json[0]!.lat),
      lng: parseFloat(json[0]!.lon),
      source: 'nominatim',
      query,
    };
  } catch (err) {
    return {
      key: k,
      lat: null,
      lng: null,
      source: 'failed',
      query,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const seed = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));
  const existing: Record<string, GeocodeEntry> = existsSync(OUT_PATH)
    ? JSON.parse(readFileSync(OUT_PATH, 'utf-8'))
    : {};

  const addresses = new Map<string, AddressLike>();

  // Depot first
  const depot = seed.depot;
  const depotKey = key(depot);
  existing[depotKey] = {
    key: depotKey,
    lat: depot.latitude,
    lng: depot.longitude,
    source: 'depot',
    query: `${depot.address1}, ${depot.city}, ${depot.state} ${depot.zipCode}`,
  };

  for (const s of seed.shipments) {
    for (const a of [s.origin, s.destination]) {
      const k = key(a);
      if (!addresses.has(k)) addresses.set(k, a);
    }
  }

  console.log(`Found ${addresses.size} unique addresses.`);
  const toGeocode = [...addresses.entries()].filter(([k]) => !existing[k]);
  console.log(`Need to geocode: ${toGeocode.length} (${addresses.size - toGeocode.length} cached).`);

  let i = 0;
  for (const [k, addr] of toGeocode) {
    i++;
    process.stdout.write(`[${i}/${toGeocode.length}] ${k.slice(0, 60)}... `);
    const result = await geocodeOne(addr);
    existing[k] = result;
    console.log(result.lat ? `OK (${result.lat.toFixed(4)}, ${result.lng!.toFixed(4)})` : `FAIL: ${result.reason}`);
    // Persist after every call so a Ctrl-C doesn't lose progress
    writeFileSync(OUT_PATH, JSON.stringify(existing, null, 2));
    if (i < toGeocode.length) await sleep(RATE_LIMIT_MS);
  }

  const failed = Object.values(existing).filter((e) => e.lat === null);
  console.log(`\nDone. ${Object.keys(existing).length} total entries, ${failed.length} failed.`);
  if (failed.length) {
    console.log('Failed addresses (expected: SHP033 missing, SHP035 invalid):');
    for (const f of failed) console.log(`  - ${f.key}: ${f.reason}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
