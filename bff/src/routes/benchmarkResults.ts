import { Request, Response } from 'express';
import http from 'http';
import https from 'https';

function validateViewerUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch {
    return null;
  }
}

// Proxy a GET request to the upstream viewer URL and pipe the response back.
function proxyGet(
  upstreamUrl: string,
  res: Response,
  transformJson?: (body: string) => string,
): void {
  const parsed = new URL(upstreamUrl);
  const mod = parsed.protocol === 'https:' ? https : http;

  const req = mod.get(
    upstreamUrl,
    { rejectUnauthorized: false }, // viewer may use a self-signed cluster cert
    (upstream) => {
      if (upstream.statusCode && upstream.statusCode >= 400) {
        res.status(upstream.statusCode).json({ error: `Upstream returned ${upstream.statusCode}` });
        upstream.resume();
        return;
      }

      if (!transformJson) {
        res.status(upstream.statusCode ?? 200);
        upstream.pipe(res);
        return;
      }

      // Buffer so we can transform (e.g. filter file list)
      let body = '';
      upstream.setEncoding('utf8');
      upstream.on('data', (chunk) => { body += chunk; });
      upstream.on('end', () => {
        try {
          const transformed = transformJson(body);
          res.setHeader('Content-Type', 'application/json');
          res.status(upstream.statusCode ?? 200).send(transformed);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          res.status(500).json({ error: `Failed to transform upstream response: ${message}` });
        }
      });
    },
  );

  req.on('error', (err) => {
    res.status(502).json({ error: `Could not reach viewer: ${err.message}` });
  });
}

// GET /api/results/files?viewerUrl=<url>
// Proxies to <viewerUrl>/api/files/ and returns only .json file entries.
export function listResultFilesHandler(req: Request, res: Response): void {
  const viewerUrl = validateViewerUrl(req.query.viewerUrl);
  if (!viewerUrl) {
    res.status(400).json({ error: 'Missing or invalid viewerUrl query parameter (must be http/https)' });
    return;
  }

  const upstream = new URL('/api/files/', viewerUrl).toString();

  proxyGet(upstream, res, (body) => {
    const items: Array<Record<string, unknown>> = JSON.parse(body);
    const jsons = items.filter(
      (i) => i['type'] === 'file' && typeof i['name'] === 'string' && (i['name'] as string).endsWith('.json'),
    );
    return JSON.stringify(jsons);
  });
}

// GET /api/results/file?viewerUrl=<url>&file=<filename>
// Proxies to <viewerUrl>/<filename> and returns the raw JSON.
export function getResultFileHandler(req: Request, res: Response): void {
  const viewerUrl = validateViewerUrl(req.query.viewerUrl);
  if (!viewerUrl) {
    res.status(400).json({ error: 'Missing or invalid viewerUrl query parameter (must be http/https)' });
    return;
  }

  const file = req.query.file as string;
  if (!file || file.includes('/') || file.includes('..') || !file.endsWith('.json')) {
    res.status(400).json({ error: 'Invalid file parameter — must be a plain .json filename' });
    return;
  }

  const upstream = new URL(encodeURIComponent(file), viewerUrl).toString();
  proxyGet(upstream, res);
}
