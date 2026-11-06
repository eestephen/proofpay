import type { Verification } from "./verify";

export type ProofFile = { data: Uint8Array; mediaType: string };

export type VerifierInput = {
  title: string;
  description: string;
  amount: string;
  currency: string;
  payeeName: string;
};

export interface VerifierPort {
  /** images[0] is the invoice; any others are work photos. */
  verify(milestone: VerifierInput, images: ProofFile[]): Promise<Verification>;
}

/**
 * PayPal definitely rejected the payout (a 4xx), so nothing was created and a
 * retry may use a new request id. Any other error is unclear: PayPal may have
 * created the batch, so a retry must reuse the same request id.
 */
export class PayoutRejected extends Error {}

export interface PayPalPort {
  createPayout(input: {
    requestId: string;
    receiverEmail: string;
    amount: string;
    currency: string;
    note: string;
  }): Promise<{ batchId: string; status: string }>;
  getPayoutStatus(batchId: string): Promise<string>;
  /** Asks PayPal whether a webhook delivery is genuine. `body` is the raw request body. */
  verifyWebhook(headers: Record<string, string>, body: string): Promise<boolean>;
  /** A PayPal invoice recording a supplier order. Needs the Invoicing permission on the app. */
  createPurchaseInvoice(input: {
    requestId: string;
    recipientEmail: string;
    supplierName: string;
    item: string;
    quantity: number;
    unitAmount: string;
    currency: string;
    note: string;
  }): Promise<{ invoiceId: string; status: string }>;
  /** Marks an invoice paid, e.g. with the Payouts batch that settled it. Returns the new status. */
  recordInvoicePayment(invoiceId: string, amount: string, currency: string, note: string): Promise<string>;
}

/** A real product used as the market reference for a purchase. */
export type CatalogProduct = {
  id: string;
  title: string;
  merchant: string;
  url: string | null;
  /** Price of the listing, in minor units of the project currency. */
  priceMinor: number;
  /** As listed, before conversion, e.g. "USD 32.99". */
  listedPrice: string;
  source: "channel3" | "fallback";
};

export interface CatalogPort {
  search(query: string, currency: string): Promise<CatalogProduct[]>;
}

/** What the owner asked for, after the agent reads the plain-language request. */
export type PurchaseRequest = {
  item: string;
  quantity: number;
  unit: string;
  budgetMinor: number;
  deadlineDays: number;
  searchQuery: string;
  /** Set by the service once a market reference is chosen. */
  referenceUnitMinor?: number;
};

export type ReferenceChoice = {
  productId: string;
  /** Price per requested unit, minor units. Must not exceed the listing price. */
  unitPriceMinor: number;
  reason: string;
};

/** Tools the service hands the agent. Every quote goes through the supplier desk. */
export type NegotiationTools = {
  suppliers: { id: string; name: string }[];
  requestQuote(supplierId: string, counterUnitMinor?: number): import("@/domain/procurement").Quote;
};

export interface NegotiatorPort {
  parseRequest(text: string, context: { today: string; currency: string }): Promise<PurchaseRequest>;
  chooseReference(request: PurchaseRequest, products: CatalogProduct[]): Promise<ReferenceChoice>;
  negotiate(
    request: PurchaseRequest,
    tools: NegotiationTools,
  ): Promise<{ recommendedSupplierId: string | null; reasoning: string; model: string }>;
}
