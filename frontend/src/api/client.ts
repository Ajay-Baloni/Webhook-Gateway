const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/** Thin fetch wrapper: JSON in/out, throws an Error with the server message on failure. */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(baseURL + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }

  // 204 No Content / empty bodies.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

// ---- Types -----------------------------------------------------------------
export type DeliveryStatus =
  | 'pending'
  | 'delivering'
  | 'succeeded'
  | 'failed'
  | 'retrying'
  | 'dead_lettered';

export interface SourceListItem {
  id: string;
  name: string;
  created_at: string;
  ingest_url: string;
}

export interface CreatedSource extends SourceListItem {
  signing_secret: string;
}

export interface Destination {
  id: string;
  name: string;
  url: string;
  created_at: string;
}

export interface Connection {
  id: string;
  source_id: string;
  destination_id: string;
  source_name: string;
  destination_name: string;
  destination_url: string;
}

export interface EventRow {
  id: string;
  source_id: string;
  source_name: string;
  received_at: string;
  idempotency_key: string | null;
  attempt_count: number;
  delivery_count: number;
  status: DeliveryStatus;
}

export interface EventDetail {
  id: string;
  source_id: string;
  source_name: string;
  raw_body: string;
  headers: Record<string, unknown>;
  idempotency_key: string | null;
  received_at: string;
}

export interface Attempt {
  attempt_number: number;
  response_code: number | null;
  response_body: string | null;
  error: string | null;
  latency_ms: number | null;
  attempted_at: string;
}

export interface DeliveryWithAttempts {
  id: string;
  status: DeliveryStatus;
  attempt_count: number;
  next_retry_at: string;
  destination_name: string;
  destination_url: string;
  attempts: Attempt[];
}

export interface DeadLetterRow {
  id: string;
  event_id: string;
  source_name: string;
  destination_name: string;
  attempt_count: number;
  failed_at: string;
}

export interface DemoStatus {
  totalEvents: number;
  pendingDeliveries: number;
  succeededDeliveries: number;
  failedDeliveries: number;
  deadLetteredDeliveries: number;
  destinationStatus: 'up' | 'down';
}

export interface Overview {
  cards: {
    totalEvents: number;
    successRate: number;
    pendingDeliveries: number;
    deadLettered: number;
  };
  successError: Array<{ hour: string; success: number; error: number }>;
  throughput: Array<{ hour: string; count: number }>;
}

// ---- Calls -----------------------------------------------------------------
export const api = {
  // sources / destinations
  listSources: () => get<SourceListItem[]>('/sources'),
  createSource: (name: string) => post<CreatedSource>('/sources', { name }),
  listDestinations: () => get<Destination[]>('/destinations'),
  createDestination: (name: string, url: string) =>
    post<Destination>('/destinations', { name, url }),

  // connections
  listConnections: () => get<Connection[]>('/connections'),
  createConnection: (source_id: string, destination_id: string) =>
    post<Connection>('/connections', { source_id, destination_id }),

  // events
  listEvents: (params: { status?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.limit != null) q.set('limit', String(params.limit));
    if (params.offset != null) q.set('offset', String(params.offset));
    const qs = q.toString();
    return get<EventRow[]>(`/events${qs ? `?${qs}` : ''}`);
  },
  getEvent: (id: string) => get<EventDetail>(`/events/${id}`),
  getEventDeliveries: (id: string) => get<DeliveryWithAttempts[]>(`/events/${id}/deliveries`),

  // deliveries
  replayDelivery: (id: string) => post<{ replayed: boolean }>(`/deliveries/${id}/replay`),
  listDeadLetter: () => get<DeadLetterRow[]>('/deliveries/dead-letter'),
  replayAllDeadLetter: () => post<{ replayed: number }>('/deliveries/dead-letter/replay'),

  // analytics + demo
  overview: () => get<Overview>('/analytics/overview'),
  demoStatus: () => get<DemoStatus>('/demo/status'),
  fireEvents: (count = 10) => post<{ fired: number }>('/demo/fire-events', { count }),
  stopDestination: () => post<{ status: string }>('/demo/destination/stop'),
  startDestination: () => post<{ status: string }>('/demo/destination/start'),
};
