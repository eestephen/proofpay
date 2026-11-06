import { beforeEach, describe, expect, it } from "vitest";
import { createService, type Service } from "./service";
import { openStore, type SeedOptions } from "./store";
import { fakeCatalog, fakeNegotiator, fakePayPal, fakeVerifier } from "./testing/fakes";

const PASSCODE = "test-passcode";
const png = { data: new Uint8Array([137, 80, 78, 71, 1, 2, 3]), mediaType: "image/png" };

function make(seedOverrides: Partial<SeedOptions> = {}) {
  const paypal = fakePayPal();
  const verifier = fakeVerifier();
  const catalog = fakeCatalog();
  const negotiator = fakeNegotiator();
  const seed: SeedOptions = { currency: "SGD", payeeEmail: "payee@example.com", ...seedOverrides };
  const service = createService({
    db: openStore(":memory:", seed),
    seed,
    paypal: paypal.port,
    verifier: verifier.port,
    catalog: catalog.port,
    negotiator: negotiator.port,
    ownerPasscode: PASSCODE,
    secret: "test-secret",
  });
  const owner = service.ownerSession(PASSCODE)!;
  const milestones = () => service.getProject(service.listProjects()[0].id)!.milestones;
  return { service, paypal, verifier, catalog, negotiator, owner, milestones, tilingId: milestones()[1].id };
}

let service: Service;
let paypal: ReturnType<typeof fakePayPal>;
let verifier: ReturnType<typeof fakeVerifier>;
let owner: string;
let tilingId: number;

beforeEach(() => {
  ({ service, paypal, verifier, owner, tilingId } = make());
});

describe("seeded project", () => {
  it("lists the kitchen renovation with its full fund remaining", () => {
    const [project] = service.listProjects();
    expect(project.mode).toBe("sme");
    expect(project.name).toBe("Kitchen renovation, 14 Elm St");
    expect(project.fund).toEqual({
      budget: "8000.00",
      released: "0.00",
      committed: "0.00",
      remaining: "8000.00",
      currency: "SGD",
    });
  });

  it("shows four milestones awaiting proof", () => {
    const project = service.getProject(service.listProjects()[0].id)!;
    expect(project.milestones.map((m) => [m.title, m.amount, m.status])).toEqual([
      ["Stage 1: Demolition and site prep", "1500.00", "awaiting_proof"],
      ["Stage 2: Wall and floor tiling", "1200.00", "awaiting_proof"],
      ["Stage 3: Plumbing and electrical", "2300.00", "awaiting_proof"],
      ["Stage 4: Cabinets and final fit-out", "3000.00", "awaiting_proof"],
    ]);
  });
});

describe("submitting proof", () => {
  it("sends the milestone scope and the image to the verifier", async () => {
    await service.submitProof(tilingId, png, owner);
    expect(verifier.calls).toHaveLength(1);
    expect(verifier.calls[0].milestone).toMatchObject({
      title: "Stage 2: Wall and floor tiling",
      amount: "1200.00",
      currency: "SGD",
      payeeName: "Tan Tiling Works",
    });
    expect(verifier.calls[0].images).toEqual([png]);
  });

  it("marks the milestone ready when the verifier recommends release", async () => {
    verifier.willReturn({ recommendation: "release", extractedTotal: "$1,200.00", reasons: ["matches"] });
    const m = await service.submitProof(tilingId, png, owner);
    expect(m.status).toBe("ready");
    expect(m.verification).toMatchObject({ recommendation: "release", extractedTotal: "$1,200.00" });
    expect(m.proof?.mime).toBe("image/png");
  });

  it("puts the milestone on hold when the verifier recommends hold", async () => {
    verifier.willReturn({ recommendation: "hold", reasons: ["scope does not match"] });
    const m = await service.submitProof(tilingId, png, owner);
    expect(m.status).toBe("on_hold");
    expect(m.verification?.reasons).toEqual(["scope does not match"]);
  });

  it("refuses files that are not images", async () => {
    await expect(
      service.submitProof(tilingId, { data: new Uint8Array([1]), mediaType: "application/pdf" }, owner),
    ).rejects.toThrow(/image/);
    expect(verifier.calls).toHaveLength(0);
  });
});

describe("approving a release", () => {
  it("pays the payee the milestone amount through PayPal and reduces the fund", async () => {
    await service.submitProof(tilingId, png, owner);
    const m = await service.approveRelease(tilingId, owner);

    expect(paypal.payouts).toEqual([
      expect.objectContaining({ receiverEmail: "payee@example.com", amount: "1200.00", currency: "SGD" }),
    ]);
    expect(m.status).toBe("paid");
    expect(m.payout).toEqual({ batchId: "BATCH1", status: "PENDING" });
    expect(service.listProjects()[0].fund).toMatchObject({ released: "1200.00", remaining: "6800.00" });
  });

  it("refuses to pay a milestone without verified proof", async () => {
    await expect(service.approveRelease(tilingId, owner)).rejects.toThrow(/not_ready/);
    expect(paypal.payouts).toHaveLength(0);
  });

  it("refuses to pay a milestone on hold", async () => {
    verifier.willReturn({ recommendation: "hold" });
    await service.submitProof(tilingId, png, owner);
    await expect(service.approveRelease(tilingId, owner)).rejects.toThrow(/not_ready/);
    expect(paypal.payouts).toHaveLength(0);
  });

  it("never pays the same milestone twice", async () => {
    await service.submitProof(tilingId, png, owner);
    await service.approveRelease(tilingId, owner);
    await expect(service.approveRelease(tilingId, owner)).rejects.toThrow(/already_paid/);
    expect(paypal.payouts).toHaveLength(1);
  });
});

describe("refreshing payout status", () => {
  it("reads the latest batch status back from PayPal", async () => {
    await service.submitProof(tilingId, png, owner);
    await service.approveRelease(tilingId, owner);
    paypal.setStatus("BATCH1", "SUCCESS");
    const m = await service.refreshPayout(tilingId, owner);
    expect(m.payout).toEqual({ batchId: "BATCH1", status: "SUCCESS" });
  });
});

describe("safe release (ticket 04)", () => {
  it("refuses a release that would exceed the remaining project fund", async () => {
    const t = make({ budgetMinor: 100000 }); // 1,000 SGD budget, milestone is 1,200
    await t.service.submitProof(t.tilingId, png, t.owner);
    await expect(t.service.approveRelease(t.tilingId, t.owner)).rejects.toThrow(/insufficient_fund/);
    expect(t.paypal.payouts).toHaveLength(0);
  });

  it("sends exactly one payout when approve is clicked twice at once", async () => {
    await service.submitProof(tilingId, png, owner);
    const results = await Promise.allSettled([
      service.approveRelease(tilingId, owner),
      service.approveRelease(tilingId, owner),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(paypal.payouts).toHaveLength(1);
  });

  it("keeps a failed payout visible and the fund untouched", async () => {
    await service.submitProof(tilingId, png, owner);
    paypal.failNext("PayPal payout failed: 422 INSUFFICIENT_FUNDS");
    const m = await service.approveRelease(tilingId, owner);
    expect(m.status).toBe("payout_failed");
    expect(m.payoutError).toMatch(/INSUFFICIENT_FUNDS/);
    expect(service.listProjects()[0].fund).toMatchObject({ released: "0.00", remaining: "8000.00" });
  });

  it("retries a failed payout with a new request id and then pays", async () => {
    await service.submitProof(tilingId, png, owner);
    paypal.failNext("boom");
    await service.approveRelease(tilingId, owner);
    const m = await service.approveRelease(tilingId, owner);
    expect(m.status).toBe("paid");
    expect(m.payoutError).toBeNull();
    expect(paypal.payouts).toHaveLength(2);
    expect(paypal.payouts[0].requestId).not.toBe(paypal.payouts[1].requestId);
    expect(service.listProjects()[0].fund).toMatchObject({ released: "1200.00", remaining: "6800.00" });
  });

  it("records every step in the audit trail, newest first", async () => {
    await service.submitProof(tilingId, png, owner);
    paypal.failNext("boom");
    await service.approveRelease(tilingId, owner);
    await service.approveRelease(tilingId, owner);
    paypal.setStatus("BATCH2", "SUCCESS");
    const m = await service.refreshPayout(tilingId, owner);
    expect(m.history.map((h) => h.kind)).toEqual([
      "payout_status",
      "payout_sent",
      "approved",
      "payout_failed",
      "approved",
      "verified",
      "proof_submitted",
    ]);
    expect(m.history.find((h) => h.kind === "payout_failed")?.detail).toMatch(/boom/);
  });
});

describe("owner passcode (ticket 02)", () => {
  it("gives no session for a wrong passcode", () => {
    expect(service.ownerSession("wrong")).toBeNull();
    expect(service.isOwner("anything")).toBe(false);
    expect(service.isOwner(owner)).toBe(true);
  });

  it("refuses a release without an owner session, even with ready proof", async () => {
    await service.submitProof(tilingId, png, owner);
    await expect(service.approveRelease(tilingId, undefined)).rejects.toThrow(/Owner passcode required/);
    await expect(service.approveRelease(tilingId, "forged")).rejects.toThrow(/Owner passcode required/);
    expect(paypal.payouts).toHaveLength(0);
    expect(service.getMilestone(tilingId)!.status).toBe("ready");
  });

  it("disables owner sign-in entirely when no passcode is configured", () => {
    const seed = { currency: "SGD", payeeEmail: "p@example.com" };
    const svc = createService({
      db: openStore(":memory:", seed),
      seed,
      paypal: fakePayPal().port,
      verifier: fakeVerifier().port,
      catalog: fakeCatalog().port,
      negotiator: fakeNegotiator().port,
      ownerPasscode: undefined,
      secret: "s",
    });
    expect(svc.ownerSession("")).toBeNull();
    expect(svc.ownerSession("undefined")).toBeNull();
  });
});

describe("payee links (ticket 02)", () => {
  it("lets a payee submit proof for their own milestone with their link", async () => {
    const token = service.payeeToken(tilingId, owner);
    const m = await service.submitProof(tilingId, png, token);
    expect(m.status).toBe("ready");
  });

  it("refuses a payee token on another milestone", async () => {
    const t = make();
    const [demolition, tiling] = t.milestones();
    const tilingToken = t.service.payeeToken(tiling.id, t.owner);
    await expect(t.service.submitProof(demolition.id, png, tilingToken)).rejects.toThrow(/Invalid upload link/);
    expect(t.verifier.calls).toHaveLength(0);
  });

  it("refuses proof with no credential at all", async () => {
    await expect(service.submitProof(tilingId, png, undefined)).rejects.toThrow(/Invalid upload link/);
  });

  it("does not let a payee link approve a release", async () => {
    const token = service.payeeToken(tilingId, owner);
    await service.submitProof(tilingId, png, token);
    await expect(service.approveRelease(tilingId, token)).rejects.toThrow(/Owner passcode required/);
  });

  it("only issues payee links to the owner", () => {
    expect(() => service.payeeToken(tilingId, undefined)).toThrow(/Owner passcode required/);
  });

  it("shows the payee their status and hold reasons, but not the audit trail", async () => {
    const token = service.payeeToken(tilingId, owner);
    verifier.willReturn({ recommendation: "hold", reasons: ["total above milestone"] });
    await service.submitProof(tilingId, png, token);
    const view = service.getPayeeView(tilingId, token)!;
    expect(view.status).toBe("on_hold");
    expect(view.verification?.reasons).toEqual(["total above milestone"]);
    expect(view).not.toHaveProperty("history");
    expect(service.getPayeeView(tilingId, "wrong")).toBeUndefined();
  });
});

describe("demo reset (ticket 02)", () => {
  it("restores the seeded state and invalidates old payee links", async () => {
    const oldToken = service.payeeToken(tilingId, owner);
    await service.submitProof(tilingId, png, oldToken);
    await service.approveRelease(tilingId, owner);

    service.resetDemo(owner);

    const project = service.getProject(service.listProjects()[0].id)!;
    expect(project.fund).toMatchObject({ released: "0.00", remaining: "8000.00" });
    expect(project.milestones.every((m) => m.status === "awaiting_proof" && m.history.length === 0)).toBe(true);
    const newTilingId = project.milestones[1].id;
    expect(service.getPayeeView(newTilingId, oldToken)).toBeUndefined();
    expect(service.getPayeeView(newTilingId, service.payeeToken(newTilingId, owner))).toBeDefined();
    expect(service.isOwner(owner)).toBe(true);
  });

  it("refuses to reset without an owner session", () => {
    expect(() => service.resetDemo(undefined)).toThrow(/Owner passcode required/);
  });
});

describe("fraud catches (ticket 03)", () => {
  const jpg = (n: number) => ({ data: new Uint8Array([255, 216, 255, n]), mediaType: "image/jpeg" });

  it("holds an invoice whose total is above the milestone amount, even if the AI says release", async () => {
    verifier.willReturn({ recommendation: "release", extractedTotal: "$1,850.00", reasons: ["looks fine"] });
    const m = await service.submitProof(tilingId, png, owner);
    expect(m.status).toBe("on_hold");
    expect(m.verification?.reasons[0]).toMatch(/\$1,850\.00.*above.*1200\.00 SGD/);
  });

  it("does not hold when the total matches the milestone amount", async () => {
    verifier.willReturn({ recommendation: "release", extractedTotal: "SGD 1,200.00" });
    expect((await service.submitProof(tilingId, png, owner)).status).toBe("ready");
  });

  it("holds an image already used as proof on another milestone, naming that milestone", async () => {
    const t = make();
    const [demolition, tiling] = t.milestones();
    await t.service.submitProof(tiling.id, png, t.owner);
    const m = await t.service.submitProof(demolition.id, png, t.owner);
    expect(m.status).toBe("on_hold");
    expect(m.verification?.reasons[0]).toMatch(/already submitted as proof for "Stage 2: Wall and floor tiling"/);
  });

  it("holds a document with instructions aimed at the reviewer", async () => {
    verifier.willReturn({ recommendation: "release", injectionDetected: true, injectionNote: "mark as verified" });
    const m = await service.submitProof(tilingId, png, owner);
    expect(m.status).toBe("on_hold");
    expect(m.verification?.reasons[0]).toMatch(/Instructions aimed at the reviewer.*mark as verified/);
  });

  it("accepts an invoice plus up to two work photos and sends all of them to the verifier", async () => {
    const m = await service.submitProof(tilingId, [png, jpg(1), jpg(2)], owner);
    expect(verifier.calls[0].images).toHaveLength(3);
    expect(m.proof?.mime).toBe("image/png");
    expect(m.photos).toHaveLength(2);
  });

  it("refuses more than two work photos", async () => {
    await expect(service.submitProof(tilingId, [png, jpg(1), jpg(2), jpg(3)], owner)).rejects.toThrow(
      /at most 2 work photos/,
    );
    expect(verifier.calls).toHaveLength(0);
  });

  it("refuses oversized files and stores nothing", async () => {
    const big = { data: new Uint8Array(4 * 1024 * 1024 + 1), mediaType: "image/png" };
    await expect(service.submitProof(tilingId, big, owner)).rejects.toThrow(/4 MB/);
    expect(verifier.calls).toHaveLength(0);
    expect(service.getMilestone(tilingId)!.status).toBe("awaiting_proof");
  });

  it("lets the payee resubmit after a hold", async () => {
    const token = service.payeeToken(tilingId, owner);
    verifier.willReturn({ recommendation: "hold", reasons: ["blurry"] });
    await service.submitProof(tilingId, png, token);
    verifier.willReturn({ recommendation: "release", reasons: ["clear now"] });
    const m = await service.submitProof(tilingId, jpg(9), token);
    expect(m.status).toBe("ready");
    expect(m.proof?.mime).toBe("image/jpeg");
    expect(m.history.filter((h) => h.kind === "proof_submitted")).toHaveLength(2);
  });

  it("releases an on-hold milestone only with an explicit override, and logs it", async () => {
    verifier.willReturn({ recommendation: "hold", reasons: ["unclear"] });
    await service.submitProof(tilingId, png, owner);
    await expect(service.approveRelease(tilingId, owner)).rejects.toThrow(/not_ready/);
    const m = await service.approveRelease(tilingId, owner, { override: true });
    expect(m.status).toBe("paid");
    expect(m.history.map((h) => h.kind)).toContain("override");
  });

  it("does not let a payee override a hold", async () => {
    const token = service.payeeToken(tilingId, owner);
    verifier.willReturn({ recommendation: "hold" });
    await service.submitProof(tilingId, png, token);
    await expect(service.approveRelease(tilingId, token, { override: true })).rejects.toThrow(/Owner passcode/);
  });
});

describe("review fixes", () => {
  it("retries an unclear payout failure with the same request id so PayPal cannot pay twice", async () => {
    await service.submitProof(tilingId, png, owner);
    paypal.failNext("network timeout", { definite: false });
    await service.approveRelease(tilingId, owner);
    await service.approveRelease(tilingId, owner);
    expect(paypal.payouts[0].requestId).toBe(paypal.payouts[1].requestId);
  });

  it("uses different request ids after a demo reset", async () => {
    const before = service.getMilestone(tilingId)!;
    await service.submitProof(tilingId, png, owner);
    await service.approveRelease(tilingId, owner);
    service.resetDemo(owner);
    const id = service.getProject(service.listProjects()[0].id)!.milestones[1].id;
    await service.submitProof(id, png, owner);
    await service.approveRelease(id, owner);
    expect(before.title).toBe("Stage 2: Wall and floor tiling");
    expect(paypal.payouts[0].requestId).not.toBe(paypal.payouts[1].requestId);
  });

  it("moves a payout PayPal later denies back to payout_failed and restores the fund", async () => {
    await service.submitProof(tilingId, png, owner);
    await service.approveRelease(tilingId, owner);
    paypal.setStatus("BATCH1", "DENIED");
    const m = await service.refreshPayout(tilingId, owner);
    expect(m.status).toBe("payout_failed");
    expect(m.payoutError).toMatch(/DENIED/);
    expect(service.listProjects()[0].fund).toMatchObject({ released: "0.00", remaining: "8000.00" });
  });

  it("only lets the owner refresh payout status", async () => {
    await expect(service.refreshPayout(tilingId, undefined)).rejects.toThrow(/Owner passcode required/);
  });

  it("drops a verification result that arrives after a demo reset", async () => {
    const resume = verifier.pause();
    const pending = service.submitProof(tilingId, png, owner);
    service.resetDemo(owner);
    resume();
    await expect(pending).rejects.toThrow(/reset/);
    const fresh = service.getProject(service.listProjects()[0].id)!.milestones[1];
    expect(fresh.status).toBe("awaiting_proof");
    expect(fresh.proof).toBeNull();
  });

  it("expires owner sessions after 12 hours", () => {
    let now = Date.UTC(2026, 10, 6);
    const seed = { currency: "SGD", payeeEmail: "p@example.com" };
    const svc = createService({
      db: openStore(":memory:", seed),
      seed,
      paypal: fakePayPal().port,
      verifier: fakeVerifier().port,
      catalog: fakeCatalog().port,
      negotiator: fakeNegotiator().port,
      ownerPasscode: "pw",
      secret: "s",
      now: () => now,
    });
    const token = svc.ownerSession("pw")!;
    expect(svc.isOwner(token)).toBe(true);
    now += 12 * 60 * 60 * 1000 + 1;
    expect(svc.isOwner(token)).toBe(false);
    expect(svc.isOwner(token.replace(/^\d+/, String(now + 1000)))).toBe(false);
  });

  it("holds an invoice whose total cannot be read", async () => {
    verifier.willReturn({ recommendation: "release", extractedTotal: "unknown" });
    const m = await service.submitProof(tilingId, png, owner);
    expect(m.status).toBe("on_hold");
    expect(m.verification?.reasons[0]).toMatch(/Could not read a total/);
  });

  it("holds a submission that repeats the same file", async () => {
    const m = await service.submitProof(tilingId, [png, png], owner);
    expect(m.status).toBe("on_hold");
    expect(m.verification?.reasons[0]).toMatch(/Work photo 1 is the same file as the invoice/);
  });

  it("records a verifier failure in the audit trail and leaves proof retryable", async () => {
    verifier.failNext("Gemini down");
    await expect(service.submitProof(tilingId, png, owner)).rejects.toThrow(/Gemini down/);
    const m = service.getMilestone(tilingId)!;
    expect(m.status).toBe("awaiting_proof");
    expect(m.history[0]).toMatchObject({ kind: "verification_failed" });
    expect(m.history[0].detail).toMatch(/Gemini down/);
  });
});

describe("PayPal webhooks (ticket 05)", () => {
  const event = (id: string, type: string, resource: object) => ({
    headers: { "paypal-transmission-id": id },
    body: JSON.stringify({ id, event_type: type, resource }),
  });
  const item = (id: string, status: string, batch = "BATCH1") =>
    event(id, `PAYMENT.PAYOUTS-ITEM.${status === "SUCCESS" ? "SUCCEEDED" : status}`, {
      payout_batch_id: batch,
      transaction_status: status,
    });

  async function paidTiling() {
    await service.submitProof(tilingId, png, owner);
    await service.approveRelease(tilingId, owner);
  }

  it("rejects an event whose signature PayPal does not confirm, changing nothing", async () => {
    await paidTiling();
    paypal.rejectWebhooks();
    expect(await service.handleWebhook(item("WH-1", "SUCCESS"))).toMatchObject({ result: "rejected" });
    expect(service.getMilestone(tilingId)!.payout?.status).toBe("PENDING");
  });

  it("marks the payout completed when PayPal reports the item succeeded", async () => {
    await paidTiling();
    expect(await service.handleWebhook(item("WH-1", "SUCCESS"))).toMatchObject({ result: "applied" });
    const m = service.getMilestone(tilingId)!;
    expect(m.payout?.status).toBe("SUCCESS");
    expect(m.history[0]).toMatchObject({ kind: "payout_status" });
    expect(m.history[0].detail).toMatch(/webhook/);
  });

  it("applies a batch-level event too", async () => {
    await paidTiling();
    await service.handleWebhook(
      event("WH-2", "PAYMENT.PAYOUTSBATCH.SUCCESS", { batch_header: { payout_batch_id: "BATCH1", batch_status: "SUCCESS" } }),
    );
    expect(service.getMilestone(tilingId)!.payout?.status).toBe("SUCCESS");
  });

  it("ignores the same event delivered twice", async () => {
    await paidTiling();
    await service.handleWebhook(item("WH-1", "SUCCESS"));
    expect(await service.handleWebhook(item("WH-1", "SUCCESS"))).toMatchObject({ result: "duplicate" });
    expect(service.getMilestone(tilingId)!.history.filter((h) => h.kind === "payout_status")).toHaveLength(1);
  });

  it("never moves status backwards when events arrive out of order", async () => {
    await paidTiling();
    await service.handleWebhook(item("WH-1", "SUCCESS"));
    expect(await service.handleWebhook(item("WH-0", "PENDING"))).toMatchObject({ result: "ignored" });
    expect(service.getMilestone(tilingId)!.payout?.status).toBe("SUCCESS");
  });

  it("moves a failed payout item back to payout_failed and restores the fund", async () => {
    await paidTiling();
    await service.handleWebhook(item("WH-1", "FAILED"));
    const m = service.getMilestone(tilingId)!;
    expect(m.status).toBe("payout_failed");
    expect(service.listProjects()[0].fund).toMatchObject({ released: "0.00", remaining: "8000.00" });
  });

  it("ignores events for batches it does not know", async () => {
    await paidTiling();
    expect(await service.handleWebhook(item("WH-1", "SUCCESS", "OTHER"))).toMatchObject({ result: "ignored" });
  });

  it("ignores event types it does not handle", async () => {
    expect(await service.handleWebhook(event("WH-9", "CHECKOUT.ORDER.APPROVED", {}))).toMatchObject({
      result: "ignored",
    });
  });

  it("rejects a body that is not JSON", async () => {
    expect(await service.handleWebhook({ headers: {}, body: "not json" })).toMatchObject({ result: "rejected" });
  });
});

describe("project board (ticket 06)", () => {
  it("returns one light row per milestone with status, recommendation and last event", async () => {
    verifier.willReturn({ recommendation: "release", extractedTotal: "$1,850.00" });
    await service.submitProof(tilingId, png, owner);
    const board = service.getBoard(service.listProjects()[0].id)!;
    expect(board.rows).toHaveLength(4);
    const tiling = board.rows[1];
    expect(tiling).toMatchObject({
      id: tilingId,
      title: "Stage 2: Wall and floor tiling",
      payeeName: "Tan Tiling Works",
      amount: 1200,
      currency: "SGD",
      status: "on_hold",
      recommendation: "hold",
      fraudChecks: 1,
      lastEvent: "verified",
    });
    expect(board.rows[0]).toMatchObject({ status: "awaiting_proof", recommendation: null, fraudChecks: 0, lastEvent: null });
    expect(JSON.stringify(board)).not.toMatch(/payee@example.com|iVBOR|"image"/);
  });

  it("shows money committed to an in-flight payout separately from released", async () => {
    const resume = paypal.pause();
    await service.submitProof(tilingId, png, owner);
    const pending = service.approveRelease(tilingId, owner);
    await Promise.resolve();
    expect(service.getBoard(service.listProjects()[0].id)!.fund).toMatchObject({
      released: "0.00",
      committed: "1200.00",
      remaining: "6800.00",
    });
    resume();
    await pending;
    expect(service.getBoard(service.listProjects()[0].id)!.fund).toMatchObject({
      released: "1200.00",
      committed: "0.00",
      remaining: "6800.00",
    });
  });

  it("returns undefined for an unknown project", () => {
    expect(service.getBoard(999)).toBeUndefined();
  });
});

describe("buyer agent (ticket 07)", () => {
  const ask = "Buy 40 m2 of porcelain floor tiles, max 1,300 SGD, delivered within 5 days";

  it("negotiates with all three suppliers and recommends the cheapest offer that fits", async () => {
    const t = make();
    const projectId = t.service.listProjects()[0].id;
    const p = await t.service.requestMaterials(projectId, ask, t.owner);
    expect(p.status).toBe("quoted");
    expect(p.rows).toHaveLength(3);
    expect(p.rows.every((r) => r.rounds === 3)).toBe(true);
    // reference 30.00/m2: Lion City floor 29.10 (3 days), Jurong 27.00 but 7 days, Kranji only 60 in stock... 30.60
    const fits = p.rows.filter((r) => r.withinBudget && r.withinDeadline && r.available);
    expect(p.recommendation?.supplierId).toBe(fits.sort((a, b) => a.total - b.total)[0].supplierId);
    expect(p.recommendation!.total).toBeLessThanOrEqual(1300);
    expect(p.reference).toMatchObject({ title: "Porcelain floor tile 60x60, per m2", unitPrice: "30.00" });
  });

  it("marks offers that break the deadline and never recommends them", async () => {
    const t = make();
    const p = await t.service.requestMaterials(t.service.listProjects()[0].id, ask, t.owner);
    const jurong = p.rows.find((r) => r.supplierId === "jurong")!;
    expect(jurong.withinDeadline).toBe(false);
    expect(p.recommendation?.supplierId).not.toBe("jurong");
  });

  it("overrules an agent pick that is over budget or late, and says so", async () => {
    const t = make();
    t.negotiator.pick("jurong");
    const p = await t.service.requestMaterials(t.service.listProjects()[0].id, ask, t.owner);
    expect(p.recommendation?.supplierId).not.toBe("jurong");
    expect(p.overruled).toMatch(/Jurong.*7 days.*deadline of 5 days/);
  });

  it("reports no fit when no supplier meets the budget", async () => {
    const t = make();
    t.negotiator.setRequest({ budgetMinor: 50000 });
    const p = await t.service.requestMaterials(t.service.listProjects()[0].id, ask, t.owner);
    expect(p.status).toBe("no_fit");
    expect(p.recommendation).toBeNull();
  });

  it("logs every negotiation round", async () => {
    const t = make();
    const p = await t.service.requestMaterials(t.service.listProjects()[0].id, ask, t.owner);
    expect(p.log).toHaveLength(9);
    expect(p.log.filter((q) => q.counterUnitMinor !== null)).toHaveLength(6);
  });

  it("refuses a reference price the catalog does not support", async () => {
    const t = make();
    t.negotiator.setReferencePrice(999999);
    await expect(t.service.requestMaterials(t.service.listProjects()[0].id, ask, t.owner)).rejects.toThrow(
      /reference price/,
    );
  });

  it("refuses a request without quantity, budget or deadline", async () => {
    const t = make();
    t.negotiator.setRequest({ quantity: 0 });
    await expect(t.service.requestMaterials(t.service.listProjects()[0].id, "buy tiles", t.owner)).rejects.toThrow(
      /quantity, a budget and a deadline/,
    );
  });

  it("is owner only", async () => {
    await expect(service.requestMaterials(service.listProjects()[0].id, ask, undefined)).rejects.toThrow(
      /Owner passcode required/,
    );
  });

  it("lists past purchases on the project, newest first", async () => {
    const t = make();
    const id = t.service.listProjects()[0].id;
    await t.service.requestMaterials(id, ask, t.owner);
    await t.service.requestMaterials(id, "Buy 10 bags of grout, max 200 SGD, within 3 days", t.owner);
    expect(t.service.listPurchases(id)).toHaveLength(2);
  });
});

describe("supplier order (ticket 08)", () => {
  const ask = "Buy 40 m2 of porcelain floor tiles, max 1,300 SGD, within 5 days";
  async function quoted(t = make()) {
    const projectId = t.service.listProjects()[0].id;
    const p = await t.service.requestMaterials(projectId, ask, t.owner);
    return { ...t, projectId, p };
  }

  it("pays the recommended supplier its final total through PayPal and records an invoice and tracking", async () => {
    const t = await quoted();
    const o = await t.service.approveQuote(t.p.id, t.owner);
    const win = t.p.recommendation!;
    expect(t.paypal.payouts.at(-1)).toMatchObject({
      receiverEmail: "payee@example.com",
      amount: win.total.toFixed(2),
      currency: "SGD",
    });
    expect(o.order).toMatchObject({ status: "ordered", supplierName: win.supplierName, payoutBatchId: "BATCH1" });
    expect(o.order?.invoice).toMatchObject({ id: "INV1", status: "PAID" });
    expect(t.paypal.invoices[0]).toMatchObject({ recipientEmail: "payee@example.com", quantity: 40 });
    expect(t.paypal.invoicePayments[0]).toMatchObject({ invoiceId: "INV1", amount: win.total.toFixed(2) });
    expect(o.order?.tracking?.number).toMatch(/^[A-Z]{2}\d{8}SG$/);
    expect(t.service.listProjects()[0].fund).toMatchObject({
      released: win.total.toFixed(2),
      remaining: (8000 - win.total).toFixed(2),
    });
  });

  it("orders a purchase at most once", async () => {
    const t = await quoted();
    await t.service.approveQuote(t.p.id, t.owner);
    await expect(t.service.approveQuote(t.p.id, t.owner)).rejects.toThrow(/already ordered/);
    expect(t.paypal.payouts).toHaveLength(1);
  });

  it("refuses a purchase with no supplier that fits", async () => {
    const t = make();
    t.negotiator.setRequest({ budgetMinor: 50000 });
    const { p } = await quoted(t);
    await expect(t.service.approveQuote(p.id, t.owner)).rejects.toThrow(/No supplier fits/);
  });

  it("refuses an order larger than the remaining fund", async () => {
    const t = make({ budgetMinor: 50000 });
    const { p } = await quoted(t);
    await expect(t.service.approveQuote(p.id, t.owner)).rejects.toThrow(/insufficient_fund/);
    expect(t.paypal.payouts).toHaveLength(0);
  });

  it("is owner only", async () => {
    const t = await quoted();
    await expect(t.service.approveQuote(t.p.id, undefined)).rejects.toThrow(/Owner passcode required/);
  });

  it("still completes the order when PayPal refuses to create the invoice, and says why", async () => {
    const t = await quoted();
    t.paypal.failInvoices("NOT_AUTHORIZED");
    const o = await t.service.approveQuote(t.p.id, t.owner);
    expect(o.order?.status).toBe("ordered");
    expect(o.order?.invoice).toMatchObject({ id: null, error: expect.stringMatching(/NOT_AUTHORIZED/) });
  });

  it("keeps a failed supplier payout retryable and out of the fund", async () => {
    const t = await quoted();
    t.paypal.failNext("422 INSUFFICIENT_FUNDS");
    const o = await t.service.approveQuote(t.p.id, t.owner);
    expect(o.order?.status).toBe("order_failed");
    expect(o.order?.error).toMatch(/INSUFFICIENT_FUNDS/);
    expect(t.service.listProjects()[0].fund).toMatchObject({ released: "0.00", remaining: "8000.00" });
    expect((await t.service.approveQuote(t.p.id, t.owner)).order?.status).toBe("ordered");
  });

  it("updates the supplier payout from a PayPal webhook", async () => {
    const t = await quoted();
    await t.service.approveQuote(t.p.id, t.owner);
    const r = await t.service.handleWebhook({
      headers: {},
      body: JSON.stringify({
        id: "WH-PO",
        event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
        resource: { payout_batch_id: "BATCH1", transaction_status: "SUCCESS" },
      }),
    });
    expect(r.result).toBe("applied");
    expect(t.service.getPurchase(t.p.id)!.order?.payoutStatus).toBe("SUCCESS");
  });

  it("shows supplier orders on the project board total", async () => {
    const t = await quoted();
    await t.service.approveQuote(t.p.id, t.owner);
    expect(t.service.getBoard(t.projectId)!.fund.released).toBe(t.p.recommendation!.total.toFixed(2));
  });
});

describe("NGO mode and donor impact page (ticket 09)", () => {
  const ngo = () => service.listProjects().find((p) => p.mode === "ngo")!;

  it("seeds a flood-recovery project for NGO mode, with field partners", () => {
    const p = ngo();
    expect(p.name).toMatch(/Flood recovery/);
    expect(p.fund.budget).toBe("5000.00");
    expect(service.listProjects({ mode: "ngo" })).toHaveLength(1);
    expect(service.listProjects({ mode: "sme" }).map((x) => x.mode)).toEqual(["sme"]);
    expect(service.getProject(p.id)!.milestones).toHaveLength(4);
  });

  it("shows donors only paid milestones, with proof, and no private fields", async () => {
    const project = service.getProject(ngo().id)!;
    const [first, second] = project.milestones;
    await service.submitProof(first.id, png, owner);
    await service.approveRelease(first.id, owner);
    verifier.willReturn({ recommendation: "hold" });
    await service.submitProof(second.id, { data: new Uint8Array([9, 9, 9]), mediaType: "image/png" }, owner);

    const impact = service.getImpact(project.id)!;
    expect(impact.name).toBe(project.name);
    expect(impact.fund).toMatchObject({ budget: "5000.00", released: first.amount });
    expect(impact.paid).toHaveLength(1);
    expect(impact.paid[0]).toMatchObject({ title: first.title, partner: first.payeeName, amount: first.amount });
    expect(impact.paid[0].proof).toHaveLength(1);
    expect(impact.paid[0].paidAt).toBeTruthy();
    const json = JSON.stringify(impact);
    for (const secret of ["payee@example.com", "verification", "reasons", "history", "BATCH", PASSCODE, owner]) {
      expect(json).not.toContain(secret);
    }
  });

  it("lists relief supplies that were ordered", async () => {
    const id = ngo().id;
    const p = await service.requestMaterials(id, "Buy 40 m2 of tarpaulin, max 1,300 SGD, within 5 days", owner);
    await service.approveQuote(p.id, owner);
    const impact = service.getImpact(id)!;
    expect(impact.supplies).toHaveLength(1);
    expect(impact.supplies[0]).toMatchObject({ quantity: 40, supplierName: p.recommendation!.supplierName });
  });

  it("has no public impact page for SME projects", () => {
    expect(service.getImpact(service.listProjects({ mode: "sme" })[0].id)).toBeUndefined();
  });

  it("restores the NGO project on reset", async () => {
    const m = service.getProject(ngo().id)!.milestones[0];
    await service.submitProof(m.id, png, owner);
    await service.approveRelease(m.id, owner);
    service.resetDemo(owner);
    expect(ngo().fund.released).toBe("0.00");
  });
});
