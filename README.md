# StockLock — Concurrency-Safe Inventory Reservation System

A production-grade inventory reservation platform built with Next.js 15 App Router, Prisma, and PostgreSQL. The core engineering challenge addressed is **preventing overselling under concurrent load** — the same problem faced by ticketing platforms, flash sale systems, and e-commerce checkouts at scale.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Technology Stack](#technology-stack)
3. [Concurrency Strategy](#concurrency-strategy)
4. [Reservation Lifecycle](#reservation-lifecycle)
5. [Expiry Mechanism](#expiry-mechanism)
6. [Idempotency Layer](#idempotency-layer)
7. [API Documentation](#api-documentation)
8. [Setup Instructions](#setup-instructions)
9. [Deployment Instructions](#deployment-instructions)
10. [Design Tradeoffs](#design-tradeoffs)
11. [Scaling Considerations](#scaling-considerations)
12. [Future Improvements](#future-improvements)

---

## Architecture Overview

The system is structured as a clean three-layer architecture with strict separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                     Presentation Layer                       │
│         Next.js App Router (Server + Client Components)      │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                      API Route Layer                         │
│   Zod Validation → Idempotency Check → Service Invocation   │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                    Business Logic Layer                      │
│   ReservationService / StockService / WarehouseService       │
│   Pessimistic Row Locking · Deadlock Prevention · JIT Expiry │
└────────────────────────────┬────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                                       │
┌────────▼────────┐                   ┌──────────▼──────────┐
│   PostgreSQL    │                   │       Redis          │
│   (Neon)        │                   │   (Idempotency)      │
│   Prisma ORM    │                   │   ioredis client     │
└─────────────────┘                   └─────────────────────┘
```

**Key design decisions:**

- **Server Components** query the database directly at render time — no intermediate REST call overhead for page loads.
- **Client Components** interact exclusively via REST API routes, keeping mutation logic server-side and auditable.
- **Service layer** owns all database transactions. Route handlers only validate input and map domain errors to HTTP status codes. They contain zero business logic.

---

## Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.x |
| Language | TypeScript | 5.x |
| Database | PostgreSQL (Neon serverless) | Latest |
| ORM | Prisma | 6.x |
| Cache / Idempotency | Redis (ioredis) | 5.x |
| Validation | Zod | 4.x |
| UI Components | shadcn/ui + Radix Primitives | Latest |
| Styling | Tailwind CSS | v4 |
| Notifications | Sonner | 2.x |
| Deployment | Vercel | — |

---

## Concurrency Strategy

This is the core engineering challenge. The naive implementation — read stock, check in application memory, then write — is fundamentally broken under concurrent load due to the **read-modify-write race condition**:

```
Thread A reads stock: 1 available    Thread B reads stock: 1 available
Thread A validates: 1 >= 1, OK       Thread B validates: 1 >= 1, OK
Thread A writes: reserved = 1        Thread B writes: reserved = 1
                                     → OVERSOLD: 2 reservations, 1 item
```

### Solution: Pessimistic Row-Level Locking

The `ReservationService` executes all stock checks and mutations inside a single PostgreSQL transaction using `SELECT ... FOR UPDATE`:

```sql
SELECT * FROM "Inventory"
WHERE "productId" = $1 AND "warehouseId" = $2
FOR UPDATE
```

This acquires an **exclusive lock on the row** for the duration of the transaction. Any concurrent transaction attempting to lock the same row is forced to wait. Once the first transaction commits, the second wakes up, reads the **updated** `reservedQuantity`, and correctly detects insufficient stock.

### Deadlock Prevention: Deterministic Key Sorting

Multi-item reservations introduce the risk of circular wait deadlocks:

- Thread A locks ProductX, waits for ProductY
- Thread B locks ProductY, waits for ProductX → deadlock

This is eliminated by **sorting inventory rows alphabetically by compound key (`productId_warehouseId`) before acquiring locks**. Since all concurrent threads lock rows in the same order, a circular wait is mathematically impossible.

```typescript
const sortedItems = [...items].sort((a, b) =>
  `${a.productId}_${a.warehouseId}`.localeCompare(`${b.productId}_${b.warehouseId}`)
);
```

### Why Not Optimistic Locking?

Optimistic locking (versioned rows + serializable isolation) would require application-level retry loops and produces high abort rates under contention — exactly the scenario of a flash sale. Pessimistic locking is more predictable and appropriate here: one transaction succeeds, concurrent ones queue and fail cleanly with HTTP 409.

---

## Reservation Lifecycle

```
                   ┌─────────────────────────────────────────────┐
                   │              Client calls POST /reservations  │
                   └───────────────────────┬─────────────────────┘
                                           │
                                    [Idempotency check]
                                     Redis: key seen?
                                    /               \
                                  YES               NO
                                   │                │
                            Return cached      Acquire in-flight
                            response           lock (SET NX)
                                                    │
                                          [JIT passive expiry]
                                          Release expired holds
                                          for requested items
                                                    │
                                         [SELECT FOR UPDATE]
                                          Lock inventory rows
                                          (sorted order)
                                                    │
                                         [Availability check]
                                         available = total - reserved
                                                    │
                                          /                    \
                                    SUFFICIENT            INSUFFICIENT
                                         │                    │
                               UPDATE reservedQty      ROLLBACK + HTTP 409
                               INSERT Reservation
                               SET expiresAt = now + TTL
                                         │
                                    COMMIT
                                         │
                              Store response in Redis
                              Return HTTP 201


Status transitions:

  PENDING ──[confirm]-──> CONFIRMED
  PENDING ──[release]──> RELEASED
  PENDING ──[expiry]───> EXPIRED
```

The `Inventory` table maintains two separate counters:

- **`totalQuantity`** — physical items on warehouse shelves. Decremented only on `CONFIRMED`.
- **`reservedQuantity`** — items currently held by `PENDING` reservations. Incremented on creation, decremented on confirm / release / expiry.

Available stock is always computed as `totalQuantity - reservedQuantity`. It is never stored — storing it would require additional synchronisation and is redundant.

---

## Expiry Mechanism

The system uses a **dual-expiry architecture** to ensure expired reservations never permanently block inventory:

### 1. JIT Passive Expiry (In-Transaction)

Before every new reservation is created, the service scans for expired `PENDING` holds on the exact same product-warehouse combinations being requested. These are released **within the same transaction** before the availability check runs:

```typescript
// Inside db.$transaction, before SELECT FOR UPDATE:
await cleanupExpiredForStock(tx, productId, warehouseId);
```

This means if a prior reservation expired, its stock is freed and immediately available to the new request — all atomically, with no external scheduler dependency.

### 2. Active Global Expiry (Scheduled Cron)

A background cron job hits `POST /api/reservations/cleanup` every minute via Vercel Cron (`vercel.json`). It:

1. Queries all `PENDING` reservations where `expiresAt < now()`
2. Processes each in its **own separate transaction** to minimise lock contention
3. Inside each transaction, re-checks that status is still `PENDING` (double-release protection)
4. Decrements `reservedQuantity` and marks status as `EXPIRED`

**Double-release protection** is critical: if the cron fires while a JIT cleanup is mid-transaction on the same reservation, one of them will see `status !== PENDING` inside the transaction and exit silently. Stock is restored exactly once.

---

## Idempotency Layer

All mutating endpoints support the `Idempotency-Key` request header. The implementation uses Redis with a three-state key lifecycle:

| State | Redis Value | Meaning |
|---|---|---|
| Not seen | `(nil)` | First request — proceed |
| In-flight | `"in_flight"` (30s TTL) | Processing — concurrent retry gets HTTP 409 |
| Completed | Serialized JSON (24h TTL) | Replay cached response immediately |

**Only successful responses are cached.** Validation errors (400) and server errors (500) delete the lock, allowing the client to retry with the same key after fixing the problem. This is the same pattern used by Stripe's idempotency implementation.

The `SET NX` (set-if-not-exists) Redis command is used atomically to claim the in-flight lock, ensuring that two simultaneous requests with the same key cannot both proceed into the database layer.

---

## API Documentation

All endpoints return JSON. Error responses follow the shape `{ error: string, message: string }`.

### `GET /api/products`

Returns all products with per-warehouse inventory levels and computed availability.

**Response `200`:**
```json
[
  {
    "id": "uuid",
    "sku": "APL-MBP14-M3",
    "name": "Apple MacBook Pro 14\" M3 Max",
    "price": "3199.00",
    "inventories": [
      {
        "warehouseId": "uuid",
        "totalQuantity": 24,
        "reservedQuantity": 3,
        "availableQuantity": 21,
        "warehouse": { "name": "North America East Hub" }
      }
    ]
  }
]
```

---

### `GET /api/warehouses`

Returns all warehouse distribution centres.

**Response `200`:**
```json
[
  { "id": "uuid", "code": "WH-US-EAST", "name": "North America East Hub", "location": "New York City, NY, USA" }
]
```

---

### `POST /api/reservations`

Creates a multi-item inventory reservation. Supports `Idempotency-Key` header.

**Request headers:**
```
Content-Type: application/json
Idempotency-Key: <client-generated-uuid>   (optional, recommended)
```

**Request body:**
```json
{
  "items": [
    { "productId": "uuid", "warehouseId": "uuid", "quantity": 2 }
  ],
  "ttlMinutes": 10
}
```

**Responses:**

| Status | Meaning |
|---|---|
| `201` | Reservation created. Returns full reservation object. |
| `400` | Validation failed. Returns `details` with field errors. |
| `404` | No inventory record found for product/warehouse combination. |
| `409` | Insufficient available stock. |
| `500` | Unexpected server error. |

---

### `POST /api/reservations/:id/confirm`

Converts a pending hold into a confirmed order, permanently decrementing `totalQuantity`. Supports `Idempotency-Key`.

**Responses:**

| Status | Meaning |
|---|---|
| `200` | Confirmed. Returns updated reservation. |
| `409` | Reservation has expired or was already processed. |
| `500` | Unexpected server error. |

---

### `POST /api/reservations/:id/release`

Manually cancels a pending hold and restores stock to the available pool.

**Responses:**

| Status | Meaning |
|---|---|
| `200` | Released. Returns updated reservation. |
| `500` | Unexpected server error (e.g. reservation not found or wrong status). |

---

### `POST /api/reservations/cleanup`

Triggers the global expiry sweep. Called by Vercel Cron automatically. Requires `Authorization: Bearer <CRON_SECRET>` header in production.

**Response `200`:**
```json
{ "message": "Expired reservations clean up operation complete.", "clearedCount": 3 }
```

---

## Setup Instructions

### Prerequisites

- Node.js 20+
- PostgreSQL database (Neon recommended)
- Redis instance (local or Upstash)

### 1. Clone and install

```bash
git clone <repo-url>
cd allo
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and set:

```env
# Neon PostgreSQL — pooled connection for queries
DATABASE_URL="postgresql://<user>:<password>@<host>-pooler.<region>.neon.tech/neondb?sslmode=require"

# Neon PostgreSQL — direct connection for migrations
DIRECT_URL="postgresql://<user>:<password>@<host>.<region>.neon.tech/neondb?sslmode=require"

# Redis — local or Upstash
REDIS_URL="redis://localhost:6379"

# Cron security token
CRON_SECRET="generate-a-secure-random-string"
```

### 3. Apply schema and seed data

```bash
npm run db:setup
```

This runs `prisma migrate dev` then `prisma db seed`. The seed inserts:
- 5 premium consumer electronics products
- 3 global warehouse hubs
- Asymmetric stock distributions including low-stock and out-of-stock scenarios for testing

### 4. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Next.js development server |
| `npm run build` | Build production bundle |
| `npm run db:migrate` | Run Prisma schema migrations |
| `npm run db:seed` | Seed the database with demo data |
| `npm run db:setup` | Migrate + seed in one command |
| `npm run prisma:generate` | Regenerate Prisma client types |

---

## Deployment Instructions

### Vercel (Recommended)

1. Push the repository to GitHub.
2. Import the project into [Vercel](https://vercel.com).
3. Set all environment variables from `.env.example` in the Vercel dashboard under **Settings → Environment Variables**.
4. For Redis in production, create a free database at [Upstash](https://upstash.com) and use the `rediss://` TLS connection string.
5. Deploy. Vercel automatically reads `vercel.json` and schedules the cleanup cron job.

The `vercel.json` cron configuration:

```json
{
  "crons": [
    {
      "path": "/api/reservations/cleanup",
      "schedule": "*/1 * * * *"
    }
  ]
}
```

---

## Design Tradeoffs

### Pessimistic vs. Optimistic Locking

Pessimistic locking was chosen over optimistic locking (version fields + retry loops) because this system is designed for **high-contention write scenarios** (flash sales, limited stock). Under pessimistic locking, one transaction succeeds and others fail fast with a clean 409. Under optimistic locking, all transactions would proceed, then all but one would roll back and retry — wasting database resources and producing unpredictable latency under load.

### Sequential vs. Parallel Expiry Processing

The global cleanup processes expired reservations **sequentially** (one transaction per reservation) rather than in a single bulk transaction. This keeps individual lock durations short and prevents a single large cleanup transaction from blocking concurrent user checkouts. The tradeoff is slightly higher total cleanup time, which is acceptable for a background job.

### JIT Expiry Scope

JIT passive expiry only cleans up expired holds for the **specific product-warehouse combinations in the current request**, not globally. This is intentional — scoping cleanup prevents unnecessary lock acquisition on unrelated inventory rows during a user's checkout.

### Redis as Idempotency Store

An alternative would be storing idempotency records in PostgreSQL. Redis was chosen for sub-millisecond reads and automatic TTL support without a background cleanup job. The tradeoff is an additional infrastructure dependency. For a deployment without Redis, the idempotency layer gracefully degrades — the `checkIdempotency` function throws if Redis is unavailable, which is caught by the route handler and the request proceeds without idempotency protection rather than returning a 500.

---

## Scaling Considerations

### Database Connection Pooling

Neon's serverless pooler is configured via `DATABASE_URL`. For Vercel deployments with many concurrent serverless invocations, PgBouncer-style pooling is essential — each function invocation cannot open a dedicated PostgreSQL connection.

### Redis Clustering

The current Redis setup uses a single instance. At higher scale, a Redis Cluster or a managed service like Upstash (which handles replication internally) would be used. The idempotency key namespace format (`idempotency:{namespace}:{key}`) is already designed to be compatible with Redis Cluster hash slot routing.

### Horizontal Scaling of the API

Because all concurrency control is enforced at the **database layer** (row locks), the API layer is fully stateless. Any number of Vercel serverless function instances can run concurrently — the PostgreSQL transaction guarantees correctness regardless of which instance handles a given request.

### Read Scaling

High-traffic product listing queries (`GET /api/products`) could be cached at the edge with `Cache-Control` headers or Next.js `unstable_cache`. This was not implemented as the assignment prioritises correctness of write paths, but it is a straightforward addition.

### Cron Frequency

The 1-minute Vercel Cron frequency is the minimum supported interval. At higher scale with thousands of concurrent reservations, the JIT passive expiry (which fires on every new reservation) becomes more important as the primary expiry mechanism, with the cron serving as a safety net rather than the primary driver.

---

## Future Improvements

- **Webhook notifications** — emit events (reservation created, confirmed, expired) to a message queue (e.g. SQS, Inngest) for downstream order management systems.
- **Multi-warehouse smart allocation** — automatically split a single reservation across multiple warehouses when no single warehouse has sufficient stock.
- **Admin restock API** — `POST /api/inventory/restock` to increment `totalQuantity` with the same row-level locking guarantees.
- **Concurrency stress test suite** — a `Promise.all` test harness sending 50 simultaneous reservation requests for a single item and asserting exactly one succeeds.
- **OpenTelemetry tracing** — distributed traces spanning Redis checks, Prisma transactions, and HTTP responses for production observability.
- **Rate limiting** — per-IP request throttling on mutation endpoints to prevent reservation flooding.

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── products/route.ts
│   │   ├── warehouses/route.ts
│   │   └── reservations/
│   │       ├── route.ts                  # POST — create reservation
│   │       ├── cleanup/route.ts          # POST — cron expiry sweep
│   │       └── [id]/
│   │           ├── confirm/route.ts      # POST — confirm order
│   │           └── release/route.ts      # POST — cancel hold
│   ├── checkout/[id]/
│   │   ├── page.tsx                      # Checkout flow (Server Component)
│   │   ├── loading.tsx
│   │   └── error.tsx
│   ├── reservations/
│   │   └── page.tsx                      # Bookings log (Server Component)
│   ├── page.tsx                          # Product catalog (Server Component)
│   ├── layout.tsx
│   ├── loading.tsx
│   └── error.tsx
├── components/
│   ├── checkout/checkout-client.tsx      # Billing form + timer
│   ├── dashboard/catalog-client.tsx      # Product grid + reserve dialog
│   ├── navigation/navbar.tsx
│   └── reservation/
│       ├── reservations-client.tsx       # Bookings table + actions
│       └── reservation-timer.tsx         # Live countdown
├── lib/
│   ├── db.ts                             # Prisma singleton
│   ├── redis.ts                          # ioredis singleton
│   ├── idempotency.ts                    # Check / store / clear helpers
│   └── errors.ts                         # Domain error classes
├── schemas/
│   └── reservation.schema.ts             # Zod input validation
├── services/
│   ├── reservation.service.ts            # Core transaction logic
│   ├── stock.service.ts                  # Inventory queries
│   └── warehouse.service.ts
└── types/
    └── index.ts
prisma/
├── schema.prisma
└── seed.ts
vercel.json                               # Cron schedule
```
