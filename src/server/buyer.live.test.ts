import { describe, expect, it } from "vitest";
import { catalogAdapter } from "./catalog";
import { geminiNegotiator } from "./negotiate";
import { createService } from "./service";
import { openStore } from "./store";
import { fakePayPal, fakeVerifier } from "./testing/fakes";

// Real Channel3 + real Gemini negotiation. No PayPal calls. Run: npm run test:live
describe("live: buyer agent", () => {
  it.each([1, 2, 3])("negotiates a real request within budget and deadline (run %i)", async () => {
    const seed = { currency: "SGD", payeeEmail: "p@example.com" };
    const service = createService({
      db: openStore(":memory:", seed),
      seed,
      paypal: fakePayPal().port,
      verifier: fakeVerifier().port,
      catalog: catalogAdapter,
      negotiator: geminiNegotiator,
      ownerPasscode: "live",
      secret: "live",
    });
    const owner = service.ownerSession("live")!;
    const p = await service.requestMaterials(
      service.listProjects()[0].id,
      "Buy 40 m2 of porcelain floor tiles for the kitchen, max 1,300 SGD, delivered within 5 days",
      owner,
    );
    console.log("request", { item: p.item, quantity: p.quantity, unit: p.unit, budget: p.budget, deadline: p.deadlineDays });
    console.log("reference", p.reference);
    console.table(p.rows.map(({ supplierName, openingUnit, finalUnit, total, leadDays, rounds, recommended }) => ({ supplierName, openingUnit, finalUnit, total, leadDays, rounds, recommended })));
    console.log("recommendation", p.recommendation, "overruled:", p.overruled, "model:", p.model);
    console.log("reasoning:", p.reasoning);
    expect(p.quantity).toBe(40);
    expect(p.log.length).toBeGreaterThanOrEqual(3);
    if (p.recommendation) {
      expect(p.recommendation.total).toBeLessThanOrEqual(1300);
      expect(p.recommendation.leadDays).toBeLessThanOrEqual(5);
    }
  }, 240_000);
});
