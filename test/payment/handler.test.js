import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateChallengeOption,
  selectPaymentOption,
  inspectWalletAvailability,
  estimateFeeBounds,
  ALLOWED_PAYMENT_OPTIONS,
  createPaymentHandler,
} from '../../src/payment/handler.js';

test('allowlist contains Base Sepolia exact and Sepolia escrow', () => {
  assert.ok(ALLOWED_PAYMENT_OPTIONS.some((a) => a.network === 'eip155:84532' && a.scheme === 'exact'));
  assert.ok(ALLOWED_PAYMENT_OPTIONS.some((a) => a.network === 'eip155:11155111' && a.scheme === 'escrow'));
});

test('validateChallengeOption rejects unexpected payTo', () => {
  const r = validateChallengeOption({
    scheme: 'exact',
    network: 'eip155:84532',
    payTo: '0x0000000000000000000000000000000000000001',
    amount: '10000',
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /unexpected payment option/);
});

test('validateChallengeOption accepts allowlisted option', () => {
  const r = validateChallengeOption({
    scheme: 'exact',
    network: 'eip155:84532',
    payTo: '0xC0A3FB6d3F1f4B54617d29ffbdA4663Af5F96e2e',
    amount: '10000',
    price: '$0.01',
  });
  assert.equal(r.ok, true);
  assert.equal(r.priceUsd, 0.01);
});

test('validateChallengeOption rejects amount above 10000 µUSDC', () => {
  const r = validateChallengeOption({
    scheme: 'exact',
    network: 'eip155:84532',
    payTo: '0xC0A3FB6d3F1f4B54617d29ffbdA4663Af5F96e2e',
    amount: '50000',
  });
  assert.equal(r.ok, false);
});

test('selectPaymentOption prefers escrow when present', () => {
  const challenge = {
    accepts: [
      { scheme: 'exact', network: 'eip155:84532', payTo: '0xC0A3FB6d3F1f4B54617d29ffbdA4663Af5F96e2e', amount: '10000', price: '$0.01' },
      { scheme: 'escrow', network: 'eip155:11155111', payTo: '0x72a70e949362670bf8bcead24efc5b8f950aa08b', amount: '10000', price: '$0.01' },
    ],
  };
  const s = selectPaymentOption(challenge);
  assert.equal(s.ok, true);
  assert.equal(s.validated.scheme, 'escrow');
});

test('inspectWalletAvailability reports no key in this environment', () => {
  const w = inspectWalletAvailability();
  assert.equal(w.hasKey, false);
});

test('estimateFeeBounds marks exact as unbounded and escrow as bounded', () => {
  assert.equal(estimateFeeBounds('escrow').bounded, true);
  assert.equal(estimateFeeBounds('exact').bounded, false);
});

test('createPaymentHandler without credentials rejects on call', async () => {
  const h = createPaymentHandler();
  await assert.rejects(() => h({ accepts: [] }), /no TELEGRAPH_PRIVATE_KEY|cannot sign/i);
});
