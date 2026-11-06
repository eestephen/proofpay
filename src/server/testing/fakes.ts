import type { PayPalPort, ProofFile, VerifierInput, VerifierPort } from "../ports";
import type { Verification } from "../verify";

export function fakeVerifier(result: Partial<Verification> = {}) {
  const calls: { milestone: VerifierInput; image: ProofFile }[] = [];
  let next: Verification = {
    recommendation: "release",
    extractedTotal: "unknown",
    reasons: ["looks fine"],
    model: "fake",
    ...result,
  };
  const port: VerifierPort = {
    async verify(milestone, image) {
      calls.push({ milestone, image });
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
  const port: PayPalPort = {
    async createPayout(input) {
      payouts.push(input);
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
  };
}
