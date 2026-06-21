import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateEventInput {
  sourceId: string;
  rawBody: string;
  headers: Record<string, unknown>;
  idempotencyKey?: string | null;
}

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insert a raw event. If an idempotency_key collides for the same source,
   * returns the already-stored event with `created: false` (used by ingest).
   * Accepts an optional transaction client so it can run inside the ingest tx.
   */
  async create(
    input: CreateEventInput,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<{ event: { id: string; sourceId: string; receivedAt: Date }; created: boolean }> {
    try {
      const event = await tx.event.create({
        data: {
          sourceId: input.sourceId,
          rawBody: input.rawBody,
          headers: (input.headers ?? {}) as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey ?? null,
        },
        select: { id: true, sourceId: true, receivedAt: true },
      });
      return { event, created: true };
    } catch (err) {
      // P2002 = unique constraint violation on (source_id, idempotency_key).
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        input.idempotencyKey
      ) {
        const existing = await tx.event.findUnique({
          where: {
            sourceId_idempotencyKey: {
              sourceId: input.sourceId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          select: { id: true, sourceId: true, receivedAt: true },
        });
        if (existing) return { event: existing, created: false };
      }
      throw err;
    }
  }

  async findAll(filters: {
    status?: string;
    sourceId?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) {
    const conditions: Prisma.Sql[] = [];

    if (filters.sourceId) conditions.push(Prisma.sql`e.source_id = ${filters.sourceId}::uuid`);
    if (filters.from) conditions.push(Prisma.sql`e.received_at >= ${filters.from}::timestamptz`);
    if (filters.to) conditions.push(Prisma.sql`e.received_at <= ${filters.to}::timestamptz`);
    if (filters.status) {
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM deliveries d WHERE d.event_id = e.id AND d.status = ${filters.status}::"DeliveryStatus")`,
      );
    }

    const where =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.empty;

    const limit = Math.min(filters.limit ?? 50, 200);
    const offset = filters.offset ?? 0;

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        sourceId: string;
        sourceName: string;
        receivedAt: Date;
        idempotencyKey: string | null;
        attemptCount: number;
        deliveryCount: number;
        succeededCount: number;
        deadLetteredCount: number;
        retryingCount: number;
        inFlightCount: number;
        failedCount: number;
      }>
    >`
      SELECT e.id, e.source_id AS "sourceId", s.name AS "sourceName",
             e.received_at AS "receivedAt", e.idempotency_key AS "idempotencyKey",
             COALESCE(SUM(d.attempt_count), 0)::int AS "attemptCount",
             COUNT(d.id)::int AS "deliveryCount",
             COUNT(*) FILTER (WHERE d.status = 'succeeded')::int     AS "succeededCount",
             COUNT(*) FILTER (WHERE d.status = 'dead_lettered')::int AS "deadLetteredCount",
             COUNT(*) FILTER (WHERE d.status = 'retrying')::int      AS "retryingCount",
             COUNT(*) FILTER (WHERE d.status IN ('pending','delivering'))::int AS "inFlightCount",
             COUNT(*) FILTER (WHERE d.status = 'failed')::int        AS "failedCount"
      FROM events e
      JOIN sources s ON s.id = e.source_id
      LEFT JOIN deliveries d ON d.event_id = e.id
      ${where}
      GROUP BY e.id, s.name
      ORDER BY e.received_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return rows.map((r) => ({
      id: r.id,
      source_id: r.sourceId,
      source_name: r.sourceName,
      received_at: r.receivedAt,
      idempotency_key: r.idempotencyKey,
      attempt_count: r.attemptCount,
      delivery_count: r.deliveryCount,
      status: this.rollupStatus(r),
    }));
  }

  /** Collapse an event's deliveries into one representative status for the table. */
  private rollupStatus(r: {
    deliveryCount: number;
    deadLetteredCount: number;
    retryingCount: number;
    inFlightCount: number;
    failedCount: number;
    succeededCount: number;
  }): string {
    if (r.deliveryCount === 0) return 'pending';
    if (r.deadLetteredCount > 0) return 'dead_lettered';
    if (r.retryingCount > 0) return 'retrying';
    if (r.inFlightCount > 0) return 'pending';
    if (r.failedCount > 0) return 'failed';
    return 'succeeded';
  }

  async findOne(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: { source: { select: { name: true } } },
    });
    if (!event) throw new NotFoundException(`Event ${id} not found`);
    return {
      id: event.id,
      source_id: event.sourceId,
      source_name: event.source.name,
      raw_body: event.rawBody,
      headers: event.headers,
      idempotency_key: event.idempotencyKey,
      received_at: event.receivedAt,
    };
  }
}
