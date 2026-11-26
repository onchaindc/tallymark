# Corporate registry preference dataset

## Scope

- Intent: `CORPORATE_REGISTRY_LOOKUP_GENERAL`
- Class: judgment
- Source benchmark: `benchmarks/real/corporate-registry-v2.json`
- Records: 13 real-reference entities (9 Companies House GB, 4 SEC EDGAR US)
- Pair construction: each negative changes exactly one field (legal name, registration identifier, or active indicator) using a donor from the same jurisdiction. The generator omits a field comparison when no valid same-jurisdiction donor differs on that field.
- Prompt design: five request structures and five task formulations, crossed across target records and corrupted fields.
- No paid Miner requests were made to create this dataset.

## Provenance and limitations

These are **LLM-constructed counterfactual preference pairs**, not observed Miner transcripts and not human-authored labels. Every row uses `provenance.source_kind = "llm"` deliberately. Under the current eval-pool rules this provenance is unverified, even though the linked official registry URL supports the target record. Do not relabel these rows as human-authored or source-attested.

The source set is a small controlled benchmark, not broad corporate-registry coverage. It covers Companies House (GB) and SEC EDGAR (US) only. SEC `active=true` means the entity is a current EDGAR registrant with recent filings; it is not a direct equivalent of Companies House company status. Entity-held-out evaluation is still required to detect memorisation. Additional jurisdictions and behaviours (missing fields, unsupported claims, stale records, evidence quality, ambiguous matches and former names) remain future work. Do not mix these pairs into TALLYMARK's real Miner score benchmark.

## Data integrity rules

- Donor records must share the target's jurisdiction.
- Each rejected answer changes exactly one target field.
- Duplicate prompts and identical chosen/rejected answers fail generation.
- Records remain linked to their official registry source URL.

## Gate status

The expanded corpus must pass the pinned Telegraph trainer's `float_runtime.train_adapter --check-data` in CI. Previous gate metrics from the 100-pair corpus are intentionally not copied here. Record new metrics only after the expanded dataset's official CI run completes.

## Rebuild

```bash
python training/build_preference_pairs.py
```

The generator reads the real-reference benchmark directly and writes the JSONL. All generated rows retain unverified LLM provenance.
