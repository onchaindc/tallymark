# Telegraph protocol evaluator compatibility

## Intent class (verified live)

`CORPORATE_REGISTRY_LOOKUP_GENERAL` is registered as:

- **family:** `CORPORATE_REGISTRY_LOOKUP`
- **class:** `judgment` (not deterministic)

Evidence: `GET https://devnode.telegraphprotocol.com/engine/v1/intents/CORPORATE_REGISTRY_LOOKUP_GENERAL`

## What the protocol accepts for this family

Per Telegraph docs (Build / Train an Evaluator Adapter):

| Intent class | On-protocol scoring module |
|--------------|----------------------------|
| Deterministic | Built-in comparator (legacy custom comparator WASM no longer accepted) |
| **Judgment** | **Evaluator adapter: safetensors LoRA delta on the shared Foundation Model** |
| Hybrid | Adapter + built-in check fusion |

A **deterministic WASM binary is not the correct registration artifact** for `CORPORATE_REGISTRY_LOOKUP`. Full-model `.wasm` adapters are rejected as `legacy_full_model`.

Registration (when competing on-protocol) requires:

1. Train/export a safetensors delta (`abi: lora-v1`) via `telegraph-wasm-baseline`
2. Host package at https/ipfs URL
3. Host `wasmRunnableUrl` executor
4. `registerWasm(keccak256, wasmUrl, "CORPORATE_REGISTRY_LOOKUP", feeAddress, wasmRunnableUrl)` with adapter bond

TALLYMARK does **not** ship a trained LoRA in this release (training requires GPU, evaluation pool access, and bond). Shipping a fake `.safetensors` would be protocol-incompatible and misleading.

## What TALLYMARK provides

TALLYMARK is an **independent commercial evaluator**:

- Deterministic claim scoring against independently sourced registry records
- Failure taxonomy (incorrect / missing / stale evidence / transport failure)
- Auditable receipts, response hashes, cost and latency
- Explicit separation of measured run scores vs generalized reliability claims

This is complementary to on-protocol ranking, not a substitute registration package.

## Reproducibility

Given retained `rawResponse` + `responseHash` + case `claims` + `reference`, re-run `evaluateRun` offline for the same claim-level scores without trusting miner self-reports.

## Current evaluation material status

- Training source records: 19 (15 GB Companies House, 4 US SEC EDGAR).
- Preference pairs: 265; LLM-constructed counterfactuals with `source_kind=llm` and unverified provenance.
- Pinned trainer data gate: passed in [GitHub Actions run 45908332861](https://github.com/onchaindc/tallymark/actions/runs/45908332861).
- Held-out challenge set: six different Companies House entities in `benchmarks/heldout/corporate-registry-adversarial-v1.json`; it is structurally checked and excluded from training.
- The held-out fixture is not a live Miner evaluation and no competitive adapter accuracy is claimed.

The next on-protocol milestone is not another synthetic data expansion. It requires independently labelled Miner responses, entity- and time-held-out validation, supported GPU training, adapter packaging and hosting, and the protocol bond/registration steps. Do not register or advertise the local scorer as a judgment adapter.
