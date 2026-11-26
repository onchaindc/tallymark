# TALLYMARK

**Independent evaluation infrastructure for Telegraph intelligence providers.**

TALLYMARK measures how well Telegraph Miners answer defined commercial-intelligence requests by comparing their returned claims with independently sourced reference records. It preserves the response, evaluation inputs, provenance metadata, payment information, and per-claim outcomes so that a result can be inspected and re-scored instead of accepted on trust.

TALLYMARK is an independent evaluator and benchmarking system. It is not itself a Miner, does not provide corporate-registry data to buyers, and does not currently ship a registered on-protocol judgment Evaluator adapter.

> **Current release: v1.0.0**
>
> The independent claim-scoring engine, reference-case format, Telegraph discovery adapter, controlled x402 request path, report generation, and offline test suite are present. The on-protocol judgment adapter is not shipped. Live gas-budget enforcement and escrow funding still require additional integration and operational verification. See [Protocol compatibility](#telegraph-protocol-compatibility) and [Payment model and operational limits](#payment-model-and-operational-limits).

---

## Contents

- [Why TALLYMARK exists](#why-tallymark-exists)
- [What it evaluates](#what-it-evaluates)
- [Architecture](#architecture)
- [Evaluation lifecycle](#evaluation-lifecycle)
- [Scoring model](#scoring-model)
- [Benchmark datasets](#benchmark-datasets)
- [Evidence, provenance, and reproducibility](#evidence-provenance-and-reproducibility)
- [Telegraph integration](#telegraph-integration)
- [Payment model and operational limits](#payment-model-and-operational-limits)
- [Reports and retained artifacts](#reports-and-retained-artifacts)
- [Installation](#installation)
- [Operator workflow](#operator-workflow)
- [Project structure](#project-structure)
- [Tests](#tests)
- [Telegraph protocol compatibility](#telegraph-protocol-compatibility)
- [Known limitations and roadmap](#known-limitations-and-roadmap)
- [Security](#security)
- [License](#license)

## Evaluator-track submission

See [SUBMISSION.md](SUBMISSION.md) for the exact evaluation-material package, reproduction commands, provenance disclosures, and the remaining requirements for an on-protocol judgment adapter.

## Why TALLYMARK exists

A successful API response is not the same thing as a correct answer.

A Miner can return HTTP 200 while identifying the wrong company, omitting a registration status, returning stale information, or presenting an unsupported claim as verified. A provider's own `verified` flag is also not independent evidence.

TALLYMARK addresses this problem by separating **response collection** from **independent evaluation**:

1. Define a benchmark case and its expected claims.
2. Discover candidate Miners and inspect their declared Telegraph capabilities.
3. Collect a response for a specific Miner and case.
4. Retain the response and its associated execution metadata.
5. Compare returned claims with the benchmark's reference values.
6. Evaluate evidence presence and freshness separately from factual matching.
7. Produce per-case and per-provider results with explicit limitations.

The objective is not to declare a provider universally reliable from a small sample. It is to produce a reproducible account of what a provider returned, what matched the reference data, what did not, and what the evaluation actually measured.

## What it evaluates

The current benchmark targets:

`CORPORATE_REGISTRY_LOOKUP_GENERAL`

The benchmark checks structured corporate identity and registry claims such as:

- Legal entity name
- Registration identifier
- Jurisdiction
- Active/inactive state
- Registry status

The current real-reference training benchmark contains 19 entities (15 Companies House GB, 4 SEC EDGAR US) and is kept separate from a six-entity held-out adversarial evaluation set:

| Reference source | Jurisdiction | Cases |
|---|---:|---:|
| Companies House | United Kingdom (GB) | 15 |
| SEC EDGAR | United States (US) | 4 |
| **Training total** | | **19** |

The held-out set is `benchmarks/heldout/corporate-registry-adversarial-v1.json` and contains six different UK entities. It tests exact identifier resolution, historical legal names, similar-name collisions, and the distinction between an active registration and an active proposal to strike off. It is not included in training.

The cases include active and dissolved entities. Synthetic negative and conflict controls are maintained separately and are excluded from published real-reference scores.

The benchmark is intentionally narrower than a general corporate due-diligence assessment. A registry match does not establish beneficial ownership, sanctions status, litigation exposure, financial health, or the absence of undisclosed relationships. Those require their own reference datasets, claim definitions, and evaluation procedures.

## Architecture

TALLYMARK is organized around five functional layers.

### 1. Telegraph adapter

`src/adapters/telegraph.js` provides the integration boundary to a Telegraph node.

It currently supports:

- Miner discovery through the node's miner API.
- Intent catalogue and intent-detail inspection.
- Capability inspection for `CORPORATE_REGISTRY_LOOKUP_GENERAL`.
- Free payment-challenge probing.
- Construction of a dry-run request plan.
- A gated paid-ask method that requires explicit operator approval, a positive spend ceiling, and a payment handler.

The default node is:

`https://devnode.telegraphprotocol.com`

It can be overridden with `TELEGRAPH_NODE_URL`.

### 2. Benchmark and reference data

Benchmark cases define the request parameters, expected claims, comparison rules, jurisdiction, and reference metadata.

The evaluator does not ask the Miner to provide its own expected answer. Expected values are maintained in TALLYMARK's benchmark records and are associated with named external reference sources.

### 3. Independent scoring engine

`src/evaluator.js` contains the deterministic scoring implementation.

Its responsibilities include:

- Normalizing values before comparison where the rule permits it.
- Evaluating each expected claim.
- Identifying missing, incorrect, and unsupported extra claims.
- Reporting unsupported response keys separately without silently changing the weighted score.
- Checking whether evidence records contain required fields.
- Evaluating evidence age against a case-specific or default freshness window.
- Excluding synthetic controls from real-reference scores.
- Aggregating case-level results into provider-level metrics.
- Producing a run-specific leaderboard with an explicit non-certification disclaimer.

The scoring engine is pure JavaScript and does not require a live Telegraph connection to re-evaluate retained response data.

### 4. Payment and execution controls

The payment modules parse Telegraph HTTP 402 challenges, validate allowlisted payment options, estimate planned spend, validate receipt structure, and provide gas/escrow accounting helpers.

Paid execution is intentionally separate from free discovery and capability inspection. A paid request must not be inferred from a successful probe.

### 5. Reports and retained evidence

Evaluation output is structured JSON. The HTML report renderer presents run metadata, provider comparisons, claim-level outcomes, evidence indicators, and evaluation limitations.

A report should be treated as a view over retained evaluation data, not as a replacement for the underlying response and reference records.

### High-level data flow

```text
Telegraph node
     |
     +---- free miner discovery
     |
     +---- intent and schema inspection
     |
     +---- free capability / 402 challenge probe
     |
     v
Candidate Miner set
     |
     v
Benchmark cases ---- independently sourced references
     |
     v
Approved execution plan
     |
     +---- operator approval and spend ceiling
     |
     +---- x402 challenge validation / payment handler
     |
     v
Miner responses + execution metadata
     |
     v
Retained run evidence
     |
     v
Deterministic claim evaluator
     |
     +---- per-claim outcomes
     +---- case metrics
     +---- provider aggregates
     |
     v
JSON / HTML evaluation report
```

## Evaluation lifecycle

A complete evaluation is a sequence of distinct stages. Keeping them separate makes it possible to inspect a plan without spending funds and to re-score retained responses without repeating paid requests.

### Stage 1: Discover providers

TALLYMARK queries the Telegraph node for available Miners. Discovery results are candidate information, not proof that a Miner can successfully fulfil a particular request.

### Stage 2: Inspect the intent

The evaluator retrieves the intent definition and examines its request schema, response schema, class, lifecycle metadata, and associated Miner capability information.

For the current benchmark, the target is `CORPORATE_REGISTRY_LOOKUP_GENERAL`.

### Stage 3: Verify capability

Capability inspection checks the node's intent-level information and records compatible candidates. It is a free inspection step; it does not establish response accuracy.

### Stage 4: Build a dry-run plan

The dry-run stage combines real benchmark cases with compatible candidate Miner IDs and estimates the maximum number of requests and their expected Miner charges.

The plan records that paid execution is disabled. Synthetic controls are listed separately and are not silently added to the real evaluation set.

### Stage 5: Obtain explicit approval

Before paid execution, the operator must decide which wallet, payment rail, request set, and spend ceiling are authorized.

TALLYMARK must not interpret the existence of a private key as authorization to spend. The paid runner requires an explicit approval flag and a bounded Miner-charge ceiling. The payment challenge is also checked against the configured allowlist.

### Stage 6: Execute and retain responses

For a paid ask, the adapter first obtains a 402 payment challenge, validates the selected payment option, obtains payment material from the supplied payment handler, and submits the paid request.

A successful response is retained with fields such as:

- Miner identifier
- Benchmark case identifier
- Raw response
- Response hash
- Cost attributed to the request
- Payment receipt or receipt-shaped evidence
- Execution status and error information, where applicable

A failed request is recorded as a failure. It must not be converted into a successful answer or silently omitted from the accounting.

### Stage 7: Score offline

The scoring engine consumes benchmark definitions and retained responses. This stage does not require a new Miner request.

Each claim is compared using its declared comparison rule. Evidence and freshness are evaluated independently. Synthetic controls are excluded from real-reference aggregation.

### Stage 8: Inspect the report

The resulting report contains provider metrics and case-level results. The leaderboard ranks only the providers represented in that run. Its rank is not a general endorsement or a certification of future performance.

## Scoring model

TALLYMARK scores four dimensions in the current weighted overall metric.

| Dimension | Weight | Meaning |
|---|---:|---|
| Accuracy | 0.50 | Share of expected claims whose returned values match the benchmark |
| Completeness | 0.20 | Share of expected claims for which a value was supplied |
| Evidence | 0.20 | Share of expected claims with at least one structurally valid evidence record |
| Freshness | 0.10 | Share of expected claims with evidence inside the allowed age window |

The current overall score is:

```text
overall =
    0.50 × accuracy
  + 0.20 × completeness
  + 0.20 × evidence
  + 0.10 × freshness
```

Each dimension is normalized to the range `[0, 1]`.

### Accuracy

For each expected claim, TALLYMARK compares the returned value with the reference value using the claim's comparison rule.

Supported comparison rules in the current engine are:

- `exact`
- `case_insensitive`
- `number`
- `contains`
- `one_of`

A missing value is not a match. A provider's self-reported verification flag does not change the result.

### Completeness

Completeness measures whether the response supplied values for the expected claim keys. A supplied but incorrect value can count as present for completeness while still failing accuracy.

This distinction prevents a response that returns many incorrect values from being described as accurate simply because it is comprehensive.

### Evidence

An evidence item is currently considered structurally valid when it contains:

- `source`
- `observedAt`
- `contentHash`

Evidence is evaluated per claim. The current implementation checks for the presence of these fields; it does not independently fetch every cited source or cryptographically prove that the cited content is authentic. Evidence score must therefore be read as an evidence-record completeness measure, not a universal source-authenticity certification.

### Freshness

Freshness checks the evidence item's `observedAt` timestamp against the benchmark's `maxEvidenceAgeHours`. If the benchmark does not define a maximum, the engine currently uses a default of 168 hours.

Evidence timestamps in the future or timestamps that cannot be parsed are not treated as fresh.

### Cost and latency

Cost and latency are captured as operational metrics:

- Total cost is aggregated across scored cases.
- Average latency is calculated from available latency measurements.
- The leaderboard uses lower cost and then lower latency as tie-breakers when overall scores are equal.

**Cost and latency are not included in the current weighted overall formula.** They must be considered alongside the quality dimensions, not interpreted as components of the overall score.

### Failure taxonomy

The evaluator distinguishes conditions including:

- `correct`
- `incorrect`
- `missing_value`
- `unsupported_claim`
- `missing_evidence`
- `stale_evidence`
- `unavailable_source`
- `transport_failure`
- `provider_self_report_ignored`
- `synthetic_excluded`

A transport failure is not a successful answer. Synthetic controls are excluded rather than mixed into the real-reference leaderboard.

### Reading a leaderboard correctly

A leaderboard is a summary of one measured run over one benchmark version and one set of retained responses.

It does not establish that:

- A Miner will perform the same way on a different jurisdiction.
- A Miner will return the same result at a later date.
- A Miner is reliable across other Telegraph intents.
- A Miner has been independently audited beyond the claims and evidence represented in the run.
- A high score is a protocol-level certification.

The report therefore marks results as measured-only and avoids generalized reliability claims.

## Benchmark datasets

### Real-reference cases

The current v2 real-reference training dataset is:

`benchmarks/real/corporate-registry-v2.json`

The preference corpus is 265 LLM-constructed counterfactual pairs, explicitly marked unverified. It passes the pinned Telegraph trainer data gate, but it is not observed Miner data and does not demonstrate model quality. See [training/DATASET_CARD.md](training/DATASET_CARD.md) and [reports/dataset/preference-report.json](reports/dataset/preference-report.json).

It contains 19 training entities (15 Companies House and 4 SEC EDGAR). A separate six-entity held-out adversarial set is maintained at `benchmarks/heldout/corporate-registry-adversarial-v1.json` and is excluded from preference-pair generation. Each case includes:

- A stable case identifier.
- A jurisdiction.
- The request parameters sent to a Miner.
- A list of expected claims.
- A comparison rule for each claim.
- Reference source name and URL.
- Retrieval timestamp.
- An explicit synthetic/non-synthetic marker.
- An independent-review marker.

### Held-out adversarial evaluation

The six-entity held-out set is deliberately excluded from training. It covers historical legal names, near-name ambiguity, and status nuance. Run its structural split checks with `npm run test:heldout`. It has not yet been used to score live Miner responses.

## Synthetic controls

Synthetic negative and conflict fixtures live under:

`fixtures/synthetic/`

They are useful for testing evaluator behavior, such as how missing entities or conflicting values should be handled. They are not real company records and must not contribute to published real-reference scores.

### Dataset maintenance

Reference data is time-sensitive. A registry record can change after it is collected. New cases should be added only when the source is authoritative for the claim, the retrieval timestamp is recorded, and the expected values have been reviewed.

When expanding jurisdiction coverage, add jurisdiction-specific authoritative sources rather than assuming that one registry's fields or status semantics apply globally.

## Evidence, provenance, and reproducibility

The central evaluation artifact is the retained run data, not merely the final score.

For each provider response, TALLYMARK aims to preserve enough information to inspect the original answer and reproduce the deterministic comparison:

- Benchmark case and expected claims.
- Provider/Miner identity.
- Raw response.
- Response hash.
- Evidence records returned with the response.
- Cost and latency metadata.
- Payment receipt information, when applicable.
- Evaluation timestamp and resulting claim-level outcomes.

The scoring engine uses SHA-256 to hash JSON payloads. A response hash is an integrity identifier for the serialized payload used by the implementation; it is not, by itself, proof that the payload came from a particular Miner or that the underlying claim is true.

Given the same benchmark data, retained response data, and evaluation timestamp, the deterministic scoring logic can be run again offline. If reference data or the evaluation timestamp changes, freshness results may change and the report should identify the benchmark version used.

## Telegraph integration

The adapter uses the Telegraph node's HTTP API.

| Operation | Endpoint | Purpose |
|---|---|---|
| Miner discovery | `GET /api/miners` | Discover candidate providers |
| Intent catalogue | `GET /engine/v1/intents` | Inspect available intents |
| Intent detail | `GET /engine/v1/intents/{intentId}` | Inspect schemas and compatible Miners |
| Payment probe / ask | `POST /engine/v1/ask` | Obtain a payment challenge or submit a paid request |

The adapter uses the node's response to discover compatible Miners, but compatibility metadata is not treated as evidence of factual accuracy.

### Free and paid operations

Free operations include discovery, intent inspection, capability inspection, and payment-challenge probing. A 402 response is a payment challenge, not a completed evaluation and not proof that a Miner has answered the request.

Paid execution is a separate operation. It requires an explicit approval configuration, a spend ceiling, a supported challenge option, credentials, and a payment handler capable of returning the required payment material.

## Payment model and operational limits

TALLYMARK uses Telegraph's x402 request flow for paid Miner calls.

### Challenge validation

The payment layer parses the 402 challenge and checks the offered scheme, network, destination, amount, and price against an explicit allowlist. The currently allowlisted options include:

- Exact payment on Base Sepolia (`eip155:84532`).
- Exact payment on the configured Solana test network.
- Escrow payment on Ethereum Sepolia (`eip155:11155111`).

The selected option must match the configured allowlist. Unexpected destinations or amounts are rejected.

### Approval and spend ceiling

The paid runner requires:

- `TALLYMARK_OPERATOR_APPROVED=1`
- A positive `TALLYMARK_SPEND_CEILING_USD`
- A funded, dedicated test wallet
- A valid payment challenge
- A payment handler that can safely settle the selected option

The current runner enforces a maximum Miner-charge ceiling of $0.24 unless the code and operator policy are deliberately changed. This is a development safeguard, not a recommended production budget.

### Miner charges are not network fees

Miner charges and network fees are different cost categories.

The historical controlled Base Sepolia evaluation recorded $0.23 in Miner charges against a $0.24 ceiling. Base Sepolia network fees were outside that Miner-charge ceiling and were not metered in that run.

The repository now contains gas-estimation, gas-budget assertion, and gas-ledger helpers. These utilities have unit tests, but the gas ledger is not yet wired as a complete live enforcement layer across the paid runner.

### Escrow status

The repository contains an escrow option selector and documents the use of a pre-funded escrow balance to avoid per-request signing gas. The deposit itself must be performed and confirmed by the operator out of band.

The presence of an escrow helper does not mean that a funded escrow account has been verified or that the complete deposit-to-settlement lifecycle has been exercised in production.

### Payment receipt validation

The current receipt validator checks for required receipt-shaped fields, including scheme, network, amount, destination, and a proof-like field.

This is structural validation. It must not be described as independent on-chain settlement verification unless a separate chain-verification step has been implemented and executed.

### Historical paid evaluation

The first controlled paid corporate-registry evaluation is retained under `reports/runs/`.

Its summary records:

- 24 planned requests across six candidate Miners and four real Companies House cases.
- 19 successful paid responses and five failed requests.
- $0.19 in formal-run Miner charges.
- $0.04 in prior exploratory/canary Miner charges.
- $0.23 total Miner charges against a $0.24 ceiling.

This historical run used the earlier four-case dataset. It must not be presented as an evaluation of all eight cases in the current v2 dataset. The report also records that network fees were not included in the Miner-charge ceiling.

The results are a limited measured sample, not a reliability certification. In particular, one Miner matching the reference claims in a small sample does not establish generalized reliability.

**No new paid evaluation should be run without a new, explicit operator approval and spend ceiling.** The previously exposed test key must not be reused. Use a newly provisioned, dedicated test wallet.

## Reports and retained artifacts

Important repository artifacts include:

| Path | Purpose |
|---|---|
| `reports/runs/paid-eval-summary.json` | Summary of the first controlled paid evaluation |
| `reports/runs/paid-eval-corporate-registry.json` | Retained paid-run responses and execution results |
| `reports/capability/corporate-registry-lookup.json` | Capability inspection output |
| `reports/dry-run-corporate-registry.json` | Dry-run plan output |
| `reports/` | Generated run and capability reports |

Reports should be distributed with their benchmark version and relevant source artifacts. A leaderboard screenshot or HTML export without the underlying run evidence is not sufficient for independent reproduction.

## Installation

Requirements:

- Node.js 20 or newer.
- npm.
- Network access to the configured Telegraph node for live discovery and capability inspection.

Clone the repository and install dependencies:

```bash
git clone https://github.com/onchaindc/tallymark.git
cd tallymark
npm install
```

Run the unit suite and build check:

```bash
npm test
npm run build
```

The evaluator's core scoring logic is dependency-light JavaScript. The payment integration declares `viem`, `@x402/core`, and `@x402/evm` as optional dependencies.

## Operator workflow

The following commands separate free inspection from any paid operation.

### 1. Discover Miners

Discover candidates:

```bash
npm run discover
```

Filter discovery by intent:

```bash
node src/cli-discover.js CORPORATE_REGISTRY_LOOKUP_GENERAL
```

Discovery is a free operation.

### 2. Inspect capability

```bash
npm run capability
```

This writes the capability result to:

`reports/capability/corporate-registry-lookup.json`

It inspects the intent and candidate Miners. It does not execute paid inference.

### 3. Build a dry-run plan

After generating the capability report:

```bash
npm run dry-run
```

The dry-run writes a plan to:

`reports/dry-run-corporate-registry.json`

Review the case count, candidate Miner IDs, request count, estimated Miner charges, excluded synthetic controls, and approval gate before considering any paid run.

### 4. Configure a dedicated test wallet

The paid path reads credentials from environment variables or the optional local wallet file. Never commit private keys or paste them into source files, reports, issue trackers, or chat.

Example environment configuration:

```bash
export TELEGRAPH_NODE_URL="https://devnode.telegraphprotocol.com"
export TELEGRAPH_PRIVATE_KEY="0x<dedicated-test-wallet-private-key>"
export TALLYMARK_OPERATOR_APPROVED="1"
export TALLYMARK_SPEND_CEILING_USD="0.24"
```

The example is a configuration shape, not authorization to spend. Do not set the approval flag until a specific run and ceiling have been reviewed and approved. Use a newly created wallet; do not reuse a previously exposed key.

### 5. Paid execution

The paid runner is:

```bash
node src/cli-evaluate-paid.js
```

**Operational warning:** the paid runner is gated, and the payment-handler interface requires an audited settlement function. The default handler intentionally refuses to sign automatically when no settlement function is supplied. Do not treat the presence of the CLI or wallet credentials as proof that a live paid run is ready. Confirm the settlement implementation, selected payment rail, gas policy, escrow funding state, and output ledger before authorizing execution.

No paid request should be executed merely to test whether the command starts.

### 6. Offline scoring

The core evaluator can be used directly from JavaScript with a run object containing a run ID, benchmark cases, and provider response maps.

Example:

```js
import { evaluateRun } from './src/evaluator.js';

const run = {
  id: 'example-run-001',
  benchmarks: [
    {
      id: 'company-case-001',
      kind: 'real_reference',
      maxEvidenceAgeHours: 168,
      claims: [
        {
          key: 'legal_name',
          expected: 'EXAMPLE LIMITED',
          rule: 'case_insensitive'
        },
        {
          key: 'jurisdiction',
          expected: 'GB',
          rule: 'exact'
        }
      ]
    }
  ],
  providers: [
    {
      id: 'miner-example',
      name: 'Example Miner',
      responses: {
        'company-case-001': {
          claims: {
            legal_name: 'Example Limited',
            jurisdiction: 'GB'
          },
          evidence: {
            legal_name: [{
              source: 'Companies House',
              observedAt: new Date().toISOString(),
              contentHash: 'example-content-hash'
            }],
            jurisdiction: [{
              source: 'Companies House',
              observedAt: new Date().toISOString(),
              contentHash: 'example-content-hash'
            }]
          },
          latencyMs: 420,
          costUsd: 0.01
        }
      }
    }
  ]
};

const report = evaluateRun(run, new Date());
console.log(JSON.stringify(report, null, 2));
```

This is an illustrative evaluator input, not a live Miner result or an authoritative company record. The example demonstrates the API shape only.

## Project structure

```text
tallymark/
├── benchmarks/
│   └── real/
│       └── corporate-registry-v2.json
├── docs/
│   └── PROTOCOL_EVALUATOR.md
├── fixtures/
│   ├── evaluation/
│   │   └── corporate-registry-cases.json
│   └── synthetic/
│       └── demo-run.json
├── reports/
│   ├── capability/
│   └── runs/
├── src/
│   ├── adapters/
│   │   └── telegraph.js
│   ├── payment/
│   │   ├── escrow.js
│   │   ├── gas.js
│   │   ├── handler.js
│   │   └── x402.js
│   ├── cli.js
│   ├── cli-capability.js
│   ├── cli-discover.js
│   ├── cli-dry-run.js
│   ├── cli-evaluate-paid.js
│   ├── evaluator.js
│   └── report-html.js
└── test/
    ├── adapter.test.js
    ├── evaluator.test.js
    └── payment/
```

## Tests

The unit suite is run with:

```bash
npm test
```

The v1.0.0 release work reported 39 passing tests, including evaluator, adapter, x402, payment-handler, gas-ledger, and escrow-selection tests. The build check is:

```bash
npm run build
```

These tests validate local code paths and fixtures. They do not prove that a live payment settlement, funded escrow deposit, complete gas cap, or on-protocol adapter registration has been exercised.

## Telegraph protocol compatibility

TALLYMARK's current independent scoring engine and Telegraph's on-protocol Evaluator registration are different deliverables.

The live intent inspection recorded `CORPORATE_REGISTRY_LOOKUP_GENERAL` under the `CORPORATE_REGISTRY_LOOKUP` family as a **judgment** intent.

For this intent class, the protocol's documented registration path requires a safetensors LoRA Evaluator adapter (`abi: lora-v1`) on the shared Foundation Model, together with a hosted package, runnable executor URL, registration transaction, and adapter bond.

A deterministic local JavaScript comparator is useful for independent commercial evaluation, but it is not a substitute for that on-protocol judgment adapter. TALLYMARK v1.0.0 does not include a trained LoRA adapter and must not claim to be a registered Canonical Evaluator.

See [docs/PROTOCOL_EVALUATOR.md](docs/PROTOCOL_EVALUATOR.md) for the intent-class findings and registration requirements.

## Known limitations and roadmap

The following items are intentionally distinguished from implemented v1.0.0 functionality.

### Implemented in the independent evaluator

- Deterministic claim comparison and weighted scoring.
- Real-reference corporate registry benchmark data for GB and US.
- Synthetic controls excluded from published real scores.
- Failure taxonomy and per-claim outcomes.
- Provider-level aggregation and run-specific ranking.
- Telegraph miner discovery and intent capability inspection.
- Free payment-challenge probing and dry-run planning.
- x402 challenge parsing and allowlist validation helpers.
- Historical controlled paid-run evidence.
- Gas and escrow utility modules with unit tests.
- JSON-based evaluation artifacts and HTML report generation.

### Still requiring integration or operational proof

- Wire gas estimation, accounting, and hard gas-ceiling enforcement into every live paid execution path.
- Complete and audit the payment settlement callback used by the paid runner.
- Fund and verify the escrow deposit path before relying on escrow for larger runs.
- Independently verify on-chain settlement rather than relying only on receipt shape.
- Expand jurisdiction coverage only with authoritative reference sources and explicit field mappings.
- Refresh time-sensitive reference records on a documented cadence.
- Increase the number and diversity of real cases before making broader comparative claims.
- Train, package, host, bond, and register the safetensors LoRA adapter if pursuing on-protocol judgment Evaluator participation.

## Security

- Never commit wallet private keys, API credentials, seed phrases, or signing material.
- Use a dedicated test wallet with a limited balance.
- Do not reuse any key that has been exposed in a chat, terminal transcript, log, or repository.
- Keep paid execution disabled unless a specific run and spend ceiling have been explicitly approved.
- Treat Miner responses, evidence URLs, and provider-supplied verification flags as untrusted input.
- Review the payment challenge destination, amount, scheme, and network before signing.
- Keep Miner charges and network fees as separate accounting categories.
- Do not publish synthetic fixture scores as real-world provider performance.

## License

MIT
