import { PayoutRejected, type PayPalPort } from "./ports";

const BASE =
  process.env.PAYPAL_ENVIRONMENT === "PRODUCTION" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

const TIMEOUT_MS = 20_000;
let cachedToken: { value: string; expiresAt: number } | null = null;

/** Cached client-credentials token, refreshed a minute before it expires. */
async function accessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  return fetchToken();
}

async function fetchToken(): Promise<string> {
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
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
  return body.access_token;
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
    signal: AbortSignal.timeout(TIMEOUT_MS),
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
    signal: AbortSignal.timeout(TIMEOUT_MS),
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
let webhookLookupFailedAt = 0;

/** PAYPAL_WEBHOOK_ID if set, otherwise the registered webhook whose URL matches this deployment. */
async function resolveWebhookId(token: string): Promise<string | undefined> {
  if (webhookId) return webhookId;
  const url = webhookUrl();
  // Forged deliveries must not make us list webhooks on every request.
  if (!url || Date.now() - webhookLookupFailedAt < 5 * 60_000) return undefined;
  const res = await fetch(`${BASE}/v1/notifications/webhooks`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`PayPal webhook list failed: ${res.status} ${await res.text()}`);
  const { webhooks } = (await res.json()) as { webhooks: { id: string; url: string }[] };
  webhookId = webhooks.find((w) => w.url === url)?.id;
  if (!webhookId) webhookLookupFailedAt = Date.now();
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
    signal: AbortSignal.timeout(TIMEOUT_MS),
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: payload,
  });
  if (!res.ok) return false;
  return ((await res.json()) as { verification_status: string }).verification_status === "SUCCESS";
}

async function invoicing(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  const res = await fetch(`${BASE}/v2/invoicing/invoices${path}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`PayPal invoicing failed: ${res.status} ${await res.text()}`);
  return res.status === 204 ? {} : res.json();
}

export const createPurchaseInvoice: PayPalPort["createPurchaseInvoice"] = async (input) => {
  const created = (await invoicing("", {
    method: "POST",
    headers: { "PayPal-Request-Id": `${input.requestId}-invoice` },
    body: JSON.stringify({
      detail: {
        currency_code: input.currency,
        invoice_number: input.requestId.slice(-25),
        note: input.note,
        payment_term: { term_type: "DUE_ON_RECEIPT" },
      },
      primary_recipients: [
        { billing_info: { email_address: input.recipientEmail, business_name: input.supplierName } },
      ],
      items: [
        {
          name: input.item.slice(0, 200),
          quantity: String(input.quantity),
          unit_amount: { currency_code: input.currency, value: input.unitAmount },
          unit_of_measure: "QUANTITY",
        },
      ],
    }),
  })) as { id: string; status: string };
  await invoicing(`/${encodeURIComponent(created.id)}/send`, {
    method: "POST",
    body: JSON.stringify({ send_to_invoicer: true, send_to_recipient: false }),
  });
  return { invoiceId: created.id, status: "SENT" };
};

export const recordInvoicePayment: PayPalPort["recordInvoicePayment"] = async (invoiceId, amount, currency, note) => {
  await invoicing(`/${encodeURIComponent(invoiceId)}/payments`, {
    method: "POST",
    body: JSON.stringify({
      method: "OTHER",
      payment_date: new Date().toISOString().slice(0, 10),
      amount: { currency_code: currency, value: amount },
      note,
    }),
  });
  const inv = (await invoicing(`/${encodeURIComponent(invoiceId)}`)) as { status: string };
  return inv.status;
};

export const paypalAdapter: PayPalPort = {
  createPayout,
  getPayoutStatus,
  verifyWebhook,
  createPurchaseInvoice,
  recordInvoicePayment,
};
