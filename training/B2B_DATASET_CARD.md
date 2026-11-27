# B2B Identity Enrichment preference dataset

## Protocol target

- Parent adapter family: `B2B_IDENTITY_ENRICHMENT`
- Serving intent / data-gate target: `B2B_IDENTITY_ENRICHMENT_GENERAL`
- Class: hybrid
- Input field: `company`
- Scored output fields: `employee_count`, `industry`
- Training companies: 17
- Held-out companies: 3
- Generated preference pairs: 272

## Source design

The reference set uses issuer SEC filings for publicly traded companies. Employee counts are reported values from the issuer's latest available filing at collection time. Reporting dates and issuer-specific workforce definitions are retained in each reference record. Approximate counts remain approximate; the source notes identify scope differences.

Industry labels are normalized from the issuer's principal business description. They are not represented as official SEC industry codes. These labels need independent review before protocol submission.

## Pair construction

Each rejected answer changes exactly one scored field:
- `employee_count` is replaced with another company's reported workforce count; or
- `industry` is replaced with another company's normalized industry label.

The chosen answer uses the target company's two reference values. Eight prompt formulations per field produce 272 pairs from 17 training companies.

## Provenance and limitations

These are generated counterfactual preference pairs, not observed Miner transcripts, not Miner ground truth, and not human-authored preference labels. Each row is marked `source_kind=llm`, which remains unverified under Telegraph provenance rules even though the reference record links to an issuer filing.

This is a US public-company pilot, not broad global company coverage. Employee counts are not perfectly comparable across issuers: some include full-time and part-time employees, some use full-time equivalents, some include subsidiaries, and some are approximate. Industry labels are curator-normalized and need independent review.

The three held-out companies (Apple, Walmart, Berkshire Hathaway) do not appear in the preference-training source. The held-out set is a small structural split check, not a live Miner performance result.

## Rebuild

```bash
python training/build_b2b_preference_pairs.py
node --test test/b2b-heldout.test.js
```

Do not describe this corpus as independently verified preference data or as evidence of live Miner accuracy. Do not register an adapter until the official trainer, export, adapterbuild, hosted executor, and protocol verification steps all pass.
