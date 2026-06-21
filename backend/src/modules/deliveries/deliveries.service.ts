import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../../database/database.module';

@Injectable()
export class DeliveriesService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Fan out: create one pending delivery per connection for a freshly ingested
   * event. Idempotent via the (event_id, connection_id) unique constraint.
   * Runs inside the ingest transaction when a client is supplied.
   */
  async createForConnections(
    eventId: string,
    connectionIds: string[],
    client: Pool | PoolClient = this.pool,
  ) {
    if (connectionIds.length === 0) return [];
    const { rows } = await client.query(
      `INSERT INTO deliveries (event_id, connection_id, status, next_retry_at)
       SELECT $1, conn_id, 'pending', now()
       FROM unnest($2::uuid[]) AS conn_id
       ON CONFLICT (event_id, connection_id) DO NOTHING
       RETURNING id`,
      [eventId, connectionIds],
    );
    return rows;
  }

  async findByEvent(eventId: string) {
    const { rows } = await this.pool.query(
      `SELECT d.id, d.event_id, d.connection_id, d.status, d.attempt_count,
              d.next_retry_at, d.created_at, d.updated_at,
              dest.name AS destination_name, dest.url AS destination_url
       FROM deliveries d
       JOIN connections c   ON c.id = d.connection_id
       JOIN destinations dest ON dest.id = c.destination_id
       WHERE d.event_id = $1
       ORDER BY d.created_at ASC`,
      [eventId],
    );
    return rows;
  }

  async listDeadLettered(limit = 100, offset = 0) {
    const { rows } = await this.pool.query(
      `SELECT d.id, d.event_id, d.status, d.attempt_count, d.updated_at,
              s.name AS source_name, dest.name AS destination_name
       FROM deliveries d
       JOIN events e        ON e.id = d.event_id
       JOIN sources s       ON s.id = e.source_id
       JOIN connections c   ON c.id = d.connection_id
       JOIN destinations dest ON dest.id = c.destination_id
       WHERE d.status = 'dead_lettered'
       ORDER BY d.updated_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return rows;
  }

  async findOne(id: string) {
    const { rows } = await this.pool.query(
      `SELECT id, event_id, connection_id, status, attempt_count, next_retry_at FROM deliveries WHERE id = $1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException(`Delivery ${id} not found`);
    return rows[0];
  }

  /**
   * Re-enqueue a delivery for immediate retry. Resets it to 'pending' and clears
   * the retry clock; attempt_count is preserved as history but does not block
   * (the worker re-evaluates against the policy). Used by replay + bulk replay.
   */
  async replay(id: string) {
    const { rows } = await this.pool.query(
      `UPDATE deliveries
       SET status = 'pending', next_retry_at = now(), attempt_count = 0
       WHERE id = $1
       RETURNING id, status`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException(`Delivery ${id} not found`);
    return rows[0];
  }

  async replayAllDeadLettered() {
    const { rowCount } = await this.pool.query(
      `UPDATE deliveries
       SET status = 'pending', next_retry_at = now(), attempt_count = 0
       WHERE status = 'dead_lettered'`,
    );
    return { replayed: rowCount ?? 0 };
  }
}
