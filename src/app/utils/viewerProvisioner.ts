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

const DASHBOARD_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>GuideLLM Results</title>
<style>
  body{font-family:system-ui,sans-serif;margin:1.5rem;background:#f6f8fa;color:#1f2328}
  h1{font-size:1.3rem;margin-bottom:.25rem}
  .subtitle{color:#57606a;font-size:.85rem;margin-bottom:1.25rem}
  select{font-size:.95rem;padding:.3rem .5rem;margin-bottom:1.5rem;max-width:100%;border:1px solid #d0d7de;border-radius:4px}
  .cards{display:flex;flex-wrap:wrap;gap:.75rem;margin-bottom:1.5rem}
  .card{background:#fff;border:1px solid #d0d7de;border-radius:6px;padding:.75rem 1rem;min-width:140px;flex:1}
  .card-label{font-size:.75rem;color:#57606a;margin-bottom:.2rem}
  .card-value{font-size:1.4rem;font-weight:600}
  .card-sub{font-size:.75rem;color:#57606a;margin-top:.1rem}
  .section{background:#fff;border:1px solid #d0d7de;border-radius:6px;padding:1rem;margin-bottom:1rem}
  .section-title{font-size:.95rem;font-weight:600;margin-bottom:.5rem}
  .section-desc{font-size:.78rem;color:#57606a;margin-bottom:.75rem}
  table{border-collapse:collapse;width:100%;font-size:.83rem}
  th,td{border:1px solid #d0d7de;padding:.3rem .6rem;text-align:right}
  th:first-child,td:first-child{text-align:left;font-weight:500}
  th{background:#f6f8fa;font-weight:600}
  .good{color:#1a7f37} .warn{color:#9a6700} .bad{color:#cf222e}
  pre{background:#f6f8fa;border:1px solid #d0d7de;padding:1rem;overflow:auto;max-height:50vh;font-size:.75rem;border-radius:4px}
</style>
</head>
<body>
<h1>GuideLLM Benchmark Results</h1>
<p class="subtitle">Load test results for your LLM endpoint. Lower latency and higher throughput indicate better performance.</p>
<label style="font-size:.9rem;font-weight:500">Result file: <select id="files"></select></label>
<div id="content"></div>
<script>
const fmt = (v,dec) => typeof v === "number" ? v.toFixed(dec ?? (Math.abs(v)>=100?1:2)) : (v ?? "—");
const get = (s,k) => s ? (s[k] ?? (s.percentiles ? s.percentiles[k] : undefined)) : undefined;

function statsOf(node){
  if(!node||typeof node!=="object") return null;
  for(const k of ["successful","total",""]){
    const n=k?node[k]:node;
    if(n&&typeof n==="object"&&("mean" in n||"median" in n)) return n;
  }
  return null;
}

function card(label,value,unit,sub,colorClass){
  return \`<div class="card"><div class="card-label">\${label}</div>
    <div class="card-value \${colorClass||""}">\${value}<span style="font-size:.9rem;font-weight:400"> \${unit}</span></div>
    \${sub?\`<div class="card-sub">\${sub}</div>\`:""}
  </div>\`;
}

function metricRow(name,node){
  const s=statsOf(node);
  if(!s) return "";
  const c=k=>fmt(get(s,k));
  return \`<tr><td>\${name}</td><td>\${c("mean")}</td><td>\${c("median")}</td><td>\${c("p90")}</td><td>\${c("p95")}</td><td>\${c("p99")}</td></tr>\`;
}

function render(file){
  const el=document.getElementById("content");
  el.innerHTML="Loading…";
  fetch("/"+file).then(r=>r.json()).then(data=>{
    const benchmarks=data.benchmarks||(data.report&&data.report.benchmarks)||[];
    if(!Array.isArray(benchmarks)||!benchmarks.length){
      el.innerHTML="<pre>"+JSON.stringify(data,null,2).slice(0,200000)+"</pre>";
      return;
    }
    let html="";
    benchmarks.forEach((b,i)=>{
      const m=b.metrics||b;
      const profile=b.profile||b.args||{};
      const streams=profile.streams||(Array.isArray(profile.streams)?profile.streams[0]:null)||"?";
      const label="Concurrency: "+streams;

      // Key summary cards
      const rps=statsOf(m.requests_per_second);
      const lat=statsOf(m.request_latency);
      const ttft=statsOf(m.time_to_first_token_ms);
      const itl=statsOf(m.inter_token_latency_ms);
      const otps=statsOf(m.output_tokens_per_second);

      const rpsVal=rps?fmt(get(rps,"mean"),1):"—";
      const latVal=lat?fmt(get(lat,"median"),2)+"s":"—";
      const ttftVal=ttft?fmt(get(ttft,"median"),0)+"ms":"—";
      const itlVal=itl?fmt(get(itl,"median"),1)+"ms":"—";
      const otpsVal=otps?fmt(get(otps,"mean"),0):"—";

      html+=\`<div class="section">
      <div class="section-title">\${label} — Run \${(i+1)}</div>
      <div class="cards">
        \${card("Throughput",rpsVal,"req/s","Requests completed per second")}
        \${card("Output tokens/s",otpsVal,"tok/s","Generated tokens per second")}
        \${card("Request latency",latVal,"","Median end-to-end time per request")}
        \${card("TTFT",ttftVal,"","Time to first token (median)")}
        \${card("ITL",itlVal,"","Inter-token latency (median)")}
      </div>

      <div class="section-title" style="margin-top:1rem">Latency breakdown
        <span style="font-size:.75rem;font-weight:400;color:#57606a;margin-left:.5rem">
          TTFT = how quickly the model starts responding &nbsp;|&nbsp;
          ITL = smoothness of token streaming &nbsp;|&nbsp;
          p95/p99 = worst-case tail latency
        </span>
      </div>
      <table>
        <tr><th>Metric</th><th>mean</th><th>median</th><th>p90</th><th>p95</th><th>p99</th></tr>
        \${metricRow("Request latency (s)",m.request_latency)}
        \${metricRow("TTFT (ms)",m.time_to_first_token_ms)}
        \${metricRow("ITL (ms)",m.inter_token_latency_ms)}
      </table>

      <div class="section-title" style="margin-top:1rem">Throughput
        <span style="font-size:.75rem;font-weight:400;color:#57606a;margin-left:.5rem">
          Higher is better &nbsp;|&nbsp; output tok/s directly reflects model generation speed
        </span>
      </div>
      <table>
        <tr><th>Metric</th><th>mean</th><th>median</th><th>p90</th><th>p95</th><th>p99</th></tr>
        \${metricRow("Requests/sec",m.requests_per_second)}
        \${metricRow("Output tokens/sec",m.output_tokens_per_second)}
        \${metricRow("Total tokens/sec",m.tokens_per_second)}
        \${metricRow("Concurrency",m.request_concurrency)}
      </table>
      </div>\`;
    });
    el.innerHTML=html;
  }).catch(e=>{el.innerHTML="<pre>Failed to load: "+e+"</pre>";});
}

async function loadFileList(){
  const res=await fetch("/api/files/");
  const items=await res.json();
  const jsons=items.filter(i=>i.type==="file"&&i.name.endsWith(".json"))
                   .sort((a,b)=>b.mtime>a.mtime?1:-1);
  const sel=document.getElementById("files");
  sel.innerHTML=jsons.map(f=>\`<option value="\${f.name}">\${f.name}</option>\`).join("");
  sel.onchange=()=>render(sel.value);
  if(jsons.length) render(jsons[0].name);
  else document.getElementById("content").textContent="No result files found yet.";
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
