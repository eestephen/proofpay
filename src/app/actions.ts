"use server";

import { refresh } from "next/cache";
import { checkRelease } from "@/domain/release";
import { db, getMilestone } from "@/server/db";
import { createPayout, getPayoutStatus } from "@/server/paypal";
import { verifyProof } from "@/server/verify";

// Skeleton only: no auth yet. A single seeded milestone, id 1.

export async function submitProof(formData: FormData) {
  const file = formData.get("proof");
  if (!(file instanceof File) || file.size === 0) throw new Error("No file uploaded");
  if (!file.type.startsWith("image/")) throw new Error("Proof must be an image");
  const milestone = getMilestone(1);
  if (!milestone) throw new Error("Milestone not found");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const verification = await verifyProof(milestone, { data: bytes, mediaType: file.type });

  db()
    .prepare(
      `UPDATE milestone SET status = 'proof_submitted', proof_image = ?, proof_mime = ?, verification = ? WHERE id = 1`,
    )
    .run(Buffer.from(bytes).toString("base64"), file.type, JSON.stringify(verification));
  refresh();
}

export async function approveRelease() {
  const milestone = getMilestone(1);
  if (!milestone) throw new Error("Milestone not found");
  const check = checkRelease({ status: milestone.status, ownerApproved: true });
  if (!check.ok) throw new Error(`Release refused: ${check.reason}`);

  const payout = await createPayout({
    milestoneId: milestone.id,
    receiverEmail: milestone.payeeEmail,
    amount: milestone.amount,
    currency: milestone.currency,
    note: `${milestone.project}: ${milestone.title}`,
  });
  db()
    .prepare(`UPDATE milestone SET status = 'paid', payout_batch_id = ?, payout_status = ? WHERE id = 1`)
    .run(payout.batchId, payout.status);
  refresh();
}

export async function refreshPayout() {
  const milestone = getMilestone(1);
  if (!milestone?.payoutBatchId) return;
  const status = await getPayoutStatus(milestone.payoutBatchId);
  db().prepare(`UPDATE milestone SET payout_status = ? WHERE id = 1`).run(status);
  refresh();
}
