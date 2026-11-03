import { describe, expect, it } from "vitest";
import { checkRelease } from "./release";

describe("checkRelease", () => {
  it("allows a payout for submitted proof that the owner approved", () => {
    expect(checkRelease({ status: "proof_submitted", ownerApproved: true })).toEqual({ ok: true });
  });

  it("refuses without owner approval", () => {
    expect(checkRelease({ status: "proof_submitted", ownerApproved: false })).toEqual({
      ok: false,
      reason: "not_approved",
    });
  });

  it("refuses before proof is submitted", () => {
    expect(checkRelease({ status: "awaiting_proof", ownerApproved: true })).toEqual({
      ok: false,
      reason: "not_submitted",
    });
  });

  it("never pays the same milestone twice", () => {
    expect(checkRelease({ status: "paid", ownerApproved: true })).toEqual({
      ok: false,
      reason: "already_paid",
    });
  });
});
