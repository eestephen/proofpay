import { beforeEach, describe, expect, it } from "vitest";
import { createService, type Service } from "./service";
import { openStore } from "./store";
import { fakePayPal, fakeVerifier } from "./testing/fakes";

let service: Service;
let paypal: ReturnType<typeof fakePayPal>;
let verifier: ReturnType<typeof fakeVerifier>;

beforeEach(() => {
  paypal = fakePayPal();
  verifier = fakeVerifier();
  service = createService({
    db: openStore(":memory:", { currency: "SGD", payeeEmail: "payee@example.com" }),
    paypal: paypal.port,
    verifier: verifier.port,
  });
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

const png = { data: new Uint8Array([137, 80, 78, 71, 1, 2, 3]), mediaType: "image/png" };

function tilingMilestoneId() {
  return service.getProject(service.listProjects()[0].id)!.milestones[1].id;
}

describe("submitting proof", () => {
  it("sends the milestone scope and the image to the verifier", async () => {
    await service.submitProof(tilingMilestoneId(), png);
    expect(verifier.calls).toHaveLength(1);
    expect(verifier.calls[0].milestone).toMatchObject({
      title: "Stage 2: Wall and floor tiling",
      amount: "1200.00",
      currency: "SGD",
      payeeName: "Tan Tiling Works",
    });
    expect(verifier.calls[0].image).toEqual(png);
  });

  it("marks the milestone ready when the verifier recommends release", async () => {
    verifier.willReturn({ recommendation: "release", extractedTotal: "$1,200.00", reasons: ["matches"] });
    const m = await service.submitProof(tilingMilestoneId(), png);
    expect(m.status).toBe("ready");
    expect(m.verification).toMatchObject({ recommendation: "release", extractedTotal: "$1,200.00" });
    expect(m.proof?.mime).toBe("image/png");
  });

  it("puts the milestone on hold when the verifier recommends hold", async () => {
    verifier.willReturn({ recommendation: "hold", reasons: ["scope does not match"] });
    const m = await service.submitProof(tilingMilestoneId(), png);
    expect(m.status).toBe("on_hold");
    expect(m.verification?.reasons).toEqual(["scope does not match"]);
  });

  it("refuses files that are not images", async () => {
    await expect(
      service.submitProof(tilingMilestoneId(), { data: new Uint8Array([1]), mediaType: "application/pdf" }),
    ).rejects.toThrow(/image/);
    expect(verifier.calls).toHaveLength(0);
  });
});

describe("approving a release", () => {
  it("pays the payee the milestone amount through PayPal and reduces the fund", async () => {
    const id = tilingMilestoneId();
    await service.submitProof(id, png);
    const m = await service.approveRelease(id);

    expect(paypal.payouts).toEqual([
      expect.objectContaining({ receiverEmail: "payee@example.com", amount: "1200.00", currency: "SGD" }),
    ]);
    expect(m.status).toBe("paid");
    expect(m.payout).toEqual({ batchId: "BATCH1", status: "PENDING" });
    expect(service.listProjects()[0].fund).toMatchObject({ released: "1200.00", remaining: "6800.00" });
  });

  it("refuses to pay a milestone without verified proof", async () => {
    await expect(service.approveRelease(tilingMilestoneId())).rejects.toThrow(/not_ready/);
    expect(paypal.payouts).toHaveLength(0);
  });

  it("refuses to pay a milestone on hold", async () => {
    verifier.willReturn({ recommendation: "hold" });
    const id = tilingMilestoneId();
    await service.submitProof(id, png);
    await expect(service.approveRelease(id)).rejects.toThrow(/not_ready/);
    expect(paypal.payouts).toHaveLength(0);
  });

  it("never pays the same milestone twice", async () => {
    const id = tilingMilestoneId();
    await service.submitProof(id, png);
    await service.approveRelease(id);
    await expect(service.approveRelease(id)).rejects.toThrow(/already_paid/);
    expect(paypal.payouts).toHaveLength(1);
  });
});

describe("refreshing payout status", () => {
  it("reads the latest batch status back from PayPal", async () => {
    const id = tilingMilestoneId();
    await service.submitProof(id, png);
    await service.approveRelease(id);
    paypal.setStatus("BATCH1", "SUCCESS");
    const m = await service.refreshPayout(id);
    expect(m.payout).toEqual({ batchId: "BATCH1", status: "SUCCESS" });
  });
});

describe("safe release (ticket 04)", () => {
  function make(budgetMinor?: number) {
    const pp = fakePayPal();
    const svc = createService({
      db: openStore(":memory:", { currency: "SGD", payeeEmail: "payee@example.com", budgetMinor }),
      paypal: pp.port,
      verifier: fakeVerifier().port,
    });
    const tilingId = svc.getProject(svc.listProjects()[0].id)!.milestones[1].id;
    return { svc, pp, tilingId };
  }

  it("refuses a release that would exceed the remaining project fund", async () => {
    const { svc, pp, tilingId } = make(100000); // 1,000 SGD budget, milestone is 1,200
    await svc.submitProof(tilingId, png);
    await expect(svc.approveRelease(tilingId)).rejects.toThrow(/insufficient_fund/);
    expect(pp.payouts).toHaveLength(0);
  });

  it("sends exactly one payout when approve is clicked twice at once", async () => {
    const { svc, pp, tilingId } = make();
    await svc.submitProof(tilingId, png);
    const results = await Promise.allSettled([svc.approveRelease(tilingId), svc.approveRelease(tilingId)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(pp.payouts).toHaveLength(1);
  });

  it("keeps a failed payout visible and the fund untouched", async () => {
    const { svc, pp, tilingId } = make();
    await svc.submitProof(tilingId, png);
    pp.failNext("PayPal payout failed: 422 INSUFFICIENT_FUNDS");
    const m = await svc.approveRelease(tilingId);
    expect(m.status).toBe("payout_failed");
    expect(m.payoutError).toMatch(/INSUFFICIENT_FUNDS/);
    expect(svc.listProjects()[0].fund).toMatchObject({ released: "0.00", remaining: "8000.00" });
  });

  it("retries a failed payout with a new request id and then pays", async () => {
    const { svc, pp, tilingId } = make();
    await svc.submitProof(tilingId, png);
    pp.failNext("boom");
    await svc.approveRelease(tilingId);
    const m = await svc.approveRelease(tilingId);
    expect(m.status).toBe("paid");
    expect(m.payoutError).toBeNull();
    expect(pp.payouts).toHaveLength(2);
    expect(pp.payouts[0].requestId).not.toBe(pp.payouts[1].requestId);
    expect(svc.listProjects()[0].fund).toMatchObject({ released: "1200.00", remaining: "6800.00" });
  });

  it("records every step in the audit trail, newest first", async () => {
    const { svc, pp, tilingId } = make();
    await svc.submitProof(tilingId, png);
    pp.failNext("boom");
    await svc.approveRelease(tilingId);
    await svc.approveRelease(tilingId);
    pp.setStatus("BATCH2", "SUCCESS");
    const m = await svc.refreshPayout(tilingId);
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
