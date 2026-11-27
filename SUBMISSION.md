# TALLYMARK — Evaluator-track submission package

## Intent correction — 27 November 2026

The previous `CORPORATE_REGISTRY_LOOKUP_GENERAL` preference corpus is legacy material only. The canonical `CORPORATE_REGISTRY_LOOKUP` intent is deterministic and comparator-only, so its LoRA training experiment is not a valid protocol Evaluator adapter and must not be submitted or registered.

The current Hybrid adapter target is `B2B_IDENTITY_ENRICHMENT` (serving child: `B2B_IDENTITY_ENRICHMENT_GENERAL`). Its scored fields are `employee_count` and `industry`, with `company` as the input. The new candidate dataset, held-out set, generator, and Kaggle notebook are documented in `training/B2B_DATASET_CARD.md` and `notebooks/tallymark_b2b_identity_training.ipynb`.

The B2B corpus is a candidate pilot: generated preference pairs have unverified LLM provenance, workforce definitions vary by issuer, and industry labels require independent review. No valid B2B adapter has yet passed training, export, packaging, hosted-executor, or protocol verification.


## Submission type

**Evaluation material and independent evaluation tooling.** This package does not claim to be a trained or registered on-protocol judgment Evaluator adapter.

## What is included

### Preference-training material

- Intent: `CORPORATE_REGISTRY_LOOKUP_GENERAL`
- 19 source entities: 15 Companies House (GB), 4 SEC EDGAR (US)
- 265 preference pairs
- Every negative changes one field and uses a donor from the same jurisdiction
- Pinned Telegraph adapter-kit data gate: PASS
- Source files:
  - `benchmarks/real/corporate-registry-v2.json`
  - `training/corporate-registry-pairs.jsonl`
  - `training/build_preference_pairs.py`
  - `training/DATASET_CARD.md`
  - `reports/dataset/preference-report.json`

### Held-out adversarial material

Six additional Companies House entities are held out by entity identifier and excluded from preference-pair generation. The cases target:
- Exact registration-number resolution
- Similar-name collisions
- Current versus former legal names
- Active registration with an active proposal to strike off

Files:
- `benchmarks/heldout/corporate-registry-adversarial-v1.json`
- `test/heldout.test.js`

The split test verifies all six held-out company numbers are absent from the preference-training source. This is a structural leakage check, not a live model-performance result.

### Independent scoring implementation

The pure-JavaScript evaluator compares returned claims with independent reference values, scores completeness/evidence/freshness, ignores provider self-verification as proof, excludes synthetic controls from real scores, and reports unsupported extra claim keys separately.

## Reproduce checks

Requirements: Node.js 20+ and Python 3.11+ for the preference-data gate.

```bash
npm test
npm run test:heldout
```

The pinned preference-data gate runs in GitHub Actions:
[Run 45908332861](https://github.com/onchaindc/tallymark/actions/runs/45908332861)

## Provenance and honest limitations

The 265 preference pairs are LLM-constructed counterfactuals. Each row uses `source_kind=llm`, which Telegraph classifies as unverified even when an official registry URL is present. They are not observed Miner transcripts and are not human-authored labels.

The current corpus covers only GB and US. The held-out set is six UK entities and has not been used to measure live Miner accuracy. The offline test suite validates software behavior, not model quality.

No LoRA has been trained, no safetensors delta or runnable executor has been produced, and no adapter has been hosted, bonded, or registered. Do not describe TALLYMARK as a registered Canonical Evaluator.

## Next protocol milestone

A competitive judgment adapter requires more than passing the data gate:
1. Obtain independently labelled, high-quality preference data and broaden jurisdiction coverage.
2. Train ModernBERT-base LoRA using the pinned Telegraph kit.
3. Pass the kit's held-out preference test and beat the length baseline by the required margin.
4. Export and check the safetensors delta against the published Foundation Model.
5. Host the package and runnable executor.
6. Complete the required bond and registration flow.

Training requires a suitable GPU for a practical run. The current environment has no confirmed GPU training capacity; no paid compute or wallet action is authorized by this repository work.
