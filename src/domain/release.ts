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

/**
 * A document total like "$1,850.00", "S$1,200", "SGD 1,200" or "1200.50 SGD", in minor
 * units. Anything ambiguous ("1.850,00", "1 850", several numbers) returns null, so the
 * hard rule holds it rather than guessing.
 */
export function parseAmountMinor(text: string): number | null {
  const match = /^(?:[A-Z]{0,3}\s?\$?)\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:[A-Z]{3})?$/i.exec(text.trim());
  if (!match) return null;
  const whole = Number(match[1].replace(/,/g, ""));
  const cents = match[2] ? Number(match[2].padEnd(2, "0")) : 0;
  return whole * 100 + cents;
}
/** PayPal payout batch/item statuses that mean the money did not reach the payee. */
export const FAILED_PAYOUT = new Set(["DENIED", "FAILED", "CANCELED", "RETURNED", "BLOCKED", "REVERSED", "REFUNDED"]);

const PAYOUT_RANK: Record<string, number> = { NEW: 0, PENDING: 1, PROCESSING: 2, ONHOLD: 2, UNCLAIMED: 2, SUCCESS: 3 };

/**
 * Whether a newly reported payout status should replace the current one.
 * Failures always apply; otherwise status only moves forward.
 */
export function nextPayoutStatus(current: string | null, next: string): { apply: boolean; failed: boolean } {
  if (FAILED_PAYOUT.has(next)) return { apply: true, failed: true };
  const from = current ? (PAYOUT_RANK[current] ?? 0) : -1;
  const to = PAYOUT_RANK[next];
  return { apply: to !== undefined && to > from, failed: false };
}
