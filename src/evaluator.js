import { createHash } from 'node:crypto';

/**
 * TALLYMARK independent scoring engine.
 * HTTP 200 and provider self-reported verified flags are never treated as proof.
 */

export const WEIGHTS = Object.freeze({
  accuracy: 0.5,
  completeness: 0.2,
  evidence: 0.2,
  freshness: 0.1,
});

export const FailureCode = Object.freeze({
  CORRECT: 'correct',
  INCORRECT: 'incorrect',
  MISSING_VALUE: 'missing_value',
  UNSUPPORTED_CLAIM: 'unsupported_claim',
  MISSING_EVIDENCE: 'missing_evidence',
  STALE_EVIDENCE: 'stale_evidence',
  UNAVAILABLE_SOURCE: 'unavailable_source',
  TRANSPORT_FAILURE: 'transport_failure',
  PROVIDER_SELF_REPORT_IGNORED: 'provider_self_report_ignored',
  SYNTHETIC_EXCLUDED: 'synthetic_excluded',
});

function normalize(value) {
  if (typeof value === 'string') return value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (typeof value === 'boolean') return value;
  return value;
}

export function compare(actual, expected, rule = 'exact') {
  if (actual === undefined || actual === null || actual === '') return false;
  switch (rule) {
    case 'exact':
      if (typeof expected === 'boolean') return Boolean(actual) === expected;
      return normalize(actual) === normalize(expected);
    case 'case_insensitive':
      return normalize(String(actual)) === normalize(String(expected));
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

export function hashPayload(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function nonNegative(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function evidenceValid(item) {
  return Boolean(item && item.source && item.observedAt && item.contentHash);
}

function isFresh(item, evaluatedAt, maxAgeHours) {
  if (!item?.observedAt || maxAgeHours == null) return false;
  const observed = Date.parse(item.observedAt);
  if (!Number.isFinite(observed)) return false;
  const ageMs = evaluatedAt.getTime() - observed;
  return ageMs >= 0 && ageMs <= maxAgeHours * 3600 * 1000;
}

export function scoreCase(benchmark, response, evaluatedAt = new Date()) {
  if (benchmark?.kind && String(benchmark.kind).startsWith('synthetic')) {
    return {
      caseId: benchmark.id,
      excluded: true,
      failureCode: FailureCode.SYNTHETIC_EXCLUDED,
      note: 'Synthetic controls are excluded from published real scores.',
      accuracy: null,
      completeness: null,
      evidence: null,
      freshness: null,
      overall: null,
    };
  }

  if (response?.transportError || response?.status === 'transport_failure') {
    return {
      caseId: benchmark.id,
      excluded: false,
      failureCode: FailureCode.TRANSPORT_FAILURE,
      transportError: response.transportError || response.error || true,
      accuracy: 0,
      completeness: 0,
      evidence: 0,
      freshness: 0,
      overall: 0,
      unsupportedClaimKeys: [],
      unsupportedClaimCount: 0,
      claimResults: (benchmark.claims || []).map((c) => ({
        key: c.key,
        expected: c.expected,
        actual: null,
        hit: false,
        failureCode: FailureCode.TRANSPORT_FAILURE,
      })),
    };
  }

  const claims = benchmark.claims ?? [];
  const returned = response.claims ?? response.result ?? {};
  const evidenceByClaim = response.evidence ?? {};
  const expectedKeys = new Set(claims.map((claim) => claim.key));
  const unsupportedClaimKeys = Object.keys(returned).filter((key) => !expectedKeys.has(key)).sort();
  const maxAge = benchmark.maxEvidenceAgeHours ?? response.maxEvidenceAgeHours ?? 168;
  const providerVerifiedIgnored = Boolean(response.verified || response.providerVerified);

  let correct = 0;
  let supplied = 0;
  let evidenceOk = 0;
  let freshOk = 0;
  let evidenceTotal = 0;

  const claimResults = claims.map((claim) => {
    const actual = returned[claim.key];
    const present = actual !== undefined && actual !== null && actual !== '';
    if (present) supplied += 1;

    const evidenceItems = Array.isArray(evidenceByClaim[claim.key])
      ? evidenceByClaim[claim.key]
      : evidenceByClaim[claim.key]
        ? [evidenceByClaim[claim.key]]
        : [];

    const hasValidEvidence = evidenceItems.some(evidenceValid);
    if (hasValidEvidence) evidenceOk += 1;
    evidenceTotal += 1;

    const anyFresh = evidenceItems.some((e) => isFresh(e, evaluatedAt, maxAge));
    if (anyFresh) freshOk += 1;

    const hit = compare(actual, claim.expected, claim.rule ?? 'exact');
    let failureCode = FailureCode.CORRECT;
    if (!present) failureCode = FailureCode.MISSING_VALUE;
    else if (!hit) failureCode = FailureCode.INCORRECT;
    else if (!hasValidEvidence) failureCode = FailureCode.MISSING_EVIDENCE;
    else if (evidenceItems.length && !anyFresh) failureCode = FailureCode.STALE_EVIDENCE;

    if (hit && present) correct += 1;

    return {
      key: claim.key,
      expected: claim.expected,
      actual: present ? actual : null,
      hit: hit && present,
      present,
      hasValidEvidence,
      fresh: anyFresh,
      failureCode:
        present && hit
          ? hasValidEvidence
            ? anyFresh
              ? FailureCode.CORRECT
              : FailureCode.STALE_EVIDENCE
            : FailureCode.MISSING_EVIDENCE
          : failureCode,
      rule: claim.rule ?? 'exact',
    };
  });

  const n = claims.length || 1;
  const accuracy = correct / n;
  const completeness = supplied / n;
  const evidence = evidenceOk / n;
  const freshness = evidenceTotal ? freshOk / evidenceTotal : 0;
  const overall =
    WEIGHTS.accuracy * accuracy +
    WEIGHTS.completeness * completeness +
    WEIGHTS.evidence * evidence +
    WEIGHTS.freshness * freshness;

  return {
    caseId: benchmark.id,
    excluded: false,
    accuracy,
    completeness,
    evidence,
    freshness,
    overall,
    claimResults,
    providerVerifiedIgnored,
    unsupportedClaimKeys,
    unsupportedClaimCount: unsupportedClaimKeys.length,
    failureCodes: [
      ...claimResults.map((c) => c.failureCode),
      ...(unsupportedClaimKeys.length ? [FailureCode.UNSUPPORTED_CLAIM] : []),
    ],
    latencyMs: nonNegative(response.latencyMs),
    costUsd: nonNegative(response.costUsd),
    responseHash: response.responseHash || null,
  };
}

export function evaluateRun(run, evaluatedAt = new Date()) {
  if (!run?.benchmarks?.length) throw new Error('evaluateRun: benchmarks required');
  if (!run?.id) throw new Error('evaluateRun: missing benchmark run id');

  const realBenchmarks = run.benchmarks.filter((b) => !String(b.kind || '').startsWith('synthetic'));
  const providers = run.providers ?? [];

  const providerResults = providers.map((provider) => {
    const caseScores = realBenchmarks.map((b) => {
      const response = provider.responses?.[b.id] ?? { transportError: 'no_response' };
      return scoreCase(b, response, evaluatedAt);
    });
    const active = caseScores.filter((s) => !s.excluded);
    const avg = (key) =>
      active.length ? active.reduce((a, s) => a + (Number(s[key]) || 0), 0) / active.length : 0;

    return {
      providerId: provider.id,
      providerName: provider.name ?? provider.id,
      caseScores,
      accuracy: avg('accuracy'),
      completeness: avg('completeness'),
      evidence: avg('evidence'),
      freshness: avg('freshness'),
      overall: avg('overall'),
      unsupportedClaimCount: active.reduce((sum, score) => sum + (score.unsupportedClaimCount || 0), 0),
      unsupportedClaimKeys: [...new Set(active.flatMap((score) => score.unsupportedClaimKeys || []))].sort(),
      totalCostUsd: active.reduce((a, s) => a + (s.costUsd || 0), 0),
      avgLatencyMs: (() => {
        const xs = active.map((s) => s.latencyMs).filter((x) => x != null);
        return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
      })(),
      measuredOnly: true,
      reliabilityClaim: null,
      note: 'Overall is a weighted blend of measured dimensions. Unsupported extra claim keys are reported separately and are not folded into the weighted score.',
    };
  });

  const leaderboard = [...providerResults]
    .sort((a, b) => {
      if (b.overall !== a.overall) return b.overall - a.overall;
      const ca = a.totalCostUsd ?? Infinity;
      const cb = b.totalCostUsd ?? Infinity;
      if (ca !== cb) return ca - cb;
      const la = a.avgLatencyMs ?? Infinity;
      const lb = b.avgLatencyMs ?? Infinity;
      return la - lb;
    })
    .map((p, i) => ({
      rank: i + 1,
      providerId: p.providerId,
      overall: p.overall,
      accuracy: p.accuracy,
      completeness: p.completeness,
      evidence: p.evidence,
      freshness: p.freshness,
      unsupportedClaimCount: p.unsupportedClaimCount,
      totalCostUsd: p.totalCostUsd,
      avgLatencyMs: p.avgLatencyMs,
      disclaimer: 'Rank reflects this run only. Not a production reliability certification.',
    }));

  return {
    runId: run.id,
    evaluatedAt: evaluatedAt.toISOString(),
    weights: WEIGHTS,
    realCaseCount: realBenchmarks.length,
    syntheticExcluded: run.benchmarks.length - realBenchmarks.length,
    providers: providerResults,
    leaderboard,
    responseHash: hashPayload({ runId: run.id, providers: providerResults }),
  };
}

export default { scoreCase, evaluateRun, compare, hashPayload, WEIGHTS, FailureCode };
