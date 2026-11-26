# TALLYMARK

Independent Telegraph Intelligence Reliability Evaluator.

TALLYMARK evaluates specialist intelligence providers (Telegraph miners) against repeatable commercial benchmark cases. It records factual accuracy, completeness, evidence quality and provenance, freshness, latency and cost, and produces an auditable, reproducible scorecard.

It is designed to answer: **which providers actually deliver reliable intelligence**, not which providers return the most convincing prose.

## Design principles

- Reference answers carry traceable sources and timestamps (or are explicitly labelled synthetic).
- Provider responses are stored unchanged and hashed for integrity.
- Scoring is deterministic wherever objective comparison is possible.
- Missing evidence is never treated as a correct answer.
- Unsupported claims are penalised and listed.
- Provider self-`verified` flags are ignored for scoring.
- Latency and cost are reported separately; they do not substitute for correctness.
- Paid Telegraph execution is gated behind explicit spend ceilings and is off by default.

## Current scope (v0.2)

| Area | Status |
|------|--------|
| Deterministic claim scoring | Implemented |
| Evidence metadata + freshness checks | Implemented |
| Fixture-driven runs + CLI | Implemented |
| HTML scorecard | Implemented |
| Corporate-identity benchmark suite (synthetic fixtures) | Started |
| Telegraph miner discovery (free `/api/miners`) | Implemented |
| Paid ask / x402 receipt capture | **Blocked until explicit approval + spend ceiling** |
| Live independent registry ground truth | Not yet curated |

## Run

Requires Node.js 20+.

```sh
npm test
npm run evaluate:demo
npm run report:html
npm run discover                  # free miner catalog from testnet node
npm run discover -- CORPORATE_REGISTRY_LOOKUP
```

## Evaluation model

Weights (overall score):

- Accuracy — 50%
- Completeness — 20%
- Evidence quality — 20%
- Freshness — 10%

Each benchmark case defines claims with expected values and comparison rules (`exact`, `case_insensitive`, `number`, `contains`, `one_of`).

## Benchmarks

Located under `benchmarks/`:

- `company-registry-status.json` — legal name, jurisdiction, status
- `company-registry-missing.json` — negative control (non-existent record)
- `company-registry-conflict.json` — conflicting source handling

All current reference records are **synthetic** and labelled as such. Production use requires independently sourced registry evidence (e.g. Companies House, OpenCorporates, jurisdiction primary sources) with retrieval timestamps.

## Telegraph integration

Adapter: `src/adapters/telegraph.js`

- **Discovery** (free): `GET /api/miners` on `https://devnode.telegraphprotocol.com`
- **Paid execution**: intentionally not enabled. Construct with `{ allowPaid: true, spendCeilingUsd: N }` only after operator approval; the `ask` method still refuses until receipt capture is implemented and reviewed.

Relevant public intent for this domain: `CORPORATE_REGISTRY_LOOKUP` (Telegraph Legal mission set).

## Repository layout

```
src/
  evaluator.js          # deterministic scoring
  adapters/telegraph.js # discovery + gated paid path
  cli.js                # evaluate a run JSON
  cli-discover.js       # free miner discovery
  report-html.js        # static scorecard
benchmarks/             # task definitions + reference metadata
fixtures/               # synthetic runs (not live results)
test/
reports/                # generated HTML (gitignored optional)
```

## Important limitations

- Demo scores are synthetic. Do not present them as live miner performance.
- Cryptographic response hashes establish integrity of captured bytes, not truth of the underlying claim.
- No paid Telegraph requests are made by default scripts.

## License

MIT
