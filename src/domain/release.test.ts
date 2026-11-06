import { describe, expect, it } from "vitest";
import { checkRelease, formatMinor, parseAmountMinor } from "./release";

const enough = { amountMinor: 120000, remainingMinor: 800000 };

describe("checkRelease", () => {
  it("allows a payout for ready proof that the owner approved", () => {
    expect(checkRelease({ status: "ready", ownerApproved: true, ...enough })).toEqual({ ok: true });
  });

  it("allows retrying a failed payout", () => {
    expect(checkRelease({ status: "payout_failed", ownerApproved: true, ...enough })).toEqual({ ok: true });
  });

  it("refuses without owner approval", () => {
    expect(checkRelease({ status: "ready", ownerApproved: false, ...enough })).toEqual({
      ok: false,
      reason: "not_approved",
    });
  });

  it("refuses before proof is verified", () => {
    for (const status of ["awaiting_proof", "under_review", "on_hold", "approved"] as const) {
      expect(checkRelease({ status, ownerApproved: true, ...enough })).toEqual({ ok: false, reason: "not_ready" });
    }
  });

  it("refuses when the remaining fund is smaller than the milestone", () => {
    expect(checkRelease({ status: "ready", ownerApproved: true, amountMinor: 120000, remainingMinor: 119999 })).toEqual({
      ok: false,
      reason: "insufficient_fund",
    });
  });

  it("never pays the same milestone twice", () => {
    expect(checkRelease({ status: "paid", ownerApproved: true, ...enough })).toEqual({
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

describe("parseAmountMinor", () => {
  it("reads document totals in common formats", () => {
    expect(parseAmountMinor("$1,850.00")).toBe(185000);
    expect(parseAmountMinor("SGD 1,200")).toBe(120000);
    expect(parseAmountMinor("1200.5")).toBe(120050);
  });
  it("returns null when there is no amount", () => {
    expect(parseAmountMinor("unknown")).toBeNull();
  });
});

describe("checkRelease override", () => {
  it("allows an on-hold milestone only with an override", () => {
    const base = { status: "on_hold" as const, ownerApproved: true, amountMinor: 1, remainingMinor: 10 };
    expect(checkRelease(base)).toEqual({ ok: false, reason: "not_ready" });
    expect(checkRelease({ ...base, override: true })).toEqual({ ok: true });
  });
});
