# TALLYMARK

Independent Telegraph Intelligence Reliability Evaluator.

TALLYMARK evaluates specialist intelligence providers (Telegraph miners) against repeatable commercial benchmark cases. It records factual accuracy, completeness, evidence quality and provenance, freshness, latency and cost, and produces an auditable, reproducible scorecard.

## Current scope (v0.4)

| Area | Status |
|------|--------|
| Deterministic claim scoring | Implemented |
| Companies House real reference dataset | Implemented |
| Intent capability verification (free) | Implemented |
| CORPORATE_REGISTRY_LOOKUP_GENERAL discovery | Verified (30 miners listed) |
| x402 challenge parse + receipt shape checks | Implemented |
| Paid ask + receipt capture | **Implemented but disabled by default** |
| Operator approval + spend ceiling gates | Implemented |
| Dry-run spend preview | Implemented |
| Live scored evaluation | **Blocked pending explicit spend approval** |

## Intent under evaluation

Canonical intent: **`CORPORATE_REGISTRY_LOOKUP_GENERAL`** (family `CORPORATE_REGISTRY_LOOKUP`).

Request params: `company` (string, required), `jurisdiction` (string, required).  
Response fields: `legal_name`, `registration_id`, `active` (bool, scored), `jurisdiction`, `registered_address`, `incorporated`.

Discovery evidence: `GET /engine/v1/intents` and `GET /engine/v1/intents/CORPORATE_REGISTRY_LOOKUP_GENERAL` on `https://devnode.telegraphprotocol.com`. Capability is taken only from explicit intent membership — not keyword matches.

## Run

```sh
npm test                 # offline unit tests (no network)
npm run test:live        # optional live discovery
npm run capability       # free intent + miner capability report
npm run dry-run          # preview cases × miners × max spend (no payment)
npm run evaluate:demo    # synthetic fixture only
```

## Paid evaluation gate

Paid `ask()` requires **all** of:

1. `allowPaid: true`
2. `operatorApproved: true`
3. positive `spendCeilingUsd`
4. `approvalToken` (operator reference)
5. a `paymentHandler` that returns a receipt passing `validateReceiptShape`

Until you approve a specific ceiling (dry-run currently estimates **$0.24** for 4 real cases × 6 code-mapping miners at $0.01), no paid requests are sent.

## Real reference sources (Companies House)

| Number | Name | Status |
|--------|------|--------|
| 14367667 | OPENAI UK LTD | Active |
| 07386350 | DEEPMIND TECHNOLOGIES LIMITED | Active |
| 04463534 | BBC COMMERCIAL LIMITED | Active |
| 03877937 | THE PULVER CARR PARTNERSHIP LIMITED | Dissolved |

Synthetic controls (missing / conflict) are labelled and excluded from real score publication.

## License

MIT
