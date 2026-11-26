#!/usr/bin/env python3
"""Build controlled preference pairs from TALLYMARK's real-reference benchmark.

These are counterfactual training examples, not captured miner transcripts.
The provenance is deliberately marked source_kind=llm so eval-pool admission
does not misrepresent their authorship as human or source-attested.
"""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "benchmarks/real/corporate-registry-v2.json"
OUTPUT = ROOT / "training/corporate-registry-pairs.jsonl"

PROMPT_PREFIXES = [
  "Registry check requested: locate {id} within {jur}.",
  "Identify the registered entity tied to company reference {id} in {jur}.",
  "Search the {jur} company register using this identifier: {id}.",
  "Resolve the corporate record for {id}; registry territory is {jur}.",
  "Company lookup parameters — reference {id}; jurisdiction {jur}.",
  "Please retrieve the official filing record indexed as {id} ({jur}).",
  "I am checking a counterparty's legal identity. Start with {id} in {jur}.",
  "Use {id} as the company key and {jur} as the register.",
  "Which legal entity does the register associate with {id} under {jur}?",
  "Run a registry identity check for {id}, using {jur} as the jurisdiction."
]
PROMPT_SUFFIXES = [
  "Return the registered name, number, jurisdiction and present standing.",
  "State the exact legal name and confirm whether the entity is active or dissolved.",
  "Provide the entity name plus its registration key and current status.",
  "I need the register's own classification, not an inference from the name.",
  "Include all four identity and status fields in the result.",
  "Report the legal-name match and the register's active-status indicator.",
  "Do not substitute a similarly named business; verify the identifier.",
  "Summarise the filing identity and whether the record remains current.",
  "Cross-check the number against the name and report the recorded standing.",
  "Give a concise registry result with the name, identifier and active state."
]
ANSWER_TEMPLATES = [
  "The registry entry identifies {name}. Registration identifier: {id}. Jurisdiction: {jur}. Active: {active}.",
  "Registered entity: {name}. The record number is {id}, the jurisdiction is {jur}, and the active indicator is {active}.",
  "According to the referenced register, the legal name is {name}; identifier {id}; jurisdiction {jur}; active flag {active}.",
  "I found {name} under registry number {id} in {jur}. The register records its active status as {active}.",
  "Legal entity: {name}\nCompany/registry number: {id}\nJurisdiction: {jur}\nActive: {active}",
  "The matching record is {name} ({id}, {jur}). The register records active as {active}.",
  "Registry result: {name}, reference {id}, jurisdiction {jur}. Active indicator: {active}.",
  "The official record for this lookup is {name}. It carries identifier {id} in {jur}; active is {active}.",
  "Name on register: {name}. Identifier: {id}. Jurisdiction: {jur}. Active: {active}.",
  "For {id} in {jur}, the registered name is {name}. The register's active indicator is {active}."
]
NOTES = [
  "This result describes registry identity and standing only.",
  "The status stated here is limited to the referenced register.",
  "No conclusion about ownership or financial condition is implied.",
  "The lookup concerns the entity record, not its wider counterparties.",
  "This summary reports register fields rather than a due-diligence conclusion.",
  "The response is confined to the identified registry entry.",
  "The stated status is the register's current classification.",
  "This record summary does not assess beneficial ownership.",
  "The result covers identity fields and register standing only.",
  "No inference about sanctions, solvency or control is made."
]

def claims(case):
    values = {item["key"]: item["expected"] for item in case["claims"]}
    return {
        "id": str(values["registration_id"]),
        "jur": values["jurisdiction"],
        "name": values["legal_name"],
        "active": bool(values["active"]),
        "url": case["reference"]["sourceUrl"],
    }

def render(template, record, note):
    answer = template.format(
        name=record["name"], id=record["id"], jur=record["jur"],
        active=str(record["active"]).lower(),
    )
    return answer + " " + note

def build():
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    records = [claims(case) for case in source["cases"]
               if case.get("kind") == "real_reference"]
    active = [i for i, row in enumerate(records) if row["active"]]
    dissolved = [i for i, row in enumerate(records) if not row["active"]]
    if len(records) != 8 or len(dissolved) != 1 or not active:
        raise SystemExit("Expected the reviewed eight-record benchmark with one dissolved entity")

    rows = []
    for group in range(10):
        sequence = []
        for j in range(5):
            sequence.extend([dissolved[0], active[(group * 5 + j) % len(active)]])
        donors = sequence[1:] + sequence[:1]
        for i, (target_index, donor_index) in enumerate(zip(sequence, donors)):
            target, donor = records[target_index], records[donor_index]
            field = ("name", "id", "active")[(i + group) % 3]
            wrong = dict(target)
            wrong[field] = donor[field]
            template = ANSWER_TEMPLATES[(group + i) % len(ANSWER_TEMPLATES)]
            note = NOTES[(group * 7 + i) % len(NOTES)]
            prompt = PROMPT_PREFIXES[group].format(
                id=target["id"], jur=target["jur"]
            ) + " " + PROMPT_SUFFIXES[i]
            rows.append({
                "prompt": prompt,
                "chosen": render(template, target, note),
                "rejected": render(template, wrong, note),
                "label_kind": "preference_pair",
                "provenance": {
                    "source_kind": "llm",
                    "source_url": target["url"],
                },
            })
    if len(rows) != 100 or len({row["prompt"] for row in rows}) != 100:
        raise SystemExit("Expected 100 unique prompts")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )
    print(f"Wrote {len(rows)} preference pairs to {OUTPUT}")

if __name__ == "__main__":
    build()
