import { useState, useEffect, useCallback, useRef } from 'react';

type OpenShiftRoute = {
  metadata: { name: string; namespace: string };
  spec: { host: string; tls?: unknown };
};

type RouteList = { items: OpenShiftRoute[] };

// Discovers the guidellm-results-viewer Route in the given namespace.
// Returns the full URL (https if TLS is configured, http otherwise).
export function useViewerRoute(namespace: string | null) {
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    if (!namespace) {
      setViewerUrl(null);
      setLoading(false);
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);

    fetch(
      `/api/k8s/apis/route.openshift.io/v1/namespaces/${namespace}/routes` +
        `?labelSelector=app%3Dguidellm-results-viewer`,
      { signal: controller.signal },
    )
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json() as Promise<RouteList>;
      })
      .then((data) => {
        const route = data.items?.[0];
        if (route?.spec?.host) {
          const scheme = route.spec.tls ? 'https' : 'http';
          setViewerUrl(`${scheme}://${route.spec.host}`);
        } else {
          setViewerUrl(null);
        }
        setLoading(false);
      })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        setError(e.message);
        setLoading(false);
      });
  }, [namespace]);

  useEffect(() => {
    refresh();
    return () => controllerRef.current?.abort();
  }, [refresh]);

  return { viewerUrl, loading, error, refresh };
}
