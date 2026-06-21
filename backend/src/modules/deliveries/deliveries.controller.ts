import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service';

@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get('dead-letter')
  listDeadLettered(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.deliveries.listDeadLettered(
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
    );
  }

  @Post('dead-letter/replay')
  replayAllDeadLettered() {
    return this.deliveries.replayAllDeadLettered();
  }

  @Post(':deliveryId/replay')
  replay(@Param('deliveryId') deliveryId: string) {
    return this.deliveries.replay(deliveryId);
  }
}
