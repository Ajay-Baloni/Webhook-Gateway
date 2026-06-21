import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../../database/database.module';

export interface RecordAttemptInput {
  deliveryId: string;
  attemptNumber: number;
  responseCode?: number | null;
  responseBody?: string | null;
  error?: string | null;
  latencyMs?: number | null;
}

@Injectable()
export class AttemptsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Record a single HTTP attempt. Called by the queue worker. */
  async record(input: RecordAttemptInput, client: Pool | PoolClient = this.pool) {
    const { rows } = await client.query(
      `INSERT INTO delivery_attempts
         (delivery_id, attempt_number, response_code, response_body, error, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (delivery_id, attempt_number) DO NOTHING
       RETURNING id`,
      [
        input.deliveryId,
        input.attemptNumber,
        input.responseCode ?? null,
        input.responseBody ?? null,
        input.error ?? null,
        input.latencyMs ?? null,
      ],
    );
    return rows[0];
  }

  /** Timeline of attempts for a delivery (oldest first). */
  async findByDelivery(deliveryId: string) {
    const { rows } = await this.pool.query(
      `SELECT id, delivery_id, attempt_number, response_code, response_body,
              error, latency_ms, attempted_at
       FROM delivery_attempts
       WHERE delivery_id = $1
       ORDER BY attempt_number ASC`,
      [deliveryId],
    );
    return rows;
  }
}
