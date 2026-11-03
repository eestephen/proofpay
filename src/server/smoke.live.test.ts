import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getMilestone } from "./db";
import { createPayout, getPayoutStatus } from "./paypal";
import { verifyProof } from "./verify";

// Live check against real Gemini + PayPal sandbox (sends a 1.00 payout). Run: npm run test:live
describe("skeleton smoke", () => {
  it("verifies a real invoice and sends a real sandbox payout", async () => {
    const m = getMilestone(1)!;
    const v = await verifyProof(m, {
      data: new Uint8Array(readFileSync("demo/invoice-ok.png")),
      mediaType: "image/png",
    });
    console.log("verification", v);
    expect(["release", "hold"]).toContain(v.recommendation);
    const p = await createPayout({
      milestoneId: 999,
      receiverEmail: m.payeeEmail,
      amount: "1.00",
      currency: m.currency,
      note: "smoke test",
    });
    console.log("payout", p);
    console.log("status", await getPayoutStatus(p.batchId));
  }, 120_000);
});
