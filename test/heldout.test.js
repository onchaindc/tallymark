import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('held-out set has no entity overlap with preference-training source', async () => {
  const [trainingText, heldoutText] = await Promise.all([
    readFile(new URL('../benchmarks/real/corporate-registry-v2.json', root), 'utf8'),
    readFile(new URL('../benchmarks/heldout/corporate-registry-adversarial-v1.json', root), 'utf8'),
  ]);
  const training = JSON.parse(trainingText);
  const heldout = JSON.parse(heldoutText);
  const trainingIds = new Set(training.cases.map((c) => String(c.params.company)));
  assert.equal(heldout.split, 'held_out');
  assert.equal(heldout.cases.length, 6);
  assert.ok(heldout.cases.every((c) => !trainingIds.has(String(c.params.company))));
  assert.ok(heldout.cases.every((c) => c.reference.independentlyReviewed && c.reference.sourceUrl));
  assert.ok(heldout.cases.some((c) => c.reference.statusNuance));
  assert.ok(heldout.cases.some((c) => (c.reference.previousNames || []).length > 0));
});
