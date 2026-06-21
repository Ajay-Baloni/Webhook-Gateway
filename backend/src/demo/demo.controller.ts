import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { DemoService } from './demo.service';

class FireEventsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  count?: number;
}

@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Post('fire-events')
  fireEvents(@Body() dto: FireEventsDto) {
    return this.demo.fireEvents(dto.count ?? 10);
  }

  @Post('destination/stop')
  stop() {
    return this.demo.stopDestination();
  }

  @Post('destination/start')
  start() {
    return this.demo.startDestination();
  }

  @Get('status')
  status() {
    return this.demo.status();
  }
}
