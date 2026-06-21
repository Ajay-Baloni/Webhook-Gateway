import { Module } from '@nestjs/common';
import { SourcesModule } from '../modules/sources/sources.module';
import { ConnectionsModule } from '../modules/connections/connections.module';
import { EventsModule } from '../modules/events/events.module';
import { DeliveriesModule } from '../modules/deliveries/deliveries.module';

/**
 * Public ingest endpoint: POST /ingest/:sourceId
 *   1. Verify HMAC-SHA256 (x-webhook-signature)
 *   2. Dedupe on x-idempotency-key
 *   3. Persist event + fan out deliveries (one per connection)
 *   4. Return 200 immediately
 *
 * TODO(step 4): add IngestController + IngestService.
 */
@Module({
  imports: [SourcesModule, ConnectionsModule, EventsModule, DeliveriesModule],
  controllers: [],
  providers: [],
})
export class IngestModule {}
