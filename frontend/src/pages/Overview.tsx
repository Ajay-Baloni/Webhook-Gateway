import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import { Card, Panel, Skeleton } from '../components/ui';

const hourLabel = (iso: string) => new Date(iso).getHours().toString().padStart(2, '0') + ':00';

const tooltipStyle = {
  backgroundColor: '#1a1d27',
  border: '1px solid #2a2d3a',
  borderRadius: 8,
  color: '#e5e7eb',
  fontSize: 12,
};

export function Overview() {
  const { data, loading } = usePolling(api.overview);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-white">Overview</h1>
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const successError = data.successError.map((d) => ({ ...d, label: hourLabel(d.hour) }));
  const throughput = data.throughput.map((d) => ({ ...d, label: hourLabel(d.hour) }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Overview</h1>

      <div className="grid grid-cols-4 gap-4">
        <Card title="Total Events (24h)" value={data.cards.totalEvents} />
        <Card title="Success Rate" value={`${data.cards.successRate}%`} accent="#22c55e" />
        <Card title="Pending Deliveries" value={data.cards.pendingDeliveries} accent="#3b82f6" />
        <Card title="Dead Lettered" value={data.cards.deadLettered} accent="#ef4444" />
      </div>

      <Panel title="Success vs Error (per hour, last 24h)">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={successError}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" />
            <XAxis dataKey="label" stroke="#6b7280" fontSize={11} interval={2} />
            <YAxis stroke="#6b7280" fontSize={11} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="success" stroke="#22c55e" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="error" stroke="#ef4444" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Events ingested (per hour, last 24h)">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={throughput}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" />
            <XAxis dataKey="label" stroke="#6b7280" fontSize={11} interval={2} />
            <YAxis stroke="#6b7280" fontSize={11} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(59,130,246,0.1)' }} />
            <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}
