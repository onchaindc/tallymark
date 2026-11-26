# Corporate registry preference dataset

## Scope

- Intent: `CORPORATE_REGISTRY_LOOKUP_GENERAL`
- Class: judgment
- Source benchmark: `benchmarks/real/corporate-registry-v2.json`
- Records: 8 real-reference entities (6 Companies House, 2 SEC EDGAR)
- Pairs: 100
- Pair construction: one deliberately corrupted field per pair, selected from legal name, registration identifier, or active flag. The preferred answer is grounded in the target record; the rejected answer substitutes one field from another real benchmark record.
- Prompt design: 10 distinct request structures crossed with 10 distinct task formulations.
- No paid Miner requests were made to create this dataset.

## Provenance and limitations

These are **LLM-constructed counterfactual preference pairs**, not observed Miner transcripts and not human-authored labels. Each row uses `provenance.source_kind = "llm"` deliberately. Under the current eval-pool rules this provenance is unverified, even though the linked official registry URL supports the target record. Do not relabel these rows as human-authored or source-attested.

The corpus is a first training candidate, not a claim of broad corporate-registry coverage. It draws on only eight entities and is vulnerable to entity memorisation. Before treating an adapter as useful beyond a prototype, expand the benchmark with more independently checked companies, more jurisdictions and additional answer behaviours (missing fields, unsupported claims, stale records, evidence quality and ambiguous matches). Do not mix these pairs into TALLYMARK's real Miner score benchmark.

## Local data-gate result

Measured with the pinned `telegraphprotocol/telegraph-wasm-baseline` trainer's dataset-gate implementation and defaults (100 pairs; seed 42; 15% holdout):

| Check | Result | Threshold |
|---|---:|---:|
| Unique rejected answers | 100% | at least 80% |
| Most repeated rejected answer | 1% | at most 2% |
| Identical chosen/rejected | 0% | at most 1% |
| Length-only shortcut | 50.5% | at most 65% |
| Held-out rejected-answer leakage | 0% | at most 10% |
| Bag-of-words surface probe, five seeds | 40.0% mean | at most 65% |
| Prompt near-duplicates at 85% similarity | 0 | none expected |

The five surface-probe results were 46.7%, 50.0%, 40.0%, 33.3% and 30.0%.

The pinned trainer's official `float_runtime.train_adapter --check-data` command passed in GitHub Actions run https://github.com/onchaindc/tallymark/actions/runs/45907031587. Passing the data gate does not prove model quality or guarantee admission/competition on Telegraph. The held-out model evaluation gate still requires at least 65% pairwise accuracy and a 10-point margin over the length baseline.

## Rebuild

```bash
python training/build_preference_pairs.py
```

The generator reads the real-reference benchmark directly and writes the JSONL. The committed JSONL is the exact input intended for the pinned training kit.
