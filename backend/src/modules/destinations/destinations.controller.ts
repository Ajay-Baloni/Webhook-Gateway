import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsString, IsUrl, MinLength } from 'class-validator';
import { DestinationsService } from './destinations.service';

class CreateDestinationDto {
  @IsString()
  @MinLength(1)
  name: string;

  // require_tld:false so http://fake-destination:4000/webhook validates.
  @IsUrl({ require_tld: false })
  url: string;
}

@Controller('destinations')
export class DestinationsController {
  constructor(private readonly destinations: DestinationsService) {}

  @Post()
  create(@Body() dto: CreateDestinationDto) {
    return this.destinations.create(dto.name, dto.url);
  }

  @Get()
  findAll() {
    return this.destinations.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.destinations.findOne(id);
  }
}
