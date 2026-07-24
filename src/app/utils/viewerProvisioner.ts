// Provisions the GuideLLM results viewer stack in a namespace:
//   PVC (RWX default storage class) + nginx ConfigMaps + Deployment + Service + Route
// All resources are idempotent — apply via POST and swallow 409 Conflict.

const LABELS = { app: 'guidellm-results-viewer' };

async function applyResource(
  apiPath: string,
  body: Record<string, unknown>,
  { forceUpdate = false }: { forceUpdate?: boolean } = {},
): Promise<void> {
  const res = await fetch(`/api/k8s${apiPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.ok || res.status === 409) {
    // If forceUpdate, overwrite with a PUT regardless of whether it existed
    if (forceUpdate && res.status === 409) {
      const name = (body.metadata as { name: string }).name;
      const putRes = await fetch(`/api/k8s${apiPath}/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!putRes.ok) {
        const err = await putRes.json().catch(() => ({}));
        throw new Error(
          (err as { message?: string }).message ||
            `Failed to update resource at ${apiPath}/${name}: ${putRes.status}`,
        );
      }
    }
    return;
  }

  const err = await res.json().catch(() => ({}));
  throw new Error(
    (err as { message?: string }).message ||
      `Failed to create resource at ${apiPath}: ${res.status}`,
  );
}

const NGINX_CONF = `server {
    listen 8080;
    server_name _;

    location /dashboard/ {
        alias /dashboard/;
        index index.html;
    }

    location /api/files/ {
        alias /usr/share/nginx/html/;
        autoindex on;
        autoindex_format json;
    }

    location / {
        root /usr/share/nginx/html;
        autoindex on;
        autoindex_exact_size off;
        autoindex_localtime on;
    }
}`;

// Minimal self-contained dashboard — same logic as the upstream nginx viewer
const DASHBOARD_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>GuideLLM Results</title>
<style>
  body{font-family:system-ui,sans-serif;margin:2rem;background:#f6f8fa;color:#1f2328}
  h1{font-size:1.3rem} h2{font-size:1.05rem;margin-top:2rem}
  select{font-size:1rem;padding:.3rem;margin-bottom:1rem;max-width:100%}
  table{border-collapse:collapse;background:#fff;margin:.5rem 0;font-size:.85rem}
  th,td{border:1px solid #d0d7de;padding:.35rem .6rem;text-align:right}
  th:first-child,td:first-child{text-align:left}
  th{background:#eef1f4}
  pre{background:#fff;border:1px solid #d0d7de;padding:1rem;overflow:auto;max-height:60vh;font-size:.75rem}
  .muted{color:#57606a;font-size:.85rem}
</style>
</head>
<body>
<h1>GuideLLM Benchmark Results</h1>
<p><label>Result file: <select id="files"></select></label></p>
<div id="content"></div>
<script>
const fmt = v => typeof v === "number" ? (Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(3)) : (v ?? "");
async function loadFileList(){
  const res = await fetch("/api/files/");
  const items = await res.json();
  const jsons = items.filter(i => i.type === "file" && i.name.endsWith(".json"));
  const sel = document.getElementById("files");
  sel.innerHTML = jsons.map(f => \`<option value="\${f.name}">\${f.name}</option>\`).join("");
  sel.onchange = () => render(sel.value);
  if (jsons.length) render(jsons[0].name);
  else document.getElementById("content").textContent = "No .json result files found yet.";
}
function statsOf(node){
  if (!node || typeof node !== "object") return null;
  for (const k of ["successful","total",""]) {
    const n = k ? node[k] : node;
    if (n && typeof n === "object" && ("mean" in n || "median" in n)) return n;
  }
  return null;
}
function metricRow(name,node){
  const s = statsOf(node);
  if (!s) return "";
  const cell = k => fmt(s[k] ?? (s.percentiles ? s.percentiles[k] : undefined));
  return \`<tr><td>\${name}</td><td>\${cell("mean")}</td><td>\${cell("median")}</td>
          <td>\${cell("p90")}</td><td>\${cell("p95")}</td><td>\${cell("p99")}</td></tr>\`;
}
function render(file){
  const el = document.getElementById("content");
  el.innerHTML = "Loading&hellip;";
  fetch("/" + file).then(r => r.json()).then(data => {
    const benchmarks = data.benchmarks || (data.report && data.report.benchmarks) || [];
    if (!Array.isArray(benchmarks) || !benchmarks.length) {
      el.innerHTML = "<pre>" + JSON.stringify(data,null,2).slice(0,200000) + "</pre>";
      return;
    }
    const wanted = {"Requests/sec":"requests_per_second","Concurrency":"request_concurrency","Request latency (s)":"request_latency","TTFT (ms)":"time_to_first_token_ms","ITL (ms)":"inter_token_latency_ms","Output tokens/sec":"output_tokens_per_second","Total tokens/sec":"tokens_per_second"};
    let html = "";
    benchmarks.forEach((b,i) => {
      const label = (b.id_ || b.id || "benchmark "+(i+1)) + (b.args && b.args.strategy ? " — " + JSON.stringify(b.args.strategy) : "");
      const m = b.metrics || b;
      let rows = Object.entries(wanted).map(([name,key]) => metricRow(name, m[key])).join("");
      html += \`<h2>\${label}</h2><table><tr><th>Metric</th><th>mean</th><th>median</th><th>p90</th><th>p95</th><th>p99</th></tr>\${rows || "<tr><td colspan=6>no metrics recognized</td></tr>"}</table>\`;
    });
    el.innerHTML = html;
  }).catch(e => { el.innerHTML = "<pre>Failed: " + e + "</pre>"; });
}
loadFileList();
</script>
</body>
</html>`;

export async function provisionViewer(namespace: string, pvcName: string): Promise<void> {
  // 1. PVC — omit storageClassName to use cluster default
  await applyResource(`/api/v1/namespaces/${namespace}/persistentvolumeclaims`, {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name: pvcName, namespace, labels: LABELS },
    spec: {
      accessModes: ['ReadWriteOnce'],
      resources: { requests: { storage: '10Gi' } },
    },
  });

  // 2. nginx config ConfigMap — always update so nginx config changes take effect
  await applyResource(
    `/api/v1/namespaces/${namespace}/configmaps`,
    {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'guidellm-results-nginx-conf', namespace, labels: LABELS },
      data: { 'default.conf': NGINX_CONF },
    },
    { forceUpdate: true },
  );

  // 3. Dashboard HTML ConfigMap — always update
  await applyResource(
    `/api/v1/namespaces/${namespace}/configmaps`,
    {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'guidellm-dashboard', namespace, labels: LABELS },
      data: { 'index.html': DASHBOARD_HTML },
    },
    { forceUpdate: true },
  );

  // 4. Deployment — annotate with config hash so pod restarts when nginx config changes
  const configHash = btoa(NGINX_CONF).slice(0, 8);
  await applyResource(`/apis/apps/v1/namespaces/${namespace}/deployments`, {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'guidellm-results-viewer', namespace, labels: LABELS },
    spec: {
      replicas: 1,
      selector: { matchLabels: LABELS },
      template: {
        metadata: { labels: LABELS, annotations: { 'guidellm/nginx-conf-hash': configHash } },
        spec: {
          containers: [
            {
              name: 'nginx',
              image: 'nginxinc/nginx-unprivileged:1.27',
              ports: [{ containerPort: 8080, name: 'http' }],
              resources: {
                requests: { cpu: '50m', memory: '64Mi' },
                limits: { cpu: '200m', memory: '128Mi' },
              },
              volumeMounts: [
                { name: 'results-volume', mountPath: '/usr/share/nginx/html', readOnly: true },
                { name: 'nginx-conf', mountPath: '/etc/nginx/conf.d/default.conf', subPath: 'default.conf' },
                { name: 'dashboard', mountPath: '/dashboard' },
              ],
            },
          ],
          volumes: [
            { name: 'results-volume', persistentVolumeClaim: { claimName: pvcName } },
            { name: 'nginx-conf', configMap: { name: 'guidellm-results-nginx-conf' } },
            { name: 'dashboard', configMap: { name: 'guidellm-dashboard' } },
          ],
        },
      },
    },
  });

  // 5. Service
  await applyResource(`/api/v1/namespaces/${namespace}/services`, {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'guidellm-results-viewer', namespace, labels: LABELS },
    spec: {
      selector: LABELS,
      ports: [{ name: 'http', port: 8080, targetPort: 8080 }],
    },
  });

  // 6. OpenShift Route
  await applyResource(
    `/apis/route.openshift.io/v1/namespaces/${namespace}/routes`,
    {
      apiVersion: 'route.openshift.io/v1',
      kind: 'Route',
      metadata: { name: 'guidellm-results-viewer', namespace, labels: LABELS },
      spec: {
        to: { kind: 'Service', name: 'guidellm-results-viewer' },
        port: { targetPort: 'http' },
        tls: { termination: 'edge', insecureEdgeTerminationPolicy: 'Redirect' },
      },
    },
  );
}
