import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DeliveriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fan out: one pending delivery per connection for a freshly ingested event.
   * Idempotent via the (event_id, connection_id) unique constraint.
   * Runs inside the ingest transaction when a client is supplied.
   */
  async createForConnections(
    eventId: string,
    connectionIds: string[],
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    if (connectionIds.length === 0) return { count: 0 };
    return tx.delivery.createMany({
      data: connectionIds.map((connectionId) => ({ eventId, connectionId })),
      skipDuplicates: true,
    });
  }

  /** Deliveries for an event, with their attempt timeline nested (oldest first). */
  async findByEvent(eventId: string) {
    const rows = await this.prisma.delivery.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
      include: {
        connection: { include: { destination: { select: { name: true, url: true } } } },
        attempts: { orderBy: { attemptNumber: 'asc' } },
      },
    });
    return rows.map((d) => ({
      id: d.id,
      status: d.status,
      attempt_count: d.attemptCount,
      next_retry_at: d.nextRetryAt,
      destination_name: d.connection.destination.name,
      destination_url: d.connection.destination.url,
      attempts: d.attempts.map((a) => ({
        attempt_number: a.attemptNumber,
        response_code: a.responseCode,
        response_body: a.responseBody,
        error: a.error,
        latency_ms: a.latencyMs,
        attempted_at: a.attemptedAt,
      })),
    }));
  }

  async listDeadLettered(limit = 100, offset = 0) {
    const rows = await this.prisma.delivery.findMany({
      where: { status: 'dead_lettered' },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(limit, 200),
      skip: offset,
      include: {
        event: { include: { source: { select: { name: true } } } },
        connection: { include: { destination: { select: { name: true } } } },
      },
    });
    return rows.map((d) => ({
      id: d.id,
      event_id: d.eventId,
      source_name: d.event.source.name,
      destination_name: d.connection.destination.name,
      attempt_count: d.attemptCount,
      failed_at: d.updatedAt,
    }));
  }

  /**
   * Re-enqueue a delivery for immediate retry. Only dead_lettered or failed
   * deliveries may be replayed.
   */
  async replay(id: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery) throw new NotFoundException(`Delivery ${id} not found`);
    if (delivery.status !== 'dead_lettered' && delivery.status !== 'failed') {
      throw new BadRequestException(
        `Delivery ${id} is '${delivery.status}'; only dead_lettered or failed can be replayed`,
      );
    }
    await this.prisma.delivery.update({
      where: { id },
      data: { status: 'pending', attemptCount: 0, nextRetryAt: new Date() },
    });
    return { replayed: true, deliveryId: id };
  }

  async replayAllDeadLettered() {
    const { count } = await this.prisma.delivery.updateMany({
      where: { status: 'dead_lettered' },
      data: { status: 'pending', attemptCount: 0, nextRetryAt: new Date() },
    });
    return { replayed: count };
  }
}
