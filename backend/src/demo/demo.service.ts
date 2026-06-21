import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { dirname } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../modules/events/events.service';
import { DeliveriesService } from '../modules/deliveries/deliveries.service';

const CONTROL_FILE = process.env.DEMO_CONTROL_FILE ?? './shared/demo-control.json';

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly deliveries: DeliveriesService,
  ) {}

  /** Create N fake events for the first source and fan out to the first connection. */
  async fireEvents(count = 10) {
    const source = await this.prisma.source.findFirst({ orderBy: { createdAt: 'asc' } });
    const connection = await this.prisma.connection.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (!source || !connection) {
      throw new BadRequestException(
        'Need at least one source and one connection. Create them on the Sources & Destinations page first.',
      );
    }

    let fired = 0;
    for (let i = 0; i < count; i++) {
      const payload = {
        event: 'demo.test',
        timestamp: new Date().toISOString(),
        data: { orderId: randomUUID(), amount: Math.floor(Math.random() * 10000) / 100 },
      };
      // Bypass signature verification — demo seeding only.
      const { event } = await this.events.create({
        sourceId: source.id,
        rawBody: JSON.stringify(payload),
        headers: { 'content-type': 'application/json', 'x-demo': 'true' },
        idempotencyKey: null,
      });
      await this.deliveries.createForConnections(event.id, [connection.id]);
      fired++;
    }
    this.logger.log(`Fired ${fired} demo events`);
    return { fired };
  }

  async stopDestination() {
    await this.writeControl({ running: false });
    this.logger.warn('Demo: destination marked DOWN');
    return { status: 'stopped' };
  }

  async startDestination() {
    await this.writeControl({ running: true });
    this.logger.log('Demo: destination marked UP');
    return { status: 'started' };
  }

  async status() {
    const [totalEvents, grouped, running] = await Promise.all([
      this.prisma.event.count(),
      this.prisma.delivery.groupBy({ by: ['status'], _count: { _all: true } }),
      this.isDestinationUp(),
    ]);

    const counts: Record<string, number> = {};
    for (const g of grouped) counts[g.status] = g._count._all;

    return {
      totalEvents,
      pendingDeliveries:
        (counts.pending ?? 0) + (counts.delivering ?? 0) + (counts.retrying ?? 0),
      succeededDeliveries: counts.succeeded ?? 0,
      failedDeliveries: counts.failed ?? 0,
      deadLetteredDeliveries: counts.dead_lettered ?? 0,
      destinationStatus: running ? 'up' : 'down',
    };
  }

  private async isDestinationUp(): Promise<boolean> {
    try {
      const raw = await fs.readFile(CONTROL_FILE, 'utf8');
      return JSON.parse(raw).running !== false;
    } catch {
      // Missing/unreadable control file → assume up.
      return true;
    }
  }

  private async writeControl(state: { running: boolean }) {
    await fs.mkdir(dirname(CONTROL_FILE), { recursive: true }).catch(() => undefined);
    await fs.writeFile(CONTROL_FILE, JSON.stringify(state) + '\n', 'utf8');
  }
}
