import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createTelegraphAdapter } from './adapters/telegraph.js';

/**
 * Free capability verification for CORPORATE_REGISTRY_LOOKUP_GENERAL.
 * No paid requests.
 */
const outPath = process.argv[2] ?? 'reports/capability/corporate-registry-lookup.json';
const adapter = createTelegraphAdapter();

console.error(`Verifying intent capability on ${adapter.nodeUrl} (free)...`);
const capability = await adapter.verifyCorporateRegistryCapability();

let challenge = null;
try {
  challenge = await adapter.probePaymentChallenge('CORPORATE_REGISTRY_LOOKUP_GENERAL', {
    company: '14367667',
    jurisdiction: 'GB',
  });
} catch (err) {
  challenge = { error: err.message };
}

const report = {
  generatedAt: new Date().toISOString(),
  node: adapter.nodeUrl,
  method: 'free_discovery_only',
  paidRequestsExecuted: false,
  capability,
  paymentChallengeProbe: challenge,
  summary: {
    listed_on_intent: capability.miners.length,
    explicit_capability_flag: capability.miners.filter((m) => m.explicit_intent_capability).length,
    compatible_true: capability.miners.filter((m) => m.compatible === true).length,
    code_mapping: capability.miners.filter((m) => m.mapping === 'code').length,
    llm_mapping: capability.miners.filter((m) => m.mapping === 'llm').length,
  },
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
console.error(`Wrote ${outPath}`);
