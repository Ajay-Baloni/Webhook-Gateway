import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../../database/database.module';

export interface CreateEventInput {
  sourceId: string;
  rawBody: string;
  headers: Record<string, unknown>;
  idempotencyKey?: string | null;
}

@Injectable()
export class EventsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Insert a raw event. If an idempotency_key collides for the same source,
   * returns the already-stored event and `created: false` (used by ingest).
   * Accepts an optional client so it can run inside the ingest transaction.
   */
  async create(
    input: CreateEventInput,
    client: Pool | PoolClient = this.pool,
  ): Promise<{ event: any; created: boolean }> {
    const { rows } = await client.query(
      `INSERT INTO events (source_id, raw_body, headers, idempotency_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (source_id, idempotency_key) DO NOTHING
       RETURNING id, source_id, received_at`,
      [input.sourceId, input.rawBody, input.headers, input.idempotencyKey ?? null],
    );

    if (rows[0]) return { event: rows[0], created: true };

    // Conflict: fetch the existing row.
    const existing = await client.query(
      `SELECT id, source_id, received_at FROM events
       WHERE source_id = $1 AND idempotency_key = $2`,
      [input.sourceId, input.idempotencyKey],
    );
    return { event: existing.rows[0], created: false };
  }

  async findAll(filters: {
    status?: string;
    sourceId?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filters.sourceId) {
      params.push(filters.sourceId);
      where.push(`e.source_id = $${params.length}`);
    }
    if (filters.from) {
      params.push(filters.from);
      where.push(`e.received_at >= $${params.length}`);
    }
    if (filters.to) {
      params.push(filters.to);
      where.push(`e.received_at <= $${params.length}`);
    }
    // Status filter operates over the event's deliveries (any matching).
    if (filters.status) {
      params.push(filters.status);
      where.push(
        `EXISTS (SELECT 1 FROM deliveries d WHERE d.event_id = e.id AND d.status = $${params.length})`,
      );
    }

    const limit = Math.min(filters.limit ?? 50, 200);
    const offset = filters.offset ?? 0;
    params.push(limit, offset);

    const { rows } = await this.pool.query(
      `SELECT e.id, e.source_id, s.name AS source_name, e.received_at, e.idempotency_key,
              COALESCE(SUM(d.attempt_count), 0)::int AS attempt_count,
              COUNT(d.id)::int AS delivery_count,
              COUNT(*) FILTER (WHERE d.status = 'succeeded')::int     AS succeeded_count,
              COUNT(*) FILTER (WHERE d.status = 'dead_lettered')::int AS dead_lettered_count,
              COUNT(*) FILTER (WHERE d.status IN ('pending','delivering','retrying','failed'))::int AS in_flight_count
       FROM events e
       JOIN sources s ON s.id = e.source_id
       LEFT JOIN deliveries d ON d.event_id = e.id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       GROUP BY e.id, s.name
       ORDER BY e.received_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return rows;
  }

  async findOne(id: string) {
    const { rows } = await this.pool.query(
      `SELECT e.id, e.source_id, s.name AS source_name, e.raw_body, e.headers,
              e.idempotency_key, e.received_at
       FROM events e JOIN sources s ON s.id = e.source_id
       WHERE e.id = $1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException(`Event ${id} not found`);
    return rows[0];
  }
}
