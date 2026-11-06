import type { PayPalPort, ProofFile, VerifierInput, VerifierPort } from "../ports";
import type { Verification } from "../verify";

export function fakeVerifier(result: Partial<Verification> = {}) {
  const calls: { milestone: VerifierInput; images: ProofFile[] }[] = [];
  let next: Verification = {
    recommendation: "release",
    extractedTotal: "unknown",
    reasons: ["looks fine"],
    injectionDetected: false,
    injectionNote: "",
    model: "fake",
    ...result,
  };
  const port: VerifierPort = {
    async verify(milestone, images) {
      calls.push({ milestone, images });
      return next;
    },
  };
  return {
    port,
    calls,
    willReturn(v: Partial<Verification>) {
      next = { ...next, ...v };
    },
  };
}

export function fakePayPal() {
  const payouts: Parameters<PayPalPort["createPayout"]>[0][] = [];
  const statuses = new Map<string, string>();
  let failure: string | null = null;
  const port: PayPalPort = {
    async createPayout(input) {
      payouts.push(input);
      if (failure) {
        const message = failure;
        failure = null;
        throw new Error(message);
      }
      const batchId = `BATCH${payouts.length}`;
      statuses.set(batchId, "PENDING");
      return { batchId, status: "PENDING" };
    },
    async getPayoutStatus(batchId) {
      return statuses.get(batchId) ?? "UNKNOWN";
    },
  };
  return {
    port,
    payouts,
    setStatus(batchId: string, status: string) {
      statuses.set(batchId, status);
    },
    /** The next createPayout call throws this message (and is still recorded). */
    failNext(message: string) {
      failure = message;
    },
  };
}
