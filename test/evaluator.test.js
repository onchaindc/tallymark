import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreCase, evaluateRun, compare, FailureCode, WEIGHTS } from '../src/evaluator.js';

const bench = {
  id: 'c1',
  kind: 'real_reference',
  claims: [
    { key: 'legal_name', expected: 'OPENAI UK LTD', rule: 'case_insensitive' },
    { key: 'active', expected: true, rule: 'exact' },
  ],
  maxEvidenceAgeHours: 48,
};

test('compare treats empty as non-match', () => {
  assert.equal(compare('', 'x', 'exact'), false);
  assert.equal(compare(null, 'x', 'exact'), false);
});

test('scoreCase rewards correct claims with evidence', () => {
  const now = new Date('2026-11-26T12:00:00Z');
  const res = scoreCase(bench, {
    claims: { legal_name: 'OPENAI UK LTD', active: true },
    evidence: {
      legal_name: [{ source: 'https://ch.gov.uk', observedAt: '2026-11-26T10:00:00Z', contentHash: 'abc' }],
      active: [{ source: 'https://ch.gov.uk', observedAt: '2026-11-26T10:00:00Z', contentHash: 'def' }],
    },
  }, now);
  assert.equal(res.accuracy, 1);
  assert.equal(res.completeness, 1);
  assert.ok(res.evidence > 0.9);
  assert.ok(res.freshness > 0.9);
  assert.ok(res.overall > 0.9);
});

test('provider verified flag is ignored for correctness', () => {
  const res = scoreCase(bench, { claims: { legal_name: 'WRONG', active: false }, verified: true, providerVerified: true });
  assert.equal(res.accuracy, 0);
  assert.equal(res.providerVerifiedIgnored, true);
});

test('missing values are missing_value not correct', () => {
  const res = scoreCase(bench, { claims: {} });
  assert.equal(res.claimResults[0].failureCode, FailureCode.MISSING_VALUE);
  assert.equal(res.accuracy, 0);
});

test('unsupported extra claims are surfaced without silently changing weighted score', () => {
  const res = scoreCase(bench, { claims: { legal_name: 'OPENAI UK LTD', active: true, beneficial_owner: 'John Doe' } });
  assert.deepEqual(res.unsupportedClaimKeys, ['beneficial_owner']);
  assert.equal(res.unsupportedClaimCount, 1);
  assert.ok(res.failureCodes.includes(FailureCode.UNSUPPORTED_CLAIM));
});

test('transport failure zeros scores', () => {
  const res = scoreCase(bench, { transportError: 'timeout' });
  assert.equal(res.failureCode, FailureCode.TRANSPORT_FAILURE);
  assert.equal(res.overall, 0);
});

test('synthetic cases are excluded', () => {
  const res = scoreCase({ ...bench, kind: 'synthetic_negative_control' }, { claims: { legal_name: 'OPENAI UK LTD', active: true } });
  assert.equal(res.excluded, true);
  assert.equal(res.failureCode, FailureCode.SYNTHETIC_EXCLUDED);
});

test('evaluateRun ranks by overall and excludes synthetic', () => {
  const run = {
    id: 'run-1',
    benchmarks: [bench, { id: 'syn', kind: 'synthetic_negative_control', claims: [{ key: 'x', expected: 1, rule: 'exact' }] }],
    providers: [
      { id: 'a', responses: { c1: { claims: { legal_name: 'OPENAI UK LTD', active: true, invented_risk_score: 99 }, evidence: {
        legal_name: [{ source: 's', observedAt: '2026-11-26T11:00:00Z', contentHash: 'h1' }],
        active: [{ source: 's', observedAt: '2026-11-26T11:00:00Z', contentHash: 'h2' }],
      }, costUsd: 0.01, latencyMs: 100 } } },
      { id: 'b', responses: { c1: { claims: { legal_name: 'NOPE', active: false }, costUsd: 0.01, latencyMs: 50 } } },
    ],
  };
  const out = evaluateRun(run, new Date('2026-11-26T12:00:00Z'));
  assert.equal(out.syntheticExcluded, 1);
  assert.equal(out.leaderboard[0].providerId, 'a');
  assert.equal(out.providers[0].unsupportedClaimCount, 1);
  assert.deepEqual(out.providers[0].unsupportedClaimKeys, ['invented_risk_score']);
  assert.match(out.leaderboard[0].disclaimer, /not a production reliability/i);
});

test('evaluateRun rejects missing id', () => {
  assert.throws(() => evaluateRun({ benchmarks: [bench], providers: [] }), /missing benchmark run id/);
});

test('weights sum to 1', () => {
  const s = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(s - 1) < 1e-9);
});

