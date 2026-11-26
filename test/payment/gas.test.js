import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateGasCostUsd,
  assertGasBudget,
  createGasLedger,
  recordFromReceipt,
  assertRailFeePolicy,
} from '../../src/payment/gas.js';
import { selectBoundedPayment, isEscrowChallenge, ESCROW_OPTION } from '../../src/payment/escrow.js';

test('estimateGasCostUsd computes eth and usd', () => {
  const r = estimateGasCostUsd({ gasUsed: 21000, gasPriceWei: 1e9, ethUsd: 3000 });
  assert.equal(r.ok, true);
  assert.ok(r.gasUsd > 0);
});

test('estimateGasCostUsd fails closed on missing inputs', () => {
  assert.equal(estimateGasCostUsd({ gasUsed: 1, gasPriceWei: null, ethUsd: 1 }).ok, false);
});

test('assertGasBudget requires estimate and ceiling', () => {
  assert.throws(() => assertGasBudget({ spentGasUsd: 0, ceilingGasUsd: null, nextEstimateUsd: 0.01 }));
  assert.throws(() => assertGasBudget({ spentGasUsd: 0, ceilingGasUsd: 1, nextEstimateUsd: null }));
  assert.throws(() =>
    assertGasBudget({ spentGasUsd: 0.09, ceilingGasUsd: 0.1, nextEstimateUsd: 0.02 }),
  );
  assert.equal(assertGasBudget({ spentGasUsd: 0.05, ceilingGasUsd: 0.1, nextEstimateUsd: 0.02 }), true);
});

test('gas ledger separates deposit from per-request', () => {
  const l = createGasLedger();
  l.record({ kind: 'escrow_deposit', gasUsd: 1.5 });
  l.record({ kind: 'per_request', gasUsd: 0.01 });
  l.record({ kind: 'per_request', gasUsd: 0.02 });
  assert.equal(l.totalUsd(), 0.03);
  assert.equal(l.depositUsd(), 1.5);
  assert.equal(l.combinedUsd(), 1.53);
});

test('recordFromReceipt accounts confirmed gas', () => {
  const r = recordFromReceipt(
    {
      transactionHash: '0xabc',
      gasUsed: '0x5208',
      effectiveGasPrice: '0x3b9aca00',
      status: '0x1',
    },
    { ethUsd: 2000 },
  );
  assert.equal(r.ok, true);
  assert.equal(r.gasUsed, 21000);
  assert.ok(r.gasUsd > 0);
});

test('recordFromReceipt fails without ethUsd', () => {
  const r = recordFromReceipt({ gasUsed: '0x5208', effectiveGasPrice: '0x1' }, {});
  assert.equal(r.ok, false);
});

test('assertRailFeePolicy rejects exact without estimate', () => {
  assert.throws(() => assertRailFeePolicy({ scheme: 'exact', nextEstimateUsd: null }));
  assert.equal(assertRailFeePolicy({ scheme: 'exact', nextEstimateUsd: 0.01 }).ok, true);
  assert.equal(assertRailFeePolicy({ scheme: 'escrow' }).ok, true);
});

test('selectBoundedPayment prefers escrow', () => {
  const r = selectBoundedPayment([
    { scheme: 'exact', network: 'eip155:84532', payTo: '0xC0A3FB6d3F1f4B54617d29ffbdA4663Af5F96e2e', amount: '10000' },
    { ...ESCROW_OPTION },
  ]);
  assert.equal(r.scheme, 'escrow');
  assert.equal(r.bounded, true);
});

test('isEscrowChallenge strict', () => {
  assert.equal(isEscrowChallenge(ESCROW_OPTION), true);
  assert.equal(isEscrowChallenge({ ...ESCROW_OPTION, payTo: '0x0' }), false);
});
