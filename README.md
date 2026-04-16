# Oway Carrier Dispatch Console

A full-stack dispatch tool for managing LTL freight: shipment lifecycle, vehicle assignment with capacity constraints, and multi-stop route generation respecting pickup-before-delivery precedence and time windows.

Built as a take-home for the Oway full-stack engineering role.

---

## Quick start

```bash
git clone https://github.com/faalbane/oway-dispatch-console.git
cd oway-dispatch-console
npm install
npm run db:reset      # creates SQLite DB + seeds 40 shipments + 4 vehicles + depot
npm run dev           # boots API (:3001) and web (:3000) concurrently
```

Open <http://localhost:3000>.

> **Reviewer convenience: hardcoded Google Maps API key.** A Google Maps API key is baked into `apps/api/src/lib/geocode-on-demand.ts` as a fallback so address autocomplete, geocoding verification, and Place Details "just work" the moment you run the app — no GCP setup required. **This would never ship in production**: real deployments inject the key via env var (Secret Manager / equivalent), pair it with origin/IP restrictions and rotation. To override locally, set `GOOGLE_MAPS_API_KEY` in `apps/api/.env` and the env var wins.
>
> **Lockdown applied for the demo** (since the key sits in a public repo): the key is restricted to **only** `geocoding-backend.googleapis.com` and `places.googleapis.com` (so it can't be abused for Maps SDK, Translate, YouTube, etc.), and each of those APIs has a **2,000 requests/day project-level quota cap**. That's plenty for the team to test extensively but caps the blast radius if the key gets scraped — at worst, the dispatch app's autocomplete goes silent for the rest of the day until the quota resets at midnight Pacific. The key lives on an isolated GCP project (`oway-prep`) that will be rotated/disabled after the interview cycle.

Tested on Node 24 / npm 11. Requires Node 20+ (Next.js 15's documented minimum).

### One-command demo state

```bash
npm run demo
```

Pre-populates a realistic dispatch scenario: VH001/VH002/VH003 each have shipments assigned and routes computed (one with a PICKED_UP shipment for delivery-only routing demo); SHP012 marked DELIVERED, SHP014 CANCELLED so all 5 statuses are visible; VH004 left empty for manual testing. Prints a guided walkthrough.

### Postgres (optional)

```bash
docker compose up -d
# Edit apps/api/prisma/schema.prisma → provider = "postgresql"
# Edit apps/api/.env → DATABASE_URL="postgresql://oway:oway@localhost:5432/oway_dispatch"
npm run db:reset
npm run dev
```

Full instructions inside `docker-compose.yml`.

### Useful scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Concurrently boots API (`:3001`) and web (`:3000`) with hot reload |
| `npm run demo` | Reset DB + run the demo setup (3 vehicles loaded with shipments + routes) |
| `npm test` | Runs the Vitest suite (37 tests covering the domain layer) |
| `npm run db:reset` | Drops & recreates the SQLite DB, then re-seeds it |
| `npm run seed` | Re-runs the seeder (idempotent — upserts existing rows) |
| `npm run geocode` | Re-runs the batch geocoder (writes `data/geocoded.json`) |
| `npm run typecheck` | Type-checks every workspace |
| `npm run build` | Builds shared package, API, and web for production |

---

## What's in the console

### Dispatch view (`/`)
Three-region layout: vehicle rail · shipment table · context-sensitive right panel.

- **Shipment table** — filter by status (pill tabs with live count `ALL (46)`), sort by ID/pallets/weight, search by ID or description. DELIVERED and CANCELLED rows are visually de-emphasized (opacity + strike-through). Origin and destination addresses stack on two lines with colored dots (blue/green) matching the map pins. Status badges, accessorial chips, vehicle assignment, and per-row data-quality flag indicators all visible at a glance.

- **Right panel** — switches based on what you last clicked (true last-action-wins, with browser-style **back/forward arrows** to retrace navigation):
  - **Shipment detail**: mini-map with pickup/delivery pins + Google Maps deep-links, full address blocks with driver `notes` callouts, accessorials, data-quality issues, status transition buttons (filtered to legal forward steps), an **"Override status"** escape hatch for ops corrections, and an inline **"Assign to vehicle"** picker for unassigned shipments.
  - **Vehicle context**: capacity bars, computed route summary with **"Why this ordering?"** rationale (objective + formula + decision bullets), full Leaflet route map with numbered stops, ordered stop list with arrival times in AM/PM PT and time-window status (ok/tight/violated), and a workload list with one-click unassign.
  - **Multi-select assignment**: when shipment checkboxes are checked, the panel becomes a vehicle picker with live capacity preview (overflow shown in red) and accessorial-compatibility warnings.

- **Top bar** — Dispatch / Fleet nav, depot location, **data-quality count badge** that opens a dialog with smart per-issue quick actions, and a **"New Shipment"** button.

### Fleet view (`/fleet`)
Dedicated overview with 4 KPI tiles (utilization %, trucks in service, active shipments, total weight) and one rich card per vehicle showing capacity bars, capability pills, status (Idle/Active/Near full/Full), and the full assigned-shipments list.

### New / Edit Shipment dialog
- Address fields with **Google Places Autocomplete** (LA-area location bias) — typing a business name or street fills `address1`/`city`/`state`/`zipCode` from Google's structured `addressComponents`
- **Live address verification** under each address fieldset — debounced 600ms, shows resolved lat/lng + Google's canonical `formattedAddress`
- **Live truck eligibility** — as pallets/weight/accessorials change, each vehicle card updates with projected load. Trucks that would overflow are disabled. Selecting one converts the submit button to **"Create & assign to VHxxx"** (one atomic flow)
- Per-field Zod validation errors (no generic "request validation failed" — surfaces exact path + message)
- Same dialog handles edit mode (pencil icon in shipment detail header, or "Edit" quick action from Data Quality dialog) — pre-fills with current values, hides the auto-assign section, swaps button to "Save changes"

### Data Quality dialog
All issues in one place with **smart resolution actions per type**:
- `DUPLICATE_OF X` → `[ View original (SHPxxx) ]` `[ Mark intentional ]` `[ Cancel this duplicate ]`
- `MISSING_ADDRESS` / `INVALID_ZIP` / `UNGEOCODABLE` → `[ Edit address ]` `[ Cancel shipment ]`
- `ZERO_PALLETS` / `ZERO_WEIGHT` / `OVERSIZED` / `MISSING_DESCRIPTION` → `[ Edit shipment ]` `[ Cancel shipment ]`

Shipment IDs in any message text are auto-linkified — click `SHP031` anywhere and it jumps to that shipment's detail.

---

## Architecture

```
oway-dispatch/
├── apps/
│   ├── api/                  # Fastify + TypeScript + Prisma + SQLite
│   │   ├── src/
│   │   │   ├── domain/       # Pure functions: routing, capacity, status,
│   │   │   │                 #   data-quality, time, distance
│   │   │   ├── services/     # Business logic — orchestrate domain + DB
│   │   │   ├── routes/       # HTTP layer — Zod validation, structured errors
│   │   │   ├── lib/          # Helpers (serialization, address keys,
│   │   │   │                 #   on-demand geocoding, error class)
│   │   │   ├── seed.ts       # Loads JSON, validates, populates DB + geocode cache
│   │   │   └── server.ts     # Fastify app, error handler, route registration
│   │   └── prisma/schema.prisma
│   └── web/                  # Next.js 15 (App Router) + Tailwind + react-leaflet
│       └── src/
│           ├── app/          # Route entries (/ dispatch, /fleet)
│           ├── components/   # ui/ primitives + dashboard/ feature components
│           ├── lib/          # Typed API client, formatters
│           └── state/        # Selection + navigation history store
├── packages/
│   └── shared/               # Zod schemas, status state machine, error codes
├── data/
│   ├── seed.json             # Provided seed (40 shipments / 4 vehicles / depot)
│   └── geocoded.json         # Pre-computed lat/lng for the seed addresses
├── scripts/
│   ├── geocode.ts            # One-time batch geocoder (Nominatim, rate-limited)
│   └── setup-demo.ts         # `npm run demo` — populates a realistic scenario
├── docker-compose.yml        # Optional Postgres swap
└── README.md
```

### Why this stack

| Choice | Why |
| --- | --- |
| **Monorepo (npm workspaces)** | The spec asks "can the system grow?" Real service boundaries demonstrate that better than folder conventions inside one Next.js app. |
| **Fastify (vs Express)** | Native TypeScript types, schema-first validation that pairs cleanly with Zod, faster cold-start. |
| **Prisma + SQLite** | Type-safe DB layer. SQLite means zero install friction; swap to Postgres is one line in `schema.prisma`. |
| **Shared Zod package** | Schemas, runtime validation, and TypeScript types all derive from one definition. The API contract *is* the schema. |
| **Next.js 15 App Router** | Modern React Server Components story; rewrites simplify CORS-free dev (web hits `/api/v1/...` which proxies to `:3001`). |
| **Tailwind + small Radix primitives** | Tasteful defaults without spending budget on bespoke design. shadcn-style — primitives are hand-written rather than running their CLI. |
| **react-leaflet + Carto Voyager tiles** | Free, no API key required for tiles. Better street detail than raw OSM tiles. |
| **TanStack Query** | Server state with cache invalidation. Polls every 5s so the UI feels live without WebSockets. |

---

## Routing & Assignment — the interesting part

Both problems are NP-hard at scale; the value is in **explainable heuristics with named tradeoffs**.

### Distance model
- **Primary**: OSRM public API (`router.project-osrm.org/table/v1/driving`) for real road distances between all stops. Fetched once per route as a full distance matrix.
- **Fallback**: haversine (great-circle straight-line) when OSRM is unreachable. Tests use haversine exclusively for determinism.
- The routing engine takes a `distanceFn` parameter — neither OSRM nor haversine is hardwired. Each computed route tags its `distanceSource` so you can verify in the Why panel.

### Vehicle assignment

**Manual-first with computed assistance.** Ops selects shipments, picks a vehicle, the system enforces capacity. The UI shows projected load *before* commit (capacity bars get a hatched preview overlay). Capacity validation is a pure function (`src/domain/capacity.ts`) used both server-side (atomic transaction with row-level lock on Postgres) and client-side (live preview).

**Capacity counts only active shipments.** ASSIGNED + PICKED_UP consume capacity; DELIVERED and CANCELLED don't. The shipment's `vehicleId` stays set after delivery (audit: which vehicle delivered this?), but the truck has its slots back.

**Reassignment between vehicles is allowed for ASSIGNED shipments.** "Move this load from VH001 to VH002 — it's too heavy." Routes for both source and target vehicles invalidate atomically.

**Accessorial compatibility** is checked as a *warning* (not blocker). Vehicles carry a `capabilities` array (box_truck: liftgate/limited_access/appointment; dry_van: hazmat/appointment). Assignment surfaces e.g. "SHP002 needs liftgate — VH001 doesn't have one" but doesn't block — ops may have a manual liftgate on-site.

### Route generation (PDPTW)

Pickup-and-Delivery Problem with Time Windows. Algorithm in `src/domain/routing.ts`:

1. **Sort by tightest delivery deadline** (anchors the route around the most time-constrained stops).
2. **Greedy insertion**: for each shipment, try every valid `(pickup, delivery)` insertion that preserves precedence. Pick the lowest-score one.
3. **Constrained 2-opt**: one improvement pass that reverses subsequences only where the result still preserves every shipment's pickup-before-delivery ordering.
4. **Score** = `total_distance_miles + 2 × window_violation_minutes − 5 × adjacent_hazmat_pairs` (weights configurable in `packages/shared/src/constants.ts`).

**Status-aware:**
- `ASSIGNED` shipments → full pickup + delivery stops
- `PICKED_UP` shipments → delivery stop only (pickup already happened — re-routing skips it)
- `DELIVERED` / `CANCELLED` shipments → excluded entirely

**Time windows**: estimate arrival times using a constant **25 mph effective speed** (LA-metro-realistic) + **20 min service time per stop**, departing the depot at **06:00**. Stops outside their window are flagged with `windowStatus: 'violated'` but **not removed** — ops decides whether to drop the shipment or accept the violation. The map and stop list color-code window status (green/amber/red).

### What "optimized" means here

We're explicitly not minimizing distance alone. The Route response includes a structured **rationale** (objective, formula, decision bullets) that the UI surfaces under "Why this ordering?":

- **Distance** is one axis to minimize.
- **Time-window violations** matter much more than a few extra miles. A truck that arrives after the dock closed is a phone call to a yelling customer. Soft penalty (2 min/violation) is in the same units as miles, so the tradeoff is explicit.
- **Hazmat clustering** is a small bonus for adjacent hazmat stops. Real ops protocol overhead for hazmat is meaningful (paperwork, gear); grouping amortizes it.

### Why not OR-Tools / off-the-shelf solvers

40 shipments × 4 vehicles is small enough that OR-Tools would solve to optimality in seconds. So why not use it? The spec rewards "we want to see you reason about tradeoffs." A documented heuristic I can step through in the interview > a black-box optimizer I'd have to apologize for. With more time: simulated annealing, large neighborhood search, or yes — OR-Tools for comparison.

### Concurrency

Assignment uses a Prisma interactive transaction so the read-validate-write sequence is atomic. Two concurrent ops users assigning to the same vehicle can't race past capacity:

- **SQLite** (default): all writes are globally serialized — the second transaction blocks until the first commits, then reads the updated load.
- **Postgres**: the transaction issues `SELECT id FROM "Vehicle" WHERE id = $1 FOR UPDATE` before reading capacity. Detected at startup via `DATABASE_URL` (`file:` = SQLite, else Postgres). No code change needed when switching.

---

## Data quality handling

Validation runs at seed time and on every shipment create/edit. Findings persist on the row (`Shipment.dataIssues` JSON column) and surface in three places: top-bar count, full dialog with **smart per-issue quick actions**, and per-row badges in the table.

| Shipment | Issue | Treatment |
| --- | --- | --- |
| **SHP002 / SHP031** | Identical content. | Both flagged `DUPLICATE_OF` with timestamp delta in the message ("created 0 min apart — likely accidental double-entry" vs softer phrasing for hours/days apart). Quick actions: View original · **Mark intentional** (dismisses) · Cancel this duplicate. Conceptually, identical content can be valid (recurring orders, split hauls) — so duplicates are flagged but never blocking. |
| **SHP033** | Empty origin address, zero pallets, zero weight, blank description. | Three blocking issues. Cannot be assigned until edited. Quick action: Edit shipment opens the form pre-filled with the broken values. |
| **SHP035** | Destination zip `00000`, city `Nowhere`. | Flagged blocking with `INVALID_ZIP`; geocoding fails → `UNGEOCODABLE`. Quick action: Edit address or Cancel. |
| **SHP015** | 14 pallets / 18,200 lbs — only fits VH002. | Not a data issue. Surfaced at assignment time via the capacity validator with structured `CAPACITY_EXCEEDED` error including exact overage. |

### Dismissing intentional flags
Ops can mark any duplicate as "intentional" via the data-quality dialog. The dismissal is recorded on the shipment (`dismissedIssues` JSON column with `{code, contextHash}` pairs) and filtered out of subsequent listings. The underlying detection still runs and the issue stays on `dataIssues` for audit — it just stops surfacing.

---

## Address handling (Google Maps integration)

Three Google APIs in play, with graceful fallback to OpenStreetMap throughout:

1. **Geocoding API** — turns an address into lat/lng. Used at create/edit time and as a fallback when planning routes for never-before-seen addresses. Cached in the `Geocode` table so we never re-call.
2. **Places Autocomplete (New)** — type-as-you-go suggestions in the New Shipment form. LA-area location bias (50km circle around downtown LA) so SoCal results rank first. Both Name and Address fields use it.
3. **Place Details (New)** — when a suggestion is picked, fetches structured `addressComponents` and parses into our `{address1, city, state, zipCode}` shape. Selecting "Whole Foods Market" as a Name auto-fills the entire address block.

Without a Google key (env var unset, hardcoded fallback removed), the system falls back to Nominatim/OSM for verification. Autocomplete returns empty (Nominatim has no comparable endpoint).

---

## API surface

Every request is Zod-validated. Every error is a structured envelope: `{ error: { code, message, details? } }`.

```
GET    /health
GET    /api/v1/depot

GET    /api/v1/shipments               ?status=&search=&vehicleId=&sort=&order=
GET    /api/v1/shipments/:id
POST   /api/v1/shipments                create with strict validation
PATCH  /api/v1/shipments/:id           edit content fields (re-validates, geocodes new addresses)
PATCH  /api/v1/shipments/:id/status    { to } — validates against state machine
POST   /api/v1/shipments/:id/override-status  { to } — escape hatch for ops corrections

GET    /api/v1/vehicles                 with computed load + remaining capacity + capabilities
GET    /api/v1/vehicles/:id/workload    assigned (active) shipments + totals

POST   /api/v1/assignments              { vehicleId, shipmentIds[] } — atomic, capacity-validated, returns accessorialWarnings
DELETE /api/v1/assignments/:shipmentId  unassigns + reverts to INITIALIZED + invalidates route

POST   /api/v1/vehicles/:id/route       compute & persist route (uses OSRM matrix when available)
GET    /api/v1/vehicles/:id/route       last computed route

GET    /api/v1/data-issues              all shipments with non-dismissed validation findings
POST   /api/v1/data-issues/dismiss      { shipmentId, code, context } — mark issue intentional

GET    /api/v1/geocodes                 ?keys=key1,key2 — bulk lookup
POST   /api/v1/geocodes/verify          live address verification (Google → Nominatim fallback)
GET    /api/v1/geocodes/autocomplete    ?q=... — Google Places autocomplete (empty if no key)
GET    /api/v1/geocodes/place-details   ?placeId=... — Google Place Details (empty if no key)
```

**Error codes**: `VALIDATION_ERROR`, `NOT_FOUND`, `INVALID_STATUS_TRANSITION`, `CAPACITY_EXCEEDED`, `SHIPMENT_BLOCKED`, `ALREADY_ASSIGNED`, `GEOCODING_FAILED`, `ROUTE_INFEASIBLE`, `INTERNAL_ERROR`.

---

## Testing

```bash
npm test
```

37 tests across the domain layer:
- `routing.test.ts` — pickup-before-delivery precedence, time-window flagging, ungeocodable handling, hazmat clustering bonus, monotonic arrival times
- `capacity.test.ts` — at-limit edges, both-violations case (the SHP015-on-VH001 scenario), accumulation on top of current load
- `status.test.ts` — every legal/illegal transition, terminal-state handling, isActiveAssignment
- `data-quality.test.ts` — every validation rule, including the four seed landmines
- `time.test.ts` — including a regression test for fractional-minute formatting

Tests focus on the domain layer because that's where bugs cost real money.

---

## File map (where things live)

| What you want to change | Where to look |
| --- | --- |
| Routing algorithm | `apps/api/src/domain/routing.ts` |
| Distance source (OSRM/haversine) | `apps/api/src/domain/distance.ts` |
| Capacity validation | `apps/api/src/domain/capacity.ts` |
| Status transitions | `packages/shared/src/status.ts` |
| Data quality rules | `apps/api/src/domain/data-quality.ts` |
| Google Maps integration | `apps/api/src/lib/geocode-on-demand.ts`, `apps/api/src/routes/geocodes.ts` |
| API contract / types | `packages/shared/src/schemas.ts` |
| HTTP routes | `apps/api/src/routes/*.ts` |
| Dashboard layout | `apps/web/src/app/page.tsx` |
| Fleet overview | `apps/web/src/app/fleet/page.tsx` |
| New/Edit shipment form | `apps/web/src/components/dashboard/new-shipment-dialog.tsx` |
| Right-rail context panel | `apps/web/src/components/dashboard/context-panel.tsx` |
| Data quality dialog | `apps/web/src/components/dashboard/data-issues-dialog.tsx` |
| Route map | `apps/web/src/components/dashboard/route-map.tsx` |
| API client | `apps/web/src/lib/api.ts` |
| Selection + nav store | `apps/web/src/state/dispatch-store.tsx` |
