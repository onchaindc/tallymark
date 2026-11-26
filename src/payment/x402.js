/**
 * x402 payment challenge parsing and receipt verification helpers.
 *
 * Does not submit payments. Used to interpret 402 challenges, estimate spend,
 * and validate receipt-shaped objects returned after a future paid ask.
 */

import { createHash } from 'node:crypto';

const USDC_DECIMALS = 6;

/**
 * Parse a 402 JSON body from Telegraph engine/v1/ask.
 * @param {object} body
 * @returns {{ accepts: object[], priceUsd: number|null, schemes: string[], networks: string[], raw: object }}
 */
export function parsePaymentChallenge(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid payment challenge body');
  }
  const accepts = Array.isArray(body.accepts) ? body.accepts : [];
  const prices = accepts
    .map((a) => {
      if (typeof a.price === 'string' && a.price.startsWith('$')) {
        return Number(a.price.slice(1));
      }
      if (a.amount != null) {
        return Number(a.amount) / 10 ** USDC_DECIMALS;
      }
      return null;
    })
    .filter((n) => Number.isFinite(n));
  const priceUsd = prices.length ? Math.max(...prices) : null;
  return {
    accepts,
    priceUsd,
    schemes: [...new Set(accepts.map((a) => a.scheme).filter(Boolean))],
    networks: [...new Set(accepts.map((a) => a.network).filter(Boolean))],
    raw: body,
  };
}

/**
 * Validate a payment receipt object structure.
 * Does not verify on-chain settlement — only shape and required fields.
 *
 * @param {object|null} receipt
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateReceiptShape(receipt) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object') {
    return { valid: false, errors: ['receipt missing or not an object'] };
  }
  if (!receipt.scheme) errors.push('receipt.scheme required');
  if (!receipt.network) errors.push('receipt.network required');
  const hasAmount = receipt.amount != null || receipt.price != null || receipt.amountUsd != null;
  if (!hasAmount) errors.push('receipt.amount, receipt.price, or receipt.amountUsd required');
  if (!receipt.payTo && !receipt.to) errors.push('receipt.payTo (or to) required');
  const hasProof = Boolean(
    receipt.txHash ||
      receipt.transactionHash ||
      receipt.authorization ||
      receipt.signature ||
      receipt.proof ||
      receipt.escrowAuth,
  );
  if (!hasProof) errors.push('receipt requires a proof field (txHash, authorization, signature, proof, or escrowAuth)');
  return { valid: errors.length === 0, errors };
}

export function hashPayload(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Estimate maximum spend for a planned evaluation batch.
 * @param {{ caseCount: number, minerCount: number, pricePerRequestUsd: number }} plan
 */
export function estimateMaxSpend({ caseCount, minerCount, pricePerRequestUsd }) {
  const requests = caseCount * minerCount;
  const maxSpendUsd = requests * pricePerRequestUsd;
  return {
    caseCount,
    minerCount,
    requests,
    pricePerRequestUsd,
    maxSpendUsd,
  };
}
