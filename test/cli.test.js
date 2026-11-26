import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);
const fixture = 'fixtures/synthetic/demo-run.json';

test('JSON CLI normalises legacy fixture input and excludes synthetic scores', async () => {
  const { stdout } = await execFileAsync(process.execPath, ['src/cli.js', fixture], { cwd: process.cwd() });
  const report = JSON.parse(stdout);
  assert.equal(report.runId, 'company-registry-status-demo-run');
  assert.equal(report.realCaseCount, 0);
  assert.equal(report.syntheticExcluded, 1);
  assert.equal(report.providers.length, 2);
  assert.ok(report.providers.every((provider) => provider.caseScores[0].excluded));
});

test('HTML report renders current evaluator result shape', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tallymark-report-'));
  const output = join(dir, 'report.html');
  try {
    await execFileAsync(process.execPath, ['src/report-html.js', fixture, output], { cwd: process.cwd() });
    const html = await readFile(output, 'utf8');
    assert.match(html, /SYNTHETIC FIXTURE RESULTS/);
    assert.match(html, /miner-alpha-demo/);
    assert.match(html, /Excluded synthetic control/);
    assert.match(html, /not a general reliability certification/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
