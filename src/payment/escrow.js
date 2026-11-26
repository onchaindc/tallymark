/**
 * Telegraph escrow (Sepolia) path — structure only.
 * Deposit must be performed by the operator out-of-band.
 */

export const ESCROW_OPTION = Object.freeze({
  scheme: 'escrow',
  network: 'eip155:11155111',
  payTo: '0x72a70e949362670bf8bcead24efc5b8f950aa08b',
  amount: '10000',
  priceUsd: 0.01,
});

export function isEscrowChallenge(option) {
  return (
    option &&
    option.scheme === 'escrow' &&
    option.network === ESCROW_OPTION.network &&
    String(option.payTo).toLowerCase() === ESCROW_OPTION.payTo.toLowerCase()
  );
}

export function selectBoundedPayment(accepts = []) {
  const escrow = accepts.find(isEscrowChallenge);
  if (escrow) {
    return {
      ok: true,
      scheme: 'escrow',
      option: escrow,
      perRequestNetworkFeeUsd: 0,
      bounded: true,
      note: 'Escrow: miner charge from pre-funded balance; per-ask gas ≈ 0 after deposit.',
    };
  }
  const exact = accepts.find((a) => a.scheme === 'exact' && a.network === 'eip155:84532');
  if (exact) {
    return {
      ok: true,
      scheme: 'exact',
      option: exact,
      perRequestNetworkFeeUsd: null,
      bounded: false,
      note: 'exact on Base Sepolia requires gas; set network fee ceiling separately.',
    };
  }
  return { ok: false, reason: 'no allowlisted escrow or Base exact option' };
}
