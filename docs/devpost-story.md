## Inspiration

Small businesses that deliver work through other people pay on trust. A builder pays subcontractors, an event company pays photographers and caterers, a digital agency pays freelancers. Some invoices are padded or reused, some work is never finished, and buying materials means an afternoon of phone calls. The honest subcontractors wait weeks, because every payment needs someone to check it.

The numbers are large:

- Businesses lose an estimated **5% of revenue** to fraud each year, and a typical fraud runs **12 months** before it is caught. Smaller businesses have the highest median losses. ([ACFE, Occupational Fraud 2026](https://www.acfe.com/about-the-acfe/newsroom-for-media/press-releases/press-release-detail?s=occupational-fraud-2026-a-report-to-the-nations-pr))
- **US$55.5 billion** was lost to business email compromise, such as fake invoices and redirected payments, from 2013 to 2023. ([FBI IC3](https://www.ic3.gov/PSA/2024/PSA240911))
- About **four in five** Singapore firms report late B2B payments, mostly because of slow approvals and invoicing. ([Atradius, Singapore 2026](https://atradius.sg/knowledge-and-research/reports/b2b-payment-practices-trends-in-singapore-2026))

AI can read an invoice, and it can negotiate. We wanted to know whether it could do both without anyone having to trust it with the money.

## What it does

ProofPay holds a project budget and releases it only against proof, in two ways.

**1. Verified milestones.** A subcontractor opens a private link and uploads an invoice and up to two work photos. Gemini checks them against the milestone's scope, payee and amount, and explains its recommendation. Then fixed rules in code run, and the AI cannot override them:

- the total is above the milestone amount, far below it, or unreadable;
- the same invoice or photo was already used as proof elsewhere;
- the document contains instructions aimed at the AI reviewer (prompt injection);
- the payment would go beyond the remaining budget.

Any hit puts the milestone **on hold**. When the owner approves, ProofPay pays the payee with **PayPal Payouts**, and a signed **PayPal webhook** turns the status to SUCCESS live.

**2. Verified purchases.** The owner types a request such as *"Buy 40 m² of porcelain floor tiles, max 2,000 SGD, within 5 days."* A Gemini buyer agent takes a real market price from **Channel3**, asks three suppliers for quotes and negotiates up to three rounds with each. It then recommends the cheapest offer that meets the budget, deadline and stock. When the owner approves, the supplier is paid with PayPal Payouts, and the order is recorded as a **PayPal invoice** marked paid, with shipment tracking.

A **Ledger** page, built with AG Grid and AG Charts, shows every payment, order and audit event across all projects, with live totals and a budget chart.

The live demo has three businesses and 12 guided scenarios, each with a downloadable test invoice:

- a kitchen renovation: the normal path, prompt injection, inflated and reused invoices, and owner override;
- a product launch event: wrong payee, vague invoice, and a deposit sent instead of a completion invoice;
- a website rebuild whose budget runs out, so the third payout is refused before PayPal is even called.

**Estimated value.** For an illustrative firm paying out SGD 600,000 a year, we estimate about **SGD 15,000 a year of benefit for about SGD 870 of cost**. The costs are published PayPal, Gemini and Render prices plus the usage we measured: one AI invoice check costs about US$0.0006. The benefits are assumptions to test in a pilot.

## How we built it

- **Next.js 16** and **TypeScript** in one codebase, deployed on **Render**. All business rules live in one service that every page, form and webhook calls.
- **PayPal REST APIs**:
  - **Payouts**, with idempotent request ids so a retry can never pay twice;
  - **payout status** lookups;
  - **Webhooks**, with every delivery signature-verified by PayPal;
  - **Invoicing**, for supplier orders;
  - **OAuth**, with token caching.
- **Google Gemini** through the **Vercel AI SDK**:
  - vision with schema-checked structured output for the verifier;
  - tool calling for the buyer agent, which has a `request_quote` tool and a `recommend` tool;
  - a fallback chain across Flash models.
- **Channel3** for real product prices; **AG Grid** and **AG Charts** for the milestone board, the quote comparison and the Ledger; **SQLite**, reseeded on every start so judges always get a clean demo.
- More than 100 automated tests run against stand-ins for PayPal, Gemini and Channel3, and separate live tests run against the real services.

We call PayPal directly rather than through the PayPal Agent Toolkit, on purpose. The toolkit gives an AI tools that move money, and our main safety rule is that no AI holds one. **The AI advises; code decides; the owner approves; PayPal pays.**

## Challenges we ran into

- **Gemini overload and quotas.** The newest models often returned "high demand" errors, and the free tier allows 20 requests a day per model. We added timeouts, a model fallback chain and fixed-rule fallbacks, so a request always finishes and the page says when the fallback was used.
- **Getting money right.** Our own hostile review found real double-pay and stale-state bugs. In one, a retry after an unclear payout error could pay twice. In another, a late webhook could revive a failed order. Each one now has a regression test.
- **Sandbox details.** Payouts must use the currency the sandbox account holds (SGD), Invoicing needs a separate app permission, and shipment tracking needs a checkout capture that payouts don't have, so tracking is simulated.
- **Keeping the AI honest in negotiation.** Prices come only from fixed supplier rules behind the tool, so the AI can't invent a quote. If it recommends an offer that breaks the budget, deadline or stock, code replaces the pick and shows the override.

## Accomplishments that we're proud of

- No payment can happen without proof, an AI check plus fixed rules, and a human approval, and all of it is in the audit trail.
- The prompt-injection invoice is caught live, and the AI quotes the hidden instruction back.
- Real PayPal sandbox payouts, with signature-verified webhooks updating the page live.
- Twelve scenarios across three industries, each with a real Gemini outcome.

## What we learned

The model works well as the layer that reads messy documents and negotiates. What makes it safe to put next to money is the plain code around it: idempotency keys, state machines, hard rules and an audit trail. Designing so that a fully fooled AI still cannot pay anyone was simpler than trying to make the AI never fooled.

## What's next for ProofPay

- A pilot with 5 to 10 small businesses on real jobs, to measure the benefit estimate.
- Live PayPal onboarding and KYC for payees, and PayPal Checkout for clients funding a project.
- A second approver for large amounts.
- A real supplier network instead of simulated suppliers, and proof submission by chat.
