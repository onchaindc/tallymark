import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { evaluateRun } from './evaluator.js';

const runPath = process.argv[2];
const outPath = process.argv[3] ?? 'reports/report.html';

if (!runPath) {
  console.error('Usage: node src/report-html.js <run.json> [out.html]');
  process.exit(2);
}

const data = JSON.parse(await readFile(runPath, 'utf8'));
const report = evaluateRun(data.benchmark, data.responses ?? [], new Date(data.evaluatedAt ?? Date.now()), {
  mode: data.mode ?? 'fixture_or_adapter',
});
const notice = data.notice ?? '';
const resultKind = data.resultKind ?? (data.mode === 'fixture' || data.synthetic ? 'synthetic' : 'unspecified');
const probes = data.probes ?? [];
const untested = data.untestedMiners ?? [];

function pct(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return `${(Number(n) * 100).toFixed(1)}%`;
}
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const kindBanner = {
  synthetic: { label: 'SYNTHETIC FIXTURE RESULTS', cls: 'kind-synthetic' },
  real_reference: { label: 'REAL REFERENCE (Companies House) — free probe only', cls: 'kind-real' },
  live_paid: { label: 'LIVE PAID EVALUATION', cls: 'kind-live' },
  probe_only: { label: 'FREE DISCOVERY / PROBE — no provider answers scored', cls: 'kind-probe' },
  unspecified: { label: 'RESULT KIND NOT DECLARED', cls: 'kind-unknown' },
}[resultKind] ?? { label: String(resultKind), cls: 'kind-unknown' };

const rows = (report.results ?? [])
  .map((r) => {
    const claimCells = (r.claims ?? [])
      .map(
        (c) =>
          `<tr><td>${esc(c.key)}</td><td>${esc(c.expected)}</td><td>${esc(c.actual)}</td><td class="st-${c.status}">${esc(c.status)}</td></tr>`,
      )
      .join('');
    return `
    <section class="card">
      <h2>${esc(r.providerId)}</h2>
      <div class="metrics">
        <div><span class="label">Overall</span><strong>${pct(r.scores.overall)}</strong></div>
        <div><span class="label">Accuracy</span>${pct(r.scores.accuracy)}</div>
        <div><span class="label">Completeness</span>${pct(r.scores.completeness)}</div>
        <div><span class="label">Evidence</span>${pct(r.scores.evidence)}</div>
        <div><span class="label">Freshness</span>${pct(r.scores.freshness)}</div>
        <div><span class="label">Latency</span>${r.metrics.latencyMs ?? '—'} ms</div>
        <div><span class="label">Cost</span>$${r.metrics.costUsd ?? '—'}</div>
      </div>
      <table>
        <thead><tr><th>Claim</th><th>Expected</th><th>Actual</th><th>Status</th></tr></thead>
        <tbody>${claimCells}</tbody>
      </table>
      <p class="hash">responseHash: <code>${esc(r.responseHash)}</code></p>
    </section>`;
  })
  .join('\n');

const leaderboard = (report.leaderboard ?? [])
  .map(
    (l, i) =>
      `<tr><td>${i + 1}</td><td>${esc(l.providerId)}</td><td>${pct(l.scores.overall)}</td><td>${pct(l.scores.accuracy)}</td><td>$${l.averageCostUsd ?? '—'}</td><td>${l.averageLatencyMs ?? '—'} ms</td></tr>`,
  )
  .join('');

const probeRows = probes
  .map(
    (p) =>
      `<tr><td>${esc(p.id ?? p.slug)}</td><td>${esc(p.name)}</td><td>${esc(p.status)}</td><td>${esc(p.detail ?? '')}</td></tr>`,
  )
  .join('');

const untestedRows = untested
  .map((u) => `<tr><td>${esc(u.id ?? u.slug)}</td><td>${esc(u.name)}</td><td class="st-missing">untested</td><td>${esc(u.reason ?? 'no paid execution')}</td></tr>`)
  .join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>TALLYMARK — ${esc(report.benchmarkId)}</title>
<style>
  :root { --bg:#0f1115; --card:#171a21; --text:#e8eaed; --muted:#9aa0a6; --ok:#3dd68c; --bad:#f07178; --miss:#e6c07b; --border:#2a2f3a; --accent:#7aa2f7; --syn:#5c4a2e; --real:#1e3a2f; --probe:#1a2a3a; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:var(--bg); color:var(--text); line-height:1.45; }
  header { padding: 1.5rem 2rem; border-bottom:1px solid var(--border); }
  header h1 { margin:0 0 .25rem; font-size:1.35rem; letter-spacing:.02em; }
  header p { margin:0; color:var(--muted); font-size:.9rem; }
  main { max-width: 1100px; margin:0 auto; padding: 1.5rem 1.25rem 3rem; }
  .notice { background:#2a2118; border:1px solid #5c4a2e; color:#e6c07b; padding:.75rem 1rem; border-radius:8px; margin-bottom:1rem; font-size:.9rem; }
  .kind-banner { padding:.65rem 1rem; border-radius:8px; margin-bottom:1.25rem; font-weight:600; font-size:.85rem; letter-spacing:.03em; text-transform:uppercase; }
  .kind-synthetic { background:var(--syn); border:1px solid #8a6d3b; color:#f0d9a0; }
  .kind-real { background:var(--real); border:1px solid #3d7a5a; color:#a8e6c5; }
  .kind-probe { background:var(--probe); border:1px solid #3a5a7a; color:#a0c4e8; }
  .kind-live { background:#2a1a2a; border:1px solid #7a3a7a; color:#e0a0e0; }
  .kind-unknown { background:#333; border:1px solid #666; color:#ccc; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:10px; padding:1.25rem; margin-bottom:1.25rem; }
  .metrics { display:grid; grid-template-columns: repeat(auto-fit,minmax(110px,1fr)); gap:.75rem; margin:1rem 0; }
  .metrics .label { display:block; color:var(--muted); font-size:.75rem; text-transform:uppercase; letter-spacing:.04em; }
  table { width:100%; border-collapse:collapse; font-size:.9rem; }
  th, td { text-align:left; padding:.45rem .5rem; border-bottom:1px solid var(--border); }
  th { color:var(--muted); font-weight:500; }
  .st-match { color:var(--ok); }
  .st-mismatch { color:var(--bad); }
  .st-missing { color:var(--miss); }
  .hash { font-size:.75rem; color:var(--muted); word-break:break-all; }
  h2 { margin:0; font-size:1.1rem; }
  h3 { margin:1.5rem 0 .75rem; font-size:1rem; color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:.05em; }
  .legend { font-size:.8rem; color:var(--muted); margin-top:2rem; }
</style>
</head>
<body>
<header>
  <h1>TALLYMARK</h1>
  <p>Independent Telegraph Intelligence Reliability Evaluator · ${esc(report.benchmarkId)} · ${esc(report.evaluatedAt)}</p>
</header>
<main>
  <div class="kind-banner ${kindBanner.cls}">${esc(kindBanner.label)}</div>
  ${notice ? `<div class="notice">${esc(notice)}</div>` : ''}
  ${leaderboard ? `<h3>Leaderboard</h3>
  <div class="card">
    <table>
      <thead><tr><th>#</th><th>Provider</th><th>Overall</th><th>Accuracy</th><th>Avg cost</th><th>Avg latency</th></tr></thead>
      <tbody>${leaderboard}</tbody>
    </table>
  </div>` : ''}
  ${rows ? `<h3>Per-provider results</h3>${rows}` : '<p class="hash">No scored provider responses in this run (probe-only or empty).</p>'}
  ${probeRows ? `<h3>Free probes</h3><div class="card"><table><thead><tr><th>Miner</th><th>Name</th><th>Status</th><th>Detail</th></tr></thead><tbody>${probeRows}</tbody></table></div>` : ''}
  ${untestedRows ? `<h3>Untested miners</h3><div class="card"><table><thead><tr><th>Miner</th><th>Name</th><th>Status</th><th>Reason</th></tr></thead><tbody>${untestedRows}</tbody></table></div>` : ''}
  <p class="legend">Weights: accuracy ${report.weights?.accuracy}, completeness ${report.weights?.completeness}, evidence ${report.weights?.evidence}, freshness ${report.weights?.freshness}. Mode: ${esc(report.mode)}. Result kind: ${esc(resultKind)}. Synthetic and real-reference scores must never be published as a single undifferentiated leaderboard.</p>
</main>
</body>
</html>`;

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, html, 'utf8');
console.error(`Wrote HTML report to ${outPath}`);
