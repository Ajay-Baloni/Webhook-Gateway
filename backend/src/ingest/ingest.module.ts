import { Module } from '@nestjs/common';
import { SourcesModule } from '../modules/sources/sources.module';
import { EventsModule } from '../modules/events/events.module';
import { DeliveriesModule } from '../modules/deliveries/deliveries.module';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';

/**
 * Public ingest endpoint: POST /ingest/:sourceId
 *   1. Verify HMAC-SHA256 (x-webhook-signature)
 *   2. Dedupe on x-idempotency-key
 *   3. Persist event + fan out one delivery per connection
 *   4. Return 200 immediately
 */
@Module({
  imports: [SourcesModule, EventsModule, DeliveriesModule],
  controllers: [IngestController],
  providers: [IngestService],
})
export class IngestModule {}
