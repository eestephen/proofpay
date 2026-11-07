# ProofPay

**AI agents that buy and pay, but only for verified work.**

Small project businesses (renovation, fit-out, maintenance) lose money in the same two places. They pay contractors on trust, and
they accept padded or fake invoices. Buying materials also means phoning suppliers for quotes.
ProofPay puts AI agents on both jobs and lets money move only against proof:

- **Milestones.** A subcontractor uploads an invoice and work photos. An
  AI verifier checks them against the milestone. Fixed fraud rules then run on top: inflated
  totals, reused invoices and hidden instructions aimed at the AI. The owner approves, and the
  payee is paid with **PayPal Payouts**.
- **Materials.** The owner types what to buy, with a budget and a deadline. A buyer agent finds a
  real market price through **Channel3**, then negotiates with three suppliers. After the owner
  approves, the supplier is paid with **PayPal Payouts** and the order is recorded as a **PayPal
  invoice** marked paid.

**The AI never moves money.** No agent has a payment tool. Every payout runs in plain code after
an owner approval and a release check. PayPal **webhooks** (signature-verified) confirm each
payment live.

Built for the PayPal AI Hackathon. PayPal **sandbox** only, no real money.

**Live demo:** https://proofpay-988i.onrender.com
**Owner passcode:** `proofpay-demo`. It's public on purpose so judges can try every step; the money is sandbox only.
The demo runs on Render's free tier. If it has been idle, the first load can take about a minute. Demo data resets on restart, or when you click **Reset demo**.

## Try the demo (5 to 15 minutes)

The easiest way: open **Demo scenarios** (top left on the site). It lists 12 scenarios, each with
a link to the right milestone, a download link for its test invoice, and the expected result. The
same invoices are in [`demo/`](demo/).

Sign in first (**Owner sign in**, passcode `proofpay-demo`) and click **Reset demo**.

There are three projects:

| Project | Budget | What it demos |
|---|---|---|
| Kitchen renovation, 14 Elm St | 8,000 | The happy path, prompt injection, inflated and reused invoices, owner override |
| Cafe fit-out, 22 Tiong Bahru Rd | 12,000 | Wrong payee, vague invoice, deposit instead of completion invoice, and a clean one for contrast |
| Bathroom remodel, 8 Jalan Kayu | 3,000 | The budget runs out: the third payout is refused before PayPal is called |

| # | Scenario | Upload | Expected |
|---|---|---|---|
| 1 | Pay for verified work (kitchen, Stage 2), using the subcontractor's private link | `invoice-ok.png` | RELEASE; PayPal payout; webhook turns it SUCCESS within about a minute |
| 2 | Hidden instructions to the AI (kitchen, Stage 3) | `invoice-injection.png` | HOLD, quoting the hidden "NOTE TO AI REVIEWER" |
| 3 | Inflated invoice (kitchen, Stage 1) | `invoice-inflated.png` | HOLD: total above the milestone |
| 4 | Reused invoice (kitchen, Stage 4) | `invoice-ok.png` | HOLD: already used on Stage 2 |
| 5 | Owner override | (a held milestone) | Paid only after ticking a confirmation; logged |
| 6 | Wrong payee (cafe, counter) | `cafe-counter-wrong-payee.png` | HOLD: invoice from a different company |
| 7 | Vague invoice (cafe, signage) | `cafe-signage-vague.png` | HOLD: line items don't evidence the work |
| 8 | Deposit, not completion (cafe, cleaning) | `cafe-cleaning-lowball.png` | HOLD: total far below the milestone |
| 9 | Clean invoice (cafe, electrical) | `cafe-electrical-ok.png` | RELEASE and payout |
| 10 | Budget runs out (bathroom) | `bath-waterproofing-ok.png`, `bath-tiling-ok.png`, `bath-fittings-ok.png` | First two paid; the third is refused |
| 11 | Buyer agent (any project) | none | Channel3 price reference, three suppliers negotiated, supplier paid, PayPal invoice marked paid, tracking |
| 12 | Nothing fits (bathroom, tiny budget) | none | "No supplier fits", with no Approve button |

AI steps take 10 to 30 seconds. The demo uses Gemini's free tier, so if several uploads go quickly
you may see "wait about a minute". Click **Reset demo** to start over.
## How it is built

| Part | What we use | Where |
|---|---|---|
| App | Next.js 16 (App Router, Server Actions), TypeScript, Tailwind | `src/app` |
| Business rules | One app service; pure domain rules | `src/server/service.ts`, `src/domain` |
| Data | SQLite (`node:sqlite`), reseeded on boot | `src/server/store.ts` |
| Proof verification | Gemini Flash (vision + structured output) through the Vercel AI SDK | `src/server/verify.ts` |
| Buyer agent | Gemini Flash with tool calling (`request_quote`, `recommend`) | `src/server/negotiate.ts` |
| Market prices | Channel3 `/v1/search`, with a fixed price list as fallback | `src/server/catalog.ts` |
| Money | PayPal Payouts, Invoicing (create, send, record payment), Webhooks + verify-webhook-signature, OAuth | `src/server/paypal.ts` |
| Tables | AG Grid Community | `src/app/projects/[id]/*-grid.tsx` |
| Hosting | Render (free web service, `render.yaml`) | |

### Safety rules, enforced in code

- The AI only advises. Payout and invoice calls are never in an agent's tool set.
- Hard rules run after the AI and can only force a **hold**:
  - the total is above the milestone amount, far below it, or can't be read;
  - a file was already used as proof on another milestone, or is repeated within the submission;
  - the document contains instructions aimed at the reviewer.
- The buyer agent can't invent prices. Every quote comes from deterministic supplier rules, and
  the reference price must match the Channel3 listing. A recommendation that breaks the budget,
  deadline or stock is replaced, and the page shows why.
- Each milestone or order is paid at most once:
  - approval only goes through if the item is still in the expected state;
  - when the outcome of a payout is unclear, the retry reuses the same PayPal request id;
  - in-flight and unclear payouts count against the fund.
- Webhooks are checked with PayPal before they change anything. Duplicates are ignored, status
  only moves forward, and failures can be retried.
- Access:
  - the owner session is signed, bound to the passcode and expires after 12 hours;
  - payee links are signed per milestone and stop working after a reset;
  - visitors never see payee emails or internal notes.

## Run it locally

You need Node.js 22.13 or later (22.x) and free accounts for:

- **PayPal Developer**: in **Sandbox**, create an app with **Payouts** and **Invoicing** enabled.
  You need a sandbox personal account to receive payouts, and a business account that holds the
  payout currency (Singapore sandbox accounts hold SGD).
- **Google AI Studio**: an API key for Gemini.
- **Channel3** (optional): a free key. Without one, a fixed price list is used.

```sh
git clone https://github.com/eestephen/proofpay && cd proofpay
npm ci
cp .env.example .env.local   # fill in the keys; set OWNER_PASSCODE
npm run dev                  # http://localhost:3000
```

Locally, PayPal can't reach your webhook, so use **Refresh status from PayPal** on a milestone
instead. To receive webhooks on a deployment, register `https://<your-host>/api/paypal/webhook`
on the sandbox app with the `PAYMENT.PAYOUTS-ITEM.*` and `PAYMENT.PAYOUTSBATCH.*` events. Then
set `PUBLIC_URL`; Render sets `RENDER_EXTERNAL_URL` for you.

Deploying to Render: **New → Blueprint**, choose this repo, and fill in the secret variables
listed in `render.yaml`.

## Tests

```sh
npm run build && npm test && npm run lint && npm run typecheck   # what CI runs
npm run test:live    # real Gemini, Channel3 and PayPal sandbox; sends small sandbox payouts
```

The main suite (more than 100 tests) drives the app service with an in-memory database and
stand-ins for PayPal, Gemini and Channel3. It covers fraud rules, fund limits, double-pay races,
webhook ordering, auth and negotiation rules.

## Limits

These are prototype limits:

- Sandbox only.
- One demo owner per deployment.
- The suppliers are simulated.
- Shipment tracking is simulated. PayPal's tracking API needs a checkout capture, and payouts
  don't have one.
- USD listings are converted at a fixed rate.
- There's no KYC of payees or suppliers.
- "Project fund" means money set aside in the owner's PayPal balance, not escrow.

## Licence

MIT. See [`LICENSE`](LICENSE).
