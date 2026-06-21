import { Module } from '@nestjs/common';
import { EventsModule } from '../modules/events/events.module';
import { DeliveriesModule } from '../modules/deliveries/deliveries.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

/**
 * Demo control panel:
 *   POST /demo/fire-events       -> create N fake events
 *   POST /demo/destination/stop  -> mark fake destination DOWN (control file)
 *   POST /demo/destination/start -> mark fake destination UP
 *   GET  /demo/status            -> live system stats for the panel
 */
@Module({
  imports: [EventsModule, DeliveriesModule],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
