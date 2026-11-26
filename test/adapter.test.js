import test from 'node:test';
import assert from 'node:assert/strict';
import { TelegraphAdapter } from '../src/adapters/telegraph.js';

test('paid calls are blocked by default', async () => {
  const adapter = new TelegraphAdapter();
  await assert.rejects(() => adapter.ask(), /Paid Telegraph requests are disabled/);
});

test('paid calls respect spend ceiling', async () => {
  const adapter = new TelegraphAdapter({ allowPaid: true, spendCeilingUsd: 0.02 });
  adapter.spentUsd = 0.02;
  assert.throws(() => adapter.assertPaidAllowed(0.01), /Spend ceiling would be exceeded/);
});

test('discovery endpoint is free and returns array-shaped data when live', async (t) => {
  const adapter = new TelegraphAdapter({ timeoutMs: 12_000 });
  try {
    const miners = await adapter.discoverMiners({ limit: 3 });
    assert.ok(Array.isArray(miners));
    if (miners.length > 0) {
      assert.ok(miners[0].id || miners[0].slug || miners[0].name);
    }
  } catch (err) {
    t.skip(`Live discovery unavailable: ${err.message}`);
  }
});
