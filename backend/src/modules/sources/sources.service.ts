import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';

@Injectable()
export class SourcesService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(name: string) {
    const signingSecret = `whsec_${randomBytes(24).toString('hex')}`;
    const { rows } = await this.pool.query(
      `INSERT INTO sources (name, signing_secret)
       VALUES ($1, $2)
       RETURNING id, name, signing_secret, created_at`,
      [name, signingSecret],
    );
    return rows[0];
  }

  async findAll() {
    const { rows } = await this.pool.query(
      `SELECT id, name, signing_secret, created_at
       FROM sources ORDER BY created_at DESC`,
    );
    return rows;
  }

  async findOne(id: string) {
    const { rows } = await this.pool.query(
      `SELECT id, name, signing_secret, created_at FROM sources WHERE id = $1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException(`Source ${id} not found`);
    return rows[0];
  }
}
