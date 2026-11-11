/** Cheap liveness check for uptime pings: touches no AI, PayPal or database. */
export function GET() {
  return Response.json({ ok: true, at: new Date().toISOString() });
}
