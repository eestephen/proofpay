import { describe, expect, it } from "vitest";
import { checkRelease, formatMinor } from "./release";

describe("checkRelease", () => {
  it("allows a payout for ready proof that the owner approved", () => {
    expect(checkRelease({ status: "ready", ownerApproved: true })).toEqual({ ok: true });
  });

  it("refuses without owner approval", () => {
    expect(checkRelease({ status: "ready", ownerApproved: false })).toEqual({
      ok: false,
      reason: "not_approved",
    });
  });

  it("refuses before proof is verified", () => {
    for (const status of ["awaiting_proof", "under_review", "on_hold"] as const) {
      expect(checkRelease({ status, ownerApproved: true })).toEqual({ ok: false, reason: "not_ready" });
    }
  });

  it("never pays the same milestone twice", () => {
    expect(checkRelease({ status: "paid", ownerApproved: true })).toEqual({
      ok: false,
      reason: "already_paid",
    });
  });
});

describe("formatMinor", () => {
  it("formats cents as a two-decimal amount", () => {
    expect(formatMinor(120000)).toBe("1200.00");
    expect(formatMinor(5)).toBe("0.05");
    expect(formatMinor(0)).toBe("0.00");
  });
});
