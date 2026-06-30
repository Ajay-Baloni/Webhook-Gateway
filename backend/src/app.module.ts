import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { PrismaModule } from './prisma/prisma.module';

import { SourcesModule } from './modules/sources/sources.module';
import { DestinationsModule } from './modules/destinations/destinations.module';
import { ConnectionsModule } from './modules/connections/connections.module';
import { EventsModule } from './modules/events/events.module';
import { DeliveriesModule } from './modules/deliveries/deliveries.module';
import { AttemptsModule } from './modules/attempts/attempts.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { IngestModule } from './ingest/ingest.module';
import { QueueModule } from './queue/queue.module';
import { DemoModule } from './demo/demo.module';

@Module({
  imports: [
    // @Interval/@Cron support for the queue worker
    ScheduleModule.forRoot(),
    PrismaModule,

    SourcesModule,
    DestinationsModule,
    ConnectionsModule,
    EventsModule,
    DeliveriesModule,
    AttemptsModule,
    AnalyticsModule,

    IngestModule,
    QueueModule,
    DemoModule,
  ],
})
export class AppModule {}
