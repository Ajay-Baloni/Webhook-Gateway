import { useState } from 'react';
import toast from 'react-hot-toast';
import { api, type CreatedSource } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import { CopyButton, EmptyState, Panel, Skeleton } from '../components/ui';

export function SourcesDestinations() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Sources &amp; Destinations</h1>
      <div className="grid grid-cols-2 gap-6">
        <Sources />
        <Destinations />
      </div>
      <Connections />
    </div>
  );
}

function Sources() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<CreatedSource | null>(null);
  const { data, loading, refetch } = usePolling(api.listSources);

  const create = async () => {
    setBusy(true);
    try {
      const s = await api.createSource(name);
      setRevealed(s);
      setName('');
      toast.success(`Source "${s.name}" created`);
      await refetch();
    } catch {
      toast.error('Could not create source');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Sources">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create();
        }}
        className="flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Source name (e.g. Stripe)"
          className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-gray-200 placeholder-gray-600"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-pending/20 px-3 py-2 text-sm font-medium text-pending hover:bg-pending/30 disabled:opacity-50"
        >
          Create
        </button>
      </form>

      {revealed && (
        <div className="mt-4 rounded-lg border border-retry/40 bg-retry/10 p-3">
          <div className="text-xs font-medium text-retry">
            Save this signing secret — it will not be shown again
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-bg px-2 py-1 font-mono text-xs text-gray-200">
              {revealed.signing_secret}
            </code>
            <CopyButton value={revealed.signing_secret} />
          </div>
        </div>
      )}

      <div className="mt-5 space-y-2">
        {loading && <Skeleton className="h-16" />}
        {!loading && data?.length === 0 && <EmptyState title="No sources yet" />}
        {data?.map((s) => (
          <div key={s.id} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-200">{s.name}</span>
              <CopyButton value={s.ingest_url} />
            </div>
            <code className="mt-1 block overflow-x-auto text-xs text-gray-500">{s.ingest_url}</code>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Destinations() {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, loading, refetch } = usePolling(api.listDestinations);

  const create = async () => {
    setBusy(true);
    try {
      const d = await api.createDestination(name, url);
      setName('');
      setUrl('');
      toast.success(`Destination "${d.name}" created`);
      await refetch();
    } catch {
      toast.error('Could not create destination (check the URL)');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Destinations">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && url.trim()) create();
        }}
        className="space-y-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Destination name"
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-gray-200 placeholder-gray-600"
        />
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://… or http://fake-destination:4000/webhook"
            className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-gray-200 placeholder-gray-600"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-pending/20 px-3 py-2 text-sm font-medium text-pending hover:bg-pending/30 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </form>

      <div className="mt-5 space-y-2">
        {loading && <Skeleton className="h-16" />}
        {!loading && data?.length === 0 && <EmptyState title="No destinations yet" />}
        {data?.map((d) => (
          <div key={d.id} className="rounded-lg border border-border p-3">
            <div className="text-sm font-medium text-gray-200">{d.name}</div>
            <code className="mt-1 block overflow-x-auto text-xs text-gray-500">{d.url}</code>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Connections() {
  const [sourceId, setSourceId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: sources } = usePolling(api.listSources);
  const { data: destinations } = usePolling(api.listDestinations);
  const { data: connections, loading, refetch } = usePolling(api.listConnections);

  const create = async () => {
    setBusy(true);
    try {
      await api.createConnection(sourceId, destinationId);
      setSourceId('');
      setDestinationId('');
      toast.success('Connection created — you can now fire events');
      await refetch();
    } catch (e) {
      toast.error((e as Error).message || 'Could not create connection');
    } finally {
      setBusy(false);
    }
  };

  const selectClass =
    'flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-gray-200';

  return (
    <Panel title="Connections (link a source → destination)">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (sourceId && destinationId) create();
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={selectClass}>
          <option value="">Select source…</option>
          {sources?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="text-gray-500">→</span>
        <select
          value={destinationId}
          onChange={(e) => setDestinationId(e.target.value)}
          className={selectClass}
        >
          <option value="">Select destination…</option>
          {destinations?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy || !sourceId || !destinationId}
          className="rounded-lg bg-pending/20 px-3 py-2 text-sm font-medium text-pending hover:bg-pending/30 disabled:opacity-50"
        >
          Connect
        </button>
      </form>

      <div className="mt-5 space-y-2">
        {loading && <Skeleton className="h-12" />}
        {!loading && connections?.length === 0 && (
          <EmptyState
            title="No connections yet"
            hint="Link a source to a destination above — events can't be delivered without one."
          />
        )}
        {connections?.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm"
          >
            <span className="font-medium text-gray-200">{c.source_name}</span>
            <span className="text-gray-500">→</span>
            <span className="font-medium text-gray-200">{c.destination_name}</span>
            <code className="ml-auto text-xs text-gray-500">{c.destination_url}</code>
          </div>
        ))}
      </div>
    </Panel>
  );
}
