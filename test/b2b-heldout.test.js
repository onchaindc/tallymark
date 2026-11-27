import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('B2B held-out companies do not overlap training companies', async () => {
  const [trainText, heldoutText] = await Promise.all([
    readFile(new URL('benchmarks/real/b2b-identity-enrichment-v1.json', root), 'utf8'),
    readFile(new URL('benchmarks/heldout/b2b-identity-enrichment-v1.json', root), 'utf8'),
  ]);
  const train = JSON.parse(trainText);
  const heldout = JSON.parse(heldoutText);
  const trainNames = new Set(train.cases.map(c => String(c.params.company).toLowerCase()));
  assert.equal(train.intent, 'B2B_IDENTITY_ENRICHMENT_GENERAL');
  assert.equal(heldout.split, 'held_out');
  assert.equal(train.cases.length, 17);
  assert.equal(heldout.cases.length, 3);
  assert.ok(heldout.cases.every(c => !trainNames.has(String(c.params.company).toLowerCase())));
  for (const c of [...train.cases, ...heldout.cases]) {
    const claims = Object.fromEntries(c.claims.map(x => [x.key, x.expected]));
    assert.equal(typeof claims.employee_count, 'number');
    assert.equal(typeof claims.industry, 'string');
    assert.ok(c.reference.sourceUrl.startsWith('https://www.sec.gov/'));
    assert.ok(c.reference.asOf);
  }
});
