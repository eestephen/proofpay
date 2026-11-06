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
}
