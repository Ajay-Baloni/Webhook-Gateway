import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  /** Record a single HTTP attempt. Called by the queue worker. */
  record(input: RecordAttemptInput, tx: Prisma.TransactionClient = this.prisma) {
    return tx.deliveryAttempt.createMany({
      data: [
        {
          deliveryId: input.deliveryId,
          attemptNumber: input.attemptNumber,
          responseCode: input.responseCode ?? null,
          responseBody: input.responseBody ?? null,
          error: input.error ?? null,
          latencyMs: input.latencyMs ?? null,
        },
      ],
      skipDuplicates: true,
    });
  }

  /** Timeline of attempts for a delivery (oldest first). */
  findByDelivery(deliveryId: string) {
    return this.prisma.deliveryAttempt.findMany({
      where: { deliveryId },
      orderBy: { attemptNumber: 'asc' },
    });
  }
}
