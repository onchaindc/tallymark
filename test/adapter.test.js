import test from 'node:test';
import assert from 'node:assert/strict';
import { TelegraphAdapter } from '../src/adapters/telegraph.js';

test('paid calls are blocked by default', async () => {
  const adapter = new TelegraphAdapter();
  await assert.rejects(() => adapter.ask({ intent: 'X', params: {} }), /disabled/i);
});

test('paid calls require operator approval', async () => {
  const adapter = new TelegraphAdapter({ allowPaid: true, spendCeilingUsd: 1 });
  await assert.rejects(() => adapter.ask({ intent: 'X', params: {} }), /Operator approval/i);
});

test('paid calls respect spend ceiling', () => {
  const adapter = new TelegraphAdapter({
    allowPaid: true,
    operatorApproved: true,
    spendCeilingUsd: 0.02,
    approvalToken: 't',
  });
  adapter.spentUsd = 0.02;
  assert.throws(() => adapter.assertPaidAllowed(0.01), /Spend ceiling would be exceeded/);
});

test('assertPaidAllowed requires positive ceiling when allowPaid', () => {
  const adapter = new TelegraphAdapter({ allowPaid: true, operatorApproved: true, spendCeilingUsd: 0 });
  assert.throws(() => adapter.assertPaidAllowed(0.01), /spendCeilingUsd must be a positive number/);
});
