import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRun, scoreCase, compare } from '../src/evaluator.js';

const now = new Date('2026-11-26T12:00:00.000Z');
const benchmark = {
  id: 'b1',
  maxEvidenceAgeHours: 48,
  claims: [
    { key: 'name', expected: 'Acme Ltd', rule: 'case_insensitive' },
    { key: 'status', expected: 'active', rule: 'exact' },
  ],
};

test('scores correct claims and required evidence metadata', () => {
  const result = scoreCase(
    benchmark,
    {
      providerId: 'p1',
      claims: { name: 'ACME LTD', status: 'active' },
      evidence: [
        { source: 'registry', observedAt: '2026-11-26T10:00:00.000Z', contentHash: 'abc' },
        { source: 'filing', observedAt: '2026-11-26T10:00:00.000Z', contentHash: 'def' },
      ],
    },
    now,
  );
  assert.equal(result.scores.accuracy, 1);
  assert.equal(result.scores.completeness, 1);
  assert.equal(result.scores.evidence, 1);
  assert.equal(result.scores.freshness, 1);
  assert.equal(result.unsupportedClaims.length, 0);
});

test('missing and incorrect claims reduce accuracy and completeness', () => {
  const result = scoreCase(benchmark, { providerId: 'p2', claims: { status: 'inactive' }, evidence: [] }, now);
  assert.equal(result.scores.accuracy, 0);
  assert.equal(result.scores.completeness, 0.5);
  assert.deepEqual(
    result.claims.map((c) => c.status),
    ['missing', 'mismatch'],
  );
  assert.equal(result.unsupportedClaims.length, 2);
});

test('provider verified flag is not treated as proof', () => {
  const result = scoreCase(benchmark, { providerId: 'p3', verified: true, claims: {}, evidence: [] }, now);
  assert.equal(result.providerVerifiedFlagIgnored, true);
  assert.equal(result.scores.evidence, 0);
});

test('stale evidence reduces freshness', () => {
  const result = scoreCase(
    benchmark,
    {
      providerId: 'p4',
      claims: { name: 'Acme Ltd', status: 'active' },
      evidence: [{ source: 'old-registry', observedAt: '2026-11-20T10:00:00.000Z', contentHash: 'old' }],
    },
    now,
  );
  assert.equal(result.scores.freshness, 0);
});

test('leaderboard ranks by overall score and reports cost/latency separately', () => {
  const run = evaluateRun(
    benchmark,
    [
      { providerId: 'weak', claims: { status: 'wrong' }, evidence: [], costUsd: 0.01, latencyMs: 100 },
      {
        providerId: 'strong',
        claims: { name: 'Acme Ltd', status: 'active' },
        evidence: [
          { source: 'registry', observedAt: '2026-11-26T10:00:00.000Z', contentHash: 'a' },
          { source: 'registry', observedAt: '2026-11-26T10:00:00.000Z', contentHash: 'b' },
        ],
        costUsd: 0.05,
        latencyMs: 300,
      },
    ],
    now,
  );
  assert.equal(run.leaderboard[0].providerId, 'strong');
  assert.equal(run.leaderboard[0].averageCostUsd, 0.05);
  assert.ok(run.reproducibility.responseHashes.length === 2);
});

test('empty string is treated as missing, not a match', () => {
  const result = scoreCase(
    benchmark,
    { providerId: 'p5', claims: { name: '', status: 'active' }, evidence: [] },
    now,
  );
  assert.equal(result.claims[0].status, 'missing');
  assert.equal(result.scores.completeness, 0.5);
});

test('one_of rule accepts any listed value', () => {
  assert.equal(compare('dissolved', ['active', 'dissolved'], 'one_of'), true);
  assert.equal(compare('unknown', ['active', 'dissolved'], 'one_of'), false);
});

test('evaluateRun rejects missing benchmark id', () => {
  assert.throws(() => evaluateRun({}, []), /benchmark.id is required/);
});
