#!/usr/bin/env python3
"""Build B2B identity-enrichment preference pairs from issuer-reported references.

Pairs are LLM-style counterfactuals, not observed Miner transcripts or human labels.
Employee counts retain issuer-specific scope and reporting dates in the source file.
Industry strings are normalized labels and require independent review.
"""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "benchmarks/real/b2b-identity-enrichment-v1.json"
OUTPUT = ROOT / "training/b2b-identity-enrichment-pairs.jsonl"

PROMPTS = {
    "employee_count": [
        "Enrich {company} using its latest public company information. Return employee_count and industry; prioritize the reported workforce size.",
        "For {company}, identify the latest reported number of employees and its primary industry.",
        "Build a counterparty profile for {company}. Resolve the workforce count from public issuer evidence.",
        "How large is {company}'s reported workforce, and what industry does it operate in? Return both fields.",
        "Return a company enrichment record for {company}, with particular care over employee_count.",
        "Look up {company} in public corporate disclosures and provide its employee count plus industry.",
        "A procurement team is screening {company}. Give the latest reported employee total and industry classification.",
        "Resolve the workforce size for {company} from its latest available issuer filing and include its industry.",
    ],
    "industry": [
        "Classify {company} by its primary operating industry and return employee_count too.",
        "For {company}, identify the main industry from its business description, not its stock ticker.",
        "Enrich {company} with its primary industry and latest reported workforce size.",
        "Return a counterparty profile for {company}; focus on getting the industry classification right.",
        "What business sector best describes {company}'s principal operations? Include employee_count.",
        "Use issuer business disclosures to classify {company} and report its workforce size.",
        "A vendor onboarding workflow needs {company}'s industry and employee count. Resolve both fields.",
        "Identify {company}'s primary industry from its public company profile and provide its employee count.",
    ],
}

def load_records():
    doc = json.loads(SOURCE.read_text(encoding="utf-8"))
    if doc.get("intent") != "B2B_IDENTITY_ENRICHMENT_GENERAL":
        raise SystemExit("Source intent mismatch")
    records = []
    for case in doc["cases"]:
        if case.get("split") != "train":
            raise SystemExit(f"Unexpected non-training case in source: {case.get('id')}")
        claims = {c["key"]: c["expected"] for c in case["claims"]}
        ref = case["reference"]
        records.append({
            "company": str(case["params"]["company"]),
            "employee_count": int(claims["employee_count"]),
            "industry": str(claims["industry"]),
            "url": str(ref["sourceUrl"]),
        })
    if len(records) != 17:
        raise SystemExit(f"Expected 17 training companies, found {len(records)}")
    return records

def build():
    records = load_records()
    rows = []
    for index, target in enumerate(records):
        for field in ("employee_count", "industry"):
            peers = [r for r in records if r["company"] != target["company"] and r[field] != target[field]]
            if not peers:
                raise SystemExit(f"No valid donor for {target['company']} / {field}")
            for variant, template in enumerate(PROMPTS[field]):
                donor = peers[(index + variant) % len(peers)]
                wrong = dict(target)
                wrong[field] = donor[field]
                prompt = template.format(company=target["company"])
                def render(record):
                    return (
                        f"Company: {record['company']}. "
                        f"Employee count: {record['employee_count']}. "
                        f"Industry: {record['industry']}."
                    )
                rows.append({
                    "prompt": prompt,
                    "chosen": render(target),
                    "rejected": render(wrong),
                    "label_kind": "preference_pair",
                    "provenance": {"source_kind": "llm", "source_url": target["url"]},
                })
    expected = len(records) * sum(len(v) for v in PROMPTS.values())
    if len(rows) != expected or expected != 272:
        raise SystemExit(f"Expected exactly 272 pairs, generated {len(rows)}")
    if len({row["prompt"] for row in rows}) != len(rows):
        raise SystemExit("Duplicate prompts generated")
    if any(row["chosen"] == row["rejected"] for row in rows):
        raise SystemExit("Identical preference pair generated")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    print(f"Wrote {len(rows)} pairs from {len(records)} issuer-referenced companies")
    print("Pair construction: one field changed per negative; provenance remains unverified LLM")

if __name__ == "__main__":
    build()
