export type MilestoneStatus =
  | "awaiting_proof"
  | "under_review"
  | "ready"
  | "on_hold"
  | "approved"
  | "paid";

export type ReleaseCheck =
  | { ok: true }
  | { ok: false; reason: "not_ready" | "already_paid" | "not_approved" };

/**
 * Guard that runs before any payout call. A payout needs proof the verifier
 * marked ready and an explicit owner approval, and never runs twice.
 */
export function checkRelease(input: {
  status: MilestoneStatus;
  ownerApproved: boolean;
}): ReleaseCheck {
  if (input.status === "paid") return { ok: false, reason: "already_paid" };
  if (input.status !== "ready") return { ok: false, reason: "not_ready" };
  if (!input.ownerApproved) return { ok: false, reason: "not_approved" };
  return { ok: true };
}

/** Integer minor units (cents) to a fixed two-decimal string. */
export function formatMinor(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
