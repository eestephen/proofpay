import { app } from "@/server/app";

/** PayPal webhook endpoint. The service verifies every delivery with PayPal before acting. */
export async function POST(request: Request) {
  const body = await request.text();
  if (body.length > 256 * 1024) return Response.json({ result: "rejected", reason: "too large" }, { status: 413 });
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (key.startsWith("paypal-")) headers[key] = value;
  });
  let outcome;
  try {
    outcome = await app().handleWebhook({ headers, body });
  } catch (err) {
    // Transient (PayPal unreachable, demo reset). 503 lets PayPal redeliver later.
    console.error("[webhook] error:", String(err));
    return Response.json({ result: "error" }, { status: 503 });
  }
  console.log(`[webhook] ${outcome.result}: ${outcome.reason}`);
  // Non-2xx makes PayPal retry, which only helps for deliveries we could not verify.
  return Response.json(outcome, { status: outcome.result === "rejected" ? 400 : 200 });
}
