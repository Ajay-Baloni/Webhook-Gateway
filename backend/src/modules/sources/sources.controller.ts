import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { SourcesService } from './sources.service';

class CreateSourceDto {
  @IsString()
  @MinLength(1)
  name: string;
}

@Controller('api/sources')
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  @Post()
  async create(@Body() dto: CreateSourceDto) {
    const source = await this.sources.create(dto.name);
    return {
      ...source,
      ingest_url: `/ingest/${source.id}`,
    };
  }

  @Get()
  findAll() {
    return this.sources.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sources.findOne(id);
  }
}
