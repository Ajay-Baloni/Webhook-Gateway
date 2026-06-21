import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DestinationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(name: string, url: string) {
    return this.prisma.destination.create({ data: { name, url } });
  }

  findAll() {
    return this.prisma.destination.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const destination = await this.prisma.destination.findUnique({ where: { id } });
    if (!destination) throw new NotFoundException(`Destination ${id} not found`);
    return destination;
  }
}
