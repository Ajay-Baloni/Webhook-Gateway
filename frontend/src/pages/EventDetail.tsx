import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, type Attempt, type DeliveryWithAttempts } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import { Panel, RelativeTime, Skeleton, StatusBadge } from '../components/ui';

function prettyJson(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function codeColor(a: Attempt) {
  if (a.response_code === null) return '#f59e0b'; // timeout / network error
  if (a.response_code >= 200 && a.response_code < 300) return '#22c55e';
  return '#ef4444';
}

function AttemptRow({ a }: { a: Attempt }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">#{a.attempt_number}</span>
          <span className="font-mono text-sm font-medium" style={{ color: codeColor(a) }}>
            {a.response_code ?? a.error ?? 'no response'}
          </span>
          {a.latency_ms != null && (
            <span className="text-xs text-gray-500">{a.latency_ms}ms</span>
          )}
        </div>
        <span className="text-xs text-gray-500">
          <RelativeTime value={a.attempted_at} />
        </span>
      </div>
      {(a.response_body || a.error) && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-2 text-xs text-pending hover:underline"
        >
          {open ? 'Hide' : 'Show'} response
        </button>
      )}
      {open && (
        <pre className="mt-2 max-h-48 overflow-auto rounded bg-bg p-2 text-xs text-gray-300">
          {a.response_body || a.error}
        </pre>
      )}
    </div>
  );
}

function DeliveryCard({ d, onReplayed }: { d: DeliveryWithAttempts; onReplayed: () => void }) {
  const [busy, setBusy] = useState(false);
  const replay = async () => {
    setBusy(true);
    try {
      await api.replayDelivery(d.id);
      toast.success('Replay queued');
      onReplayed();
    } catch (e) {
      toast.error((e as Error).message || 'Replay failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-300">
          → {d.destination_name}
          <span className="ml-2 text-xs text-gray-500">{d.destination_url}</span>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={d.status} />
          {d.status === 'dead_lettered' && (
            <button
              onClick={replay}
              disabled={busy}
              className="rounded bg-pending/20 px-2.5 py-1 text-xs font-medium text-pending hover:bg-pending/30 disabled:opacity-50"
            >
              Replay
            </button>
          )}
        </div>
      </div>
      {d.attempts.length === 0 ? (
        <div className="text-xs text-gray-500">No attempts yet — waiting for the worker.</div>
      ) : (
        <div className="space-y-2">
          {d.attempts.map((a) => (
            <AttemptRow key={a.attempt_number} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}

export function EventDetail() {
  const { eventId = '' } = useParams();
  const { data: event, loading } = usePolling(() => api.getEvent(eventId), [eventId]);
  const { data: deliveries, refetch: refetchDeliveries } = usePolling(
    () => api.getEventDeliveries(eventId),
    [eventId],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/events" className="text-sm text-gray-400 hover:text-gray-200">
          ← Events
        </Link>
        <h1 className="text-2xl font-semibold text-white">Event detail</h1>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-6">
          <Panel title="Metadata">
            {loading || !event ? (
              <Skeleton className="h-32" />
            ) : (
              <dl className="space-y-2 text-sm">
                <Row k="Event ID" v={<span className="font-mono text-xs">{event.id}</span>} />
                <Row k="Source" v={event.source_name} />
                <Row k="Received" v={<RelativeTime value={event.received_at} />} />
                <Row k="Idempotency key" v={event.idempotency_key ?? '—'} />
              </dl>
            )}
          </Panel>

          <Panel title="Raw payload">
            {loading || !event ? (
              <Skeleton className="h-48" />
            ) : (
              <pre className="max-h-96 overflow-auto rounded bg-bg p-3 text-xs text-gray-300">
                {prettyJson(event.raw_body)}
              </pre>
            )}
          </Panel>
        </div>

        <Panel title="Delivery timeline">
          {!deliveries ? (
            <Skeleton className="h-48" />
          ) : deliveries.length === 0 ? (
            <div className="text-sm text-gray-500">No deliveries for this event.</div>
          ) : (
            <div className="space-y-6">
              {deliveries.map((d) => (
                <DeliveryCard key={d.id} d={d} onReplayed={refetchDeliveries} />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{k}</dt>
      <dd className="text-right text-gray-200">{v}</dd>
    </div>
  );
}
