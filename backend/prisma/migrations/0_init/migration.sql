-- Initial schema for the Webhook Gateway.
-- Hand-authored so the worker's partial claim index ships with the first migration.
-- Index/constraint names follow Prisma conventions to keep future `migrate dev` drift-free.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM (
  'pending', 'delivering', 'succeeded', 'failed', 'retrying', 'dead_lettered'
);

-- CreateTable: sources
CREATE TABLE "sources" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "name"           TEXT NOT NULL,
  "signing_secret" TEXT NOT NULL,
  "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable: destinations
CREATE TABLE "destinations" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "name"       TEXT NOT NULL,
  "url"        TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: connections
CREATE TABLE "connections" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_id"      UUID NOT NULL,
  "destination_id" UUID NOT NULL,
  "retry_policy"   JSONB NOT NULL,
  "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable: events
CREATE TABLE "events" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_id"       UUID NOT NULL,
  "raw_body"        TEXT NOT NULL,
  "headers"         JSONB NOT NULL DEFAULT '{}',
  "idempotency_key" TEXT,
  "received_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable: deliveries
CREATE TABLE "deliveries" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id"      UUID NOT NULL,
  "connection_id" UUID NOT NULL,
  "status"        "DeliveryStatus" NOT NULL DEFAULT 'pending',
  "next_retry_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable: delivery_attempts
CREATE TABLE "delivery_attempts" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "delivery_id"    UUID NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "response_code"  INTEGER,
  "response_body"  TEXT,
  "error"          TEXT,
  "latency_ms"     INTEGER,
  "attempted_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- Indexes & unique constraints
CREATE UNIQUE INDEX "connections_source_id_destination_id_key" ON "connections"("source_id", "destination_id");
CREATE INDEX "connections_source_id_idx" ON "connections"("source_id");

CREATE UNIQUE INDEX "events_source_id_idempotency_key_key" ON "events"("source_id", "idempotency_key");
CREATE INDEX "events_source_id_idx" ON "events"("source_id");
CREATE INDEX "events_received_at_idx" ON "events"("received_at");

CREATE UNIQUE INDEX "deliveries_event_id_connection_id_key" ON "deliveries"("event_id", "connection_id");
CREATE INDEX "deliveries_status_idx" ON "deliveries"("status");
CREATE INDEX "deliveries_event_id_idx" ON "deliveries"("event_id");

-- The worker's hot path: only rows eligible to be claimed.
CREATE INDEX "deliveries_claimable_idx" ON "deliveries"("next_retry_at")
  WHERE "status" IN ('pending', 'retrying');

CREATE UNIQUE INDEX "delivery_attempts_delivery_id_attempt_number_key" ON "delivery_attempts"("delivery_id", "attempt_number");
CREATE INDEX "delivery_attempts_delivery_id_idx" ON "delivery_attempts"("delivery_id");

-- Foreign keys
ALTER TABLE "connections" ADD CONSTRAINT "connections_source_id_fkey"
  FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "connections" ADD CONSTRAINT "connections_destination_id_fkey"
  FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "events" ADD CONSTRAINT "events_source_id_fkey"
  FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_delivery_id_fkey"
  FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
