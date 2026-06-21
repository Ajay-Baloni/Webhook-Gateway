import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import { EmptyState, RelativeTime, Skeleton, truncId } from '../components/ui';

export function DeadLetterQueue() {
  const { data, loading, refetch } = usePolling(api.listDeadLetter);
  const [busy, setBusy] = useState(false);

  const replayOne = async (id: string) => {
    setBusy(true);
    try {
      await api.replayDelivery(id);
      toast.success('Replay queued');
      await refetch();
    } catch (e) {
      toast.error((e as Error).message || 'Replay failed');
    } finally {
      setBusy(false);
    }
  };

  const replayAll = async () => {
    setBusy(true);
    try {
      const r = await api.replayAllDeadLetter();
      toast.success(`Replaying ${r.replayed} deliveries`);
      await refetch();
    } catch (e) {
      toast.error((e as Error).message || 'Replay failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Dead Letter Queue</h1>
        <button
          onClick={replayAll}
          disabled={busy || !data?.length}
          className="rounded-lg bg-pending/20 px-3 py-1.5 text-sm font-medium text-pending hover:bg-pending/30 disabled:opacity-50"
        >
          Replay All
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-5 py-3 font-medium">Event ID</th>
              <th className="px-5 py-3 font-medium">Source</th>
              <th className="px-5 py-3 font-medium">Destination</th>
              <th className="px-5 py-3 font-medium">Failed</th>
              <th className="px-5 py-3 font-medium">Attempts</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              [0, 1, 2].map((i) => (
                <tr key={i} className="border-b border-border/50">
                  <td colSpan={6} className="px-5 py-3">
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))}
            {!loading &&
              data?.map((d) => (
                <tr key={d.id} className="border-b border-border/50 hover:bg-border/20">
                  <td className="px-5 py-3 font-mono text-xs">
                    <Link to={`/events/${d.event_id}`} className="text-pending hover:underline">
                      {truncId(d.event_id)}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-gray-200">{d.source_name}</td>
                  <td className="px-5 py-3 text-gray-300">{d.destination_name}</td>
                  <td className="px-5 py-3 text-gray-400">
                    <RelativeTime value={d.failed_at} />
                  </td>
                  <td className="px-5 py-3 text-gray-300">{d.attempt_count}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => replayOne(d.id)}
                      disabled={busy}
                      className="rounded bg-pending/20 px-2.5 py-1 text-xs font-medium text-pending hover:bg-pending/30 disabled:opacity-50"
                    >
                      Replay
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!loading && data?.length === 0 && (
          <EmptyState title="Dead letter queue is empty 🎉" hint="Nothing has exhausted its retries." />
        )}
      </div>
    </div>
  );
}
