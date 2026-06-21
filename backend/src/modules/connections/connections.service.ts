import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';

const DEFAULT_RETRY_POLICY = {
  maxAttempts: 5,
  baseMs: 5000,
  maxDelayMs: 600000,
  jitterMs: 1000,
};

@Injectable()
export class ConnectionsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(sourceId: string, destinationId: string, retryPolicy?: object) {
    const { rows } = await this.pool.query(
      `INSERT INTO connections (source_id, destination_id, retry_policy)
       VALUES ($1, $2, $3)
       ON CONFLICT (source_id, destination_id) DO UPDATE SET retry_policy = EXCLUDED.retry_policy
       RETURNING id, source_id, destination_id, retry_policy, created_at`,
      [sourceId, destinationId, retryPolicy ?? DEFAULT_RETRY_POLICY],
    );
    return rows[0];
  }

  async findAll() {
    const { rows } = await this.pool.query(
      `SELECT c.id, c.source_id, c.destination_id, c.retry_policy, c.created_at,
              s.name AS source_name, d.name AS destination_name, d.url AS destination_url
       FROM connections c
       JOIN sources s      ON s.id = c.source_id
       JOIN destinations d ON d.id = c.destination_id
       ORDER BY c.created_at DESC`,
    );
    return rows;
  }

  /** All connections for a source — used by the ingest endpoint to fan out deliveries. */
  async findBySource(sourceId: string) {
    const { rows } = await this.pool.query(
      `SELECT id, source_id, destination_id, retry_policy FROM connections WHERE source_id = $1`,
      [sourceId],
    );
    return rows;
  }

  async findOne(id: string) {
    const { rows } = await this.pool.query(
      `SELECT id, source_id, destination_id, retry_policy, created_at FROM connections WHERE id = $1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException(`Connection ${id} not found`);
    return rows[0];
  }
}
