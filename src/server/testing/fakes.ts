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
  const port: PayPalPort = {
    async createPayout(input) {
      payouts.push(input);
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
  };
  return {
    port,
    payouts,
    setStatus(batchId: string, status: string) {
      statuses.set(batchId, status);
    },
    /** The next createPayout call throws this message (and is still recorded). */
    failNext(message: string, opts: { definite?: boolean } = {}) {
      failure = { message, definite: opts.definite ?? true };
    },
  };
}
