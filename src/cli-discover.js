import { createTelegraphAdapter } from './adapters/telegraph.js';

/**
 * Free discovery only. Does not execute paid miner requests.
 */
const adapter = createTelegraphAdapter();
const intentFilter = process.argv[2] ?? null;

console.error(`Discovering miners on ${adapter.nodeUrl} (free endpoint)...`);

let miners;
if (intentFilter) {
  miners = await adapter.discoverMiners({ intent: intentFilter, limit: 100 });
  console.error(`Filter: intent=${intentFilter}`);
} else {
  miners = await adapter.discoverMiners({ limit: 20 });
}

const summary = miners.map((m) => ({
  id: m.id,
  slug: m.slug,
  name: m.name,
  kind: m.kind,
  endpointCount: m.endpoints?.length ?? 0,
  intentsSample: (m.endpoints ?? [])
    .slice(0, 3)
    .map((e) => e.path)
    .join(', '),
}));

console.log(JSON.stringify({ node: adapter.nodeUrl, count: summary.length, miners: summary }, null, 2));
