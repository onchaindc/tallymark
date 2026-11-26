/**
 * Controlled paid evaluation runner.
 *
 * Hard ceiling: aggregate Miner charges only (default $0.24).
 * Never runs without operatorApproved + credentials + bounded fee policy.
 *
 * Usage:
 *   TALLYMARK_OPERATOR_APPROVED=1 TALLYMARK_SPEND_CEILING_USD=0.24 \
 *     node src/cli-evaluate-paid.js
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createTelegraphAdapter } from './adapters/telegraph.js';
import {
  createPaymentHandler,
  inspectWalletAvailability,
  selectPaymentOption,
  estimateFeeBounds,
  ALLOWED_PAYMENT_OPTIONS,
} from './payment/handler.js';

const CEILING = Number(process.env.TALLYMARK_SPEND_CEILING_USD ?? '0.24');
const APPROVED = process.env.TALLYMARK_OPERATOR_APPROVED === '1';
const APPROVAL_TOKEN = process.env.TALLYMARK_APPROVAL_TOKEN ?? 'operator-ceiling-0.24';
const OUT = process.argv[2] ?? 'reports/runs/paid-eval-corporate-registry.json';

const PREFERRED_MINER_IDS = [
  '774921',
  '4433',
  '77393',
  '6164',
  '83159274',
  '1900999000',
];

const casesDoc = JSON.parse(
  await readFile(new URL('../fixtures/evaluation/corporate-registry-cases.json', import.meta.url), 'utf8'),
);
const realCases = casesDoc.cases.filter((c) => c.kind === 'real_reference');

function fail(msg) {
  console.error(`PREFLIGHT FAIL: ${msg}`);
  process.exitCode = 2;
}

console.error('=== TALLYMARK paid evaluation preflight ===');
console.error(`Ceiling: $${CEILING} aggregate miner charges`);
console.error(`Cases: ${realCases.length} real CH only`);
console.error(`Miners: ${PREFERRED_MINER_IDS.join(', ')}`);
console.error(`Max requests: ${realCases.length * PREFERRED_MINER_IDS.length}`);

if (!APPROVED) {
  fail('TALLYMARK_OPERATOR_APPROVED=1 is required');
  process.exit(2);
}
if (!(CEILING > 0) || CEILING > 0.24 + 1e-9) {
  if (CEILING > 0.24 + 1e-9) {
    fail(`Ceiling $${CEILING} exceeds the approved hard limit of $0.24`);
    process.exit(2);
  }
}

const wallet = inspectWalletAvailability();
console.error(`Wallet: hasKey=${wallet.hasKey} source=${wallet.source}`);
if (!wallet.hasKey) {
  const report = {
    status: 'blocked_preflight',
    reason: 'No funded test wallet credentials available in environment',
    required: [
      'Set TELEGRAPH_PRIVATE_KEY (0x-prefixed) or provide ~/.telegraph/wallet.json for a dedicated test wallet',
      'Fund wallet with testnet USDC on the chosen rail (escrow deposit preferred)',
      'For exact scheme, also fund native gas on Base Sepolia or Solana',
    ],
    approvedCeilingUsd: CEILING,
    allowedPaymentOptions: ALLOWED_PAYMENT_OPTIONS,
    preferredMiners: PREFERRED_MINER_IDS,
    realCases: realCases.map((c) => c.id),
    paidRequestsExecuted: false,
    fabricatedResponses: false,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.error(JSON.stringify(report, null, 2));
  console.error(`Wrote ${OUT}`);
  process.exit(2);
}

const probeAdapter = createTelegraphAdapter();
const sample = realCases[0];
const challengeProbe = await probeAdapter.probePaymentChallenge(
  'CORPORATE_REGISTRY_LOOKUP_GENERAL',
  sample.params,
);
if (challengeProbe.status !== 402) {
  fail(`Expected 402 challenge, got ${challengeProbe.status}`);
  process.exit(2);
}
const selected = selectPaymentOption(challengeProbe.challenge);
if (!selected.ok) {
  fail(selected.reason);
  process.exit(2);
}
const feeBounds = estimateFeeBounds(selected.validated.scheme);
console.error(`Selected scheme: ${selected.validated.scheme} network=${selected.validated.network}`);
console.error(`Fee bounds: ${JSON.stringify(feeBounds)}`);

if (!feeBounds.bounded && process.env.TALLYMARK_ALLOW_UNBOUNDED_FEES !== '1') {
  const report = {
    status: 'blocked_preflight',
    reason: 'Network fees cannot be bounded for the selected payment scheme without operator waiver',
    feeBounds,
    selectedOption: selected.validated,
    note: 'Use escrow scheme with a pre-funded deposit to bound per-request network fees to $0, or set TALLYMARK_ALLOW_UNBOUNDED_FEES=1 only after accepting gas risk outside the $0.24 miner ceiling.',
    paidRequestsExecuted: false,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.error(JSON.stringify(report, null, 2));
  process.exit(2);
}

const paymentHandler = createPaymentHandler({ remainingBudgetUsd: CEILING });

const adapter = createTelegraphAdapter({
  allowPaid: true,
  operatorApproved: true,
  spendCeilingUsd: CEILING,
  approvalToken: APPROVAL_TOKEN,
});

const results = [];
let spent = 0;
let stopped = null;

for (const minerId of PREFERRED_MINER_IDS) {
  for (const c of realCases) {
    const remaining = CEILING - spent;
    if (remaining < 0.01 - 1e-9) {
      stopped = { reason: 'aggregate ceiling reached', spent, remaining };
      break;
    }
    try {
      const out = await adapter.ask({
        intent: 'CORPORATE_REGISTRY_LOOKUP_GENERAL',
        params: c.params,
        minerId,
        paymentHandler: async (challenge) => {
          const sel = selectPaymentOption(challenge);
          if (!sel.ok) throw new Error(sel.reason);
          if (sel.priceUsd > remaining + 1e-9) {
            throw new Error(`price ${sel.priceUsd} > remaining ${remaining}`);
          }
          return paymentHandler(challenge);
        },
      });
      spent += out.costUsd;
      results.push({
        status: 'success',
        minerId,
        caseId: c.id,
        costUsd: out.costUsd,
        responseHash: out.responseHash,
        receipt: out.receipt,
        rawResponse: out.rawResponse,
      });
    } catch (err) {
      results.push({ status: 'failed', minerId, caseId: c.id, error: err.message });
      if (/ceiling|budget|challenge rejected|unexpected payment|cannot sign|settle\(\)|Payment was rejected/i.test(err.message)) {
        stopped = { reason: err.message, spent };
        break;
      }
    }
  }
  if (stopped) break;
}

const successful = results.filter((r) => r.status === 'success');
const report = {
  status: successful.length ? 'partial_or_complete' : 'blocked_or_failed',
  paidRequestsExecuted: successful.length > 0,
  spentUsd: spent,
  ceilingUsd: CEILING,
  remainingUsd: CEILING - spent,
  stopped,
  walletSource: wallet.source,
  selectedPaymentOption: selected.validated,
  feeBounds,
  results,
  note:
    successful.length === 0
      ? 'No paid responses obtained. No miner scores published.'
      : 'Scores must be derived only from successful retained responses; success ≠ reliability.',
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(report, null, 2), 'utf8');
console.error(JSON.stringify({ status: report.status, spentUsd: spent, successes: successful.length, failures: results.length - successful.length, stopped }, null, 2));
console.error(`Wrote ${OUT}`);
if (successful.length === 0) process.exitCode = 2;
