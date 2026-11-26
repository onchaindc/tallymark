import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePaymentChallenge,
  validateReceiptShape,
  estimateMaxSpend,
  hashPayload,
} from '../../src/payment/x402.js';
import { TelegraphAdapter } from '../../src/adapters/telegraph.js';

const sample402 = {
  error: 'payment required',
  accepts: [
    { scheme: 'exact', price: '$0.01', network: 'eip155:84532', payTo: '0xabc' },
    { scheme: 'escrow', price: '$0.01', network: 'eip155:11155111', payTo: '0xdef' },
  ],
};

test('parsePaymentChallenge extracts price and schemes', () => {
  const c = parsePaymentChallenge(sample402);
  assert.equal(c.priceUsd, 0.01);
  assert.ok(c.schemes.includes('exact'));
  assert.ok(c.schemes.includes('escrow'));
});

test('parsePaymentChallenge rejects invalid body', () => {
  assert.throws(() => parsePaymentChallenge(null), /Invalid payment challenge/);
});

test('validateReceiptShape rejects missing receipt', () => {
  const r = validateReceiptShape(null);
  assert.equal(r.valid, false);
  assert.ok(r.errors.length > 0);
});

test('validateReceiptShape rejects incomplete receipt', () => {
  const r = validateReceiptShape({ scheme: 'exact' });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('network')));
  assert.ok(r.errors.some((e) => e.includes('amount') || e.includes('price')));
});

test('validateReceiptShape accepts complete receipt shape', () => {
  const r = validateReceiptShape({
    scheme: 'exact',
    network: 'eip155:84532',
    amount: '10000',
    payTo: '0xabc',
    txHash: '0xdeadbeef',
  });
  assert.equal(r.valid, true);
  assert.equal(r.errors.length, 0);
});

test('estimateMaxSpend multiplies cases × miners × price', () => {
  const e = estimateMaxSpend({ caseCount: 4, minerCount: 6, pricePerRequestUsd: 0.01 });
  assert.equal(e.requests, 24);
  assert.equal(e.maxSpendUsd, 0.24);
});

test('hashPayload is deterministic', () => {
  assert.equal(hashPayload({ a: 1 }), hashPayload({ a: 1 }));
  assert.notEqual(hashPayload({ a: 1 }), hashPayload({ a: 2 }));
});

test('ask is rejected without allowPaid', async () => {
  const adapter = new TelegraphAdapter();
  await assert.rejects(() => adapter.ask({ intent: 'X', params: {} }), /disabled/i);
});

test('ask is rejected without operatorApproved', async () => {
  const adapter = new TelegraphAdapter({ allowPaid: true, spendCeilingUsd: 1 });
  await assert.rejects(() => adapter.ask({ intent: 'X', params: {} }), /Operator approval/i);
});

test('ask is rejected when spend ceiling exceeded', () => {
  const adapter = new TelegraphAdapter({
    allowPaid: true,
    operatorApproved: true,
    spendCeilingUsd: 0.02,
    approvalToken: 'test-approval',
  });
  adapter.spentUsd = 0.02;
  assert.throws(() => adapter.assertPaidAllowed(0.01), /Spend ceiling would be exceeded/);
});

test('ask is rejected without paymentHandler even when approved', async () => {
  const adapter = new TelegraphAdapter({
    allowPaid: true,
    operatorApproved: true,
    spendCeilingUsd: 1,
    approvalToken: 'test-approval',
  });
  await assert.rejects(
    () => adapter.ask({ intent: 'CORPORATE_REGISTRY_LOOKUP_GENERAL', params: { company: '1', jurisdiction: 'GB' } }),
    /paymentHandler is required/i,
  );
});

test('ask rejects invalid receipt from paymentHandler', async () => {
  const adapter = new TelegraphAdapter({
    allowPaid: true,
    operatorApproved: true,
    spendCeilingUsd: 1,
    approvalToken: 'test-approval',
  });
  adapter.probePaymentChallenge = async () => ({
    status: 402,
    challenge: parsePaymentChallenge(sample402),
  });
  await assert.rejects(
    () =>
      adapter.ask({
        intent: 'CORPORATE_REGISTRY_LOOKUP_GENERAL',
        params: { company: '1', jurisdiction: 'GB' },
        paymentHandler: async () => ({ receipt: { scheme: 'exact' } }),
      }),
    /Invalid payment receipt/i,
  );
});

test('dry-run preview does not enable paid mode', () => {
  const adapter = new TelegraphAdapter();
  const preview = adapter.buildDryRunPreview({
    cases: [{ id: 'c1', params: { company: '1', jurisdiction: 'GB' }, claims: [] }],
    minerIds: ['9002', '302'],
    pricePerRequestUsd: 0.01,
  });
  assert.equal(preview.paidRequestsExecuted, false);
  assert.equal(preview.requests, 2);
  assert.equal(preview.maxSpendUsd, 0.02);
  assert.equal(preview.operatorApprovalRequired, true);
});
