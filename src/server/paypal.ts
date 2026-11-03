import { randomUUID } from "node:crypto";

const BASE =
  process.env.PAYPAL_ENVIRONMENT === "PRODUCTION"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

async function accessToken(): Promise<string> {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Sends one sandbox payout. Never exposed as an AI tool. */
export async function createPayout(input: {
  milestoneId: number;
  receiverEmail: string;
  amount: string;
  currency: string;
  note: string;
}): Promise<{ batchId: string; status: string }> {
  const token = await accessToken();
  const res = await fetch(`${BASE}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `proofpay-milestone-${input.milestoneId}`,
    },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: `milestone-${input.milestoneId}-${randomUUID()}`,
        email_subject: "ProofPay: milestone payment released",
      },
      items: [
        {
          recipient_type: "EMAIL",
          receiver: input.receiverEmail,
          amount: { value: input.amount, currency: input.currency },
          note: input.note,
          sender_item_id: `milestone-${input.milestoneId}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`PayPal payout failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as {
    batch_header: { payout_batch_id: string; batch_status: string };
  };
  return { batchId: body.batch_header.payout_batch_id, status: body.batch_header.batch_status };
}

export async function getPayoutStatus(batchId: string): Promise<string> {
  const token = await accessToken();
  const res = await fetch(`${BASE}/v1/payments/payouts/${encodeURIComponent(batchId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`PayPal payout lookup failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { batch_header: { batch_status: string } };
  return body.batch_header.batch_status;
}
