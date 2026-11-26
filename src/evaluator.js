import { createHash } from 'node:crypto';

/**
 * Scoring weights for overall reliability score.
 * Latency and cost are reported separately and used only for ranking ties / context.
 */
const WEIGHTS = Object.freeze({
  accuracy: 0.5,
  completeness: 0.2,
  evidence: 0.2,
  freshness: 0.1,
});

function normalize(value) {
  if (typeof value === 'string') {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }
  return value;
}

/**
 * Deterministic claim comparison.
 * Missing / null / empty values never count as a match.
 */
function compare(actual, expected, rule = 'exact') {
  if (actual === undefined || actual === null || actual === '') return false;
  switch (rule) {
    case 'exact':
    case 'case_insensitive':
      return normalize(actual) === normalize(expected);
    case 'number':
      return Number.isFinite(Number(actual)) && Number(actual) === Number(expected);
    case 'contains':
      return String(actual).toLowerCase().includes(String(expected).toLowerCase());
    case 'one_of': {
      const options = Array.isArray(expected) ? expected : [expected];
      return options.some((opt) => normalize(actual) === normalize(opt));
    }
    default:
      throw new Error(`Unsupported comparison rule: ${rule}`);
  }
}

function hashPayload(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function nonNegative(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Score a single provider response against a benchmark case.
 * - Accuracy: fraction of claims that match expected values under the claim rule.
 * - Completeness: fraction of claims for which the provider supplied a non-empty value.
 * - Evidence: fraction of claims that have at least one evidence item with source + observedAt + contentHash.
 * - Freshness: fraction of evidence items whose observedAt falls within maxEvidenceAgeHours.
 * Missing evidence is never treated as correct. Provider `verified` flags are recorded but ignored for scoring.
 */
function scoreCase(benchmark, response, evaluatedAt = new Date()) {
  const claims = benchmark.claims ?? [];
  const returned = response.claims ?? {};
  let correct = 0;
  let supplied = 0;

  const claimResults = claims.map((claim) => {
    const actual = returned[claim.key];
    const present = actual !== undefined && actual !== null && actual !== '';
    if (present) supplied += 1;
    const passed = compare(actual, claim.expected, claim.rule ?? 'exact');
    if (passed) correct += 1;
    return {
      key: claim.key,
      expected: claim.expected,
      actual: present ? actual : null,
      rule: claim.rule ?? 'exact',
      status: !present ? 'missing' : passed ? 'match' : 'mismatch',
    };
  });

  const accuracy = claims.length ? correct / claims.length : 0;
  const completeness = claims.length ? supplied / claims.length : 0;

  const refs = Array.isArray(response.evidence) ? response.evidence : [];
  const evidenceValid = refs.filter(
    (item) =>
      item &&
      typeof item.source === 'string' &&
      item.source.trim() &&
      item.observedAt &&
      item.contentHash,
  ).length;
  const evidence = claims.length ? Math.min(1, evidenceValid / claims.length) : 0;

  const maxAgeHours = benchmark.maxEvidenceAgeHours ?? 24 * 30;
  const evalMs = evaluatedAt.getTime();
  const freshCount = refs.filter((item) => {
    if (!item?.observedAt) return false;
    const age = (evalMs - new Date(item.observedAt).getTime()) / 3_600_000;
    return Number.isFinite(age) && age >= 0 && age <= maxAgeHours;
  }).length;
  const freshness = refs.length ? freshCount / refs.length : 0;

  const overall =
    accuracy * WEIGHTS.accuracy +
    completeness * WEIGHTS.completeness +
    evidence * WEIGHTS.evidence +
    freshness * WEIGHTS.freshness;

  const unsupportedClaims = claimResults.filter((c) => c.status === 'mismatch' || c.status === 'missing');

  return {
    benchmarkId: benchmark.id,
    providerId: response.providerId,
    scores: {
      accuracy,
      completeness,
      evidence,
      freshness,
      overall,
    },
    claims: claimResults,
    unsupportedClaims,
    metrics: {
      latencyMs: nonNegative(response.latencyMs),
      costUsd: nonNegative(response.costUsd),
      evidenceCount: refs.length,
      evidenceWithRequiredMetadata: evidenceValid,
    },
    providerVerifiedFlagIgnored: response.verified === true,
    responseHash: hashPayload(response),
    rawResponseStored: true,
  };
}

/**
 * Evaluate a full run: multiple provider responses against one benchmark.
 * Preserves every response hash and claim-level outcome for reproducibility.
 */
function evaluateRun(benchmark, responses, evaluatedAt = new Date(), options = {}) {
  if (!benchmark?.id) {
    throw new Error('benchmark.id is required');
  }
  if (!Array.isArray(responses)) {
    throw new Error('responses must be an array');
  }

  const results = responses.map((response) => scoreCase(benchmark, response, evaluatedAt));
  const providers = [...new Set(results.map((r) => r.providerId))];

  const leaderboard = providers
    .map((providerId) => {
      const rows = results.filter((r) => r.providerId === providerId);
      const mean = (key) => rows.reduce((sum, row) => sum + row.scores[key], 0) / rows.length;
      const costs = rows.map((r) => r.metrics.costUsd).filter((v) => v !== null);
      const latencies = rows.map((r) => r.metrics.latencyMs).filter((v) => v !== null);
      return {
        providerId,
        cases: rows.length,
        scores: Object.fromEntries([...Object.keys(WEIGHTS), 'overall'].map((k) => [k, mean(k)])),
        averageCostUsd: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
        averageLatencyMs: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null,
      };
    })
    .sort(
      (a, b) =>
        b.scores.overall - a.scores.overall ||
        (a.averageCostUsd ?? Infinity) - (b.averageCostUsd ?? Infinity) ||
        (a.averageLatencyMs ?? Infinity) - (b.averageLatencyMs ?? Infinity),
    );

  return {
    benchmarkId: benchmark.id,
    evaluatedAt: evaluatedAt.toISOString(),
    mode: options.mode ?? 'fixture_or_adapter',
    results,
    leaderboard,
    weights: WEIGHTS,
    reproducibility: {
      note: 'Scores are deterministic given the same benchmark claims, response payloads, and evaluatedAt timestamp.',
      responseHashes: results.map((r) => ({ providerId: r.providerId, responseHash: r.responseHash })),
    },
  };
}

export { WEIGHTS, scoreCase, evaluateRun, hashPayload, compare, normalize };
