import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { evaluateRun } from './evaluator.js';
import { normalizeRunInput } from './run-format.js';

const path = process.argv[2];
const outPath = process.argv[3];

if (!path) {
  console.error('Usage: node src/cli.js <run.json> [out-report.json]');
  process.exit(2);
}

const data = JSON.parse(await readFile(path, 'utf8'));
const run = normalizeRunInput(data);
const evaluatedAt = new Date(data.evaluatedAt ?? run.evaluatedAt ?? Date.now());
const report = evaluateRun(run, evaluatedAt);
const full = {
  ...report,
  mode: data.mode ?? 'run',
  resultKind: data.resultKind ?? (data.synthetic ? 'synthetic' : 'unspecified'),
  notice: data.notice ?? 'Evaluation uses the supplied benchmark and responses. Confirm reference-source independence before treating scores as authoritative.',
};
const json = JSON.stringify(full, null, 2);
console.log(json);

if (outPath) {
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, json, 'utf8');
  console.error(`Wrote report to ${outPath}`);
}
