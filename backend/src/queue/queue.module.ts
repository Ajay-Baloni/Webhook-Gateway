import { Module } from '@nestjs/common';
import { AttemptsModule } from '../modules/attempts/attempts.module';
import { QueueWorkerService } from './queue-worker.service';

/**
 * Postgres-backed queue worker. Polls every WORKER_POLL_INTERVAL ms, claims due
 * deliveries with FOR UPDATE SKIP LOCKED, delivers over HTTP, records each
 * attempt, applies exponential backoff with jitter, and dead-letters after
 * maxAttempts.
 */
@Module({
  imports: [AttemptsModule],
  providers: [QueueWorkerService],
})
export class QueueModule {}
