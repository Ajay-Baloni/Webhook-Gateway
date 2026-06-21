import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';

export function DemoControlPanel() {
  const { data: status, refetch } = usePolling(api.demoStatus);
  const [busy, setBusy] = useState(false);
  const up = status?.destinationStatus === 'up';

  // Polling (every 3s across the app) refreshes the rest of the UI; we just
  // refetch the local status for an immediate badge update.
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await refetch();
    } finally {
      setBusy(false);
    }
  };

  const fire = () =>
    run(async () => {
      try {
        const r = await api.fireEvents(10);
        toast.success(`Fired ${r.fired} events`);
      } catch (e) {
        toast.error((e as Error).message || 'Could not fire events');
      }
    });

  const kill = () =>
    run(async () => {
      await api.stopDestination();
      toast('💀 Destination killed', { icon: '💀' });
    });

  const restore = () =>
    run(async () => {
      await api.startDestination();
      toast.success('Destination restored');
    });

  return (
    <div className="fixed bottom-5 right-5 w-64 rounded-xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Demo Control
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            backgroundColor: up ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            color: up ? '#22c55e' : '#ef4444',
          }}
        >
          {up ? 'UP' : 'DOWN'}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={fire}
          disabled={busy}
          className="rounded-lg bg-pending/20 px-3 py-2 text-sm font-medium text-pending hover:bg-pending/30 disabled:opacity-50"
        >
          🔥 Fire 10 Events
        </button>
        <button
          onClick={kill}
          disabled={!up || busy}
          className="rounded-lg bg-error/20 px-3 py-2 text-sm font-medium text-error hover:bg-error/30 disabled:opacity-50"
        >
          💀 Kill Destination
        </button>
        <button
          onClick={restore}
          disabled={up || busy}
          className="rounded-lg bg-success/20 px-3 py-2 text-sm font-medium text-success hover:bg-success/30 disabled:opacity-50"
        >
          ✅ Restore Destination
        </button>
      </div>
    </div>
  );
}
