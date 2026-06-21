import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SourcesService } from '../modules/sources/sources.service';
import { EventsService } from '../modules/events/events.service';
import { DeliveriesService } from '../modules/deliveries/deliveries.service';

export interface IngestInput {
  sourceId: string;
  rawBody: Buffer;
  signature?: string;
  idempotencyKey?: string;
  headers: Record<string, unknown>;
}

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sources: SourcesService,
    private readonly events: EventsService,
    private readonly deliveries: DeliveriesService,
  ) {}

  async ingest(input: IngestInput) {
    // 1. Resolve the source (404 if unknown).
    const source = await this.sources.findOneWithSecret(input.sourceId).catch(() => null);
    if (!source) throw new NotFoundException(`Source ${input.sourceId} not found`);

    // 2. Verify HMAC-SHA256 over the exact raw bytes.
    this.verifySignature(source.signingSecret, input.rawBody, input.signature);

    // 3 + 4 + 5. Persist event (idempotent) and fan out deliveries atomically.
    const result = await this.prisma.$transaction(async (tx) => {
      const { event, created } = await this.events.create(
        {
          sourceId: source.id,
          rawBody: input.rawBody.toString('utf8'),
          headers: input.headers,
          idempotencyKey: input.idempotencyKey ?? null,
        },
        tx,
      );

      // Duplicate idempotency key → return the existing event, no new deliveries.
      if (!created) {
        return { eventId: event.id, deliveries: 0, duplicate: true };
      }

      const connections = await tx.connection.findMany({
        where: { sourceId: source.id },
        select: { id: true },
      });
      const { count } = await this.deliveries.createForConnections(
        event.id,
        connections.map((c) => c.id),
        tx,
      );
      return { eventId: event.id, deliveries: count, duplicate: false };
    });

    this.logger.log(
      `Ingested event ${result.eventId} for source ${source.id} ` +
        `(${result.deliveries} deliveries${result.duplicate ? ', duplicate' : ''})`,
    );

    // 6. Caller returns 200 with this payload.
    return { received: true, ...result };
  }

  /** Constant-time HMAC-SHA256 comparison; throws 401 on mismatch/missing. */
  private verifySignature(secret: string, rawBody: Buffer, signature?: string) {
    if (!signature) {
      throw new UnauthorizedException('Missing x-webhook-signature header');
    }
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const providedBuf = Buffer.from(signature, 'utf8');
    if (
      expectedBuf.length !== providedBuf.length ||
      !timingSafeEqual(expectedBuf, providedBuf)
    ) {
      throw new UnauthorizedException('Invalid signature');
    }
  }
}
