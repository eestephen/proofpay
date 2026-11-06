import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createService } from "./service";
import { openStore } from "./store";
import { fakePayPal } from "./testing/fakes";
import { geminiVerifier } from "./verify";

// Real Gemini against the demo fraud images. No PayPal calls. Run: npm run test:live
function make() {
  const seed = { currency: "SGD", payeeEmail: "p@example.com" };
  const service = createService({
    db: openStore(":memory:", seed),
    seed,
    paypal: fakePayPal().port,
    verifier: geminiVerifier,
    ownerPasscode: "live",
    secret: "live",
  });
  const owner = service.ownerSession("live")!;
  const [demolition, tiling] = service.getProject(service.listProjects()[0].id)!.milestones;
  return { service, owner, demolition, tiling };
}

const image = (name: string) => ({ data: new Uint8Array(readFileSync(`demo/${name}`)), mediaType: "image/png" });

describe("live: fraud catches with real Gemini", () => {
  it("holds the inflated invoice", async () => {
    const { service, owner, tiling } = make();
    const m = await service.submitProof(tiling.id, image("invoice-inflated.png"), owner);
    console.log("inflated", m.verification);
    expect(m.status).toBe("on_hold");
  }, 120_000);

  it("holds the invoice with hidden reviewer instructions", async () => {
    const { service, owner, tiling } = make();
    const m = await service.submitProof(tiling.id, image("invoice-injection.png"), owner);
    console.log("injection", m.verification);
    expect(m.status).toBe("on_hold");
    expect(m.verification?.injectionDetected).toBe(true);
  }, 120_000);

  it("holds an invoice reused on a second milestone", async () => {
    const { service, owner, tiling, demolition } = make();
    await service.submitProof(tiling.id, image("invoice-ok.png"), owner);
    const m = await service.submitProof(demolition.id, image("invoice-ok.png"), owner);
    console.log("reused", m.verification?.reasons);
    expect(m.status).toBe("on_hold");
    expect(m.verification?.reasons[0]).toMatch(/already submitted/);
  }, 180_000);
});
