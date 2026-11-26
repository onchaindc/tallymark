import { writeFile, mkdir } from 'node:fs/promises';
import { createTelegraphAdapter } from './adapters/telegraph.js';
import { readFile } from 'node:fs/promises';

/**
 * Free discovery + catalog probe against CORPORATE_REGISTRY / registry keywords.
 * Does not execute paid miner requests. Produces a probe report suitable for HTML.
 */
const adapter = createTelegraphAdapter();
const outPath = process.argv[2] ?? 'reports/probe-registry.json';

console.error(`Probing free catalog on ${adapter.nodeUrl}...`);

const realRef = JSON.parse(
  await readFile(new URL('../benchmarks/real/companies-house-uk.json', import.meta.url), 'utf8'),
);

let probe;
let discoverError = null;
try {
  probe = await adapter.probeRegistryCapability();
} catch (err) {
  discoverError = err.message;
  probe = { node: adapter.nodeUrl, scanned: 0, matches: [], note: `Probe failed: ${err.message}` };
}

const untestedMiners = (probe.matches ?? []).map((m) => ({
  id: m.id,
  slug: m.slug,
  name: m.name,
  reason: 'Catalog match only — paid ask not enabled; no response scored',
}));

const report = {
  evaluatedAt: new Date().toISOString(),
  mode: 'free_probe',
  resultKind: 'probe_only',
  synthetic: false,
  notice:
    'FREE DISCOVERY / PROBE ONLY. Real Companies House reference cases are listed for readiness, but no miner was paid and no provider responses were scored. Do not treat this as a reliability evaluation.',
  benchmark: {
    id: realRef.id,
    title: realRef.title,
    caseCount: realRef.cases.length,
    cases: realRef.cases.map((c) => ({
      id: c.id,
      company_number: c.company_number,
      claims: c.claims,
      reference: c.reference,
    })),
  },
  responses: [],
  probes: (probe.matches ?? []).map((m) => ({
    id: m.id,
    slug: m.slug,
    name: m.name,
    status: m.status ?? 'catalog_match',
    detail: `${m.endpointCount ?? 0} endpoints; matching: ${(m.matchingEndpoints ?? []).map((e) => e.path).join(', ') || 'keyword in catalog'}`,
  })),
  untestedMiners,
  discovery: {
    node: probe.node,
    scanned: probe.scanned,
    matchCount: (probe.matches ?? []).length,
    error: discoverError,
    note: probe.note,
  },
  referenceSources: realRef.cases.map((c) => ({
    company_number: c.company_number,
    legal_name: c.claims.find((x) => x.key === 'legal_name')?.expected,
    status: c.claims.find((x) => x.key === 'status')?.expected,
    sourceUrl: c.reference.sourceUrl,
    retrievedAt: c.reference.retrievedAt,
  })),
};

await mkdir(new URL('../reports', import.meta.url).pathname, { recursive: true }).catch(() => {});
await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
console.error(`Wrote probe report to ${outPath}`);
