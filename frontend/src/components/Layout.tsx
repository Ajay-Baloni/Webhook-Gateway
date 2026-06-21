import { NavLink, Outlet } from 'react-router-dom';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import { DemoControlPanel } from './DemoControlPanel';

const navItems = [
  { to: '/', label: 'Overview', end: true },
  { to: '/events', label: 'Events', end: false },
  { to: '/dlq', label: 'Dead Letter Queue', end: false },
  { to: '/sources', label: 'Sources & Destinations', end: false },
];

export function Layout() {
  const { data: status } = usePolling(api.demoStatus);
  const { data: dlq } = usePolling(api.listDeadLetter);

  const up = status?.destinationStatus === 'up';

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r border-border bg-card/60 p-4">
        <div className="mb-6 px-2">
          <div className="text-lg font-bold text-white">
            Webhook<span className="text-pending">GW</span>
          </div>
          <div className="text-[11px] text-gray-500">observability dashboard</div>
        </div>

        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                  isActive ? 'bg-pending/15 text-white' : 'text-gray-400 hover:bg-border/40 hover:text-gray-200'
                }`
              }
            >
              <span>{item.label}</span>
              {item.to === '/dlq' && dlq && dlq.length > 0 && (
                <span className="rounded-full bg-error/20 px-2 text-xs font-medium text-error">
                  {dlq.length}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto rounded-lg border border-border p-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-500">Destination</div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: up ? '#22c55e' : '#ef4444' }}
            />
            <span className="text-sm font-medium" style={{ color: up ? '#22c55e' : '#ef4444' }}>
              {up ? 'UP' : 'DOWN'}
            </span>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden p-8">
        <Outlet />
      </main>

      <DemoControlPanel />
    </div>
  );
}
