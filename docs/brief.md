# ProofPay — Brief

> AI agents that buy and pay, but only for verified work.

**Hackathon:** PayPal AI Hackathon (Devpost). Deadline **2026-11-13 04:00 SGT**.
**Track:** internal tool, plus the `security-and-hardening` gate.
**Budget:** $0 (free tiers and sandbox only).
**Repo:** `C:\dev\ProofPay`. It's outside OneDrive because OneDrive sync breaks
npm. The knowledge-base folder holds a pointer README and the tracker.

## What it does

ProofPay holds a project budget and releases it only against proof:

1. **Verified goods.** A buyer agent sources materials, gets quotes from supplier
   agents and negotiates inside the owner's limits. The owner approves, and the
   supplier is paid through PayPal.
2. **Verified milestones.** A subcontractor uploads proof of a finished stage
   (photos, invoice). A verifier agent checks the proof against the milestone and
   recommends release or hold, with reasons. The owner approves, and the
   subcontractor is paid with PayPal Payouts.

The AI drafts, scores and flags. It never moves money: every payment needs a
human approval, and every agent decision goes into an audit log.

## Who it's for

| Mode | Payer | Paid | Lead demo |
|---|---|---|---|
| **SME (leads)** | Small renovation/construction business owner | Subcontractors, material suppliers | "Kitchen renovation, $8,000, 4 stages" |
| **NGO (second)** | Donors, via the NGO coordinator | Field partners, relief suppliers | "Flood recovery, $5,000" + donor impact page |

The problem: SMEs pay deposits to contractors who don't deliver, accept padded
or fake invoices, and spend hours phoning suppliers for quotes. Subcontractors,
in turn, finish work and get paid late.

## Stack

| Layer | Choice | Note |
|---|---|---|
| App | Next.js (App Router) + TypeScript + Tailwind | One codebase for UI and API routes |
| AI | Gemini Flash (free tier) via Vercel AI SDK | Groq as free fallback |
| PayPal | REST API (sandbox) + `@paypal/agent-toolkit` | See "Facts checked" |
| Grid | AG Grid Community | Free, MIT |
| Data | SQLite, seeded on boot | See open decision 1 |
| Host | Render free web service | Hosted demo URL |
| Repo | Public GitHub, MIT licence | |

Versions get pinned in Phase 1.

## Thinnest end-to-end slice

> **The owner opens one seeded milestone, the subcontractor uploads a receipt
> photo, Gemini checks it against the milestone and recommends release, the owner
> approves, and a real PayPal sandbox payout is sent and shown as paid.**

- **Real data:** a real Gemini call on a real uploaded image, a real PayPal
  sandbox Payouts call, and the payout status read back from PayPal.
- **Demo:** about 60 seconds, one milestone, one subcontractor.
- **Why this slice:** it is the core claim ("pay on proof") and it covers the
  three risky integrations together: image upload → LLM verification → money
  movement.

## Later slices (Phase 3 shapes these into tickets)

- Fraud catch: inflated amount, reused photo, prompt injection inside the receipt.
- Buyer agent: Channel3 product search, 3 simulated supplier agents, negotiation,
  AG Grid quote comparison, approve, PayPal order/invoice to the supplier.
- Shipment tracking attached to supplier orders.
- Webhooks: payout/invoice events update status live.
- Project board: AG Grid of milestones, payouts, risk flags, audit log.
- NGO mode: donations through PayPal Checkout, field partners, donor impact page.
- Maker-checker approval for large amounts; policy presets per mode.

## Non-goals

- Real money or live PayPal. Sandbox only.
- Real escrow. The "project fund" is the owner's sandbox balance, which ProofPay
  tracks and releases; we will not call it escrow.
- KYC or identity verification of vendors and partners.
- Multi-tenant auth. There is one demo owner per mode, plus a separate
  subcontractor upload page.
- Real beneficiary or personal data. Synthetic only.
- Marketplace imports (Shopee/Lazada/TikTok), mobile apps, WhatsApp/Telegram.
- The AI calling Payouts. Money-moving calls sit outside the agent's tool set.

## Facts checked (2026-11-04)

- **PayPal Agent Toolkit** (`@paypal/agent-toolkit`, Apache-2.0, works with Vercel
  AI SDK, has a sandbox flag) provides tools for invoices, orders, refunds,
  disputes, shipment tracking, catalog, subscriptions and transactions. It has
  **no Payouts tool**, so Payouts goes through the REST API directly. That is
  also what the "AI never moves money" rule needs.
- **Channel3** product API: free tier, no credit card required.
- **Bryntum Gantt** is commercial software with a free trial. Licence terms
  for a public open-source repo are still unverified (open decision 2).
- **Render free web services** have an ephemeral disk: local files, including
  SQLite, are lost on restart or redeploy.

## Decisions (agreed 2026-11-04)

1. **Data persistence on Render:** SQLite, reseeded on every boot. The demo
   always starts from a known state.
2. **Bryntum:** not in the core. Add it only if its licence allows a public
   repo. AG Grid covers the board.
3. **First slice:** as written above.

## Accounts you'll need (free; I'll walk you through each when we get there)

PayPal Developer (sandbox client ID/secret, plus a sandbox personal account to
receive payouts), Google AI Studio (Gemini key), GitHub, Render. Channel3 can
wait until the buyer-agent slice.
