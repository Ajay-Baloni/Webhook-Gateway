import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { DatabaseModule } from './database/database.module';

// Domain modules
import { SourcesModule } from './modules/sources/sources.module';
import { DestinationsModule } from './modules/destinations/destinations.module';
import { ConnectionsModule } from './modules/connections/connections.module';
import { EventsModule } from './modules/events/events.module';
import { DeliveriesModule } from './modules/deliveries/deliveries.module';
import { AttemptsModule } from './modules/attempts/attempts.module';

// Subsystems (scaffolded now, implemented in later steps)
import { IngestModule } from './ingest/ingest.module';
import { QueueModule } from './queue/queue.module';
import { DemoModule } from './demo/demo.module';

@Module({
  imports: [
    // @Interval/@Cron support for the queue worker (step 5).
    ScheduleModule.forRoot(),
    DatabaseModule,

    SourcesModule,
    DestinationsModule,
    ConnectionsModule,
    EventsModule,
    DeliveriesModule,
    AttemptsModule,

    IngestModule,
    QueueModule,
    DemoModule,
  ],
})
export class AppModule {}
