import React, { useState } from 'react';
import {
  ActionGroup,
  Alert,
  Button,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  PageSection,
  PageSectionVariants,
  Spinner,
  Content,
  TextInput,
  Title,
} from '@patternfly/react-core';
import ProjectSelector from '~/app/components/ProjectSelector';
import { submitBenchmarkJob, BenchmarkRunConfig } from '~/app/hooks/useBenchmarkJobs';

const DEFAULT_DATA_CONFIG =
  '{"prompt_tokens":512,"prompt_tokens_stdev":128,"prompt_tokens_min":128,"prompt_tokens_max":1024,"output_tokens":128,"output_tokens_stdev":32,"output_tokens_min":32,"output_tokens_max":256}';

function randomRunId(): string {
  return Math.random().toString(36).slice(2, 8);
}

const RunBenchmarkPage: React.FC = () => {
  const [namespace, setNamespace] = useState<string>('');
  const [targetUrl, setTargetUrl] = useState('');
  const [modelName, setModelName] = useState('');
  const [processorName, setProcessorName] = useState('');
  const [rateValues, setRateValues] = useState('1,2,4,8,16');
  const [maxSeconds, setMaxSeconds] = useState('300');
  const [parallelism, setParallelism] = useState('1');
  const [dataConfig, setDataConfig] = useState(DEFAULT_DATA_CONFIG);
  const [guidellmImage, setGuidellmImage] = useState('ghcr.io/vllm-project/guidellm:v0.5.0');
  const [apiToken, setApiToken] = useState('fake');
  const [hfToken, setHfToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namespace || !targetUrl || !modelName || !processorName) return;

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
          `Results viewer auto-provisioned — go to the Results page once the job completes.`,
      );
      setTargetUrl('');
      setModelName('');
      setProcessorName('');
      setRateValues('1,2,4,8,16');
      setMaxSeconds('300');
      setParallelism('1');
      setDataConfig(DEFAULT_DATA_CONFIG);
      setApiToken('fake');
      setHfToken('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageSection variant={PageSectionVariants.light}>
        <Content>
          <Title headingLevel="h1">Run GuideLLM Benchmark</Title>
          <Content component="p">
            Submit a Kubernetes Job that runs GuideLLM against an LLM inference endpoint,
            sweeping the specified concurrency levels. Results are written to the shared PVC.
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
          <FormGroup label="Namespace" isRequired fieldId="namespace">
            <ProjectSelector
              selectedProject={namespace}
              onProjectChange={setNamespace}
            />
          </FormGroup>

          <FormGroup label="Target URL" isRequired fieldId="targetUrl">
            <TextInput
              id="targetUrl"
              value={targetUrl}
              onChange={(_e, v) => setTargetUrl(v)}
              placeholder="http://inference-gateway.apps.example.com/my-model"
              isRequired
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>URL of the LLMInferenceService via the inference gateway</HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label="Model Name" isRequired fieldId="modelName">
            <TextInput
              id="modelName"
              value={modelName}
              onChange={(_e, v) => setModelName(v)}
              placeholder="my-model"
              isRequired
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>Served model name as exposed by the endpoint (/v1/models)</HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label="Processor / Tokenizer" isRequired fieldId="processorName">
            <TextInput
              id="processorName"
              value={processorName}
              onChange={(_e, v) => setProcessorName(v)}
              placeholder="meta-llama/Llama-3.1-8B-Instruct"
              isRequired
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>HuggingFace tokenizer repo for the served model</HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label="Concurrency Levels" isRequired fieldId="rateValues">
            <TextInput
              id="rateValues"
              value={rateValues}
              onChange={(_e, v) => setRateValues(v)}
              placeholder="1,2,4,8,16"
              isRequired
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  Comma-separated list of simultaneous in-flight requests to test. GuideLLM runs
                  each level in sequence and measures latency and throughput at each load, producing
                  a curve. Start low (1–2) and go high (16–32) to find where the endpoint saturates.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label="Duration per level (seconds)" isRequired fieldId="maxSeconds">
            <TextInput
              id="maxSeconds"
              type="number"
              value={maxSeconds}
              onChange={(_e, v) => setMaxSeconds(v)}
              isRequired
              validated={parseInt(maxSeconds, 10) < 60 ? 'error' : 'default'}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant={parseInt(maxSeconds, 10) < 60 ? 'error' : 'default'}>
                  {parseInt(maxSeconds, 10) < 60
                    ? 'Minimum 60 seconds — values below 60 s cause GuideLLM to fail silently.'
                    : 'How long GuideLLM sustains each concurrency level before moving to the next. With 5 levels at 300 s each the total run takes ~25 minutes.'}
                </HelperTextItem>
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
                  Prefer raising concurrency levels first; increase pods only when one pod&apos;s CPU saturates
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label="Data Config (JSON)" isRequired fieldId="dataConfig">
            <TextInput
              id="dataConfig"
              value={dataConfig}
              onChange={(_e, v) => setDataConfig(v)}
              isRequired
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  Synthetic prompt/output token distribution. Default is a small profile (512 prompt / 128 output tokens) suitable for most endpoints. Increase prompt_tokens for long-context benchmarks.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label="GuideLLM Image" isRequired fieldId="guidellmImage">
            <TextInput
              id="guidellmImage"
              value={guidellmImage}
              onChange={(_e, v) => setGuidellmImage(v)}
              isRequired
            />
          </FormGroup>

          <FormGroup label="API Token" fieldId="apiToken">
            <TextInput
              id="apiToken"
              type="password"
              value={apiToken}
              onChange={(_e, v) => setApiToken(v)}
              placeholder="fake"
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  Bearer token for the inference endpoint. Use &quot;fake&quot; (the default) for
                  endpoints that don&apos;t require authentication.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

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

          <ActionGroup>
            <Button
              variant="primary"
              type="submit"
              isDisabled={submitting || !namespace || !targetUrl || !modelName || !processorName || parseInt(maxSeconds, 10) < 60}
            >
              {submitting ? <><Spinner size="sm" /> Submitting…</> : 'Run Benchmark'}
            </Button>
          </ActionGroup>
        </Form>
      </PageSection>
    </>
  );
};

export default RunBenchmarkPage;
