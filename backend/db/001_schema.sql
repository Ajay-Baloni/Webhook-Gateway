-- ============================================================================
-- Webhook Gateway schema
-- Applied automatically by the postgres container on first boot.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
-- pending    -> picked up by worker
-- delivering -> in-flight HTTP request
-- succeeded  -> got a 2xx
-- failed     -> last attempt failed (transient internal state before retry calc)
-- retrying   -> scheduled for a future retry (next_retry_at set)
-- dead_lettered -> exhausted max attempts
DO $$ BEGIN
  CREATE TYPE delivery_status AS ENUM (
    'pending',
    'delivering',
    'succeeded',
    'failed',
    'retrying',
    'dead_lettered'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- sources: where webhooks come from (e.g. "Stripe")
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sources (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  signing_secret TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- destinations: where events get delivered
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS destinations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  url        TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- connections: link a source to a destination with a retry policy
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS connections (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  destination_id UUID NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  -- retry_policy shape:
  -- { "maxAttempts": 5, "baseMs": 5000, "maxDelayMs": 600000, "jitterMs": 1000 }
  retry_policy   JSONB NOT NULL DEFAULT
    '{"maxAttempts":5,"baseMs":5000,"maxDelayMs":600000,"jitterMs":1000}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, destination_id)
);

CREATE INDEX IF NOT EXISTS idx_connections_source ON connections(source_id);

-- ---------------------------------------------------------------------------
-- events: ingested raw events (immutable)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  raw_body        TEXT NOT NULL,           -- exact bytes received (for HMAC fidelity)
  headers         JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency is scoped per source. Partial index so NULL keys are allowed freely.
CREATE UNIQUE INDEX IF NOT EXISTS uq_events_source_idem
  ON events(source_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_source     ON events(source_id);
CREATE INDEX IF NOT EXISTS idx_events_received_at ON events(received_at DESC);

-- ---------------------------------------------------------------------------
-- deliveries: one event x one connection
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  status        delivery_status NOT NULL DEFAULT 'pending',
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_count INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, connection_id)
);

-- The hot path: the worker's claim query.
-- Partial index keeps it tiny — only rows eligible to be picked up.
CREATE INDEX IF NOT EXISTS idx_deliveries_claimable
  ON deliveries(next_retry_at)
  WHERE status IN ('pending', 'retrying');

CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_event  ON deliveries(event_id);

-- ---------------------------------------------------------------------------
-- delivery_attempts: each individual HTTP try
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery_attempts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id    UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  attempt_number INT NOT NULL,
  response_code  INT,             -- NULL when the request never completed (e.g. ECONNREFUSED)
  response_body  TEXT,
  error          TEXT,            -- transport-level error message, if any
  latency_ms     INT,
  attempted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (delivery_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_attempts_delivery ON delivery_attempts(delivery_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger for deliveries
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deliveries_updated_at ON deliveries;
CREATE TRIGGER trg_deliveries_updated_at
  BEFORE UPDATE ON deliveries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
