# WebhookGW — Webhook Gateway & Observability Dashboard

It sits between systems that **send** webhooks and systems that **receive** them, and gives you:

- **Reliable delivery** — at-least-once, with automatic retries and exponential backoff
- **Durability** — every event is persisted before delivery, so nothing is lost if a destination is down
- **Observability** — a dashboard showing every event, every delivery attempt, latencies, and failures
- **A dead-letter queue** — failed deliveries you can inspect and replay
- **A live demo mode** — fire test events and kill/restore the destination to watch the whole failure-and-recovery arc

Everything runs locally via Docker Compose.

---

## Table of contents

1. [What problem it solves](#what-problem-it-solves)
2. [Architecture](#architecture)
3. [Tech stack](#tech-stack)
4. [The data model (and why each table exists)](#the-data-model)
5. [How the tables connect](#how-the-tables-connect)
6. [Core delivery semantics](#core-delivery-semantics)
7. [Request flows](#request-flows)
8. [API reference](#api-reference)
9. [Dashboard pages](#dashboard-pages)
10. [The demo control panel & `shared/`](#the-demo-control-panel)
11. [Getting started](#getting-started)
12. [Sending a real (signed) webhook](#sending-a-real-signed-webhook)
13. [Project structure](#project-structure)
14. [Troubleshooting](#troubleshooting)

---

## What problem it solves

When system A sends a webhook to system B, lots can go wrong: B is down, B is slow, the
network blips, B returns a 500. A naïve "just POST it" loses data the moment B has a bad day.

A webhook gateway fixes this by **decoupling receiving from delivering**:

1. **Ingest** — accept the webhook, verify it's authentic, store it, and return `200` immediately.
2. **Deliver asynchronously** — a background worker forwards it to the destination, retrying
   with backoff until it succeeds or gives up (dead-letter).
3. **Observe** — keep a full audit trail of every attempt so you can debug and replay.

The sender gets a fast, reliable `200`. The receiver gets the event delivered eventually, even
after an outage. You get a dashboard to see it all.

---

## Architecture

```
                        ┌──────────────────────────────────────────────────────┐
                        │                  Docker Compose network                │
                        │                                                        │
  external sender       │   ┌─────────────┐         ┌──────────────────────┐     │
  (Stripe, GitHub, …)   │   │  Frontend   │  HTTP   │       Backend        │     │
        │               │   │               ──────▶ │      (NestJS)        │     │
        │  POST /ingest │   │             │  /api   │                │     │
        └───────────────┼──▶│             │         │                      │     │
                        │   └─────────────┘         │  ┌────────────────┐  │     │
                        │                           │  │ Ingest module  │  │     │
                        │                           │  │  - HMAC verify │  │     │
                        │                           │  │  - idempotency │  │     │
                        │                           │  │  - persist     │  │     │
                        │                           │  └───────┬────────┘  │     │
                        │                           │          │ writes    │     │
                        │   ┌─────────────┐         │  ┌───────▼────────┐  │     │
                        │   │  Postgres   │ ◀───────┼──│  Prisma client │  │     │
                        │   │  port 5432  │  SQL    │  └───────┬────────┘  │     │
                        │   │  (+ volume) │         │          │ polls     │     │
                        │   └─────────────┘ ◀───────┼──┌───────▼────────┐  │     │
                        │         ▲                 │  │ Queue worker   │  │     │
                        │         │ SELECT … FOR    │  │  (every 5s,    │  │     │
                        │         │ UPDATE SKIP     │  │   SKIP LOCKED) │  │     │
                        │         │ LOCKED          │  └───────┬────────┘  │     │
                        │         └─────────────────┼──────────┘           │     │
                        │                           │          │ POST      │     │
                        │   ┌────────────────────┐  │          │           │     │
                        │   │ fake-destination   │ ◀┼──────────┘           │     │
                        │   │ (Express, port 4000)│ │   delivery            │     │
                        │   │  500 when "down"   │  └──────────────────────┘     │
                        │   └─────────┬──────────┘                               │
                        │             │ reads                                    │
                        │   ┌─────────▼──────────┐  (shared file, demo toggle)   │
                        │   │ shared/demo-control │ ◀── backend writes here       │
                        │   │     .json          │                               │
                        │   └────────────────────┘                               │
                        └──────────────────────────────────────────────────────┘
```

**Two independent loops, decoupled by the database:**

- The **ingest path** (synchronous, fast): verify → persist → return `200`.
- The **delivery path** (asynchronous, durable): the worker polls the DB, delivers, retries.

The database is the queue. There is no Redis/BullMQ — Postgres `SELECT … FOR UPDATE SKIP LOCKED`
gives us a safe, concurrent work queue..

---

## Tech stack

| Layer            | Choice                  | Why                                                             |
| ---------------- | ----------------------- | --------------------------------------------------------------- |
| Backend          | **NestJS** (TypeScript) | Modular structure, DI, decorators                               |
| ORM              | **Prisma** (hybrid)     | Type-safe schema + migrations + CRUD; raw SQL only where needed |
| Database         | **PostgreSQL 16**       | ACID + `SKIP LOCKED` work queue + `JSONB`                       |
| Queue            | **Postgres-backed**     | `FOR UPDATE SKIP LOCKED` — no Redis                             |
| Scheduler        | **@nestjs/schedule**    | 5-second worker poll                                            |
| Frontend         | **Vite + React + TS**   | Fast dev, hot reload                                            |
| Styling          | **TailwindCSS**         | Dark, data-dense dev-tool look                                  |
| Charts           | **Recharts**            | Hourly success/error + throughput                               |
| Data fetching    | **Native Fetch API**    | Custom `usePolling` hook re-fetches every 3s for live updates   |
| Fake destination | **Express**             | A target we can "break" on demand                               |

---

## The data model

Six tables. Each row in the chain below is **immutable history** except `deliveries`, which is
the one mutable "state machine" row.

### 1. `sources` — _who is allowed to send us webhooks_

A source is an external system (e.g. "Stripe"). Each gets a **signing secret** used to verify
that incoming webhooks are authentic (HMAC).

| column           | purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `id`             | UUID                                                                    |
| `name`           | human label                                                             |
| `signing_secret` | shared secret for HMAC-SHA256 verification (shown **once** on creation) |
| `created_at`     |                                                                         |

### 2. `destinations` — _where webhooks get forwarded to_

A target URL that should receive events.

| column       | purpose                |
| ------------ | ---------------------- |
| `id`         | UUID                   |
| `name`       | human label            |
| `url`        | where the worker POSTs |
| `created_at` |                        |

### 3. `connections` — _the routing rule: source → destination_

A connection links **one source to one destination** and carries the **retry policy**. This is
what makes fan-out possible: one source can have many connections, so one event becomes many
deliveries.

| column           | purpose                                                        |
| ---------------- | -------------------------------------------------------------- |
| `id`             | UUID                                                           |
| `source_id`      | → `sources.id`                                                 |
| `destination_id` | → `destinations.id`                                            |
| `retry_policy`   | JSONB: `{ maxAttempts: 5, baseDelay: 5000, maxDelay: 600000 }` |
| `created_at`     |                                                                |

### 4. `events` — _the raw, immutable record of what was received_

One row per webhook received. Stored **before** any delivery is attempted, so we never lose data.

| column            | purpose                                                                           |
| ----------------- | --------------------------------------------------------------------------------- |
| `id`              | UUID                                                                              |
| `source_id`       | → `sources.id`                                                                    |
| `raw_body`        | the **exact bytes** received (TEXT, not parsed JSON — needed so HMAC stays valid) |
| `headers`         | JSONB snapshot of incoming headers                                                |
| `idempotency_key` | from `x-idempotency-key`; deduplicates resends (unique per source)                |
| `received_at`     |                                                                                   |

### 5. `deliveries` — _one event × one connection (the state machine)_

The only mutable table. Each delivery tracks the lifecycle of getting **one event** to **one
destination**. This is what the worker claims, updates, and retries.

| column                      | purpose                                                       |
| --------------------------- | ------------------------------------------------------------- |
| `id`                        | UUID                                                          |
| `event_id`                  | → `events.id`                                                 |
| `connection_id`             | → `connections.id`                                            |
| `status`                    | `pending → delivering → succeeded / retrying → dead_lettered` |
| `attempt_count`             | how many tries so far                                         |
| `next_retry_at`             | when the worker may next pick it up (drives backoff)          |
| `created_at` / `updated_at` |                                                               |

### 6. `delivery_attempts` — _the audit log of every individual HTTP try_

One row per HTTP request the worker makes. This is the timeline you see on the event detail page.

| column           | purpose                                                                     |
| ---------------- | --------------------------------------------------------------------------- |
| `id`             | UUID                                                                        |
| `delivery_id`    | → `deliveries.id`                                                           |
| `attempt_number` | 1, 2, 3, …                                                                  |
| `response_code`  | HTTP status, or `NULL` if the request never completed (e.g. `ECONNREFUSED`) |
| `response_body`  | truncated response text                                                     |
| `error`          | transport-level error (timeout, connection refused)                         |
| `latency_ms`     | how long the attempt took                                                   |
| `attempted_at`   |                                                                             |

---

## How the tables connect

```
 sources ───┐                         ┌─── destinations
            │                         │
            │      connections        │
            └──────▶ (source_id,──────┘
            │         destination_id)
            │              │
            │              │  (the routing rule + retry policy)
            ▼              │
         events           │
            │             │
            │   fan-out: one delivery per connection
            └──────┐      │
                   ▼      ▼
                deliveries  ◀── (event_id, connection_id)
                   │
                   │  one row per HTTP try
                   ▼
            delivery_attempts
```

Read it as a sentence:

> A **source** is connected to a **destination** by a **connection** (which holds the retry policy).
> When that source sends a webhook, we store one **event**, then create one **delivery** per
> connection. Each delivery is attempted by the worker, and every attempt is logged as a
> **delivery_attempt**.

**Why this shape?**

- Splitting `events` (immutable) from `deliveries` (mutable) means the raw truth is never
  mutated — you can always replay from the original event.
- `connections` in the middle gives **fan-out** (1 source → N destinations) and **per-route
  retry policies** for free.
- `delivery_attempts` as a separate log gives a complete, append-only audit trail — perfect for
  the observability dashboard.

The unique constraints enforce correctness:

- `events(source_id, idempotency_key)` → the same webhook can't be stored twice.
- `deliveries(event_id, connection_id)` → an event is delivered to each destination at most once per fan-out.
- `delivery_attempts(delivery_id, attempt_number)` → no duplicate attempt rows.

---

## Core delivery semantics

- **At-least-once delivery.** We'd rather deliver twice than zero times, so destinations should
  be idempotent (we help them with an idempotency header).
- **Idempotency on ingest.** `x-idempotency-key` deduplicates resends from the source.
- **Idempotency on delivery.** Each outgoing POST carries
  `x-idempotency-key: <eventId>-<attemptNumber>` so the destination can dedupe too.
- **Exponential backoff with jitter:**
  ```
  delay = min(baseDelay * 2^attempt + random(0..1000ms), maxDelay)
  defaults: baseDelay = 5s,  maxDelay = 10min,  maxAttempts = 5
  ```
  Jitter prevents a "thundering herd" of retries all firing at once.
- **Dead-lettering.** After `maxAttempts` failures, status becomes `dead_lettered` and the worker
  stops. You can inspect and **replay** it from the DLQ page.
- **Concurrency-safe queue.** The worker claims work with `FOR UPDATE SKIP LOCKED`, so multiple
  poll cycles (or multiple workers) never grab the same delivery.

### Delivery status lifecycle

```
pending ──▶ delivering ──▶ succeeded
                │
                ├──▶ retrying ──▶ delivering ──▶ succeeded
                │        ▲             │
                │        └─────────────┘ (until maxAttempts)
                │
                └──▶ dead_lettered ──(replay)──▶ pending
```

---

## Request flows

### Ingest flow (`POST /ingest/:sourceId`) — must return `200` fast

1. Look up the source (404 if unknown).
2. **Verify HMAC-SHA256** of the raw body against the `x-webhook-signature` header, using the
   source's `signing_secret`, compared in constant time (`timingSafeEqual`). 401 if invalid.
3. **Idempotency check** — if an event with the same `x-idempotency-key` already exists for this
   source, return the existing event without creating duplicates.
4. **Persist the event** and **fan out** one `pending` delivery per connection — all in **one
   transaction**.
5. Return `{ received: true, eventId, deliveries }`.

> Persist-first, deliver-later. The sender never waits on the destination.

### Queue worker flow (every 5 seconds)

1. **Claim a batch** atomically (single statement, raw SQL):
   ```sql
   UPDATE deliveries SET status = 'delivering'
   WHERE id IN (
     SELECT id FROM deliveries
     WHERE status IN ('pending','retrying') AND next_retry_at <= now()
     ORDER BY next_retry_at
     FOR UPDATE SKIP LOCKED
     LIMIT 10
   ) RETURNING …;
   ```
2. For each claimed delivery (processed independently — one failure can't crash the loop):
   - POST `event.raw_body` to the destination URL with headers
     `x-webhook-id`, `x-idempotency-key`, `x-attempt-number`, 10s timeout.
   - Record a `delivery_attempts` row (code, body, latency, or error).
   - **2xx** → `succeeded`.
   - **non-2xx / timeout / connection refused:**
     - `attempt + 1 >= maxAttempts` → `dead_lettered`
     - else → `retrying`, compute `next_retry_at` from the backoff formula.

### Replay (`POST /deliveries/:id/replay`)

Resets a `dead_lettered`/`failed` delivery to `pending`, `attempt_count = 0`, `next_retry_at = now()`.
The worker picks it up on the next poll.

---

## API reference

Base URL: `http://localhost:3000`

| Method | Path                             | Purpose                                                            |
| ------ | -------------------------------- | ------------------------------------------------------------------ |
| `POST` | `/ingest/:sourceId`              | **Public webhook ingest** (HMAC-verified)                          |
| `GET`  | `/sources`                       | List sources (no secret)                                           |
| `POST` | `/sources`                       | Create source → returns `signing_secret` + `ingest_url` **once**   |
| `GET`  | `/destinations`                  | List destinations                                                  |
| `POST` | `/destinations`                  | Create destination (`name`, `url`)                                 |
| `GET`  | `/connections`                   | List connections (with source/destination names)                   |
| `POST` | `/connections`                   | Create connection (`source_id`, `destination_id`, `retry_policy?`) |
| `GET`  | `/events?status=&limit=&offset=` | List events (rollup status, filterable)                            |
| `GET`  | `/events/:id`                    | Event metadata + raw payload                                       |
| `GET`  | `/events/:id/deliveries`         | Deliveries for an event, with attempts nested                      |
| `POST` | `/deliveries/:id/replay`         | Replay a dead-lettered/failed delivery                             |
| `GET`  | `/deliveries/dead-letter`        | The dead-letter queue                                              |
| `POST` | `/deliveries/dead-letter/replay` | Replay **all** dead-lettered                                       |
| `GET`  | `/analytics/overview`            | Cards + hourly chart series                                        |
| `GET`  | `/demo/status`                   | Live stats + destination up/down                                   |
| `POST` | `/demo/fire-events`              | Create N fake events (`{ count }`)                                 |
| `POST` | `/demo/destination/stop`         | Mark fake destination **down**                                     |
| `POST` | `/demo/destination/start`        | Mark fake destination **up**                                       |

---

## Dashboard pages

Open `http://localhost:5173`.

1. **Overview** (`/`) — cards (24h events, success rate, pending, dead-lettered) + line chart
   (success vs error per hour) + bar chart (throughput per hour).
2. **Events** (`/events`) — filterable table; click a row to drill in.
3. **Event detail** (`/events/:id`) — raw payload + per-attempt delivery timeline with codes,
   latencies, and bodies. Replay button when dead-lettered.
4. **Dead Letter Queue** (`/dlq`) — all dead-lettered deliveries; replay individually or in bulk.
   A count badge appears in the sidebar.
5. **Sources & Destinations** (`/sources`) — create sources (secret shown once, with copy) and
   destinations.

Everything auto-refreshes every 3 seconds.

---

## The demo control panel

A fixed panel (bottom-right) drives the entire failure-and-recovery demo from one screen:

- **🔥 Fire 10 Events** → `POST /demo/fire-events` (creates fake events for the first source/connection).
- **💀 Kill Destination** → `POST /demo/destination/stop`.
- **✅ Restore Destination** → `POST /demo/destination/start`.

### How "kill/restore" works — the `shared/` folder

The backend and the fake destination are **separate containers** and can't reach into each
other's process. They coordinate through a single file on a shared volume:

```
shared/demo-control.json     ←  backend WRITES {"running": false|true}
                             →  fake-destination READS it on every POST /webhook
```

When `running` is `false`, the fake destination returns **500** on every webhook → the worker
retries → eventually dead-letters. Flip it back to `true` and replays succeed. `GET /demo/status`
reads the same file to render the UP/DOWN badge. It's pure demo plumbing — not part of the real
pipeline.

---

## Getting started

### Prerequisites

- Docker + Docker Compose
- (Optional, for local non-Docker dev) Node.js 20+

### Quick start (Docker — recommended)

```bash
# from the project root
docker compose up --build
```

This starts Postgres, the backend (which runs `prisma generate` + `prisma migrate deploy`
automatically), the frontend, and the fake destination.

- Dashboard → http://localhost:5173
- API → http://localhost:3000
- Fake destination → http://localhost:4000/health

> **Upgrading from the old schema?** If you ran an earlier version that used a different DB user,
> reset the volume first so Postgres reinitializes cleanly:
>
> ```bash
> docker compose down -v && docker compose up --build
> ```

### First-run walkthrough

1. Go to **Sources & Destinations** → create a source (**save the signing secret**) and a
   destination (`http://fake-destination:4000/webhook`).
2. Create a **connection** linking them (via `POST /connections`, or seed it).
3. Open **Overview**, click **🔥 Fire 10 Events**, and watch deliveries succeed.
4. Click **💀 Kill Destination**, fire more events, and watch them retry → dead-letter.
5. Click **✅ Restore**, then **Replay All** on the DLQ page.

### Environment variables (backend)

| var                       | default                                                        | meaning                   |
| ------------------------- | -------------------------------------------------------------- | ------------------------- |
| `DATABASE_URL`            | `postgresql://postgres:postgres@postgres:5432/webhook_gateway` | Postgres connection       |
| `PORT`                    | `3000`                                                         | API port                  |
| `WORKER_POLL_INTERVAL`    | `5000`                                                         | worker poll interval (ms) |
| `DEMO_CONTROL_FILE`       | `/shared/demo-control.json`                                    | shared demo toggle file   |
| `DEFAULT_DESTINATION_URL` | `http://fake-destination:4000/webhook`                         | demo seeding              |

### Local dev (without Docker)

```bash
# backend
cd backend
npm install
npx prisma generate
npx prisma migrate deploy        # needs a Postgres reachable at DATABASE_URL
npm run start:dev

# frontend
cd ../frontend
npm install
npm run dev
```

---

## Sending a real (signed) webhook

The signature is `HMAC-SHA256(signing_secret, rawBody)` as hex, in the `x-webhook-signature` header.

```bash
SECRET="<your signing_secret>"
SOURCE_ID="<your source id>"
BODY='{"event":"order.created","amount":42}'

SIG=$(printf '%s' "$BODY" \
  | openssl dgst -sha256 -hmac "$SECRET" \
  | sed 's/^.* //')

curl -i http://localhost:3000/ingest/$SOURCE_ID \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: $SIG" \
  -H "x-idempotency-key: $(uuidgen)" \
  -d "$BODY"
```

A `200` with `{ "received": true, "eventId": "…", "deliveries": N }` means it's persisted and
queued. A `401` means the signature didn't match.

---

## Project structure

```
webhook-gateway/
├── docker-compose.yml          # postgres, backend, frontend, fake-destination + shared volume
├── shared/
│   └── demo-control.json        # demo kill/restore toggle (backend writes, fake-dest reads)
├── backend/                     # NestJS API
│   ├── prisma/
│   │   ├── schema.prisma         # source of truth for the Prisma client
│   │   └── migrations/0_init/    # hand-authored DDL (keeps the partial SKIP LOCKED index)
│   └── src/
│       ├── prisma/               # global PrismaService (the shared DB layer)
│       ├── ingest/               # POST /ingest/:sourceId — HMAC, idempotency, fan-out
│       ├── queue/                # the SKIP LOCKED worker + backoff
│       ├── demo/                 # demo control endpoints
│       └── modules/
│           ├── sources/  destinations/  connections/
│           ├── events/   deliveries/    attempts/
│           └── analytics/        # hourly chart aggregations
├── frontend/                    # Vite + React + Tailwind dashboard
│   └── src/
│       ├── api/client.ts         # typed API client
│       ├── components/           # Layout, DemoControlPanel, UI primitives
│       └── pages/                # Overview, Events, EventDetail, DLQ, Sources&Destinations
└── fake-destination/            # Express server that returns 500 when "down"
    └── index.js
```

---

## Troubleshooting

| Symptom                                      | Cause / fix                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Backend can't connect to Postgres            | Wait for the `postgres` healthcheck; it gates the backend.                                   |
| `prisma migrate` errors about an existing DB | Old volume from a previous schema — `docker compose down -v`.                                |
| Deliveries stuck in `pending`                | Is the worker running? Check backend logs for `Queue worker started`.                        |
| Everything goes to `dead_lettered`           | The fake destination is "down" — click **✅ Restore** (or check `shared/demo-control.json`). |
| `401` on ingest                              | Signature mismatch — sign the **raw body bytes** with the exact `signing_secret`.            |
| Dashboard shows nothing                      | Create a source + destination + connection, then fire events.                                |

---

**Built as a portfolio/demo project** to show durable, observable, at-least-once webhook delivery
on nothing but Postgres.
