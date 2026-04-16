/**
 * Demo setup script.
 *
 * Calls the running API to create a realistic dispatch scenario:
 *   - VH001 (dry_van, 12p/15k): 5 shipments assigned, route computed
 *   - VH002 (dry_van, 18p/24k): 4 shipments incl. hazmat, one PICKED_UP, route computed
 *   - VH003 (box_truck, 8p/10k): 3 shipments incl. liftgate, route computed
 *   - VH004 (dry_van, 14p/20k): empty — ready for user to assign
 *   - ~28 remaining INITIALIZED shipments for manual testing
 *   - SHP033/SHP035 blocked by data issues (can't assign)
 *
 * Run: `npm run demo` (API must be running on :3001)
 */

const API = 'http://localhost:3001/api/v1';

async function post(path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    ...(body
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(`  FAILED ${path}:`, JSON.stringify(err));
    return null;
  }
  return res.json();
}

async function patch(path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(`  FAILED ${path}:`, JSON.stringify(err));
    return null;
  }
  return res.json();
}

async function main() {
  // Verify API is up
  const health = await fetch(`${API.replace('/api/v1', '')}/health`).catch(() => null);
  if (!health?.ok) {
    console.error('API not running on :3001. Start it first: npm run dev');
    process.exit(1);
  }
  console.log('API is up. Setting up demo state...\n');

  // ── VH001: dry_van (12 pallets / 15,000 lbs) ────────────────────────────
  // Mix of small-to-medium LA metro shipments
  console.log('VH001 — 5 shipments (LA metro mix)');
  const vh1Ships = ['SHP001', 'SHP004', 'SHP005', 'SHP010', 'SHP021'];
  // SHP001: 4p/2800lb Auto Parts (Olympic→Jefferson)
  // SHP004: 3p/1800lb Refrigerated Produce (Traction→Van Nuys) — appointment
  // SHP005: 2p/950lb Office Supplies (Ontario→Pasadena)
  // SHP010: 1p/400lb Retail Goods (El Monte→Santa Monica) — limited_access
  // SHP021: 1p/350lb Pharmaceuticals (Chino Hills→West Hollywood) — appointment
  // Total: 11p / 6,300lb — fits in 12p/15k
  await post('/assignments', { vehicleId: 'VH001', shipmentIds: vh1Ships });
  console.log('  assigned:', vh1Ships.join(', '));
  const r1 = await post('/vehicles/VH001/route');
  console.log(`  route: ${r1?.stops?.length} stops, ${r1?.score?.totalDistanceMi} mi (${r1?.distanceSource})\n`);

  // ── VH002: dry_van (18 pallets / 24,000 lbs) ────────────────────────────
  // Includes hazmat + one PICKED_UP shipment for delivery-only routing demo
  console.log('VH002 — 4 shipments (incl. hazmat + one PICKED_UP)');
  const vh2Ships = ['SHP009', 'SHP017', 'SHP024', 'SHP038'];
  // SHP009: 4p/6800lb Industrial Chemicals (Wilmington→Pomona) — hazmat
  // SHP017: 3p/1500lb Consumer Electronics (Ontario→Whittier)
  // SHP024: 4p/2000lb Textiles (Montebello→Santa Ana)
  // SHP038: 5p/3000lb Fresh Produce (LA Produce Mkt→Claremont)
  // Total: 16p / 13,300lb — fits in 18p/24k
  await post('/assignments', { vehicleId: 'VH002', shipmentIds: vh2Ships });
  console.log('  assigned:', vh2Ships.join(', '));

  // Progress SHP009 (hazmat) to PICKED_UP — tests delivery-only routing
  await patch('/shipments/SHP009/status', { to: 'PICKED_UP' });
  console.log('  SHP009 → PICKED_UP (will route as delivery-only)');

  const r2 = await post('/vehicles/VH002/route');
  console.log(`  route: ${r2?.stops?.length} stops, ${r2?.score?.totalDistanceMi} mi (${r2?.distanceSource})`);
  const delivOnlyStops = (r2?.stops ?? []).filter((s: { shipmentId: string; kind: string }) =>
    s.shipmentId === 'SHP009',
  );
  console.log(`  SHP009 stops: ${delivOnlyStops.map((s: { kind: string }) => s.kind).join(', ') || 'none'} (expect: delivery only)\n`);

  // ── VH003: box_truck (8 pallets / 10,000 lbs) — has liftgate ───────────
  // Includes liftgate shipments (compatible) + limited_access
  console.log('VH003 — 3 shipments (liftgate-compatible box truck)');
  const vh3Ships = ['SHP011', 'SHP026', 'SHP028'];
  // SHP011: 3p/2100lb AV Equipment (Commerce→Burbank) — appointment + liftgate
  // SHP026: 2p/800lb Server Hardware (Hawthorne→Irvine) — liftgate
  // SHP028: 3p/1800lb Prepared Foods (Norwalk→Manhattan Beach)
  // Total: 8p / 4,700lb — exactly fills 8p, within 10k weight
  await post('/assignments', { vehicleId: 'VH003', shipmentIds: vh3Ships });
  console.log('  assigned:', vh3Ships.join(', '));

  const r3 = await post('/vehicles/VH003/route');
  console.log(`  route: ${r3?.stops?.length} stops, ${r3?.score?.totalDistanceMi} mi (${r3?.distanceSource})\n`);

  // ── VH004: dry_van (14 pallets / 20,000 lbs) — empty for user testing ──
  console.log('VH004 — left empty for manual assignment testing\n');

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('═══ Demo ready ═══');
  console.log('');
  console.log('Things to try in the browser (http://localhost:3000):');
  console.log('');
  console.log('  1. Click VH001/VH002/VH003 in the left rail → see workload + route map');
  console.log('     - VH002 has SHP009 (hazmat, PICKED_UP) routed as delivery-only');
  console.log('     - Route distances are real road miles via OSRM');
  console.log('');
  console.log('  2. Click a shipment row → detail drawer shows status + notes');
  console.log('     - SHP010: has address note "No trucks over 26ft"');
  console.log('     - SHP011: has accessorials appointment + liftgate');
  console.log('');
  console.log('  3. Try assigning shipments to VH004:');
  console.log('     - Check SHP002 (liftgate, 6p/5200lb) → assign to VH004 (dry_van)');
  console.log('       → expect accessorial warning (dry_van lacks liftgate)');
  console.log('     - Check SHP015 (14p/18200lb) → only VH004 has room → assign it');
  console.log('     - Click VH004 → Compute route → see map + stops');
  console.log('');
  console.log('  4. Status progression:');
  console.log('     - Click SHP004 (ASSIGNED on VH001) → "Mark PICKED UP"');
  console.log('     - Click it again → "Mark DELIVERED"');
  console.log('     - VH001 capacity bar should decrease (delivered = off truck)');
  console.log('');
  console.log('  5. Data quality: click the warning badge in the top bar');
  console.log('     - SHP033: missing data (blocking)');
  console.log('     - SHP035: invalid zip "00000" (blocking)');
  console.log('     - SHP002/SHP031: duplicate (warning)');
  console.log('');
  console.log('  6. Create new shipment: top-right "New shipment" button');
  console.log('     - Try submitting with empty address → validation error');
  console.log('');
  console.log('  7. Cancel: open any ASSIGNED shipment → "Mark CANCELLED"');
  console.log('     - Vehicle capacity frees up, route is invalidated');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
