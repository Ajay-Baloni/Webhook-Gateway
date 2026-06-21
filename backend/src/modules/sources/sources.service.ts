import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SourcesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a source with a freshly generated signing secret (returned once). */
  create(name: string) {
    const signingSecret = randomBytes(32).toString('hex');
    return this.prisma.source.create({
      data: { name, signingSecret },
    });
  }

  /** Public listing — never includes the signing secret. */
  findAll() {
    return this.prisma.source.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, createdAt: true },
    });
  }

  /** Full record incl. secret — used internally (e.g. ingest HMAC verification). */
  async findOneWithSecret(id: string) {
    const source = await this.prisma.source.findUnique({ where: { id } });
    if (!source) throw new NotFoundException(`Source ${id} not found`);
    return source;
  }
}
