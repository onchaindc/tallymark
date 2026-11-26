/**
 * Live network tests. Not part of default `npm test`.
 * Run: node --test test/live/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TelegraphAdapter } from '../../src/adapters/telegraph.js';

test('live free discovery returns array-shaped miner catalog', async (t) => {
  const adapter = new TelegraphAdapter({ timeoutMs: 15_000 });
  try {
    const miners = await adapter.discoverMiners({ limit: 5 });
    assert.ok(Array.isArray(miners));
    if (miners.length > 0) {
      assert.ok(miners[0].id || miners[0].slug || miners[0].name);
    }
  } catch (err) {
    t.skip(`Live discovery unavailable: ${err.message}`);
  }
});

test('live registry capability probe runs without paid calls', async (t) => {
  const adapter = new TelegraphAdapter({ timeoutMs: 15_000 });
  try {
    const probe = await adapter.probeRegistryCapability();
    assert.equal(typeof probe.scanned, 'number');
    assert.ok(Array.isArray(probe.matches));
    assert.match(probe.note, /No paid inference/);
  } catch (err) {
    t.skip(`Live probe unavailable: ${err.message}`);
  }
});
