# Changelog

## 0.1.0 (2026-11-06): milestone 1, demo-ready

- Projects with milestones and a project fund, shown on an AG Grid board with an audit trail.
- Proof submission through private payee links: one invoice plus up to two work photos.
- AI verification (Gemini), with hard fraud rules on top: total above, far below or unreadable;
  reused or repeated files; prompt injection.
- Owner approval behind a passcode. PayPal Payouts that can only be paid once: fund limit,
  idempotent retries, failure handling.
- PayPal webhooks (signature-verified, deduplicated, forward-only) for live payout status.
- Buyer agent: Channel3 market reference, negotiation with three simulated suppliers, quote
  comparison in AG Grid. Supplier paid with Payouts and recorded as a PayPal invoice, with
  shipment tracking.
- NGO mode with a flood-recovery project and a public donor impact page.
- Demo reset; Render deployment.
