# TALLYMARK

Independent **Telegraph Intelligence Reliability Evaluator**.

TALLYMARK scores miner answers against **independently sourced** reference records (Companies House, SEC EDGAR, etc.). It does **not** treat HTTP 200 or a miner’s self-reported “verified” flag as proof.

## Status (v1.0.0)

| Capability | Status |
|------------|--------|
| Deterministic claim scoring | Implemented |
| Evidence / freshness / cost / latency | Implemented |
| Real reference datasets (GB + US) | Implemented |
| Synthetic controls (excluded from published scores) | Implemented |
| Free discovery + capability probe | Implemented |
| x402 paid path (gated, operator-approved) | Implemented |
| First controlled paid eval ($0.23 / $0.24 ceiling) | Complete — see `reports/runs/` |
| On-protocol judgment **adapter** (safetensors LoRA) | **Not shipped** — see `docs/PROTOCOL_EVALUATOR.md` |
| New paid spends | **Blocked** without explicit operator approval |

## Install

```bash
git clone https://github.com/onchaindc/tallymark.git
cd tallymark
npm test
npm install   # optional: viem / @x402 for paid path
```

Node **≥ 20**.

## Configure

| Variable | Purpose |
|----------|---------|
| `TELEGRAPH_NODE_URL` | Default `https://devnode.telegraphprotocol.com` |
| `TELEGRAPH_PRIVATE_KEY` | Test wallet only — **never commit** |
| `TALLYMARK_OPERATOR_APPROVED=1` | Required for paid runner |
| `TALLYMARK_SPEND_CEILING_USD` | Hard aggregate miner ceiling |

Do not reuse exposed keys.

## Protocol note

`CORPORATE_REGISTRY_LOOKUP` is a **judgment** family. On-chain registration expects a **safetensors Evaluator adapter**, not deterministic WASM. See `docs/PROTOCOL_EVALUATOR.md`.

## License

MIT
