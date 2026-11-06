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
  /** The owner explicitly releases a milestone the verifier put on hold. */
  override?: boolean;
}): ReleaseCheck {
  if (input.status === "paid") return { ok: false, reason: "already_paid" };
  const releasable =
    input.status === "ready" || input.status === "payout_failed" || (input.override === true && input.status === "on_hold");
  if (!releasable) return { ok: false, reason: "not_ready" };
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

/** First amount in a document total like "$1,850.00" or "SGD 1,200", in minor units. */
export function parseAmountMinor(text: string): number | null {
  const match = /(\d[\d,]*)(?:\.(\d{1,2}))?/.exec(text);
  if (!match) return null;
  const whole = Number(match[1].replace(/,/g, ""));
  const cents = match[2] ? Number(match[2].padEnd(2, "0")) : 0;
  return whole * 100 + cents;
}