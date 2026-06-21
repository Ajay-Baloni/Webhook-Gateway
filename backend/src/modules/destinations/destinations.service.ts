import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';

@Injectable()
export class DestinationsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(name: string, url: string) {
    const { rows } = await this.pool.query(
      `INSERT INTO destinations (name, url)
       VALUES ($1, $2)
       RETURNING id, name, url, created_at`,
      [name, url],
    );
    return rows[0];
  }

  async findAll() {
    const { rows } = await this.pool.query(
      `SELECT id, name, url, created_at FROM destinations ORDER BY created_at DESC`,
    );
    return rows;
  }

  async findOne(id: string) {
    const { rows } = await this.pool.query(
      `SELECT id, name, url, created_at FROM destinations WHERE id = $1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException(`Destination ${id} not found`);
    return rows[0];
  }
}
