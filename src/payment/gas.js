/**
 * Base Sepolia gas metering — separate from miner USDC charges.
 * Does not submit transactions. Used to record/estimate gas bounds.
 */

export function estimateGasCostUsd({ gasUsed, gasPriceWei, ethUsd }) {
  if (gasUsed == null || gasPriceWei == null || ethUsd == null) {
    return { ok: false, reason: 'missing gasUsed, gasPriceWei, or ethUsd' };
  }
  const eth = (Number(gasUsed) * Number(gasPriceWei)) / 1e18;
  const usd = eth * Number(ethUsd);
  return { ok: true, gasEth: eth, gasUsd: usd };
}

export function assertGasBudget({ spentGasUsd, ceilingGasUsd, nextEstimateUsd }) {
  if (!(ceilingGasUsd >= 0)) throw new Error('ceilingGasUsd required');
  if (spentGasUsd + nextEstimateUsd > ceilingGasUsd + 1e-9) {
    throw new Error(
      `Network fee ceiling exceeded (spentGasUsd=${spentGasUsd}, next≈${nextEstimateUsd}, ceiling=${ceilingGasUsd})`,
    );
  }
  return true;
}

export function createGasLedger() {
  const entries = [];
  return {
    record(entry) {
      entries.push({ ...entry, at: new Date().toISOString() });
    },
    totalUsd() {
      return entries.reduce((a, e) => a + (Number(e.gasUsd) || 0), 0);
    },
    entries() {
      return [...entries];
    },
  };
}
