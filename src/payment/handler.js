/**
 * Real x402 payment handler for Telegraph engine asks.
 *
 * Credentials are loaded only from environment / optional wallet path.
 * Private keys are never logged, written to repo files, or included in reports.
 *
 * Supported challenge schemes (from live 402 inspection):
 * - exact on eip155:84532 (Base Sepolia) — USDC via x402 client
 * - exact on solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1 — Solana USDC
 * - escrow on eip155:11155111 (Ethereum Sepolia) — EIP-191 personal_sign auth
 *
 * Refuses to operate without explicit credentials and validated challenge fields.
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Hard allowlist from live PAYMENT-REQUIRED inspection (devnode). */
export const ALLOWED_PAYMENT_OPTIONS = Object.freeze([
  {
    scheme: 'exact',
    network: 'eip155:84532',
    payTo: '0xC0A3FB6d3F1f4B54617d29ffbdA4663Af5F96e2e',
    amount: '10000',
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    priceUsd: 0.01,
  },
  {
    scheme: 'exact',
    network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    payTo: 'G53EbeTZSNsAn7bj6iMFUQnq3zpDdEbHhKkPRywo8bix',
    amount: '10000',
    asset: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    priceUsd: 0.01,
  },
  {
    scheme: 'escrow',
    network: 'eip155:11155111',
    payTo: '0x72a70e949362670bf8bcead24efc5b8f950aa08b',
    amount: '10000',
    priceUsd: 0.01,
  },
]);

const MAX_PRICE_USD = 0.01;

export function inspectWalletAvailability() {
  const envKey = process.env.TELEGRAPH_PRIVATE_KEY || process.env.TALLYMARK_PRIVATE_KEY;
  const walletPath =
    process.env.TELEGRAPH_WALLET_PATH || join(homedir(), '.telegraph', 'wallet.json');

  if (envKey && envKey.startsWith('0x') && envKey.length >= 66) {
    return { source: 'env:TELEGRAPH_PRIVATE_KEY', hasKey: true, addressHint: null };
  }
  if (existsSync(walletPath)) {
    try {
      const raw = JSON.parse(readFileSync(walletPath, 'utf8'));
      if (raw.privateKey || raw.private_key) {
        return {
          source: `file:${walletPath}`,
          hasKey: true,
          addressHint: raw.address
            ? `${String(raw.address).slice(0, 6)}…${String(raw.address).slice(-4)}`
            : null,
        };
      }
    } catch {
      return { source: `file:${walletPath}`, hasKey: false, addressHint: null };
    }
  }
  return { source: 'none', hasKey: false, addressHint: null };
}

export function validateChallengeOption(option) {
  if (!option || typeof option !== 'object') {
    return { ok: false, reason: 'option missing' };
  }
  const scheme = option.scheme;
  const network = option.network;
  const payTo = option.payTo;
  const amount = option.amount != null ? String(option.amount) : null;

  const match = ALLOWED_PAYMENT_OPTIONS.find(
    (a) =>
      a.scheme === scheme &&
      a.network === network &&
      a.payTo.toLowerCase() === String(payTo || '').toLowerCase(),
  );
  if (!match) {
    return {
      ok: false,
      reason: `unexpected payment option scheme=${scheme} network=${network} payTo=${payTo}`,
    };
  }
  if (amount && amount !== match.amount) {
    return {
      ok: false,
      reason: `unexpected amount ${amount} (expected ${match.amount} µUSDC)`,
    };
  }
  let priceUsd = match.priceUsd;
  if (typeof option.price === 'string' && option.price.startsWith('$')) {
    priceUsd = Number(option.price.slice(1));
  }
  if (priceUsd > MAX_PRICE_USD + 1e-9) {
    return { ok: false, reason: `price $${priceUsd} exceeds max $${MAX_PRICE_USD}` };
  }
  return { ok: true, option: match, priceUsd };
}

export function selectPaymentOption(challenge) {
  const accepts = challenge?.accepts ?? challenge?.raw?.accepts ?? [];
  if (!Array.isArray(accepts) || accepts.length === 0) {
    return { ok: false, reason: 'no accepts in challenge' };
  }

  const ordered = [
    ...accepts.filter((a) => a.scheme === 'escrow'),
    ...accepts.filter((a) => a.scheme === 'exact' && a.network === 'eip155:84532'),
    ...accepts.filter((a) => a.scheme === 'exact'),
  ];

  for (const opt of ordered) {
    const v = validateChallengeOption(opt);
    if (v.ok) {
      return { ok: true, selected: opt, validated: v.option, priceUsd: v.priceUsd };
    }
  }
  return {
    ok: false,
    reason: 'no allowlisted payment option in challenge',
    inspected: accepts.map((a) => ({
      scheme: a.scheme,
      network: a.network,
      payTo: a.payTo,
      amount: a.amount,
      price: a.price,
    })),
  };
}

export function createPaymentHandler(options = {}) {
  const wallet = inspectWalletAvailability();
  const preferredScheme = options.preferredScheme ?? 'escrow';

  if (!wallet.hasKey) {
    return async function paymentHandlerMissingCredentials() {
      throw new Error(
        'Payment handler cannot sign: no TELEGRAPH_PRIVATE_KEY / TALLYMARK_PRIVATE_KEY and no ~/.telegraph/wallet.json. Provision a dedicated funded test wallet before paid evaluation.',
      );
    };
  }

  if (!options.settle) {
    return async function paymentHandlerNeedsSettleFn(challenge) {
      const sel = selectPaymentOption(challenge);
      if (!sel.ok) {
        throw new Error(`Payment challenge rejected: ${sel.reason}`);
      }
      throw new Error(
        `Wallet credentials detected (source=${wallet.source}) but no settle() function was provided. ` +
          `Refusing to sign automatically. Wire an audited x402 settle function that returns ` +
          `{ headers: { 'PAYMENT-SIGNATURE': ... }, receipt: { scheme, network, amount, payTo, ...proof } }. ` +
          `Selected option would be scheme=${sel.validated.scheme} network=${sel.validated.network} priceUsd=${sel.priceUsd}.`,
      );
    };
  }

  return async function paymentHandler(challenge) {
    const sel = selectPaymentOption(challenge);
    if (!sel.ok) {
      throw new Error(`Payment challenge rejected: ${sel.reason}`);
    }
    if (options.remainingBudgetUsd != null && sel.priceUsd > options.remainingBudgetUsd + 1e-9) {
      throw new Error(
        `Request price $${sel.priceUsd} exceeds remaining budget $${options.remainingBudgetUsd}`,
      );
    }
    const result = await options.settle({
      challenge,
      selected: sel.selected,
      validated: sel.validated,
      priceUsd: sel.priceUsd,
      preferredScheme,
    });
    if (!result?.receipt && !result?.headers) {
      throw new Error('settle() returned neither receipt nor headers');
    }
    return result;
  };
}

export function estimateFeeBounds(scheme) {
  if (scheme === 'escrow') {
    return {
      scheme,
      perRequestNetworkFeeUsd: 0,
      note: 'Escrow charges miner fee from pre-funded balance; no per-ask gas if deposit already confirmed. Deposit gas is a one-time prior cost outside this run.',
      bounded: true,
    };
  }
  if (scheme === 'exact') {
    return {
      scheme,
      perRequestNetworkFeeUsd: null,
      note: 'exact scheme requires on-chain USDC transfer (or EIP-3009 authorization) per request. Gas/native fees are network-dependent and not fixed by Telegraph. Without a measured gas price × gas limit bound from the operator wallet, fees cannot be bounded.',
      bounded: false,
    };
  }
  return { scheme, perRequestNetworkFeeUsd: null, bounded: false, note: 'unknown scheme' };
}
