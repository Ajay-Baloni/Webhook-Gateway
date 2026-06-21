import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service';

@Controller('api/deliveries')
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

  @Get('by-event/:eventId')
  findByEvent(@Param('eventId') eventId: string) {
    return this.deliveries.findByEvent(eventId);
  }

  @Post(':id/replay')
  replay(@Param('id') id: string) {
    return this.deliveries.replay(id);
  }
}
