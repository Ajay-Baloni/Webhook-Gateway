import { Controller, Get, Param, Query } from '@nestjs/common';
import { EventsService } from './events.service';
import { DeliveriesService } from '../deliveries/deliveries.service';

@Controller('events')
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly deliveries: DeliveriesService,
  ) {}

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('sourceId') sourceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.events.findAll({
      status,
      sourceId,
      from,
      to,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.events.findOne(id);
  }

  @Get(':id/deliveries')
  findDeliveries(@Param('id') id: string) {
    return this.deliveries.findByEvent(id);
  }
}
