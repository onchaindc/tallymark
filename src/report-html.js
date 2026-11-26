import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { evaluateRun } from './evaluator.js';
import { normalizeRunInput } from './run-format.js';

const runPath = process.argv[2];
const outPath = process.argv[3] ?? 'reports/report.html';
if (!runPath) {
  console.error('Usage: node src/report-html.js <run.json> [out.html]');
  process.exit(2);
}

const data = JSON.parse(await readFile(runPath, 'utf8'));
const run = normalizeRunInput(data);
const report = evaluateRun(run, new Date(data.evaluatedAt ?? run.evaluatedAt ?? Date.now()));
const notice = data.notice ?? '';
const resultKind = data.resultKind ?? (data.mode === 'fixture' || data.synthetic ? 'synthetic' : 'unspecified');

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function pct(value) {
  return value == null || Number.isNaN(Number(value)) ? '—' : `${(Number(value) * 100).toFixed(1)}%`;
}
const banner = resultKind === 'synthetic'
  ? 'SYNTHETIC FIXTURE RESULTS — NOT LIVE MINER PERFORMANCE'
  : resultKind === 'live_paid'
    ? 'LIVE PAID EVALUATION'
    : resultKind === 'real_reference'
      ? 'REAL REFERENCE EVALUATION'
      : 'EVALUATION REPORT — RESULT PROVENANCE MUST BE CHECKED';

const leaderboardRows = report.leaderboard.map((item) => `
<tr><td>${item.rank}</td><td>${esc(item.providerId)}</td><td>${pct(item.overall)}</td><td>${pct(item.accuracy)}</td><td>${pct(item.completeness)}</td><td>${pct(item.evidence)}</td><td>${pct(item.freshness)}</td><td>${item.unsupportedClaimCount ?? 0}</td><td>$${Number(item.totalCostUsd ?? 0).toFixed(4)}</td><td>${item.avgLatencyMs == null ? '—' : Math.round(item.avgLatencyMs) + ' ms'}</td></tr>
`).join('');

const providerSections = report.providers.map((provider) => {
  const cases = provider.caseScores.map((score) => {
    const claims = (score.claimResults ?? []).map((claim) => `
<tr><td>${esc(claim.key)}</td><td>${esc(JSON.stringify(claim.expected))}</td><td>${esc(JSON.stringify(claim.actual))}</td><td class="${claim.hit ? 'ok' : 'bad'}">${esc(claim.failureCode)}</td></tr>
`).join('');
    const excluded = score.excluded ? '<p class="muted">Excluded synthetic control; not included in real scores.</p>' : '';
    const unsupported = score.unsupportedClaimCount ? `<p class="warn">Unsupported extra claims: ${esc(score.unsupportedClaimKeys.join(', '))}</p>` : '';
    return `<section class="case"><h3>${esc(score.caseId)}</h3>${excluded}<p class="muted">Overall ${pct(score.overall)} · Accuracy ${pct(score.accuracy)} · Completeness ${pct(score.completeness)} · Evidence ${pct(score.evidence)} · Freshness ${pct(score.freshness)}</p><table><thead><tr><th>Claim</th><th>Expected</th><th>Actual</th><th>Outcome</th></tr></thead><tbody>${claims}</tbody></table>${unsupported}</section>`;
  }).join('');
  return `<section class="provider"><h2>${esc(provider.providerName)}</h2><p class="muted">Overall ${pct(provider.overall)} · Accuracy ${pct(provider.accuracy)} · Completeness ${pct(provider.completeness)} · Evidence ${pct(provider.evidence)} · Freshness ${pct(provider.freshness)}</p><p class="muted">Unsupported extra claims: ${provider.unsupportedClaimCount ?? 0} · Cost: $${Number(provider.totalCostUsd ?? 0).toFixed(4)} · Average latency: ${provider.avgLatencyMs == null ? '—' : Math.round(provider.avgLatencyMs) + ' ms'}</p>${cases}</section>`;
}).join('');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TALLYMARK — ${esc(report.runId)}</title><style>
:root{color-scheme:dark;--bg:#101216;--panel:#191d24;--line:#303640;--text:#e8ebef;--muted:#a0a8b4;--ok:#55d69e;--bad:#f18a8a;--warn:#e9bd73}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,sans-serif}header,main{max-width:1100px;margin:auto;padding:24px}header{border-bottom:1px solid var(--line)}h1{font-size:22px;margin:0}h2{font-size:18px;margin:0 0 8px}h3{font-size:15px;margin:16px 0 8px}.banner,.provider,.case{background:var(--panel);border:1px solid var(--line);padding:16px;margin:16px 0;border-radius:8px}.banner{font-weight:700}.muted{color:var(--muted);font-size:13px}.notice,.warn{color:var(--warn)}table{width:100%;border-collapse:collapse;font-size:13px;overflow-wrap:anywhere}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line)}th{color:var(--muted);font-weight:600}.ok{color:var(--ok)}.bad{color:var(--bad)}@media(max-width:650px){header,main{padding:14px}.provider,.case{padding:12px}table{font-size:11px}th,td{padding:5px}}
</style></head><body><header><h1>TALLYMARK</h1><p class="muted">Run ${esc(report.runId)} · ${esc(report.evaluatedAt)}</p></header><main><div class="banner">${banner}</div>${notice ? `<p class="notice">${esc(notice)}</p>` : ''}<p class="muted">Real cases: ${report.realCaseCount} · Synthetic excluded: ${report.syntheticExcluded} · Weights: accuracy ${report.weights.accuracy}, completeness ${report.weights.completeness}, evidence ${report.weights.evidence}, freshness ${report.weights.freshness}</p>${leaderboardRows ? `<h2>Leaderboard</h2><section class="provider"><table><thead><tr><th>Rank</th><th>Provider</th><th>Overall</th><th>Accuracy</th><th>Completeness</th><th>Evidence</th><th>Freshness</th><th>Unsupported</th><th>Cost</th><th>Latency</th></tr></thead><tbody>${leaderboardRows}</tbody></table></section>` : ''}${providerSections || '<p class="muted">No provider responses were included.</p>'}<p class="muted">Scores describe this run only. They are not a general reliability certification. Unsupported extra claims are reported separately and are not included in the weighted score.</p></main></body></html>`;

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, html, 'utf8');
console.error(`Wrote HTML report to ${outPath}`);
