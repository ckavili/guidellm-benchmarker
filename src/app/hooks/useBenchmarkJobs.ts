import { useState, useEffect, useCallback, useRef } from 'react';
import { provisionViewer } from '~/app/utils/viewerProvisioner';

export const RESULTS_PVC_NAME = 'guidellm-results-pvc';

export type JobCondition = {
  type: string;
  status: string;
  lastTransitionTime?: string;
  reason?: string;
  message?: string;
};

export type BenchmarkJob = {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
    uid: string;
    creationTimestamp: string;
    labels?: Record<string, string>;
  };
  status?: {
    active?: number;
    succeeded?: number;
    failed?: number;
    startTime?: string;
    completionTime?: string;
    conditions?: JobCondition[];
  };
};

export type JobPhase = 'Running' | 'Succeeded' | 'Failed' | 'Pending';

export function getJobPhase(job: BenchmarkJob): JobPhase {
  const s = job.status ?? {};
  if ((s.succeeded ?? 0) > 0) return 'Succeeded';
  if ((s.failed ?? 0) > 0) return 'Failed';
  if ((s.active ?? 0) > 0) return 'Running';
  return 'Pending';
}

export function useBenchmarkJobs(namespace: string | null) {
  const [jobs, setJobs] = useState<BenchmarkJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    if (!namespace) {
      setJobs([]);
      setLoading(false);
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);

    fetch(
      `/api/k8s/apis/batch/v1/namespaces/${namespace}/jobs?labelSelector=app%3Dguidellm-benchmark`,
      { signal: controller.signal },
    )
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then((data) => {
        setJobs(
          [...(data.items ?? [])].sort(
            (a, b) =>
              new Date(b.metadata.creationTimestamp).getTime() -
              new Date(a.metadata.creationTimestamp).getTime(),
          ),
        );
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

  return { jobs, loading, error, refresh };
}

export type BenchmarkRunConfig = {
  namespace: string;
  runId: string;
  targetUrl: string;
  modelName: string;
  processorName: string;
  rateValues: string;
  maxSeconds: string;
  parallelism: string;
  dataConfig: string;
  rateType: string;
  guidellmImage: string;
  apiToken?: string;
  hfToken?: string;
  backoffLimit: string;
  loadgenCpu: string;
  loadgenCpuLimit: string;
  loadgenMemory: string;
  loadgenMemoryLimit: string;
};

// Provisions the results viewer stack then submits the benchmark Job.
// Both operations use the dashboard /api/k8s/ pass-through with the user's token.
export async function submitBenchmarkJob(config: BenchmarkRunConfig): Promise<void> {
  // Ensure the viewer (PVC + nginx Deployment + Service + Route) exists first.
  // All applyResource calls are idempotent — 409 Conflict is silently swallowed.
  await provisionViewer(config.namespace, RESULTS_PVC_NAME);

  const parallelism = parseInt(config.parallelism, 10) || 1;
  const backoffLimit = parseInt(config.backoffLimit, 10) || 1;
  // v0.7.2 CLI: api_key is now a first-class --backend param (auth bug fixed)
  const backend = [
    'kind=openai_http',
    `target=${config.targetUrl}`,
    `model=${config.modelName}`,
    `api_key=${config.apiToken || 'fake'}`,
    'verify=false',
    'http2=false',
  ].join(',');

  // One --profile flag per concurrency level
  const profileArgs = config.rateValues
    .split(',')
    .map((v) => `--profile kind=concurrent,streams=${v.trim()}`)
    .join(' ');

  const outBase = `/results/agentmode-${config.runId}-p\${JOB_COMPLETION_INDEX}`;
  const args = [
    'exec guidellm run',
    `--backend '${backend}'`,
    `--tokenizer 'kind=huggingface_auto,model=${config.processorName}'`,
    `--data '${config.dataConfig}'`,
    profileArgs,
    `--constraint 'kind=max_duration,seconds=${config.maxSeconds}'`,
    `--output 'kind=json,path=${outBase}.json'`,
    `--output 'kind=csv,path=${outBase}.csv'`,
  ].join(' ');

  const job = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: `guidellm-agentmode-${config.runId}`,
      namespace: config.namespace,
      labels: {
        app: 'guidellm-benchmark',
        'run-id': config.runId,
      },
    },
    spec: {
      backoffLimit,
      completionMode: 'Indexed',
      completions: parallelism,
      parallelism,
      template: {
        metadata: {
          labels: {
            app: 'guidellm-benchmark',
            'run-id': config.runId,
          },
        },
        spec: {
          restartPolicy: 'Never',
          containers: [
            {
              name: 'guidellm',
              image: config.guidellmImage,
              command: ['/bin/sh', '-c'],
              args: [args],
              env: [
                { name: 'HF_TOKEN', value: config.hfToken ?? '' },
                { name: 'HUGGING_FACE_HUB_TOKEN', value: config.hfToken ?? '' },
                { name: 'HOME', value: '/cache' },
                { name: 'HF_HOME', value: '/cache/hf' },
              ],
              resources: {
                requests: { cpu: config.loadgenCpu, memory: config.loadgenMemory },
                limits: { cpu: config.loadgenCpuLimit, memory: config.loadgenMemoryLimit },
              },
              volumeMounts: [
                { name: 'results-volume', mountPath: '/results' },
                { name: 'cache-volume', mountPath: '/cache' },
              ],
            },
          ],
          volumes: [
            {
              name: 'results-volume',
              persistentVolumeClaim: { claimName: RESULTS_PVC_NAME },
            },
            { name: 'cache-volume', emptyDir: {} },
          ],
        },
      },
    },
  };

  const response = await fetch(
    `/api/k8s/apis/batch/v1/namespaces/${config.namespace}/jobs`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job),
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Failed to submit job: ${response.status}`);
  }
}
