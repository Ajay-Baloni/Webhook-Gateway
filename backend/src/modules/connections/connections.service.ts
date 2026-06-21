import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_RETRY_POLICY = {
  maxAttempts: 5,
  baseDelay: 5000,
  maxDelay: 600000,
};

@Injectable()
export class ConnectionsService {
  constructor(private readonly prisma: PrismaService) {}

  create(sourceId: string, destinationId: string, retryPolicy?: object) {
    const policy = (retryPolicy ?? DEFAULT_RETRY_POLICY) as Prisma.InputJsonValue;
    return this.prisma.connection.upsert({
      where: { sourceId_destinationId: { sourceId, destinationId } },
      create: { sourceId, destinationId, retryPolicy: policy },
      update: { retryPolicy: policy },
    });
  }

  async findAll() {
    const rows = await this.prisma.connection.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        source: { select: { name: true } },
        destination: { select: { name: true, url: true } },
      },
    });
    return rows.map((c) => ({
      id: c.id,
      source_id: c.sourceId,
      destination_id: c.destinationId,
      retry_policy: c.retryPolicy,
      created_at: c.createdAt,
      source_name: c.source.name,
      destination_name: c.destination.name,
      destination_url: c.destination.url,
    }));
  }

  /** All connections for a source — used by ingest to fan out deliveries. */
  findBySource(sourceId: string) {
    return this.prisma.connection.findMany({ where: { sourceId } });
  }

  async findOne(id: string) {
    const connection = await this.prisma.connection.findUnique({ where: { id } });
    if (!connection) throw new NotFoundException(`Connection ${id} not found`);
    return connection;
  }
}
