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
- **Synthetic and real-reference results are never mixed in published scores.**

## Current scope (v0.3)

| Area | Status |
|------|--------|
| Deterministic claim scoring | Implemented |
| Evidence metadata + freshness checks | Implemented |
| Fixture-driven runs + CLI | Implemented |
| HTML scorecard (kind banners) | Implemented |
| Corporate-identity synthetic fixtures | Implemented (regression only) |
| Independently sourced Companies House dataset | Implemented |
| Telegraph miner discovery (free `/api/miners`) | Implemented |
| Free registry capability probe | Implemented |
| Paid ask / x402 receipt capture | **Not enabled** |
| Live scored evaluation against real CH cases | Blocked on paid path + operator approval |

## Run

Requires Node.js 20+.

```sh
npm test                 # deterministic unit tests only (no network)
npm run test:live        # optional live discovery/probe (network)
npm run evaluate:demo    # synthetic fixture scorecard
npm run report:html
npm run discover         # free miner catalog
npm run probe:registry   # free catalog probe + real CH case readiness report
npm run report:probe
```

## Evaluation model

Weights (overall score):

- Accuracy — 50%
- Completeness — 20%
- Evidence quality — 20%
- Freshness — 10%

## Benchmarks

**Synthetic (regression only)** — `benchmarks/company-registry-*.json`, `fixtures/synthetic/`

**Real reference** — `benchmarks/real/companies-house-uk.json`

Records retrieved 2026-11-26 from Companies House public pages:

| Company number | Legal name | Status | Source |
|----------------|------------|--------|--------|
| 14367667 | OPENAI UK LTD | Active | [CH](https://find-and-update.company-information.service.gov.uk/company/14367667) |
| 07386350 | DEEPMIND TECHNOLOGIES LIMITED | Active | [CH](https://find-and-update.company-information.service.gov.uk/company/07386350) |
| 04463534 | BBC COMMERCIAL LIMITED | Active | [CH](https://find-and-update.company-information.service.gov.uk/company/04463534) |
| 03877937 | THE PULVER CARR PARTNERSHIP LIMITED | Dissolved | [CH](https://find-and-update.company-information.service.gov.uk/company/03877937) |

## Telegraph integration

Adapter: `src/adapters/telegraph.js`

- **Discovery** (free): `GET /api/miners` on `https://devnode.telegraphprotocol.com`
- **Probe**: keyword scan of free catalog for registry/corporate capability
- **Paid execution**: not enabled

## License

MIT
