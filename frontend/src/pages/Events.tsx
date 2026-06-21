import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import { EmptyState, RelativeTime, Skeleton, StatusBadge, truncId } from '../components/ui';

const STATUSES = ['all', 'pending', 'succeeded', 'failed', 'retrying', 'dead_lettered'];

export function Events() {
  const [status, setStatus] = useState('all');
  const { data, loading } = usePolling(
    () => api.listEvents({ status: status === 'all' ? undefined : status, limit: 50 }),
    [status],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Events</h1>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-gray-200"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All statuses' : s}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-5 py-3 font-medium">Event ID</th>
              <th className="px-5 py-3 font-medium">Source</th>
              <th className="px-5 py-3 font-medium">Received</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Attempts</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              [0, 1, 2, 3, 4].map((i) => (
                <tr key={i} className="border-b border-border/50">
                  <td colSpan={6} className="px-5 py-3">
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))}
            {!loading &&
              data?.map((e) => (
                <tr key={e.id} className="border-b border-border/50 hover:bg-border/20">
                  <td className="px-5 py-3 font-mono text-xs text-gray-300">{truncId(e.id)}</td>
                  <td className="px-5 py-3 text-gray-200">{e.source_name}</td>
                  <td className="px-5 py-3 text-gray-400">
                    <RelativeTime value={e.received_at} />
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={e.status} />
                  </td>
                  <td className="px-5 py-3 text-gray-300">{e.attempt_count}</td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      to={`/events/${e.id}`}
                      className="rounded border border-border px-2.5 py-1 text-xs text-gray-300 hover:bg-border/50"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!loading && data?.length === 0 && (
          <EmptyState title="No events yet" hint="Fire some from the demo panel, or POST to an ingest URL." />
        )}
      </div>
    </div>
  );
}
