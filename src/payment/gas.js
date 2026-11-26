/**
 * Network-fee ledger independent of miner USDC charges.
 * Fail-closed: missing estimates or unbounded rails cannot proceed.
 */

export function estimateGasCostUsd({ gasUsed, gasPriceWei, ethUsd }) {
  if (gasUsed == null || gasPriceWei == null || ethUsd == null) {
    return { ok: false, reason: 'missing gasUsed, gasPriceWei, or ethUsd' };
  }
  const eth = (Number(gasUsed) * Number(gasPriceWei)) / 1e18;
  if (!Number.isFinite(eth)) return { ok: false, reason: 'non-finite eth cost' };
  const usd = eth * Number(ethUsd);
  if (!Number.isFinite(usd)) return { ok: false, reason: 'non-finite usd cost' };
  return { ok: true, gasEth: eth, gasUsd: usd };
}

export function recordFromReceipt(receipt, opts = {}) {
  if (!receipt || typeof receipt !== 'object') {
    return { ok: false, reason: 'receipt missing' };
  }
  const gasUsed = receipt.gasUsed != null ? Number(BigInt(receipt.gasUsed)) : null;
  const gasPriceWei =
    opts.gasPriceWei != null
      ? Number(BigInt(opts.gasPriceWei))
      : receipt.effectiveGasPrice != null
        ? Number(BigInt(receipt.effectiveGasPrice))
        : opts.effectiveGasPrice != null
          ? Number(BigInt(opts.effectiveGasPrice))
          : null;
  if (gasUsed == null || gasPriceWei == null) {
    return { ok: false, reason: 'receipt missing gasUsed or gas price' };
  }
  if (opts.ethUsd == null) return { ok: false, reason: 'ethUsd required for USD accounting' };
  const cost = estimateGasCostUsd({ gasUsed, gasPriceWei, ethUsd: opts.ethUsd });
  if (!cost.ok) return cost;
  return {
    ok: true,
    txHash: receipt.transactionHash || receipt.hash || null,
    gasUsed,
    gasPriceWei,
    gasEth: cost.gasEth,
    gasUsd: cost.gasUsd,
    status: receipt.status,
  };
}

export function assertGasBudget({ spentGasUsd, ceilingGasUsd, nextEstimateUsd }) {
  if (ceilingGasUsd == null || !(Number(ceilingGasUsd) >= 0)) {
    throw new Error('ceilingGasUsd required (set TALLYMARK_GAS_CEILING_USD)');
  }
  if (nextEstimateUsd == null || !Number.isFinite(Number(nextEstimateUsd))) {
    throw new Error('nextEstimateUsd required — refuse to proceed without a fee estimate');
  }
  if (spentGasUsd + Number(nextEstimateUsd) > Number(ceilingGasUsd) + 1e-9) {
    throw new Error(
      `Network fee ceiling exceeded (spentGasUsd=${spentGasUsd}, next≈${nextEstimateUsd}, ceiling=${ceilingGasUsd})`,
    );
  }
  return true;
}

export function assertRailFeePolicy({ scheme, perRequestNetworkFeeUsd, nextEstimateUsd }) {
  if (scheme === 'escrow') {
    return { ok: true, scheme, bounded: true };
  }
  if (scheme === 'exact') {
    if (nextEstimateUsd == null || !Number.isFinite(Number(nextEstimateUsd))) {
      throw new Error(
        'exact rail requires a finite pre-execution gas estimate (nextEstimateUsd); refuse unbounded fees',
      );
    }
    return { ok: true, scheme, bounded: true, nextEstimateUsd: Number(nextEstimateUsd) };
  }
  throw new Error(`unsupported payment scheme for fee policy: ${scheme}`);
}

export function createGasLedger() {
  const entries = [];
  let spentUsd = 0;
  let depositUsd = 0;
  return {
    record(entry) {
      const row = { ...entry, at: new Date().toISOString() };
      entries.push(row);
      if (entry.kind === 'escrow_deposit') {
        depositUsd += Number(entry.gasUsd) || 0;
      } else {
        spentUsd += Number(entry.gasUsd) || 0;
      }
      return row;
    },
    totalUsd() {
      return spentUsd;
    },
    depositUsd() {
      return depositUsd;
    },
    combinedUsd() {
      return spentUsd + depositUsd;
    },
    entries() {
      return [...entries];
    },
  };
}
