/**
 * Telegraph provider adapter.
 *
 * Discovery and schema inspection are free.
 * Paid execution (engine/v1/ask, x402) is gated:
 * never call paid endpoints without explicit operator approval and spend ceiling.
 *
 * Live node (testnet): https://devnode.telegraphprotocol.com
 */

import { createHash } from 'node:crypto';
import { parsePaymentChallenge, validateReceiptShape, hashPayload } from '../payment/x402.js';

const DEFAULT_NODE = process.env.TELEGRAPH_NODE_URL ?? 'https://devnode.telegraphprotocol.com';

export class TelegraphAdapter {
  /**
   * @param {object} options
   * @param {string} [options.nodeUrl]
   * @param {number} [options.timeoutMs]
   * @param {boolean} [options.allowPaid]
   * @param {number} [options.spendCeilingUsd]
   * @param {boolean} [options.operatorApproved]
   * @param {string} [options.approvalToken]
   */
  constructor(options = {}) {
    this.nodeUrl = (options.nodeUrl ?? DEFAULT_NODE).replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.allowPaid = options.allowPaid === true;
    this.operatorApproved = options.operatorApproved === true;
    this.approvalToken = options.approvalToken ?? null;
    this.spendCeilingUsd = Number(options.spendCeilingUsd) || 0;
    this.spentUsd = 0;
    this.ledger = [];
  }

  async #get(path) {
    const url = `${this.nodeUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Telegraph GET ${path} failed: ${res.status} ${body.slice(0, 200)}`);
      }
      return res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async #post(path, body, headers = {}) {
    const url = `${this.nodeUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text };
      }
      return { status: res.status, headers: res.headers, json, text };
    } finally {
      clearTimeout(timer);
    }
  }

  async discoverMiners(query = {}) {
    const params = new URLSearchParams();
    if (query.intent) params.set('intent', query.intent);
    if (query.limit) params.set('limit', String(query.limit));
    if (query.status) params.set('status', query.status);
    const qs = params.toString();
    const path = `/api/miners${qs ? `?${qs}` : ''}`;
    const data = await this.#get(path);
    return Array.isArray(data) ? data : data?.miners ?? data?.data ?? [];
  }

  async listIntents() {
    return this.#get('/engine/v1/intents');
  }

  async getIntent(intentId) {
    if (!intentId) throw new Error('intentId required');
    return this.#get(`/engine/v1/intents/${encodeURIComponent(intentId)}`);
  }

  async verifyCorporateRegistryCapability() {
    const intentId = 'CORPORATE_REGISTRY_LOOKUP_GENERAL';
    const detail = await this.getIntent(intentId);
    const miners = (detail.miners ?? []).map((m) => ({
      id: String(m.id),
      slug: m.slug,
      name: m.name,
      compatible: m.compatible,
      compatibility_reason: m.compatibility_reason ?? null,
      mapping: m.mapping ?? null,
      cost_per_call: m.cost_per_call ?? null,
      compatible_endpoints: m.compatible_endpoints ?? [],
      explicit_intent_capability: Array.isArray(m.capabilities)
        ? m.capabilities.includes(intentId)
        : null,
      discovery_source: `GET /engine/v1/intents/${intentId}`,
    }));
    return {
      intent_id: detail.intent_id,
      family: detail.family,
      class: detail.class,
      lifecycle: detail.lifecycle,
      request_schema: detail.request,
      response_schema: detail.response,
      onchain: detail.onchain,
      miner_count: detail.miner_count ?? miners.length,
      miners,
      paidRequestsExecuted: false,
    };
  }

  async probePaymentChallenge(intent, params) {
    const { status, json } = await this.#post('/engine/v1/ask', { intent, params });
    if (status !== 402) {
      return {
        status,
        unexpected: true,
        body: json,
        note: 'Expected HTTP 402 payment challenge; no payment was submitted.',
      };
    }
    const challenge = parsePaymentChallenge(json);
    return {
      status: 402,
      challenge,
      note: 'Payment challenge only. No payment was submitted and no inference was executed.',
    };
  }

  assertPaidAllowed(estimatedCostUsd = 0.01) {
    if (!this.allowPaid) {
      throw new Error(
        'Paid Telegraph requests are disabled. Construct TelegraphAdapter with { allowPaid: true, operatorApproved: true, spendCeilingUsd: N, approvalToken } after explicit operator approval.',
      );
    }
    if (!this.operatorApproved) {
      throw new Error(
        'Operator approval required. Set operatorApproved: true and supply approvalToken after an explicit spend ceiling approval.',
      );
    }
    if (this.spendCeilingUsd <= 0) {
      throw new Error('spendCeilingUsd must be a positive number when paid execution is enabled.');
    }
    if (this.spentUsd + estimatedCostUsd > this.spendCeilingUsd + 1e-9) {
      throw new Error(
        `Spend ceiling would be exceeded (spent=${this.spentUsd}, request≈${estimatedCostUsd}, ceiling=${this.spendCeilingUsd}).`,
      );
    }
  }

  async ask({ intent, params, minerId, paymentHandler }) {
    this.assertPaidAllowed(0.01);

    if (typeof paymentHandler !== 'function') {
      throw new Error(
        'paymentHandler is required for paid ask. Provide a function that settles the 402 challenge and returns payment proof. No paid request was sent.',
      );
    }

    const challengeRes = await this.probePaymentChallenge(intent, params);
    if (challengeRes.status !== 402 || !challengeRes.challenge) {
      throw new Error(`Expected 402 challenge before payment; got status=${challengeRes.status}`);
    }
    const estimated = challengeRes.challenge.priceUsd ?? 0.01;
    this.assertPaidAllowed(estimated);

    const paymentResult = await paymentHandler(challengeRes.challenge);
    const receipt = paymentResult?.receipt ?? paymentResult;
    const shape = validateReceiptShape(receipt);
    if (!shape.valid) {
      throw new Error(`Invalid payment receipt: ${shape.errors.join('; ')}`);
    }

    const paymentHeaders = paymentResult?.headers ?? {};
    const body = { intent, params };
    if (minerId) body.miner_id = minerId;

    const paid = await this.#post('/engine/v1/ask', body, paymentHeaders);
    if (paid.status === 402) {
      throw new Error('Payment was rejected or not accepted; server still returned 402.');
    }
    if (paid.status < 200 || paid.status >= 300) {
      throw new Error(`Paid ask failed: HTTP ${paid.status} ${String(paid.text).slice(0, 200)}`);
    }

    const rawResponse = paid.json;
    const responseHash = hashPayload(rawResponse);
    this.spentUsd += estimated;
    const entry = {
      at: new Date().toISOString(),
      intent,
      params,
      minerId: minerId ?? null,
      costUsd: estimated,
      responseHash,
      receipt,
      approvalToken: this.approvalToken,
    };
    this.ledger.push(entry);

    return {
      rawResponse,
      responseHash,
      costUsd: estimated,
      receipt,
      ledgerEntry: entry,
    };
  }

  buildDryRunPreview({ cases, minerIds, pricePerRequestUsd = 0.01, probeChallenge = null }) {
    const caseCount = cases.length;
    const minerCount = minerIds.length;
    const requests = caseCount * minerCount;
    const maxSpendUsd = requests * pricePerRequestUsd;
    return {
      mode: 'dry_run',
      paidRequestsExecuted: false,
      intent: 'CORPORATE_REGISTRY_LOOKUP_GENERAL',
      pricePerRequestUsd,
      caseCount,
      minerCount,
      requests,
      maxSpendUsd,
      spendCeilingRequired: maxSpendUsd,
      cases: cases.map((c) => ({
        id: c.id,
        company_number: c.company_number,
        params: c.params,
        claimKeys: (c.claims || []).map((x) => x.key),
      })),
      candidateMinerIds: minerIds,
      paymentChallengeSample: probeChallenge,
      operatorApprovalRequired: true,
      note: 'Dry-run only. No paid requests will be executed until explicit approval of a spend ceiling.',
    };
  }
}

export function createTelegraphAdapter(options) {
  return new TelegraphAdapter(options);
}
