import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';

export const PG_POOL = 'PG_POOL';

/**
 * Global Postgres connection pool. Injected anywhere with:
 *   constructor(@Inject(PG_POOL) private readonly pool: Pool) {}
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () => {
        return new Pool({
          connectionString:
            process.env.DATABASE_URL ??
            'postgres://webhook:webhook@localhost:5432/webhook_gateway',
          max: 10,
        });
      },
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
