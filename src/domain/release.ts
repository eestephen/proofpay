export type MilestoneStatus = "awaiting_proof" | "proof_submitted" | "paid";

export type ReleaseCheck =
  | { ok: true }
  | { ok: false; reason: "not_submitted" | "already_paid" | "not_approved" };

/**
 * Guard that runs before any payout call. A payout needs submitted proof and
 * an explicit owner approval, and it never runs twice for the same milestone.
 */
export function checkRelease(input: {
  status: MilestoneStatus;
  ownerApproved: boolean;
}): ReleaseCheck {
  if (input.status === "paid") return { ok: false, reason: "already_paid" };
  if (input.status !== "proof_submitted") return { ok: false, reason: "not_submitted" };
  if (!input.ownerApproved) return { ok: false, reason: "not_approved" };
  return { ok: true };
}
