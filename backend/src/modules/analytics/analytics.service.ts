import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [eventsRow, statusRows, successErrorRows, throughputRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ total: number }>>`
        SELECT COUNT(*)::int AS total FROM events
        WHERE received_at >= now() - interval '24 hours'
      `,
      this.prisma.$queryRaw<Array<{ status: string; count: number }>>`
        SELECT status::text AS status, COUNT(*)::int AS count FROM deliveries GROUP BY status
      `,
      this.prisma.$queryRaw<Array<{ hour: Date; success: number; error: number }>>`
        SELECT date_trunc('hour', attempted_at) AS hour,
               COUNT(*) FILTER (WHERE response_code >= 200 AND response_code < 300)::int AS success,
               COUNT(*) FILTER (WHERE response_code IS NULL OR response_code < 200 OR response_code >= 300)::int AS error
        FROM delivery_attempts
        WHERE attempted_at >= now() - interval '24 hours'
        GROUP BY 1 ORDER BY 1
      `,
      this.prisma.$queryRaw<Array<{ hour: Date; count: number }>>`
        SELECT date_trunc('hour', received_at) AS hour, COUNT(*)::int AS count
        FROM events
        WHERE received_at >= now() - interval '24 hours'
        GROUP BY 1 ORDER BY 1
      `,
    ]);

    const counts: Record<string, number> = {};
    for (const r of statusRows) counts[r.status] = r.count;

    const succeeded = counts.succeeded ?? 0;
    const deadLettered = counts.dead_lettered ?? 0;
    const terminal = succeeded + deadLettered;
    const successRate = terminal === 0 ? 100 : Math.round((succeeded / terminal) * 1000) / 10;

    return {
      cards: {
        totalEvents: eventsRow[0]?.total ?? 0,
        successRate,
        pendingDeliveries:
          (counts.pending ?? 0) + (counts.delivering ?? 0) + (counts.retrying ?? 0),
        deadLettered,
      },
      successError: this.fillHours(successErrorRows, (row) => ({
        success: row?.success ?? 0,
        error: row?.error ?? 0,
      })),
      throughput: this.fillHours(throughputRows, (row) => ({ count: row?.count ?? 0 })),
    };
  }

  /** Build a dense 24-hour series (oldest → newest), filling gaps with zeros. */
  private fillHours<T extends { hour: Date }, R>(
    rows: T[],
    pick: (row: T | undefined) => R,
  ): Array<{ hour: string } & R> {
    const byHour = new Map<string, T>();
    for (const r of rows) byHour.set(new Date(r.hour).toISOString(), r);

    const out: Array<{ hour: string } & R> = [];
    const now = new Date();
    now.setMinutes(0, 0, 0);
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 3600_000);
      const key = d.toISOString();
      out.push({ hour: key, ...pick(byHour.get(key)) });
    }
    return out;
  }
}
