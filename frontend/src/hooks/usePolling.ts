import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Minimal replacement for React Query's useQuery: fetches on mount, re-fetches
 * on a fixed interval (paused while the tab is hidden), and re-fetches whenever
 * `deps` change. Returns the data plus a manual `refetch` for use after mutations.
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  intervalMs = 3000,
) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Keep the latest fetcher without making it a dependency (it changes identity
  // every render when defined inline, e.g. () => api.listEvents({ status })).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refetch = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    refetch();
    const id = setInterval(() => {
      if (!document.hidden) refetch();
    }, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, intervalMs, refetch]);

  return { data, loading, error, refetch };
}
