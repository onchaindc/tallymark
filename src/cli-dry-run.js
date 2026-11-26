import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createTelegraphAdapter } from './adapters/telegraph.js';
import { estimateMaxSpend } from './payment/x402.js';

/**
 * Dry-run preview for a controlled paid evaluation.
 * Shows exact requests, candidate miners, and max spend.
 * Does not execute paid requests.
 *
 * Usage:
 *   node src/cli-dry-run.js [cases.json] [capability.json] [out.json]
 */
const casesPath = process.argv[2] ?? 'fixtures/evaluation/corporate-registry-cases.json';
const capabilityPath = process.argv[3] ?? 'reports/capability/corporate-registry-lookup.json';
const outPath = process.argv[4] ?? 'reports/dry-run-corporate-registry.json';

const casesDoc = JSON.parse(await readFile(casesPath, 'utf8'));
const capabilityDoc = JSON.parse(await readFile(capabilityPath, 'utf8'));

const realCases = (casesDoc.cases ?? []).filter((c) => c.kind === 'real_reference');
const miners = capabilityDoc.capability?.miners ?? capabilityDoc.candidates ?? [];
const preferred = miners.filter((m) => m.mapping === 'code' && m.compatible === true);
const candidates = preferred.length ? preferred : miners.filter((m) => m.compatible === true);
const minerIds = candidates.map((m) => m.id);

const pricePerRequestUsd = 0.01;
const adapter = createTelegraphAdapter();

let probeChallenge = null;
try {
  const sample = realCases[0];
  if (sample) {
    probeChallenge = await adapter.probePaymentChallenge(
      casesDoc.intent ?? 'CORPORATE_REGISTRY_LOOKUP_GENERAL',
      sample.params,
    );
  }
} catch (err) {
  probeChallenge = { error: err.message };
}

const livePrice =
  probeChallenge?.challenge?.priceUsd != null ? probeChallenge.challenge.priceUsd : pricePerRequestUsd;

const preview = adapter.buildDryRunPreview({
  cases: realCases,
  minerIds,
  pricePerRequestUsd: livePrice,
  probeChallenge,
});

const spend = estimateMaxSpend({
  caseCount: realCases.length,
  minerCount: minerIds.length,
  pricePerRequestUsd: livePrice,
});

const report = {
  ...preview,
  generatedAt: new Date().toISOString(),
  candidateMiners: candidates.map((m) => ({
    id: m.id,
    slug: m.slug,
    name: m.name,
    mapping: m.mapping,
    cost_per_call: m.cost_per_call,
    compatible_endpoints: m.compatible_endpoints,
  })),
  spendEstimate: spend,
  excludedSyntheticCases: (casesDoc.cases ?? [])
    .filter((c) => c.kind !== 'real_reference')
    .map((c) => ({ id: c.id, kind: c.kind })),
  approvalGate: {
    allowPaid: false,
    operatorApproved: false,
    spendCeilingUsd: null,
    message:
      'Paid execution remains disabled. Approve a specific spendCeilingUsd (see spendEstimate.maxSpendUsd) before any ask() call.',
  },
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
console.error(`Wrote ${outPath}`);
console.error(
  `Max spend for ${spend.requests} requests × $${livePrice} = $${spend.maxSpendUsd.toFixed(2)}. No paid requests executed.`,
);
