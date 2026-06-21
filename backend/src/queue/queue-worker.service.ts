import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AttemptsService } from '../modules/attempts/attempts.service';

interface ClaimedDelivery {
  id: string;
  eventId: string;
  connectionId: string;
  attemptCount: number;
}

interface RetryPolicy {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
}

const DEFAULT_POLICY: RetryPolicy = {
  maxAttempts: 5,
  baseDelay: 5000,
  maxDelay: 600000,
};

const BATCH_SIZE = 10;
const HTTP_TIMEOUT_MS = 10000;
const RESPONSE_BODY_LIMIT = 4000; // chars stored per attempt

@Injectable()
export class QueueWorkerService implements OnModuleInit {
  private readonly logger = new Logger(QueueWorkerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly attempts: AttemptsService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onModuleInit() {
    const intervalMs = parseInt(process.env.WORKER_POLL_INTERVAL ?? '5000', 10);
    const interval = setInterval(() => this.pollAndDeliver(), intervalMs);
    this.scheduler.addInterval('delivery-poll', interval);
    this.logger.log(`Queue worker started (poll every ${intervalMs}ms)`);
  }

  async pollAndDeliver(): Promise<void> {
    // Guard against overlapping runs if a batch takes longer than the interval.
    if (this.running) return;
    this.running = true;
    try {
      const claimed = await this.claimBatch();
      if (claimed.length === 0) return;
      this.logger.log(`Claimed ${claimed.length} deliveries`);
      // Process concurrently; each is fully isolated.
      await Promise.all(claimed.map((d) => this.deliverOne(d)));
    } catch (err) {
      // Never let the poll loop die.
      this.logger.error(`pollAndDeliver failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Atomically claim up to BATCH_SIZE due deliveries and mark them 'delivering'.
   * SKIP LOCKED lets multiple workers/poll-cycles run without contention.
   */
  private claimBatch(): Promise<ClaimedDelivery[]> {
    return this.prisma.$queryRaw<ClaimedDelivery[]>`
      UPDATE deliveries d
      SET status = 'delivering', updated_at = now()
      WHERE d.id IN (
        SELECT id FROM deliveries
        WHERE status IN ('pending', 'retrying') AND next_retry_at <= now()
        ORDER BY next_retry_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${BATCH_SIZE}
      )
      RETURNING d.id,
                d.event_id      AS "eventId",
                d.connection_id AS "connectionId",
                d.attempt_count AS "attemptCount";
    `;
  }

  private async deliverOne(claim: ClaimedDelivery): Promise<void> {
    const attemptNumber = claim.attemptCount + 1;
    try {
      const delivery = await this.prisma.delivery.findUnique({
        where: { id: claim.id },
        include: {
          event: true,
          connection: { include: { destination: true } },
        },
      });
      if (!delivery) return;

      const policy = this.resolvePolicy(delivery.connection.retryPolicy);
      const destinationUrl = delivery.connection.destination.url;

      const { responseCode, responseBody, error, latencyMs } = await this.send(
        destinationUrl,
        delivery.id,
        delivery.event.id,
        attemptNumber,
        delivery.event.rawBody,
      );

      await this.attempts.record({
        deliveryId: delivery.id,
        attemptNumber,
        responseCode,
        responseBody: responseBody?.slice(0, RESPONSE_BODY_LIMIT) ?? null,
        error,
        latencyMs,
      });

      const success = responseCode !== null && responseCode >= 200 && responseCode < 300;
      if (success) {
        await this.prisma.delivery.update({
          where: { id: delivery.id },
          data: { status: 'succeeded', attemptCount: attemptNumber },
        });
        this.logger.log(
          `Delivery ${delivery.id} succeeded (attempt ${attemptNumber}, ${responseCode}, ${latencyMs}ms)`,
        );
        return;
      }

      // Failure path: dead-letter or schedule a backed-off retry.
      if (attemptNumber >= policy.maxAttempts) {
        await this.prisma.delivery.update({
          where: { id: delivery.id },
          data: { status: 'dead_lettered', attemptCount: attemptNumber },
        });
        this.logger.warn(
          `Delivery ${delivery.id} dead-lettered after ${attemptNumber} attempts ` +
            `(last: ${responseCode ?? error})`,
        );
        return;
      }

      const delayMs = this.backoff(policy, attemptNumber);
      const nextRetryAt = new Date(Date.now() + delayMs);
      await this.prisma.delivery.update({
        where: { id: delivery.id },
        data: {
          status: 'retrying',
          attemptCount: attemptNumber,
          nextRetryAt,
        },
      });
      this.logger.log(
        `Delivery ${delivery.id} failed (attempt ${attemptNumber}, ${responseCode ?? error}); ` +
          `retrying in ${delayMs}ms`,
      );
    } catch (err) {
      // Unexpected error while processing — log and leave it for the next poll.
      this.logger.error(
        `deliverOne(${claim.id}) errored: ${(err as Error).message}`,
      );
      await this.prisma.delivery
        .update({ where: { id: claim.id }, data: { status: 'retrying' } })
        .catch(() => undefined);
    }
  }

  /** POST the payload to the destination with a hard timeout. */
  private async send(
    url: string,
    deliveryId: string,
    eventId: string,
    attemptNumber: number,
    rawBody: string,
  ): Promise<{
    responseCode: number | null;
    responseBody: string | null;
    error: string | null;
    latencyMs: number;
  }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    const startedAt = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-id': deliveryId,
          'x-idempotency-key': `${eventId}-${attemptNumber}`,
          'x-attempt-number': String(attemptNumber),
        },
        body: rawBody,
        signal: controller.signal,
      });
      const text = await res.text().catch(() => '');
      return {
        responseCode: res.status,
        responseBody: text,
        error: null,
        latencyMs: Date.now() - startedAt,
      };
    } catch (err) {
      // Timeout (AbortError), ECONNREFUSED, DNS failure, etc.
      const e = err as Error;
      return {
        responseCode: null,
        responseBody: null,
        error: e.name === 'AbortError' ? `timeout after ${HTTP_TIMEOUT_MS}ms` : e.message,
        latencyMs: Date.now() - startedAt,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** delay = min(baseDelay * 2^attempt + jitter, maxDelay) */
  private backoff(policy: RetryPolicy, attemptNumber: number): number {
    const jitter = Math.floor(Math.random() * 1000);
    return Math.min(
      policy.baseDelay * Math.pow(2, attemptNumber) + jitter,
      policy.maxDelay,
    );
  }

  private resolvePolicy(raw: unknown): RetryPolicy {
    const p = (raw ?? {}) as Partial<RetryPolicy>;
    return {
      maxAttempts: p.maxAttempts ?? DEFAULT_POLICY.maxAttempts,
      baseDelay: p.baseDelay ?? DEFAULT_POLICY.baseDelay,
      maxDelay: p.maxDelay ?? DEFAULT_POLICY.maxDelay,
    };
  }
}
