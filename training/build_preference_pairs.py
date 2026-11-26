#!/usr/bin/env python3
"""Build controlled preference pairs from independently sourced registry records.

These are LLM-constructed counterfactuals, not observed Miner transcripts or
human labels. Provenance remains source_kind=llm (unverified). Each negative
changes exactly one field and uses a donor from the same jurisdiction.
"""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "benchmarks/real/corporate-registry-v2.json"
OUTPUT = ROOT / "training/corporate-registry-pairs.jsonl"

PROMPTS = [
    "Resolve registry identifier {id} in jurisdiction {jur}.",
    "A counterparty supplied registration reference {id} ({jur}). Verify its registry identity.",
    "Look up company number {id} in the {jur} register and return the official record.",
    "For {jur} company reference {id}, confirm the registered identity and standing.",
    "Check this corporate identity: registry={jur}; reference={id}.",
]
TASKS = [
    "Return the exact legal name, registration identifier, jurisdiction and active indicator.",
    "Report the name recorded against that identifier and whether the register marks it active.",
    "Do not infer from a trading name. Give the register's legal entity name and status fields.",
    "Confirm all identity fields against the supplied registry number; flag any mismatch.",
    "Provide a concise record containing legal name, registry number, jurisdiction and active state.",
]
ANSWER_TEMPLATES = [
    "Legal name: {name}. Registration identifier: {id}. Jurisdiction: {jur}. Active: {active}.",
    "The official record identifies {name} (number {id}, jurisdiction {jur}). Active indicator: {active}.",
    "Registry match: {name} | ID {id} | {jur} | active={active}.",
    "According to the cited register, {name} is recorded under {id} in {jur}; active is {active}.",
    "Name on register: {name}\nRegistration number: {id}\nJurisdiction: {jur}\nActive: {active}",
]

def read_records():
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    records = []
    for case in source["cases"]:
        if case.get("kind") != "real_reference":
            continue
        values = {claim["key"]: claim["expected"] for claim in case["claims"]}
        records.append({
            "name": str(values["legal_name"]),
            "id": str(values["registration_id"]),
            "jur": str(values["jurisdiction"]),
            "active": bool(values["active"]),
            "url": case["reference"]["sourceUrl"],
        })
    if len(records) < 19:
        raise SystemExit(f"Expected at least 19 reviewed source records; found {len(records)}")
    return records

def build():
    records = read_records()
    by_jurisdiction = {}
    for index, record in enumerate(records):
        by_jurisdiction.setdefault(record["jur"], []).append((index, record))

    rows = []
    for index, target in enumerate(records):
        peers = [row for row in by_jurisdiction[target["jur"]] if row[0] != index]
        if not peers:
            raise SystemExit(f"No same-jurisdiction donor for {target['id']}")

        for field in ("name", "id", "active"):
            donors = [row for row in peers if row[1][field] != target[field]]
            if not donors:
                continue
            for variant in range(5):
                _, donor = donors[(index + variant) % len(donors)]
                wrong = dict(target)
                wrong[field] = donor[field]
                prompt = PROMPTS[variant].format(id=target["id"], jur=target["jur"])
                prompt += " " + TASKS[(variant + (0 if field == "name" else 1 if field == "id" else 2)) % len(TASKS)]
                template = ANSWER_TEMPLATES[(variant + index) % len(ANSWER_TEMPLATES)]
                def render(record):
                    return template.format(
                        name=record["name"], id=record["id"], jur=record["jur"],
                        active=str(record["active"]).lower(),
                    )
                rows.append({
                    "prompt": prompt,
                    "chosen": render(target),
                    "rejected": render(wrong),
                    "label_kind": "preference_pair",
                    "provenance": {"source_kind": "llm", "source_url": target["url"]},
                })

    if len(rows) < 250:
        raise SystemExit(f"Expected at least 250 pairs after same-jurisdiction filtering; found {len(rows)}")
    if len({row["prompt"] for row in rows}) != len(rows):
        raise SystemExit("Duplicate prompts generated")
    if any(row["chosen"] == row["rejected"] for row in rows):
        raise SystemExit("Identical preference pair generated")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )
    print(f"Wrote {len(rows)} preference pairs from {len(records)} real-reference records")

if __name__ == "__main__":
    build()
