# Devpost submission: ProofPay

## Tagline

AI agents that buy and pay, but only for verified work.

## Inspiration

Small businesses that deliver work through others pay on trust: a builder pays subcontractors, an event company pays photographers and caterers, a digital agency pays freelance designers and developers. Some disappear,
some invoices are padded, and buying materials means an afternoon of phone calls. The subcontractors who do the work honestly wait weeks to be paid. AI can
read an invoice, and it can negotiate. We wanted to see whether it could do both without anyone
having to trust it with the money.

## Why it matters

- **5% of revenue** is lost to fraud each year, by fraud examiners' estimate; the median case costs **US$104,000**, a typical fraud runs **12 months** before it is detected, and smaller businesses have the highest median losses. ([ACFE, Occupational Fraud 2026: A Report to the Nations](https://www.acfe.com/about-the-acfe/newsroom-for-media/press-releases/press-release-detail?s=occupational-fraud-2026-a-report-to-the-nations-pr))
- **US$55.5 billion** in exposed losses to business email compromise worldwide, October 2013 to December 2023: fake invoices and redirected payments. ([FBI IC3, PSA I-091124](https://www.ic3.gov/PSA/2024/PSA240911))
- **Around four in five** Singapore companies report delayed B2B payments, with construction among the hardest hit; delays mostly come from internal approval cycles and invoicing issues. ([Atradius, B2B payment practices trends in Singapore 2026](https://atradius.sg/knowledge-and-research/reports/b2b-payment-practices-trends-in-singapore-2026))

## Estimated benefit vs cost

An **estimate**, not customer data. Benefit inputs are assumptions to test in a pilot; cost inputs are published prices and our measured usage. Illustrative firm: pays out SGD 600,000 a year in about 100 payments, SGD 200,000 of it for materials.

| Benefit (per year) | Assumption | SGD |
|---|---|---|
| Overbilling and duplicates caught | 1% of payouts overbilled, half caught | 3,000 |
| Better materials prices | 3% below the first quote (the demo negotiated 16% below an opening quote, but its suppliers are simulated) | 6,000 |
| Admin time saved | 3 hours a week at SGD 40/hour | 6,240 |
| **Total** | | **≈ 15,200** |

| Cost (per year) | Basis | SGD |
|---|---|---|
| PayPal Payouts fees | 100 payouts × SGD 1.60 domestic cap ([PayPal SG fees](https://www.paypal.com/sg/business/paypal-business-fees)) | 160 |
| AI checks and negotiations | Gemini 3.1 Flash-Lite at US$0.30 / 1M input and US$2.50 / 1M output tokens; one invoice check measured at 1,241 tokens ≈ US$0.0006 | < 5 |
| Hosting share | Render Starter, US$7/month | 115 |
| ProofPay subscription | Proposed SGD 49/month | 588 |
| **Total** | | **≈ 870** |

That is roughly an **18× return**. Counting only the overbilling caught, it is still about **3.5×**.
## What it does

ProofPay holds a project budget and releases it only against proof, in two ways:

1. **Verified milestones.** A subcontractor opens a private link and uploads an invoice plus up
   to two work photos. A Gemini vision model checks them against the milestone's scope, payee
   and amount, and explains its recommendation. ProofPay then applies fixed fraud rules the AI
   can't override:
   - the total is above the milestone amount, far below it, or unreadable;
   - an invoice or photo was already used as proof elsewhere, or repeated in the same submission;
   - the document contains instructions aimed at the AI reviewer (prompt injection).

   Any hit puts the milestone **on hold**. When the owner approves, the payee is paid with
   **PayPal Payouts**, and PayPal **webhooks** turn the status to SUCCESS live.
2. **Verified purchases.** The owner types "Buy 40 m² of porcelain floor tiles, max 2,000 SGD,
   within 5 days". A Gemini buyer agent then:
   - reads the request;
   - picks a real product from **Channel3** as the market reference price;
   - asks three suppliers for quotes and negotiates up to three rounds each;
   - recommends the cheapest offer that meets budget, deadline and stock, in an AG Grid
     comparison.

   When the owner approves, the supplier is paid with **PayPal Payouts**, the order is recorded
   as a **PayPal invoice** marked paid, and shipment tracking is attached.

The demo has three projects and 12 guided scenarios (an in-app **Demo scenarios** page with
downloadable test invoices):

- a kitchen renovation (the happy path, prompt injection, inflated and reused invoices, owner override);
- an events company's product launch (wrong payee, vague invoice, deposit instead of completion, clean invoice);
- a digital agency's website rebuild whose budget runs out, so the third freelancer payout is refused before PayPal is called.
## How we built it

- **Next.js 16** (App Router, Server Actions) and TypeScript in one codebase, deployed on
  **Render**.
- All business rules live in **one app service**. Every page, server action and webhook calls it.
  More than 100 tests drive that service with stand-ins for PayPal, Gemini and Channel3. Separate
  live tests run against the real services.
- **SQLite** (`node:sqlite`), reseeded on boot, so judges always start from a clean demo.
- **AG Grid Community** for the milestone board and the quote comparison.

### PayPal: what we use and how

| PayPal capability | How ProofPay uses it |
|---|---|
| **Payouts** (`/v1/payments/payouts`) | Pays subcontractors per verified milestone, and suppliers per approved order. Each attempt uses a `PayPal-Request-Id` and `sender_batch_id`. When the outcome is unclear (network error or 5xx), the retry reuses the same id so PayPal can't pay twice. A definite 4xx rejection gets a new id. |
| **Payout status** (`GET /v1/payments/payouts/{id}`) | Manual "Refresh status from PayPal". Denied, failed or returned payouts move the item back to *payout failed*, return the money to the fund and offer a retry. |
| **Webhooks** + **verify-webhook-signature** | `PAYMENT.PAYOUTS-ITEM.*` and `PAYMENT.PAYOUTSBATCH.*` events update status live. Every delivery is checked with PayPal (raw body embedded verbatim). Events are deduplicated by id, status only moves forward, and failures are final. |
| **Invoicing** (`/v2/invoicing/invoices`, send, record payment) | Each supplier order becomes a PayPal invoice, recorded as paid against the Payouts batch that settled it. |
| **OAuth 2.0** client credentials | Token cached until expiry. All calls have timeouts. |

We call these PayPal REST APIs directly rather than through the PayPal Agent Toolkit, and that's
a deliberate choice. The toolkit's job is to give an AI tools for money, and our main safety rule
is that the AI never holds one.

### AI: what we use and how

| AI tool | How ProofPay uses it |
|---|---|
| **Google Gemini Flash** (3.6, 3.5, 3.1-lite, with fallback when a model is overloaded) through the **Vercel AI SDK** | **Verifier:** vision plus schema-validated structured output (`recommendation`, `extractedTotal`, `reasons`, `injectionDetected`). The prompt treats uploads as untrusted data. |
| Gemini **tool calling** | **Buyer agent:** a `request_quote(supplierId, counterOfferPerUnit)` tool and a `recommend` tool. Three steps in all: parse the request into fields, choose a reference product and work out the unit price, negotiate. |
| **Channel3** product API | Real product listings and prices, used as the market reference for negotiation. Shown with a link. |

How we keep the AI honest:

- **The AI advises; code decides.** Hard rules run after the AI and can only make a decision
  stricter.
- **The AI can't invent prices.** Quotes come only from deterministic supplier rules behind the
  tool. The chosen reference price must not exceed the Channel3 listing. If the agent recommends
  an offer that breaks the budget, deadline or stock, it is replaced, and the page shows the
  override.
- **No agent has a payment tool.** Payouts and invoices run in plain code after an owner
  approval and a release check.

## Challenges we ran into

- **The newest Gemini models returning "high demand" (503).** We added a per-call timeout and a
  model fallback chain. In the negotiation it only falls back before any quote is requested, so
  rounds are never replayed.
- **Money correctness.** Our own hostile review found real double-pay and stale-state bugs. One:
  a retry after an unclear payout failure could pay twice. Another: a late batch SUCCESS webhook
  could revive a failed order. Each now has a regression test.
- **The sandbox's quirks.** Payouts must use the currency the sandbox business account holds
  (SGD). Invoicing needs a separate app permission. Shipment tracking needs a checkout capture,
  which payouts don't have, so tracking is simulated.

## Accomplishments we're proud of

- A payment can't happen without three things: proof, an AI check and fixed rules, and a human
  approval. All of it is in an audit trail.
- The prompt-injection invoice is caught live. The AI quotes the hidden instruction back to you.
- Real PayPal webhooks, signature-verified, update the page within about 40 seconds.
- Twelve scenarios, each with a real outcome from Gemini against a purpose-built invoice: wrong payee, vague scope, deposit-only, duplicates, injection, budget exhaustion.

## What we learned

The model does well as the reasoning layer that reads messy documents and negotiates. What makes
it safe to put next to money is the plain code around it: idempotency keys, state machines and
hard rules.

## What's next

- Real supplier and partner onboarding through PayPal, with KYC.
- PayPal Checkout for clients funding a project.
- A second approver for large amounts.
- Chat-based proof submission.

## Built with

PayPal Payouts, PayPal Invoicing, PayPal Webhooks, Google Gemini, Vercel AI SDK, Channel3, AG Grid,
Next.js, TypeScript, Tailwind CSS, SQLite, Render, Vitest.

## Links

- Live demo: https://proofpay-988i.onrender.com (owner passcode `proofpay-demo`)
- Code: https://github.com/eestephen/proofpay (MIT)
