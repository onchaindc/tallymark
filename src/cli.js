import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { evaluateRun } from './evaluator.js';

const path = process.argv[2];
const outPath = process.argv[3];

if (!path) {
  console.error('Usage: node src/cli.js <run.json> [out-report.json]');
  process.exit(2);
}

const data = JSON.parse(await readFile(path, 'utf8'));
const evaluatedAt = new Date(data.evaluatedAt ?? Date.now());
const report = evaluateRun(data.benchmark, data.responses, evaluatedAt, {
  mode: data.mode ?? 'fixture_or_adapter',
});

const notice =
  data.notice ??
  'Evaluation uses the supplied benchmark and responses. Confirm reference-source independence before treating scores as authoritative.';

const full = { ...report, notice };

const json = JSON.stringify(full, null, 2);
console.log(json);

if (outPath) {
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, json, 'utf8');
  console.error(`Wrote report to ${outPath}`);
}
