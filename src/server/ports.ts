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
  verify(milestone: VerifierInput, image: ProofFile): Promise<Verification>;
}

export interface PayPalPort {
  createPayout(input: {
    requestId: string;
    receiverEmail: string;
    amount: string;
    currency: string;
    note: string;
  }): Promise<{ batchId: string; status: string }>;
  getPayoutStatus(batchId: string): Promise<string>;
}
