export type MilestoneStatus =
  | "awaiting_proof"
  | "under_review"
  | "ready"
  | "on_hold"
  | "approved"
  | "payout_failed"
  | "paid";

export type ReleaseRefusal = "not_ready" | "already_paid" | "not_approved" | "insufficient_fund";

export type ReleaseCheck = { ok: true } | { ok: false; reason: ReleaseRefusal };

/**
 * Guard that runs before any payout call. A payout needs proof the verifier
 * marked ready (or a failed payout being retried), an explicit owner approval,
 * enough project fund left, and never runs twice.
 */
export function checkRelease(input: {
  status: MilestoneStatus;
  ownerApproved: boolean;
  amountMinor: number;
  remainingMinor: number;
}): ReleaseCheck {
  if (input.status === "paid") return { ok: false, reason: "already_paid" };
  if (input.status !== "ready" && input.status !== "payout_failed") return { ok: false, reason: "not_ready" };
  if (!input.ownerApproved) return { ok: false, reason: "not_approved" };
  if (input.amountMinor > input.remainingMinor) return { ok: false, reason: "insufficient_fund" };
  return { ok: true };
}

/** Integer minor units (cents) to a fixed two-decimal string. */
export function formatMinor(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
