import { Module } from '@nestjs/common';
import { SourcesModule } from '../modules/sources/sources.module';
import { DestinationsModule } from '../modules/destinations/destinations.module';
import { ConnectionsModule } from '../modules/connections/connections.module';
import { EventsModule } from '../modules/events/events.module';
import { DeliveriesModule } from '../modules/deliveries/deliveries.module';

/**
 * Demo control panel endpoints:
 *   POST /demo/fire-events          -> create N fake events
 *   POST /demo/destination/stop     -> kill the fake destination
 *   POST /demo/destination/start    -> restart the fake destination
 *
 * TODO(step 7): add DemoController + DemoService.
 */
@Module({
  imports: [
    SourcesModule,
    DestinationsModule,
    ConnectionsModule,
    EventsModule,
    DeliveriesModule,
  ],
  controllers: [],
  providers: [],
})
export class DemoModule {}
