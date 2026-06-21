import { Module } from '@nestjs/common';
import { AttemptsModule } from '../modules/attempts/attempts.module';
import { ConnectionsModule } from '../modules/connections/connections.module';

/**
 * Postgres-backed queue worker. Polls every 5s:
 *   SELECT ... FROM deliveries
 *   WHERE status IN ('pending','retrying') AND next_retry_at <= now()
 *   FOR UPDATE SKIP LOCKED LIMIT 10
 *
 * Delivers via HTTP, records an attempt, applies exponential backoff with
 * jitter, and dead-letters after maxAttempts.
 *
 * TODO(step 5): add QueueWorker (@Interval) + DeliveryDispatcher.
 */
@Module({
  imports: [AttemptsModule, ConnectionsModule],
  providers: [],
})
export class QueueModule {}
