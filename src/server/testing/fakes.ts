import { PayoutRejected, type PayPalPort, type ProofFile, type VerifierInput, type VerifierPort } from "../ports";
import type { Verification } from "../verify";

export function fakeVerifier(result: Partial<Verification> = {}) {
  const calls: { milestone: VerifierInput; images: ProofFile[] }[] = [];
  let next: Verification = {
    recommendation: "release",
    extractedTotal: "1200.00",
    reasons: ["looks fine"],
    injectionDetected: false,
    injectionNote: "",
    model: "fake",
    ...result,
  };
  let failure: string | null = null;
  let gate: Promise<void> | null = null;
  const port: VerifierPort = {
    async verify(milestone, images) {
      calls.push({ milestone, images });
      if (gate) await gate;
      if (failure) {
        const message = failure;
        failure = null;
        throw new Error(message);
      }
      return next;
    },
  };
  return {
    port,
    calls,
    failNext(message: string) {
      failure = message;
    },
    /** Holds the next verify() call until the returned function is called. */
    pause(): () => void {
      let release!: () => void;
      gate = new Promise<void>((r) => (release = r));
      return () => {
        gate = null;
        release();
      };
    },
    willReturn(v: Partial<Verification>) {
      next = { ...next, ...v };
    },
  };
}

export function fakePayPal() {
  const payouts: Parameters<PayPalPort["createPayout"]>[0][] = [];
  const statuses = new Map<string, string>();
  let failure: { message: string; definite: boolean } | null = null;
  let webhooksGenuine = true;
  let gate: Promise<void> | null = null;
  const port: PayPalPort = {
    async createPayout(input) {
      payouts.push(input);
      if (gate) await gate;
      if (failure) {
        const { message, definite } = failure;
        failure = null;
        throw definite ? new PayoutRejected(message) : new Error(message);
      }
      const batchId = `BATCH${payouts.length}`;
      statuses.set(batchId, "PENDING");
      return { batchId, status: "PENDING" };
    },
    async getPayoutStatus(batchId) {
      return statuses.get(batchId) ?? "UNKNOWN";
    },
    async verifyWebhook() {
      return webhooksGenuine;
    },
  };
  return {
    port,
    payouts,
    setStatus(batchId: string, status: string) {
      statuses.set(batchId, status);
    },
    /** The next createPayout call throws this message (and is still recorded). */
    /** Holds the next createPayout call until the returned function is called. */
    pause(): () => void {
      let release!: () => void;
      gate = new Promise<void>((r) => (release = r));
      return () => {
        gate = null;
        release();
      };
    },
    /** verifyWebhook answers false from now on. */
    rejectWebhooks() {
      webhooksGenuine = false;
    },
    failNext(message: string, opts: { definite?: boolean } = {}) {
      failure = { message, definite: opts.definite ?? true };
    },
  };
}

export function fakeCatalog(products?: import("../ports").CatalogProduct[]) {
  const searches: string[] = [];
  const port: import("../ports").CatalogPort = {
    async search(query) {
      searches.push(query);
      return (
        products ?? [
          {
            id: "p1",
            title: "Porcelain floor tile 60x60, per m2",
            merchant: "example.com",
            url: "https://example.com/tile",
            priceMinor: 3000,
            listedPrice: "USD 22.22",
            source: "fallback" as const,
          },
        ]
      );
    },
  };
  return { port, searches };
}

/**
 * Deterministic negotiator: opens with every supplier, then counters at the
 * budget per unit. Recommends the cheapest offer that fits, unless told otherwise.
 */
export function fakeNegotiator(overrides: Partial<import("../ports").PurchaseRequest> = {}) {
  let request: import("../ports").PurchaseRequest = {
    item: "porcelain floor tiles",
    quantity: 40,
    unit: "m2",
    budgetMinor: 130000,
    deadlineDays: 5,
    searchQuery: "porcelain floor tiles",
    ...overrides,
  };
  let forcedPick: string | null | undefined;
  let referencePrice: number | undefined;
  let parseError: string | null = null;
  const port: import("../ports").NegotiatorPort = {
    async parseRequest() {
      if (parseError) throw new Error(parseError);
      return request;
    },
    async chooseReference(_req, products) {
      return {
        productId: products[0].id,
        unitPriceMinor: referencePrice ?? products[0].priceMinor,
        reason: "closest match",
      };
    },
    async negotiate(req, tools) {
      const target = Math.floor(req.budgetMinor / req.quantity);
      for (const s of tools.suppliers) {
        tools.requestQuote(s.id);
        tools.requestQuote(s.id, target);
        tools.requestQuote(s.id, target);
      }
      return {
        recommendedSupplierId: forcedPick === undefined ? null : forcedPick,
        reasoning: "fake reasoning",
        model: "fake",
      };
    },
  };
  return {
    port,
    setRequest(r: Partial<import("../ports").PurchaseRequest>) {
      request = { ...request, ...r };
    },
    /** Make the agent recommend this supplier, right or wrong. */
    pick(supplierId: string | null) {
      forcedPick = supplierId;
    },
    setReferencePrice(minor: number) {
      referencePrice = minor;
    },
    failParse(message: string) {
      parseError = message;
    },
  };
}
