/**
 * Normalise both the current evaluator run contract and the older
 * benchmark + responses fixture format into evaluateRun's single input shape.
 */
export function normalizeRunInput(data) {
  if (Array.isArray(data?.benchmarks) && Array.isArray(data?.providers)) return data;

  if (!data?.benchmark || !Array.isArray(data.responses)) {
    throw new Error('Run file must contain { benchmarks, providers } or legacy { benchmark, responses }');
  }

  const benchmark = { ...data.benchmark };
  if (data.synthetic === true || data.resultKind === 'synthetic') {
    benchmark.kind = benchmark.kind ?? 'synthetic_fixture';
  }

  const expectedKeys = (benchmark.claims ?? []).map((claim) => claim.key);
  const providers = data.responses.map((response, index) => {
    const rawEvidence = response.evidence ?? {};
    let evidence = rawEvidence;
    if (Array.isArray(rawEvidence)) {
      evidence = Object.fromEntries(expectedKeys.map((key) => [
        key,
        rawEvidence.filter((item) => !item.claimKey || item.claimKey === key),
      ]));
    }

    return {
      id: String(response.providerId ?? response.id ?? `provider-${index + 1}`),
      name: response.providerName ?? response.name ?? response.providerId ?? response.id,
      responses: {
        [benchmark.id]: {
          claims: response.claims ?? response.result ?? {},
          evidence,
          latencyMs: response.latencyMs,
          costUsd: response.costUsd,
          responseHash: response.responseHash,
          verified: response.verified,
          providerVerified: response.providerVerified,
          transportError: response.transportError,
          status: response.status,
          error: response.error,
        },
      },
    };
  });

  return {
    id: data.id ?? data.runId ?? `${benchmark.id ?? 'benchmark'}-run`,
    evaluatedAt: data.evaluatedAt,
    benchmarks: [benchmark],
    providers,
  };
}
