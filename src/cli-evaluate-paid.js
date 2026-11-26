/**
 * Controlled paid evaluation runner (fail-closed).
 *
 * Miner USDC ceiling: TALLYMARK_SPEND_CEILING_USD
 * Network fee ceiling: TALLYMARK_GAS_CEILING_USD (required; no unbounded bypass)
 *
 * Does not sign or pay unless an audited settlement callback is provided and
 * operator approval flags are set.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createTelegraphAdapter } from './adapters/telegraph.js';
import {
  createPaymentHandler,
  inspectWalletAvailability,
  selectPaymentOption,
} from './payment/handler.js';
import {
  createGasLedger,
  assertGasBudget,
  assertRailFeePolicy,
  recordFromReceipt,
} from './payment/gas.js';
import { selectBoundedPayment } from './payment/escrow.js';

const CEILING = Number(process.env.TALLYMARK_SPEND_CEILING_USD ?? '0');
const GAS_CEILING = Number(process.env.TALLYMARK_GAS_CEILING_USD ?? '');
const APPROVED = process.env.TALLYMARK_OPERATOR_APPROVED === '1';
const APPROVAL_TOKEN = process.env.TALLYMARK_APPROVAL_TOKEN ?? null;
const OUT = process.argv[2] ?? 'reports/runs/paid-eval-corporate-registry.json';
const ETH_USD = process.env.TALLYMARK_ETH_USD != null ? Number(process.env.TALLYMARK_ETH_USD) : null;
const GAS_ESTIMATE_USD =
  process.env.TALLYMARK_GAS_ESTIMATE_USD != null ? Number(process.env.TALLYMARK_GAS_ESTIMATE_USD) : null;

const PREFERRED_MINER_IDS = ['774921', '4433', '77393', '6164', '83159274', '1900999000'];

const casesDoc = JSON.parse(
  await readFile(new URL('../fixtures/evaluation/corporate-registry-cases.json', import.meta.url), 'utf8'),
);
const realCases = casesDoc.cases.filter((c) => c.kind === 'real_reference');

function fail(msg) {
  console.error(`PREFLIGHT FAIL: ${msg}`);
  process.exitCode = 2;
}

console.error('=== TALLYMARK paid evaluation preflight ===');
console.error(`Miner ceiling: $${CEILING}`);
console.error(`Gas ceiling: ${Number.isFinite(GAS_CEILING) ? '$' + GAS_CEILING : '(unset)'}`);

if (!APPROVED) {
  fail('TALLYMARK_OPERATOR_APPROVED=1 is required');
  process.exit(2);
}
if (!(CEILING > 0)) {
  fail('TALLYMARK_SPEND_CEILING_USD must be a positive number');
  process.exit(2);
}
if (!Number.isFinite(GAS_CEILING) || GAS_CEILING < 0) {
  fail('TALLYMARK_GAS_CEILING_USD is required (hard network-fee limit; no unbounded bypass)');
  process.exit(2);
}

const wallet = inspectWalletAvailability();
if (!wallet.hasKey) {
  const report = {
    status: 'blocked_preflight',
    reason: 'No funded test wallet credentials available',
    minerCeilingUsd: CEILING,
    gasCeilingUsd: GAS_CEILING,
    paidRequestsExecuted: false,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.error(JSON.stringify(report, null, 2));
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

const accepts = challengeProbe.challenge?.accepts || challengeProbe.challenge?.raw?.accepts || [];
const bounded = selectBoundedPayment(accepts);
if (!bounded.ok) {
  fail(bounded.reason || 'no bounded payment rail');
  process.exit(2);
}

const selected = selectPaymentOption(challengeProbe.challenge);
if (!selected.ok) {
  fail(selected.reason);
  process.exit(2);
}

let nextGasEstimate = 0;
if (bounded.scheme === 'escrow') {
  nextGasEstimate = 0;
  if (process.env.TALLYMARK_ESCROW_BALANCE_USD == null) {
    fail('Escrow rail selected but TALLYMARK_ESCROW_BALANCE_USD is unset — verify deposit before run');
    process.exit(2);
  }
  const bal = Number(process.env.TALLYMARK_ESCROW_BALANCE_USD);
  if (!(bal >= CEILING)) {
    fail(`Escrow balance $${bal} < miner ceiling $${CEILING}`);
    process.exit(2);
  }
} else if (bounded.scheme === 'exact') {
  if (!Number.isFinite(GAS_ESTIMATE_USD) || GAS_ESTIMATE_USD < 0) {
    fail('exact rail requires TALLYMARK_GAS_ESTIMATE_USD (finite pre-execution per-request gas estimate in USD)');
    process.exit(2);
  }
  nextGasEstimate = GAS_ESTIMATE_USD;
  assertRailFeePolicy({ scheme: 'exact', nextEstimateUsd: nextGasEstimate });
}

const gasLedger = createGasLedger();
assertGasBudget({
  spentGasUsd: gasLedger.totalUsd(),
  ceilingGasUsd: GAS_CEILING,
  nextEstimateUsd: nextGasEstimate,
});

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
      stopped = { reason: 'aggregate miner ceiling reached', spent, remaining };
      break;
    }
    try {
      assertGasBudget({
        spentGasUsd: gasLedger.totalUsd(),
        ceilingGasUsd: GAS_CEILING,
        nextEstimateUsd: nextGasEstimate,
      });
    } catch (e) {
      stopped = { reason: e.message, spentGasUsd: gasLedger.totalUsd() };
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
      if (out.receipt?.evmReceipt && ETH_USD != null) {
        const rec = recordFromReceipt(out.receipt.evmReceipt, { ethUsd: ETH_USD });
        if (rec.ok) gasLedger.record({ kind: 'per_request', ...rec, minerId, caseId: c.id });
        else {
          stopped = { reason: `gas receipt accounting failed: ${rec.reason}`, spent };
          results.push({ status: 'failed', minerId, caseId: c.id, error: stopped.reason });
          break;
        }
      } else if (bounded.scheme === 'exact') {
        gasLedger.record({
          kind: 'per_request_estimate',
          gasUsd: nextGasEstimate,
          minerId,
          caseId: c.id,
        });
      }
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
      if (/ceiling|budget|challenge rejected|cannot sign|settle\(\)|Network fee/i.test(err.message)) {
        stopped = { reason: err.message, spent, spentGasUsd: gasLedger.totalUsd() };
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
  gasCeilingUsd: GAS_CEILING,
  spentGasUsd: gasLedger.totalUsd(),
  escrowDepositGasUsd: gasLedger.depositUsd(),
  gasLedger: gasLedger.entries(),
  remainingUsd: CEILING - spent,
  stopped,
  walletSource: wallet.source,
  selectedPaymentOption: selected.validated,
  boundedRail: bounded,
  results,
  note:
    successful.length === 0
      ? 'No paid responses. Settlement still requires audited settle(); safety gate preserved.'
      : 'Success ≠ reliability.',
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(report, null, 2), 'utf8');
console.error(JSON.stringify({ status: report.status, spentUsd: spent, spentGasUsd: report.spentGasUsd, successes: successful.length, stopped }, null, 2));
if (successful.length === 0) process.exitCode = 2;
