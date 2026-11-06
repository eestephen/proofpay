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
