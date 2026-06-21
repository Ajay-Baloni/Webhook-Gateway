import {
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { IngestService } from './ingest.service';

@Controller('ingest')
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post(':sourceId')
  @HttpCode(200)
  async receive(
    @Param('sourceId') sourceId: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    // rawBody is populated because the app is created with { rawBody: true }.
    const rawBody = req.rawBody ?? Buffer.from('');
    return this.ingest.ingest({
      sourceId,
      rawBody,
      signature,
      idempotencyKey,
      headers: req.headers as Record<string, unknown>,
    });
  }
}
