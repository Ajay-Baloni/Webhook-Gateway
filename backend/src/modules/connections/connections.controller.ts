import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsObject, IsOptional, IsUUID } from 'class-validator';
import { ConnectionsService } from './connections.service';

class CreateConnectionDto {
  @IsUUID()
  source_id: string;

  @IsUUID()
  destination_id: string;

  @IsOptional()
  @IsObject()
  retry_policy?: object;
}

@Controller('api/connections')
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Post()
  create(@Body() dto: CreateConnectionDto) {
    return this.connections.create(dto.source_id, dto.destination_id, dto.retry_policy);
  }

  @Get()
  findAll() {
    return this.connections.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.connections.findOne(id);
  }
}
