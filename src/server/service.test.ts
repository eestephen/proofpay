import { beforeEach, describe, expect, it } from "vitest";
import { createService, type Service } from "./service";
import { openStore, type SeedOptions } from "./store";
import { fakePayPal, fakeVerifier } from "./testing/fakes";

const PASSCODE = "test-passcode";
const png = { data: new Uint8Array([137, 80, 78, 71, 1, 2, 3]), mediaType: "image/png" };

function make(seedOverrides: Partial<SeedOptions> = {}) {
  const paypal = fakePayPal();
  const verifier = fakeVerifier();
  const seed: SeedOptions = { currency: "SGD", payeeEmail: "payee@example.com", ...seedOverrides };
  const service = createService({
    db: openStore(":memory:", seed),
    seed,
    paypal: paypal.port,
    verifier: verifier.port,
    ownerPasscode: PASSCODE,
    secret: "test-secret",
  });
  const owner = service.ownerSession(PASSCODE)!;
  const milestones = () => service.getProject(service.listProjects()[0].id)!.milestones;
  return { service, paypal, verifier, owner, milestones, tilingId: milestones()[1].id };
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
    expect(project.name).toBe("Kitchen renovation, 14 Elm St");
    expect(project.fund).toEqual({ budget: "8000.00", released: "0.00", remaining: "8000.00", currency: "SGD" });
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
