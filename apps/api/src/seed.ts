/**
 * Database seeder.
 *
 * Reads `data/seed.json` and `data/geocoded.json`, runs data-quality
 * validation, and populates SQLite. Idempotent: existing rows are upserted.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from './db.js';
import { validateShipment } from './domain/data-quality.js';
import { addressKey } from './lib/address-key.js';
import type { RawShipment } from '@oway/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');

interface GeocodeFile {
  [key: string]: { lat: number | null; lng: number | null; source: string; reason?: string };
}

async function main() {
  console.log('Loading seed data...');
  const seed = JSON.parse(readFileSync(resolve(ROOT, 'data/seed.json'), 'utf-8'));
  const geocoded: GeocodeFile = JSON.parse(readFileSync(resolve(ROOT, 'data/geocoded.json'), 'utf-8'));

  console.log(`Seed: ${seed.shipments.length} shipments, ${seed.vehicles.length} vehicles.`);
  console.log(`Geocoded: ${Object.keys(geocoded).length} addresses (${Object.values(geocoded).filter((g) => g.lat !== null).length} successful).`);

  // Depot
  await prisma.depot.upsert({
    where: { id: 'depot' },
    create: {
      id: 'depot',
      name: seed.depot.name,
      address1: seed.depot.address1,
      city: seed.depot.city,
      state: seed.depot.state,
      zipCode: seed.depot.zipCode,
      latitude: seed.depot.latitude,
      longitude: seed.depot.longitude,
    },
    update: {
      name: seed.depot.name,
      latitude: seed.depot.latitude,
      longitude: seed.depot.longitude,
    },
  });

  // Geocode cache
  for (const [key, entry] of Object.entries(geocoded)) {
    await prisma.geocode.upsert({
      where: { key },
      create: { key, lat: entry.lat, lng: entry.lng, source: entry.source, reason: entry.reason ?? null },
      update: { lat: entry.lat, lng: entry.lng, source: entry.source, reason: entry.reason ?? null },
    });
  }

  // Vehicles
  for (const v of seed.vehicles) {
    await prisma.vehicle.upsert({
      where: { id: v.id },
      create: { id: v.id, type: v.type, maxPallets: v.maxPallets, maxWeightLbs: v.maxWeightLbs },
      update: { type: v.type, maxPallets: v.maxPallets, maxWeightLbs: v.maxWeightLbs },
    });
  }

  // Build geocoded map for validation
  const geocodedMap = new Map<string, boolean>(
    Object.entries(geocoded).map(([k, v]) => [k, v.lat !== null]),
  );

  // Shipments (with data-quality validation)
  let blockingCount = 0;
  let warningCount = 0;
  const allRawShipments = seed.shipments as RawShipment[];

  for (const s of allRawShipments) {
    const issues = validateShipment(s, {
      allShipments: allRawShipments,
      geocoded: geocodedMap,
      vehicleCapacities: seed.vehicles,
    });

    blockingCount += issues.filter((i) => i.severity === 'blocking').length;
    warningCount += issues.filter((i) => i.severity === 'warning').length;

    await prisma.shipment.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        origin: JSON.stringify(s.origin),
        destination: JSON.stringify(s.destination),
        palletCount: s.palletCount,
        weightLbs: s.weightLbs,
        description: s.description ?? '',
        status: s.status ?? 'INITIALIZED',
        accessorials: JSON.stringify(s.accessorials ?? []),
        dataIssues: JSON.stringify(issues),
        createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
      },
      update: {
        origin: JSON.stringify(s.origin),
        destination: JSON.stringify(s.destination),
        palletCount: s.palletCount,
        weightLbs: s.weightLbs,
        description: s.description ?? '',
        accessorials: JSON.stringify(s.accessorials ?? []),
        dataIssues: JSON.stringify(issues),
      },
    });
  }

  console.log(
    `Seeded ${allRawShipments.length} shipments. Data quality: ${blockingCount} blocking issues, ${warningCount} warnings.`,
  );
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
