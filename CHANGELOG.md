# Changelog

## Unreleased

- **Ledger** page (owner only): totals across projects, an AG Charts budget chart, an AG Grid of every payment and supplier order with a pinned total that follows the filter, and an AG Grid of the audit trail across projects.
- `GET /api/health` for uptime pings; it touches no AI, PayPal or database.
- Sourced statistics and an estimated benefit vs cost in the README, the Devpost text and the deck.
- Deck has 15 slides, including Why it matters, Ledger and Estimated benefit vs cost. Pitch video (2:58) includes a Ledger shot.

## 0.2.0 (2026-11-07)

- Removed NGO mode and the donor impact page from the hackathon build (kept in git tag `with-ngo`).
- Three SME demo projects: a builder (kitchen renovation), an events company (product launch) and a digital agency (website rebuild, budget-limit demo).
- In-app **Demo scenarios** page with 12 guided scenarios and downloadable test invoices.
- Seven new scenario invoices: wrong payee, vague line items, deposit instead of completion, and clean invoices.
- Readable messages for refused releases.

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
