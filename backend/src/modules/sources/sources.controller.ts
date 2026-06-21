import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { SourcesService } from './sources.service';

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';

class CreateSourceDto {
  @IsString()
  @MinLength(1)
  name: string;
}

@Controller('sources')
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  @Post()
  async create(@Body() dto: CreateSourceDto) {
    const source = await this.sources.create(dto.name);
    return {
      id: source.id,
      name: source.name,
      // Shown only on creation — clients must save it now.
      signing_secret: source.signingSecret,
      ingest_url: `${PUBLIC_BASE_URL}/ingest/${source.id}`,
    };
  }

  @Get()
  async findAll() {
    const sources = await this.sources.findAll();
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      created_at: s.createdAt,
      ingest_url: `${PUBLIC_BASE_URL}/ingest/${s.id}`,
    }));
  }
}
