import React, { useState } from 'react';
import {
  Alert,
  Badge,
  EmptyState,
  EmptyStateBody,
  EmptyStateVariant,
  FormGroup,
  Label,
  PageSection,
  PageSectionVariants,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  Split,
  SplitItem,
  Content,
  Title,
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import ProjectSelector from '~/app/components/ProjectSelector';
import { useBenchmarkJobs, getJobPhase, BenchmarkJob } from '~/app/hooks/useBenchmarkJobs';
import { useViewerRoute } from '~/app/hooks/useViewerRoute';
import {
  useBenchmarkResultFiles,
  useBenchmarkResultData,
  BenchmarkEntry,
  BenchmarkMetricStats,
} from '~/app/hooks/useBenchmarkResults';

function phaseLabel(job: BenchmarkJob) {
  const phase = getJobPhase(job);
  const colors: Record<string, 'green' | 'blue' | 'red' | 'grey'> = {
    Succeeded: 'green',
    Running: 'blue',
    Failed: 'red',
    Pending: 'grey',
  };
  return <Label color={colors[phase] ?? 'grey'}>{phase}</Label>;
}

function statsOf(node: unknown): BenchmarkMetricStats | null {
  if (!node || typeof node !== 'object') return null;
  const n = node as Record<string, unknown>;
  for (const k of ['successful', 'total', '']) {
    const candidate = k ? n[k] : n;
    if (candidate && typeof candidate === 'object') {
      const c = candidate as Record<string, unknown>;
      if ('mean' in c || 'median' in c) return c as BenchmarkMetricStats;
    }
  }
  return null;
}

function fmt(v: number | undefined): string {
  if (v === undefined || v === null) return '—';
  return Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(3);
}

const METRIC_KEYS: [string, string][] = [
  ['requests_per_second', 'Requests/sec'],
  ['request_concurrency', 'Concurrency'],
  ['request_latency', 'Request latency (s)'],
  ['time_to_first_token_ms', 'TTFT (ms)'],
  ['inter_token_latency_ms', 'ITL (ms)'],
  ['output_tokens_per_second', 'Output tokens/sec'],
  ['tokens_per_second', 'Total tokens/sec'],
  ['prompt_token_count', 'Prompt tokens'],
  ['output_token_count', 'Output tokens'],
];

function MetricsTable({ entry }: { entry: BenchmarkEntry }) {
  const m = (entry.metrics ?? entry) as Record<string, unknown>;
  const label =
    (entry.id_ || entry.id || 'Benchmark') +
    (entry.args?.strategy ? ` — ${JSON.stringify(entry.args.strategy)}` : '');

  const rows: { name: string; stats: BenchmarkMetricStats }[] = [];
  for (const [key, name] of METRIC_KEYS) {
    const s = statsOf(m[key]);
    if (s) rows.push({ name, stats: s });
  }
  if (!rows.length) {
    for (const [key, val] of Object.entries(m)) {
      const s = statsOf(val);
      if (s) rows.push({ name: key, stats: s });
    }
  }

  return (
    <div style={{ marginBottom: '2rem' }}>
      <Title headingLevel="h3" size="md" style={{ marginBottom: '0.5rem' }}>
        {label}
      </Title>
      <Table aria-label={label} borders variant="compact">
        <Thead>
          <Tr>
            <Th>Metric</Th>
            <Th>Mean</Th>
            <Th>Median</Th>
            <Th>p90</Th>
            <Th>p95</Th>
            <Th>p99</Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows.length ? (
            rows.map(({ name, stats }) => (
              <Tr key={name}>
                <Td>{name}</Td>
                <Td>{fmt(stats.mean)}</Td>
                <Td>{fmt(stats.median)}</Td>
                <Td>{fmt(stats.p90 ?? stats.percentiles?.p90)}</Td>
                <Td>{fmt(stats.p95 ?? stats.percentiles?.p95)}</Td>
                <Td>{fmt(stats.p99 ?? stats.percentiles?.p99)}</Td>
              </Tr>
            ))
          ) : (
            <Tr>
              <Td colSpan={6}>No numeric metrics recognized in this entry</Td>
            </Tr>
          )}
        </Tbody>
      </Table>
    </div>
  );
}

const ResultsPage: React.FC = () => {
  const [namespace, setNamespace] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileSelectOpen, setFileSelectOpen] = useState(false);

  const { jobs, loading: jobsLoading, error: jobsError } = useBenchmarkJobs(namespace || null);
  const {
    viewerUrl,
    loading: routeLoading,
    error: routeError,
    refresh: refreshRoute,
  } = useViewerRoute(namespace || null);

  const { files, loading: filesLoading, error: filesError } = useBenchmarkResultFiles(namespace || null, viewerUrl);
  const { data, loading: dataLoading, error: dataError } = useBenchmarkResultData(
    namespace || null,
    viewerUrl,
    selectedFile,
  );

  return (
    <>
      <PageSection variant={PageSectionVariants.light}>
        <Content>
          <Title headingLevel="h1">Benchmark Results</Title>
          <Content component="p">
            Select a namespace to view submitted benchmark jobs and explore their metric results.
            The results viewer is provisioned automatically when you run your first benchmark.
          </Content>
        </Content>
      </PageSection>

      <PageSection>
        <Split hasGutter style={{ marginBottom: '1.5rem', alignItems: 'flex-end' }}>
          <SplitItem style={{ minWidth: '240px' }}>
            <FormGroup label="Namespace" fieldId="results-namespace">
              <ProjectSelector
                selectedProject={namespace}
                onProjectChange={(ns) => {
                  setNamespace(ns);
                  setSelectedFile(null);
                }}
              />
            </FormGroup>
          </SplitItem>
        </Split>

        {/* Jobs table */}
        <Title headingLevel="h2" size="lg" style={{ marginBottom: '0.75rem' }}>
          Benchmark Jobs {namespace && <Badge isRead>{jobs.length}</Badge>}
        </Title>
        {jobsError && (
          <Alert variant="danger" title={jobsError} isInline style={{ marginBottom: '1rem' }} />
        )}
        {jobsLoading ? (
          <Spinner />
        ) : !namespace ? (
          <EmptyState variant={EmptyStateVariant.sm}>
            <EmptyStateBody>Select a namespace to view benchmark jobs.</EmptyStateBody>
          </EmptyState>
        ) : jobs.length === 0 ? (
          <EmptyState variant={EmptyStateVariant.sm}>
            <EmptyStateBody>No GuideLLM benchmark jobs found in this namespace.</EmptyStateBody>
          </EmptyState>
        ) : (
          <Table aria-label="Benchmark jobs" borders style={{ marginBottom: '2rem' }}>
            <Thead>
              <Tr>
                <Th>Job Name</Th>
                <Th>Status</Th>
                <Th>Started</Th>
                <Th>Completed</Th>
                <Th>Run ID</Th>
              </Tr>
            </Thead>
            <Tbody>
              {jobs.map((job) => (
                <Tr key={job.metadata.uid}>
                  <Td>{job.metadata.name}</Td>
                  <Td>{phaseLabel(job)}</Td>
                  <Td>
                    {job.status?.startTime
                      ? new Date(job.status.startTime).toLocaleString()
                      : '—'}
                  </Td>
                  <Td>
                    {job.status?.completionTime
                      ? new Date(job.status.completionTime).toLocaleString()
                      : '—'}
                  </Td>
                  <Td>{job.metadata.labels?.['run-id'] ?? '—'}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}

        {/* Metrics viewer */}
        <Title headingLevel="h2" size="lg" style={{ marginBottom: '0.75rem' }}>
          Metrics Viewer
        </Title>

        {routeError && (
          <Alert variant="danger" title={`Could not discover results viewer: ${routeError}`} isInline style={{ marginBottom: '1rem' }} />
        )}
        {filesError && (
          <Alert
            variant={filesError.includes('not available yet') ? 'info' : 'danger'}
            title={filesError}
            isInline
            style={{ marginBottom: '1rem' }}
          />
        )}
        {dataError && (
          <Alert variant="danger" title={dataError} isInline style={{ marginBottom: '1rem' }} />
        )}

        {namespace && !routeLoading && !viewerUrl && (
          <Alert
            variant="info"
            title="Results viewer not found in this namespace"
            isInline
            style={{ marginBottom: '1rem' }}
          >
            Run a benchmark from the <strong>Run Benchmark</strong> page — the viewer is
            provisioned automatically on first run.{' '}
            <button
              onClick={refreshRoute}
              style={{ background: 'none', border: 'none', color: '#0066cc', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
            >
              Refresh
            </button>
          </Alert>
        )}

        {routeLoading && <Spinner />}

        {viewerUrl && namespace && (
          <div style={{ marginBottom: '1.5rem' }}>
            <a href={`${viewerUrl}/dashboard/`} target="_blank" rel="noreferrer"
              style={{ fontSize: '0.875rem', color: '#0066cc' }}>
              Open full dashboard ↗
            </a>
            <iframe
              src={`${viewerUrl}/dashboard/`}
              title="GuideLLM Metrics Dashboard"
              style={{ width: '100%', height: '600px', border: '1px solid #d2d2d2', borderRadius: '4px', marginTop: '0.5rem' }}
            />
          </div>
        )}

        {viewerUrl && namespace && (
          <FormGroup
            label="Result file"
            fieldId="result-file-select"
            style={{ marginBottom: '1.5rem', maxWidth: '520px' }}
          >
            {filesLoading ? (
              <Spinner size="sm" />
            ) : (
              <Select
                id="result-file-select"
                isOpen={fileSelectOpen}
                onOpenChange={setFileSelectOpen}
                selected={selectedFile ?? undefined}
                onSelect={(_e, val) => {
                  setSelectedFile(val as string);
                  setFileSelectOpen(false);
                }}
                toggle={(ref) => (
                  <button
                    ref={ref as React.Ref<HTMLButtonElement>}
                    onClick={() => setFileSelectOpen((o) => !o)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 12px',
                      border: '1px solid #d2d2d2',
                      borderRadius: '4px',
                      background: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    {selectedFile ??
                      (files.length
                        ? 'Select a result file…'
                        : 'No .json result files found yet — job may still be running')}
                  </button>
                )}
              >
                <SelectList>
                  {files.map((f) => (
                    <SelectOption key={f.name} value={f.name}>
                      {f.name}
                    </SelectOption>
                  ))}
                </SelectList>
              </Select>
            )}
          </FormGroup>
        )}

        {dataLoading && <Spinner />}
        {data && data.benchmarks.length === 0 && (
          <Alert variant="warning" title="No benchmarks array found in this file" isInline />
        )}
        {data &&
          data.benchmarks.map((entry, i) => (
            <MetricsTable key={entry.id_ ?? entry.id ?? i} entry={entry} />
          ))}
      </PageSection>
    </>
  );
};

export default ResultsPage;
