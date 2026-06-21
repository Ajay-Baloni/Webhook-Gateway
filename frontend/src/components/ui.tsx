import { ReactNode } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { DeliveryStatus } from '../api/client';

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  succeeded: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e', label: 'succeeded' },
  pending: { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6', label: 'pending' },
  delivering: { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6', label: 'delivering' },
  retrying: { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b', label: 'retrying' },
  failed: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444', label: 'failed' },
  dead_lettered: { bg: 'rgba(239,68,68,0.18)', text: '#ef4444', label: 'dead lettered' },
};

export function StatusBadge({ status }: { status: DeliveryStatus | string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}

export function Card({
  title,
  value,
  accent,
}: {
  title: string;
  value: ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-xs uppercase tracking-wide text-gray-400">{title}</div>
      <div className="mt-2 text-3xl font-semibold" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  );
}

export function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold text-gray-200">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-border/60 ${className}`} />;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-sm font-medium text-gray-300">{title}</div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  );
}

export function RelativeTime({ value }: { value: string }) {
  try {
    return <span title={new Date(value).toLocaleString()}>{formatDistanceToNow(new Date(value), { addSuffix: true })}</span>;
  } catch {
    return <span>{value}</span>;
  }
}

export function truncId(id: string, len = 8) {
  return id.length > len ? `${id.slice(0, len)}…` : id;
}

export function CopyButton({ value }: { value: string }) {
  return (
    <button
      onClick={() => navigator.clipboard.writeText(value)}
      className="rounded border border-border px-2 py-0.5 text-xs text-gray-300 hover:bg-border/50"
    >
      Copy
    </button>
  );
}
