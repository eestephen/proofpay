import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createService } from "./service";
import { openStore } from "./store";
import { fakeCatalog, fakeNegotiator, fakePayPal } from "./testing/fakes";
import { geminiVerifier } from "./verify";

// Real Gemini against every demo scenario image. No PayPal calls. Run: npm run test:live
const seed = { currency: "SGD", payeeEmail: "p@example.com" };
const service = createService({
  db: openStore(":memory:", seed),
  seed,
  paypal: fakePayPal().port,
  verifier: geminiVerifier,
  catalog: fakeCatalog().port,
  negotiator: fakeNegotiator().port,
  ownerPasscode: "live",
  secret: "live",
});
const owner = service.ownerSession("live")!;
const [, cafe, bath] = service.listProjects();
const c = service.getProject(cafe.id)!.milestones;
const b = service.getProject(bath.id)!.milestones;
const img = (n: string) => ({ data: new Uint8Array(readFileSync(`demo/${n}`)), mediaType: "image/png" });
const pause = () => new Promise((r) => setTimeout(r, 13_000)); // free tier: 5 requests/min

const cases: [string, number, string, "ready" | "on_hold"][] = [
  ["cafe electrical, clean", c[0].id, "cafe-electrical-ok.png", "ready"],
  ["cafe counter, wrong payee", c[1].id, "cafe-counter-wrong-payee.png", "on_hold"],
  ["cafe signage, vague line items", c[2].id, "cafe-signage-vague.png", "on_hold"],
  ["cafe cleaning, deposit far below", c[3].id, "cafe-cleaning-lowball.png", "on_hold"],
  ["bath waterproofing, clean", b[0].id, "bath-waterproofing-ok.png", "ready"],
  ["bath tiling, clean", b[1].id, "bath-tiling-ok.png", "ready"],
  ["bath fittings, clean", b[2].id, "bath-fittings-ok.png", "ready"],
];

describe("live: demo scenarios", () => {
  it.each(cases)("%s", async (_label, id, file, expected) => {
    await pause();
    const m = await service.submitProof(id, img(file), owner);
    console.log(_label, "->", m.status, m.verification?.reasons.slice(0, 2));
    expect(m.status).toBe(expected);
  }, 120_000);
});
