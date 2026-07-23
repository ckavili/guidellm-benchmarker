import { useState, useEffect } from 'react';

export type BenchmarkMetricStats = {
  mean?: number;
  median?: number;
  p90?: number;
  p95?: number;
  p99?: number;
  successful?: BenchmarkMetricStats;
  total?: BenchmarkMetricStats;
  percentiles?: Record<string, number>;
};

export type BenchmarkEntry = {
  id_?: string;
  id?: string;
  args?: { strategy?: unknown };
  metrics?: Record<string, BenchmarkMetricStats>;
  [key: string]: unknown;
};

export type ResultFile = {
  name: string;
  size?: number;
  mtime?: string;
};

export function useBenchmarkResultFiles(viewerUrl: string | null) {
  const [files, setFiles] = useState<ResultFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!viewerUrl) {
      setFiles([]);
      return;
    }
    setLoading(true);
    setError(null);
    const encoded = encodeURIComponent(viewerUrl);
    fetch(`/guidellm-benchmarker/api/results/files?viewerUrl=${encoded}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('application/json')) {
          throw new Error('Results not available yet — the job may still be running.');
        }
        return res.json();
      })
      .then((data: ResultFile[]) => {
        setFiles(data);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [viewerUrl]);

  return { files, loading, error };
}

export function useBenchmarkResultData(viewerUrl: string | null, filename: string | null) {
  const [data, setData] = useState<{ benchmarks: BenchmarkEntry[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!viewerUrl || !filename) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    const encodedUrl = encodeURIComponent(viewerUrl);
    const encodedFile = encodeURIComponent(filename);
    fetch(`/guidellm-benchmarker/api/results/file?viewerUrl=${encodedUrl}&file=${encodedFile}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then((raw) => {
        const benchmarks: BenchmarkEntry[] =
          raw.benchmarks || (raw.report && raw.report.benchmarks) || [];
        setData({ benchmarks });
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [viewerUrl, filename]);

  return { data, loading, error };
}
