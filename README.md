# Oway Carrier Dispatch Console

A full-stack dispatch tool for managing LTL freight: shipment lifecycle, vehicle
assignment with capacity constraints, and multi-stop route generation respecting
pickup-before-delivery precedence and time windows.

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

> **Why SQLite by default?** Zero install friction for the reviewer — `git clone → npm install → npm run dev`
> just works. A `docker-compose.yml` ships alongside for anyone who wants Postgres (4-step swap documented in that file).

Tested against Node 24 / npm 11. Should work on Node ≥ 20.

### Postgres (optional)

```bash
docker compose up -d
# Edit apps/api/prisma/schema.prisma → provider = "postgresql"
# Edit apps/api/.env → DATABASE_URL="postgresql://oway:oway@localhost:5432/oway_dispatch"
npm run db:reset
npm run dev
```

Full instructions are in `docker-compose.yml`.

### Useful scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Concurrently boots API (`:3001`) and web (`:3000`) with hot reload |
| `npm test` | Runs the Vitest suite (34 tests covering the domain layer) |
| `npm run db:reset` | Drops & recreates the SQLite DB, then re-seeds it |
| `npm run seed` | Re-runs the seeder (idempotent — upserts existing rows) |
| `npm run geocode` | Re-runs the batch geocoder (writes `data/geocoded.json`) |
| `npm run typecheck` | Type-checks every workspace |
| `npm run build` | Builds shared package, API, and web for production |

---

## Architecture

```
oway-dispatch/
├── apps/
│   ├── api/                  # Fastify + TypeScript + Prisma + SQLite
│   │   ├── src/
│   │   │   ├── domain/       # Pure functions: routing, capacity, status, data-quality, time
│   │   │   ├── services/     # Business logic — orchestrate domain + DB
│   │   │   ├── routes/       # HTTP layer — Zod validation, structured errors
│   │   │   ├── lib/          # Helpers (serialization, address keys, error class)
│   │   │   ├── seed.ts       # Loads JSON, validates, populates DB + geocode cache
│   │   │   └── server.ts     # Fastify app, error handler, route registration
│   │   └── prisma/schema.prisma
│   └── web/                  # Next.js 15 (App Router) + Tailwind + react-leaflet
│       └── src/
│           ├── app/          # Route entry, layout, providers
│           ├── components/   # ui/ primitives + dashboard/ feature components
│           ├── lib/          # Typed API client, formatters
│           └── state/        # Selection store (React Context)
├── packages/
│   └── shared/               # Zod schemas, status state machine, error codes — single source of truth
├── data/
│   ├── seed.json             # Provided seed (40 shipments / 4 vehicles / depot)
│   └── geocoded.json         # Pre-computed lat/lng for all unique addresses
└── scripts/geocode.ts        # One-time batch geocoder (Nominatim, 1.1s rate-limited)
```

### The big picture

```
                       ┌──────────────────────────────┐
                       │  packages/shared (Zod)       │
                       │  ─ Schemas (Address, Ship,   │
                       │    Vehicle, Route, etc.)     │
                       │  ─ Status state machine      │
                       │  ─ Error codes               │
                       └────────────┬─────────────────┘
                                    │ both apps import
                ┌───────────────────┴───────────────────┐
                ▼                                       ▼
   ┌────────────────────────┐                ┌──────────────────────────┐
   │  apps/api              │                │  apps/web                │
   │  routes →              │                │  TanStack Query →        │
   │    services →          │     HTTP       │    typed api client →    │
   │      domain (pure)     │ ◄────────────► │      Next.js rewrite →   │
   │      + Prisma          │  /api/v1/*     │      :3001               │
   └────────────────────────┘                └──────────────────────────┘
                │
                ▼
        ┌───────────────┐
        │  SQLite       │
        │  (Prisma)     │
        └───────────────┘
```

### Why this stack

| Choice | Why |
| --- | --- |
| **Monorepo (npm workspaces)** | The spec asks "can the system grow?" Real service boundaries demonstrate that better than folder conventions inside one Next.js app. |
| **Fastify (vs Express)** | Native TypeScript types, schema-first validation that pairs cleanly with Zod, faster cold-start. |
| **Prisma + SQLite** | Type-safe DB layer. SQLite means zero install friction for the reviewer; swap to Postgres is one line in `schema.prisma`. |
| **Shared Zod package** | Schemas, runtime validation, and TypeScript types all derive from one definition. The API contract is the schema. |
| **Next.js 15 App Router** | Modern React Server Components story; rewrites simplify CORS-free dev (web hits `/api/v1/...` which proxies to `:3001`). |
| **Tailwind + small Radix primitives** | Tasteful defaults without spending budget on bespoke design. shadcn-style — I wrote the primitives by hand rather than running their CLI to keep dependencies honest. |
| **react-leaflet + OSM tiles** | No API token required. Reviewer runs zero env setup. Mapbox/Google Maps would be prettier but cost a key exchange. |
| **TanStack Query** | Server state with cache invalidation. Polls every 5s so the UI feels live without WebSockets. |

---

## Routing & Assignment — the interesting part

This is where the take-home rewards thinking. Both problems are NP-hard at scale; the value is in **explainable heuristics with named tradeoffs**.

### Distance model

Straight-line **haversine** between geocoded coordinates. Not OSRM, not Google Maps.

**Why**: deterministic, free, no API key. Good enough to demonstrate the algorithm structure. The routing engine takes a `distanceFn` parameter — swapping to OSRM is one file (`src/domain/distance.ts`).

**Tradeoff**: LA freeway geometry is far from "as the crow flies." Expect actual drive times to be 1.3–1.6× the haversine estimate. A production system would want real road distances, ideally with real-time traffic.

### Vehicle assignment

**Manual-first.** Ops selects shipments, picks a vehicle, the system validates capacity and either commits or rejects with a structured error.

**Why not full auto-assignment?** Real LTL ops teams don't trust black boxes — they want the system to enforce constraints and surface suggestions, but the human keeps the final call. The UI shows projected load *before* you click assign (selected shipments preview as a hatched overlay on each vehicle's capacity bar). For a future iteration, a "Suggest assignments" button could run a first-fit-decreasing packer as a starting point.

**Implementation**: `src/domain/capacity.ts` is a pure function — no DB, no HTTP. Used both by the assignment service (atomic transaction) and by the UI for the live capacity preview.

### Route generation (PDPTW for one vehicle)

Pickup-and-Delivery Problem with Time Windows. Algorithm in `src/domain/routing.ts`:

1. **Sort by tightest delivery window** (anchors the route around the most time-constrained stops).
2. **Greedy insertion**: for each shipment, try every valid `(pickup, delivery)` insertion position that preserves precedence. Choose the insertion that minimizes the route's weighted score.
3. **Constrained 2-opt**: one improvement pass that reverses subsequences only where the result still preserves every shipment's pickup-before-delivery ordering. Most 2-opt swaps would violate precedence; we skip those.
4. **Score** = `total_distance + α·time_window_violation_minutes − β·hazmat_clustering_pairs`.

**Time window handling**: estimate arrival times using a constant **25 mph effective speed** (LA-metro-realistic) + **20 min service time per stop**, departing the depot at **06:00**. Stops outside their window are flagged with `windowStatus: 'violated'` but **not removed** — ops decides whether to drop the shipment or accept the violation. The map and stop list color-code window status (green/amber/red).

### What "optimized" means here

We're explicitly not minimizing distance alone. The spec invites this question; my answer:

- **Distance** is an axis we want to minimize.
- **Time-window violations** matter much more than a few extra miles. A truck that arrives after the receiving dock closed is a phone call to a yelling customer. Soft penalty (2 min/violation) is in the same units as miles, so the tradeoff is explicit.
- **Hazmat clustering** is a small bonus for adjacent hazmat stops. Real ops protocol overhead for hazmat stops is meaningful (paperwork, gear); grouping them amortizes that cost.

The score function is in `domain/routing.ts:scoreRoute`. Tweak the weights in `packages/shared/src/constants.ts:ROUTING_DEFAULTS`.

### Why not OR-Tools / off-the-shelf solvers

40 shipments × 4 vehicles is small enough that OR-Tools would solve to optimality in seconds. So why not use it?

The spec rewards "we want to see you reason about tradeoffs." A documented heuristic I can step through in the interview > a black-box optimizer I'd have to apologize for. With more time, the natural next steps are:

- Simulated annealing on the score function for better local minima
- Large neighborhood search (LNS) — destroy a chunk of the route and re-insert
- Or yes, OR-Tools `RoutingModel` once we have a baseline to compare against

---

## Data quality handling

The seed has deliberate landmines. We surface them as first-class entities, not silent filters.

| Shipment | Issue | Treatment |
| --- | --- | --- |
| **SHP002 / SHP031** | SHP031 is an exact content duplicate of SHP002 (origin, destination, pallets, weight, description). | Detected by content hash. Both flagged with `DUPLICATE_OF` (warning severity). Both still assignable; ops decides. |
| **SHP033** | Empty `address1` on origin, zero `palletCount`, zero `weightLbs`, blank description. | Three blocking issues (`MISSING_ADDRESS`, `ZERO_PALLETS`, `ZERO_WEIGHT`) + one warning (`MISSING_DESCRIPTION`). Cannot be assigned until edited. |
| **SHP035** | Destination zip `00000`, city `Nowhere`. | Flagged blocking with `INVALID_ZIP`. Also fails geocoding → `UNGEOCODABLE`. Cannot be added to a route. |
| **SHP015** | 14 pallets / 18,200 lbs — only fits VH002. | Not a data issue. `OVERSIZED` would fire only if no vehicle could hold it. The capacity validator catches the wrong-vehicle case at assignment time with a structured error showing exactly how much it overflows by. |

Validation lives in `src/domain/data-quality.ts` — pure function called at seed time and on every `POST /shipments`. Findings persist on the row (`Shipment.dataIssues` JSON column) and surface in:

1. **Top-bar badge** with a count
2. **Data Quality dialog** (full list, severity badges)
3. **Per-row warning icon** in the shipment table
4. **Disabled checkbox** on rows with blocking issues — they can't be batch-selected for assignment

---

## API surface

Every request is Zod-validated. Every error is a structured envelope: `{ error: { code, message, details? } }`.

```
GET    /health
GET    /api/v1/depot

GET    /api/v1/shipments               ?status=&search=&vehicleId=&sort=&order=
GET    /api/v1/shipments/:id
POST   /api/v1/shipments                create with strict validation
PATCH  /api/v1/shipments/:id/status    { to } — validates against state machine

GET    /api/v1/vehicles                 with computed load + remaining capacity
GET    /api/v1/vehicles/:id/workload    assigned shipments + totals

POST   /api/v1/assignments              { vehicleId, shipmentIds[] } — atomic, capacity-validated
DELETE /api/v1/assignments/:shipmentId  unassigns + reverts to INITIALIZED

POST   /api/v1/vehicles/:id/route       compute & persist route
GET    /api/v1/vehicles/:id/route       last computed route

GET    /api/v1/data-issues              list of all shipments with validation findings
```

**Error codes**: `VALIDATION_ERROR`, `NOT_FOUND`, `INVALID_STATUS_TRANSITION`, `CAPACITY_EXCEEDED`, `SHIPMENT_BLOCKED`, `ALREADY_ASSIGNED`, `GEOCODING_FAILED`, `ROUTE_INFEASIBLE`, `INTERNAL_ERROR`.

Try them out:

```bash
# Smallest vehicle can't take SHP015 (14 pallets / 18,200 lbs)
curl -sX POST http://localhost:3001/api/v1/assignments \
  -H 'content-type: application/json' \
  -d '{"vehicleId":"VH001","shipmentIds":["SHP015"]}' | jq

# Backward transition on a hypothetical DELIVERED shipment is rejected
curl -sX PATCH http://localhost:3001/api/v1/shipments/SHP010/status \
  -H 'content-type: application/json' \
  -d '{"to":"INITIALIZED"}' | jq
```

---

## UI walkthrough

Three regions, all visible at once on a 1440px screen:

- **Left rail (320px)** — Vehicle cards. Capacity bars for pallets and weight. When you've selected shipments, each card shows projected load with a hatched overlay; cards that would overflow turn red. Click a card to focus its workload + route in the right rail.

- **Center (flex)** — Shipment table. Status pill filters, search across ID/description, sortable columns, multi-select. Delivered/cancelled rows are 50% opacity with strike-through ID. Per-row warning badges for data issues. Accessorials shown as small pills (hazmat in red).

- **Right (480px)** — Context-sensitive panel:
  - **No selection**: empty-state hint
  - **Shipments selected**: assignment form with per-vehicle projection + capacity preview
  - **Vehicle focused**: workload, capacity, "Compute route" button, score breakdown, Leaflet map with depot + numbered stops, ordered list with arrival times and window status

Top bar: data-quality count badge (opens the issues drawer), "New shipment" CTA, depot indicator.

Status transitions only show valid next states (no disabled buttons — reviewers should never see affordances they can't explain).

---

## Testing

```bash
npm test
```

34 tests across the domain layer:

- `routing.test.ts` — pickup-before-delivery precedence, time-window flagging, ungeocodable handling, hazmat clustering bonus, monotonic arrival times
- `capacity.test.ts` — at-limit edges, both-violations case (the SHP015-on-VH001 scenario), accumulation on top of current load
- `status.test.ts` — every legal/illegal transition, terminal-state handling
- `data-quality.test.ts` — every validation rule, including the four seed landmines
- `time.test.ts` — including a regression test for fractional-minute formatting

Tests focus on the domain layer because that's where bugs cost real money. The HTTP routes are thin Zod-validated wrappers; the services are mostly orchestration. If a routing or capacity bug ships, the company loses revenue.

---

## What I'd do with more time

These are scoped extensions that would slot in cleanly given the architecture:

- **Auth**: cookie-based session via Lucia or NextAuth. Already have a service-layer pattern that doesn't know about HTTP, so adding auth middleware is mechanical.
- **Real road distances**: swap `domain/distance.ts:haversineMiles` for an OSRM call. The routing engine's `distanceFn` parameter is the seam.
- **Multi-day planning**: shipments have a `createdAt`; a `dispatchDate` field would let the dashboard scope to a single day.
- **Drag-and-drop assignment**: the multi-select + click-vehicle pattern is faster for ops doing 30 assignments at once, but DnD is more discoverable. `dnd-kit` would slot into the existing selection store.
- **Real-time updates**: SSE or WebSockets push from the API on shipment/route changes, replacing the 5s polling.
- **Better routing**: simulated annealing or large neighborhood search on top of the current heuristic. Or an OR-Tools call for comparison.
- **Suggest assignments**: a "Pack remaining shipments" button that runs first-fit-decreasing as a starting point.

---

## File map (where things live)

| What you want to change | Where to look |
| --- | --- |
| Routing algorithm | `apps/api/src/domain/routing.ts` |
| Capacity validation | `apps/api/src/domain/capacity.ts` |
| Status transitions | `packages/shared/src/status.ts` |
| Data quality rules | `apps/api/src/domain/data-quality.ts` |
| API contract / types | `packages/shared/src/schemas.ts` |
| HTTP routes | `apps/api/src/routes/*.ts` |
| Dashboard layout | `apps/web/src/app/page.tsx` |
| Vehicle cards | `apps/web/src/components/dashboard/vehicle-rail.tsx` |
| Route map | `apps/web/src/components/dashboard/route-map.tsx` |
| API client | `apps/web/src/lib/api.ts` |

---

Built by [@faalbane](https://github.com/faalbane) for Oway. Built with help from Claude (Opus) — I wrote the architecture and drove every decision; AI helped with boilerplate. Happy to walk through any of the choices in the follow-up.
