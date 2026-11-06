import { app } from "@/server/app";

/** PayPal webhook endpoint. The service verifies every delivery with PayPal before acting. */
export async function POST(request: Request) {
  const body = await request.text();
  if (body.length > 256 * 1024) return Response.json({ result: "rejected", reason: "too large" }, { status: 413 });
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (key.startsWith("paypal-")) headers[key] = value;
  });
  const outcome = await app().handleWebhook({ headers, body });
  console.log(`[webhook] ${outcome.result}: ${outcome.reason}`);
  // Non-2xx makes PayPal retry, which only helps for deliveries we could not verify.
  return Response.json(outcome, { status: outcome.result === "rejected" ? 400 : 200 });
}
