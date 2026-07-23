import React, { useState, useMemo } from 'react';
import {
  ActionGroup,
  Alert,
  Button,
  Content,
  ExpandableSection,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  PageSection,
  PageSectionVariants,
  Spinner,
  TextInput,
  Title,
  ToggleGroup,
  ToggleGroupItem,
} from '@patternfly/react-core';
import ProjectSelector from '~/app/components/ProjectSelector';
import { submitBenchmarkJob, BenchmarkRunConfig } from '~/app/hooks/useBenchmarkJobs';

function randomRunId(): string {
  return Math.random().toString(36).slice(2, 8);
}

type Preset = 'quick' | 'full' | null;
type Variability = 'low' | 'medium' | 'high';

const PRESET_RATES: Record<Exclude<Preset, 'custom'>, string> = {
  quick: '1,4',
  full: '1,2,4,8,16',
};
const PRESET_SECONDS: Record<Exclude<Preset, 'custom'>, string> = {
  quick: '60',
  full: '300',
};

function buildDataConfig(promptTokens: string, outputTokens: string, variability: Variability): string {
  const p = Math.max(64, parseInt(promptTokens, 10) || 512);
  const o = Math.max(32, parseInt(outputTokens, 10) || 128);
  const factor = variability === 'low' ? 0.1 : variability === 'medium' ? 0.25 : 0.5;
  const ps = Math.round(p * factor);
  const os = Math.round(o * factor);
  return JSON.stringify({
    prompt_tokens: p,
    prompt_tokens_stdev: ps,
    prompt_tokens_min: Math.max(32, p - 2 * ps),
    prompt_tokens_max: p + 2 * ps,
    output_tokens: o,
    output_tokens_stdev: os,
    output_tokens_min: Math.max(32, o - 2 * os),
    output_tokens_max: o + 2 * os,
  });
}

const RunBenchmarkPage: React.FC = () => {
  // Preset
  const [preset, setPreset] = useState<Preset>('full');

  // Endpoint fields
  const [namespace, setNamespace] = useState<string>('');
  const [targetUrl, setTargetUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [modelName, setModelName] = useState('');
  const [processorName, setProcessorName] = useState('');

  // Load profile fields
  const [rateValues, setRateValues] = useState(PRESET_RATES.full);
  const [maxSeconds, setMaxSeconds] = useState(PRESET_SECONDS.full);

  // Data profile fields
  const [promptTokens, setPromptTokens] = useState('512');
  const [outputTokens, setOutputTokens] = useState('128');
  const [variability, setVariability] = useState<Variability>('medium');

  // Advanced fields
  const [parallelism, setParallelism] = useState('1');
  const [guidellmImage, setGuidellmImage] = useState('ghcr.io/vllm-project/guidellm:v0.5.0');
  const [hfToken, setHfToken] = useState('');
  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const dataConfig = useMemo(
    () => buildDataConfig(promptTokens, outputTokens, variability),
    [promptTokens, outputTokens, variability],
  );

  const estimatedMinutes = useMemo(() => {
    const levels = rateValues.split(',').filter((v) => v.trim()).length;
    const secs = parseInt(maxSeconds, 10) || 0;
    return Math.round((levels * secs) / 60);
  }, [rateValues, maxSeconds]);

  const maxSecondsInt = parseInt(maxSeconds, 10);
  const durationInvalid = maxSecondsInt < 60;

  const applyPreset = (p: Exclude<Preset, null>) => {
    setPreset(p);
    setRateValues(PRESET_RATES[p]);
    setMaxSeconds(PRESET_SECONDS[p]);
  };

  const handleRateChange = (_e: React.FormEvent, v: string) => {
    setPreset(null);
    setRateValues(v);
  };

  const handleMaxSecondsChange = (_e: React.FormEvent, v: string) => {
    setPreset(null);
    setMaxSeconds(v);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namespace || !targetUrl || !modelName || !processorName || durationInvalid) return;

    setSubmitting(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    const runId = randomRunId();
    const config: BenchmarkRunConfig = {
      namespace,
      runId,
      targetUrl,
      modelName,
      processorName,
      rateValues,
      maxSeconds,
      parallelism,
      dataConfig,
      rateType: 'concurrent',
      guidellmImage,
      apiToken: apiToken || undefined,
      hfToken: hfToken || undefined,
      backoffLimit: '1',
      loadgenCpu: '2',
      loadgenCpuLimit: '4',
      loadgenMemory: '4Gi',
      loadgenMemoryLimit: '8Gi',
    };

    try {
      await submitBenchmarkJob(config);
      setSuccessMsg(
        `Job guidellm-agentmode-${runId} submitted to "${namespace}". ` +
          `Go to the Results page once the job completes (~${estimatedMinutes} min).`,
      );
      // Reset form to full preset defaults
      applyPreset('full');
      setTargetUrl('');
      setApiToken('');
      setModelName('');
      setProcessorName('');
      setRateValues(PRESET_RATES.full);
      setMaxSeconds(PRESET_SECONDS.full);
      setPromptTokens('512');
      setOutputTokens('128');
      setVariability('medium');
      setParallelism('1');
      setHfToken('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    !submitting && !!namespace && !!targetUrl && !!modelName && !!processorName && !durationInvalid;

  return (
    <>
      <PageSection variant={PageSectionVariants.light}>
        <Content>
          <Title headingLevel="h1">Run GuideLLM Benchmark</Title>
          <Content component="p">
            Submit a Kubernetes Job that runs GuideLLM against an LLM inference endpoint,
            sweeping the specified concurrency levels and measuring latency and throughput at each load.
          </Content>
        </Content>
      </PageSection>

      <PageSection>
        {successMsg && (
          <Alert
            variant="success"
            title={successMsg}
            isInline
            style={{ marginBottom: '1rem' }}
            actionClose={<Button variant="plain" onClick={() => setSuccessMsg(null)}>✕</Button>}
          />
        )}
        {errorMsg && (
          <Alert
            variant="danger"
            title={errorMsg}
            isInline
            style={{ marginBottom: '1rem' }}
            actionClose={<Button variant="plain" onClick={() => setErrorMsg(null)}>✕</Button>}
          />
        )}

        <Form onSubmit={handleSubmit} style={{ maxWidth: '720px' }}>

          {/* ── Namespace ── */}
          <FormGroup label="Namespace" isRequired fieldId="namespace">
            <ProjectSelector selectedProject={namespace} onProjectChange={setNamespace} />
            <FormHelperText>
              <HelperText><HelperTextItem>The OpenShift namespace where the benchmark Job will run</HelperTextItem></HelperText>
            </FormHelperText>
          </FormGroup>

          {/* ── Preset ── */}
          <FormGroup label="Benchmark preset" fieldId="preset">
            <ToggleGroup aria-label="Benchmark preset">
              <ToggleGroupItem
                text="Quick test (~2 min)"
                isSelected={preset === 'quick'}
                onChange={() => applyPreset('quick')}
              />
              <ToggleGroupItem
                text="Full benchmark (~25 min)"
                isSelected={preset === 'full'}
                onChange={() => applyPreset('full')}
              />
            </ToggleGroup>
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  {preset === 'quick'
                    ? '2 concurrency levels (1, 4) × 60 s each. Good for a quick connectivity check and ballpark numbers.'
                    : preset === 'full'
                    ? '5 concurrency levels (1, 2, 4, 8, 16) × 300 s each. Produces a full latency/throughput curve.'
                    : 'Custom values set below — click a preset to reset.'}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          {/* ── Endpoint section ── */}
          <Title headingLevel="h2" size="md" style={{ marginTop: '0.5rem', marginBottom: '-0.25rem', color: '#6a6e73' }}>
            Endpoint
          </Title>

          <FormGroup label="Target URL" isRequired fieldId="targetUrl">
            <TextInput
              id="targetUrl"
              value={targetUrl}
              onChange={(_e, v) => setTargetUrl(v)}
              placeholder="https://litellm-litemaas.apps.example.com"
              isRequired
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  Base URL of the LLM inference endpoint — no trailing slash, no path suffix.
                  GuideLLM appends <code>/v1/chat/completions</code> automatically.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label="API Token" fieldId="apiToken">
            <TextInput
              id="apiToken"
              type="password"
              value={apiToken}
              onChange={(_e, v) => setApiToken(v)}
              placeholder="Enter your API token (or 'fake' for open endpoints)"
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  Bearer token sent as <code>Authorization: Bearer &lt;token&gt;</code>.
                  Required for authenticated endpoints (e.g. LiteLLM). Leave as <code>fake</code> only
                  for unauthenticated vLLM endpoints — using a wrong token causes all requests to fail with 401.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label="Model name" isRequired fieldId="modelName">
            <TextInput
              id="modelName"
              value={modelName}
              onChange={(_e, v) => setModelName(v)}
              placeholder="Qwen3-35B-A3B"
              isRequired
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  Must match exactly what the endpoint returns at <code>GET /v1/models</code>.
                  Run <code>curl &lt;target-url&gt;/v1/models</code> to look it up.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label="Tokenizer (HuggingFace model ID)" isRequired fieldId="processorName">
            <TextInput
              id="processorName"
              value={processorName}
              onChange={(_e, v) => setProcessorName(v)}
              placeholder="Qwen/Qwen3-35B-A3B"
              isRequired
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  HuggingFace repo of the tokenizer for the served model — used to count tokens accurately.
                  Usually the same as the model&apos;s HuggingFace ID (e.g. <code>meta-llama/Llama-3.1-8B-Instruct</code>).
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          {/* ── Load profile section ── */}
          <Title headingLevel="h2" size="md" style={{ marginTop: '0.5rem', marginBottom: '-0.25rem', color: '#6a6e73' }}>
            Load profile
          </Title>

          <FormGroup label="Concurrency levels to sweep" isRequired fieldId="rateValues">
            <TextInput
              id="rateValues"
              value={rateValues}
              onChange={handleRateChange}
              placeholder="1,2,4,8,16"
              isRequired
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  Comma-separated list of simultaneous in-flight requests. GuideLLM runs each
                  level for the duration below and measures latency + throughput, building a
                  performance curve. Fewer levels = faster run; more levels = richer curve.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label="Duration per level (seconds)" isRequired fieldId="maxSeconds">
            <TextInput
              id="maxSeconds"
              type="number"
              value={maxSeconds}
              onChange={handleMaxSecondsChange}
              isRequired
              validated={durationInvalid ? 'error' : 'default'}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant={durationInvalid ? 'error' : 'default'}>
                  {durationInvalid
                    ? 'Minimum 60 seconds — values below 60 s cause GuideLLM to fail silently.'
                    : `How long GuideLLM sustains each concurrency level. Longer = more stable measurements. Estimated total: ~${estimatedMinutes} min.`}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          {/* ── Data profile section ── */}
          <Title headingLevel="h2" size="md" style={{ marginTop: '0.5rem', marginBottom: '-0.25rem', color: '#6a6e73' }}>
            Request data profile
          </Title>

          <FormGroup label="Prompt tokens (average)" isRequired fieldId="promptTokens">
            <TextInput
              id="promptTokens"
              type="number"
              value={promptTokens}
              onChange={(_e, v) => setPromptTokens(v)}
              isRequired
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  Average number of input tokens per request. Use a value representative of your
                  real workload. Larger prompts stress memory bandwidth; start with 512 if unsure.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label="Output tokens (average)" isRequired fieldId="outputTokens">
            <TextInput
              id="outputTokens"
              type="number"
              value={outputTokens}
              onChange={(_e, v) => setOutputTokens(v)}
              isRequired
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  Average number of tokens the model should generate per response.
                  More output tokens = longer requests = lower throughput at the same concurrency.
                  For reasoning/thinking models, set this to 1024 or higher — the model spends
                  many tokens on internal reasoning before producing visible output.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label="Request variability" isRequired fieldId="variability">
            <FormSelect
              id="variability"
              value={variability}
              onChange={(_e, v) => setVariability(v as Variability)}
              aria-label="Request variability"
            >
              <FormSelectOption value="low" label="Low — requests are nearly the same length" />
              <FormSelectOption value="medium" label="Medium — realistic mix of short and long requests" />
              <FormSelectOption value="high" label="High — wide spread, stress-tests scheduling" />
            </FormSelect>
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  Controls how much the prompt and output lengths vary request-to-request.
                  Medium is a good default for most workloads.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          {/* ── Advanced (collapsed) ── */}
          <ExpandableSection
            toggleText={advancedExpanded ? 'Hide advanced options' : 'Show advanced options'}
            isExpanded={advancedExpanded}
            onToggle={(_e, expanded) => setAdvancedExpanded(expanded)}
            style={{ marginTop: '0.5rem' }}
          >
            <Form style={{ paddingTop: '0.5rem' }}>
              <FormGroup label="HuggingFace Token (optional)" fieldId="hfToken">
                <TextInput
                  id="hfToken"
                  type="password"
                  value={hfToken}
                  onChange={(_e, v) => setHfToken(v)}
                  placeholder="hf_..."
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>Required only for gated tokenizers; leave blank for public models</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>

              <FormGroup label="Parallelism (load-generator pods)" isRequired fieldId="parallelism">
                <TextInput
                  id="parallelism"
                  type="number"
                  value={parallelism}
                  onChange={(_e, v) => setParallelism(v)}
                  isRequired
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>
                      Number of parallel load-generator pods. Raise concurrency levels first;
                      increase pods only when a single pod&apos;s CPU saturates.
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>

              <FormGroup label="GuideLLM image" isRequired fieldId="guidellmImage">
                <TextInput
                  id="guidellmImage"
                  value={guidellmImage}
                  onChange={(_e, v) => setGuidellmImage(v)}
                  isRequired
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>Container image used to run GuideLLM. Change only if you need a specific version.</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>

              <FormGroup label="Data config (JSON)" fieldId="dataConfigPreview">
                <TextInput
                  id="dataConfigPreview"
                  value={dataConfig}
                  isDisabled
                  aria-label="Generated data config"
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>
                      Generated from the prompt/output token and variability fields above.
                      This value is passed directly to GuideLLM.
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
            </Form>
          </ExpandableSection>

          <ActionGroup style={{ marginTop: '1rem' }}>
            <Button
              variant="primary"
              type="submit"
              isDisabled={!canSubmit}
            >
              {submitting ? <><Spinner size="sm" /> Submitting…</> : `Run benchmark (~${estimatedMinutes} min)`}
            </Button>
          </ActionGroup>
        </Form>
      </PageSection>
    </>
  );
};

export default RunBenchmarkPage;
