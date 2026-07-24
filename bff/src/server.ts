import express from 'express';
import { listResultFilesHandler, getResultFileHandler } from './routes/benchmarkResults';
import { getK8sBaseUrl } from './utils/k8sClient';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// Routes registered under both path prefixes:
// - /api/... used in local dev (webpack proxy rewrites /guidellm-benchmarker/api → /api)
// - /guidellm-benchmarker/api/... used in production (dashboard proxyService with pathRewrite: "")
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/guidellm-benchmarker/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/results/files', listResultFilesHandler);
app.get('/guidellm-benchmarker/api/results/files', listResultFilesHandler);
app.get('/api/results/file', getResultFileHandler);
app.get('/guidellm-benchmarker/api/results/file', getResultFileHandler);

app.listen(PORT, () => {
  try {
    const baseUrl = getK8sBaseUrl();
    console.log(`BFF listening on port ${PORT}`);
    console.log(`K8s API target: ${baseUrl}`);
  } catch {
    console.error(`BFF listening on port ${PORT}`);
    console.error('WARNING: K8s API is not configured. Set K8S_API_BASE or run in-cluster.');
  }
});

export default app;
