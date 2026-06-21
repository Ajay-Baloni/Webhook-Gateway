import { Controller, Get, Param } from '@nestjs/common';
import { AttemptsService } from './attempts.service';

@Controller('deliveries')
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Get(':deliveryId/attempts')
  findByDelivery(@Param('deliveryId') deliveryId: string) {
    return this.attempts.findByDelivery(deliveryId);
  }
}
