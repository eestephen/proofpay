import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { paypalAdapter } from "./paypal";
import { createService } from "./service";
import { openStore } from "./store";
import { geminiVerifier } from "./verify";

// Live check against real Gemini + PayPal sandbox through the app service.
// Sends a real sandbox payout. Run: npm run test:live
describe("live: app service with real adapters", () => {
  it("verifies a real invoice and releases a real sandbox payout", async () => {
    const seed = {
      currency: process.env.PAYOUT_CURRENCY ?? "SGD",
      payeeEmail: process.env.PAYOUT_RECEIVER_EMAIL ?? "",
    };
    const service = createService({
      db: openStore(":memory:", seed),
      seed,
      paypal: paypalAdapter,
      verifier: geminiVerifier,
      ownerPasscode: "live",
      secret: "live",
    });
    const owner = service.ownerSession("live")!;
    const tiling = service.getProject(service.listProjects()[0].id)!.milestones[1];

    const verified = await service.submitProof(tiling.id, {
      data: new Uint8Array(readFileSync("demo/invoice-ok.png")),
      mediaType: "image/png",
    }, service.payeeToken(tiling.id, owner));
    console.log("verification", verified.verification);
    expect(verified.status).toBe("ready");

    const paid = await service.approveRelease(tiling.id, owner);
    console.log("payout", paid.payout);
    expect(paid.status).toBe("paid");
    expect(paid.payout?.batchId).toBeTruthy();
  }, 180_000);
});
