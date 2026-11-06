import { PayoutRejected, type PayPalPort } from "./ports";

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
  requestId: string;
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
      "PayPal-Request-Id": input.requestId,
    },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: input.requestId,
        email_subject: "ProofPay: milestone payment released",
      },
      items: [
        {
          recipient_type: "EMAIL",
          receiver: input.receiverEmail,
          amount: { value: input.amount, currency: input.currency },
          note: input.note,
          sender_item_id: input.requestId,
        },
      ],
    }),
  });
  if (!res.ok) {
    const message = `PayPal payout failed: ${res.status} ${await res.text()}`;
    // 4xx: PayPal rejected it and created nothing. 5xx: unclear, retry with the same id.
    throw res.status >= 400 && res.status < 500 ? new PayoutRejected(message) : new Error(message);
  }
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

/** Where PayPal delivers webhooks for this deployment. Render sets RENDER_EXTERNAL_URL. */
export function webhookUrl(): string | undefined {
  const base = process.env.PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL;
  return base ? `${base.replace(/\/$/, "")}/api/paypal/webhook` : undefined;
}

let webhookId = process.env.PAYPAL_WEBHOOK_ID || undefined;

/** PAYPAL_WEBHOOK_ID if set, otherwise the registered webhook whose URL matches this deployment. */
async function resolveWebhookId(token: string): Promise<string | undefined> {
  if (webhookId) return webhookId;
  const url = webhookUrl();
  if (!url) return undefined;
  const res = await fetch(`${BASE}/v1/notifications/webhooks`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`PayPal webhook list failed: ${res.status} ${await res.text()}`);
  const { webhooks } = (await res.json()) as { webhooks: { id: string; url: string }[] };
  webhookId = webhooks.find((w) => w.url === url)?.id;
  return webhookId;
}

export async function verifyWebhook(headers: Record<string, string>, body: string): Promise<boolean> {
  const token = await accessToken();
  const id = await resolveWebhookId(token);
  if (!id) return false;
  const h = (name: string) => JSON.stringify(headers[name] ?? "");
  // Embed the raw body verbatim: re-serialising the event can change it and fail the check.
  const payload =
    `{"auth_algo":${h("paypal-auth-algo")},"cert_url":${h("paypal-cert-url")},` +
    `"transmission_id":${h("paypal-transmission-id")},"transmission_sig":${h("paypal-transmission-sig")},` +
    `"transmission_time":${h("paypal-transmission-time")},"webhook_id":${JSON.stringify(id)},"webhook_event":${body}}`;
  const res = await fetch(`${BASE}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: payload,
  });
  if (!res.ok) return false;
  return ((await res.json()) as { verification_status: string }).verification_status === "SUCCESS";
}

export const paypalAdapter: PayPalPort = { createPayout, getPayoutStatus, verifyWebhook };