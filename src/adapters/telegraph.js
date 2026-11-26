/**
 * Telegraph provider adapter.
 *
 * Discovery and schema inspection are free (GET /api/miners).
 * Paid execution (engine/v1/ask, x402) is intentionally gated:
 * never call paid endpoints without an explicit spend ceiling and approval.
 *
 * Live node (testnet): https://devnode.telegraphprotocol.com
 */

const DEFAULT_NODE = process.env.TELEGRAPH_NODE_URL ?? 'https://devnode.telegraphprotocol.com';

export class TelegraphAdapter {
  /**
   * @param {object} options
   * @param {string} [options.nodeUrl]
   * @param {number} [options.timeoutMs]
   * @param {boolean} [options.allowPaid] - must be true AND spendCeilingUsd set to enable paid calls
   * @param {number} [options.spendCeilingUsd] - hard max USDC for this adapter instance
   */
  constructor(options = {}) {
    this.nodeUrl = (options.nodeUrl ?? DEFAULT_NODE).replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.allowPaid = options.allowPaid === true;
    this.spendCeilingUsd = Number(options.spendCeilingUsd) || 0;
    this.spentUsd = 0;
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

  /**
   * Free discovery: list miners, optionally filtered by intent.
   * @param {{ intent?: string, limit?: number, status?: string }} [query]
   */
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

  /**
   * Free: fetch a single miner catalog entry by id/slug if the node supports it.
   * Falls back to filtering the catalog.
   */
  async getMiner(idOrSlug) {
    const miners = await this.discoverMiners({ limit: 500 });
    return miners.find((m) => m.id === idOrSlug || m.slug === idOrSlug || m.name === idOrSlug) ?? null;
  }

  /**
   * Summarise miners that declare CORPORATE_REGISTRY_LOOKUP or related intents.
   * Used to plan independent evaluation runs — does not execute paid requests.
   */
  async findCorporateRegistryMiners() {
    const candidates = [];
    const intentsToProbe = ['CORPORATE_REGISTRY_LOOKUP', 'COMPANY_REGISTRY', 'REGISTRY_LOOKUP'];
    for (const intent of intentsToProbe) {
      try {
        const miners = await this.discoverMiners({ intent, limit: 50 });
        for (const m of miners) {
          candidates.push({
            id: m.id,
            slug: m.slug,
            name: m.name,
            intent,
            endpoints: m.endpoints?.map((e) => ({ path: e.path, method: e.method })) ?? [],
            minPriceUsdc: m.min_price_usdc ?? m.minPriceUsdc ?? null,
            raw: m,
          });
        }
      } catch {
        // Intent may not exist on this node; continue.
      }
    }
    const seen = new Set();
    return candidates.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }

  /**
   * Probe free catalog for miners whose endpoints or descriptions mention corporate/registry terms.
   * Does not call paid endpoints.
   */
  async probeRegistryCapability() {
    const miners = await this.discoverMiners({ limit: 100 });
    const keywords = /registry|corporate|company.?house|companies.?house|legal.?entity|incorporation|opencorporates/i;
    const hits = [];
    for (const m of miners) {
      const blob = JSON.stringify(m);
      if (!keywords.test(blob)) continue;
      hits.push({
        id: m.id,
        slug: m.slug,
        name: m.name,
        endpointCount: m.endpoints?.length ?? 0,
        matchingEndpoints: (m.endpoints ?? [])
          .filter((e) => keywords.test(JSON.stringify(e)))
          .map((e) => ({ path: e.path, method: e.method, description: (e.description ?? '').slice(0, 120) })),
        status: 'catalog_match',
      });
    }
    return {
      node: this.nodeUrl,
      scanned: miners.length,
      matches: hits,
      note: 'Free catalog probe only. No paid inference was executed.',
    };
  }

  /**
   * Paid execution is blocked until allowPaid + spendCeilingUsd are set
   * and an explicit approveSpend call has been made by the operator.
   */
  assertPaidAllowed(estimatedCostUsd = 0.01) {
    if (!this.allowPaid) {
      throw new Error(
        'Paid Telegraph requests are disabled. Construct TelegraphAdapter with { allowPaid: true, spendCeilingUsd: N } and obtain explicit approval before enabling.',
      );
    }
    if (this.spendCeilingUsd <= 0) {
      throw new Error('spendCeilingUsd must be a positive number when allowPaid is true.');
    }
    if (this.spentUsd + estimatedCostUsd > this.spendCeilingUsd) {
      throw new Error(
        `Spend ceiling would be exceeded (spent=${this.spentUsd}, request≈${estimatedCostUsd}, ceiling=${this.spendCeilingUsd}).`,
      );
    }
  }

  /**
   * Placeholder for future paid ask. Never executes without the gates above.
   * When implemented: POST /engine/v1/ask with x402 handling, capture receipt + raw response.
   */
  async ask(/* intent, params, options */) {
    this.assertPaidAllowed();
    throw new Error(
      'Paid ask is not enabled in this build. Discovery and fixture evaluation only. Live paid integration requires explicit operator approval and receipt capture.',
    );
  }
}

export function createTelegraphAdapter(options) {
  return new TelegraphAdapter(options);
}
