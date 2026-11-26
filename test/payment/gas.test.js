import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateGasCostUsd, assertGasBudget, createGasLedger } from '../../src/payment/gas.js';
import { selectBoundedPayment, isEscrowChallenge, ESCROW_OPTION } from '../../src/payment/escrow.js';

test('estimateGasCostUsd computes eth and usd', () => {
  const r = estimateGasCostUsd({ gasUsed: 21000, gasPriceWei: 1e9, ethUsd: 3000 });
  assert.equal(r.ok, true);
  assert.ok(r.gasUsd > 0);
});

test('assertGasBudget fail-closed', () => {
  assert.throws(
    () => assertGasBudget({ spentGasUsd: 0.09, ceilingGasUsd: 0.1, nextEstimateUsd: 0.02 }),
    /ceiling/i,
  );
  assert.equal(assertGasBudget({ spentGasUsd: 0.05, ceilingGasUsd: 0.1, nextEstimateUsd: 0.02 }), true);
});

test('gas ledger accumulates', () => {
  const l = createGasLedger();
  l.record({ gasUsd: 0.01 });
  l.record({ gasUsd: 0.02 });
  assert.equal(l.totalUsd(), 0.03);
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
