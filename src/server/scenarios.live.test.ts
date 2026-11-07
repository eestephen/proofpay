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
const [, event, web] = service.listProjects();
const e = service.getProject(event.id)!.milestones;
const w = service.getProject(web.id)!.milestones;
const img = (n: string) => ({ data: new Uint8Array(readFileSync(`demo/${n}`)), mediaType: "image/png" });
const pause = () => new Promise((r) => setTimeout(r, 13_000)); // free tier: 5 requests/min

const cases: [string, number, string, "ready" | "on_hold"][] = [
  ["event AV, clean", e[0].id, "event-av-ok.png", "ready"],
  ["event photography, wrong payee", e[1].id, "event-photo-wrong-payee.png", "on_hold"],
  ["event backdrop, vague line items", e[2].id, "event-backdrop-vague.png", "on_hold"],
  ["event catering, deposit far below", e[3].id, "event-catering-deposit.png", "on_hold"],
  ["website design, clean", w[0].id, "web-design-ok.png", "ready"],
  ["website build, clean", w[1].id, "web-build-ok.png", "ready"],
  ["website launch, clean", w[2].id, "web-launch-ok.png", "ready"],
];

describe("live: demo scenarios", () => {
  it.each(cases)("%s", async (_label, id, file, expected) => {
    await pause();
    const m = await service.submitProof(id, img(file), owner);
    console.log(_label, "->", m.status, m.verification?.reasons.slice(0, 2));
    expect(m.status).toBe(expected);
  }, 120_000);
});
