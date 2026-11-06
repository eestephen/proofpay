# ProofPay

**AI agents that buy and pay, but only for verified work.**

ProofPay releases a project budget in two ways. Suppliers are paid for goods an
AI buyer agent negotiated, and subcontractors are paid for milestones an AI
verifier checked. A human approves every payment, and PayPal (sandbox) settles
it. The AI never moves money on its own.

Built for the PayPal AI Hackathon. Status: walking skeleton. See `docs/brief.md`.

**Live demo:** https://proofpay-988i.onrender.com (free tier: the first load after idle can take about a minute; demo data resets on restart).

## Try the demo

1. Open the live demo and click **Owner sign in**. The demo passcode is `proofpay-demo`.
2. Open **Kitchen renovation → Stage 2: Wall and floor tiling**.
3. Open the **payee upload link** shown there (for example in a private window) and upload
   `demo/invoice-ok.png` from this repo.
4. Back as the owner, click **approve and release**. A PayPal sandbox payout is sent.
5. Try the fraud checks: upload `demo/invoice-inflated.png` (total above the milestone),
   `demo/invoice-injection.png` (hidden text telling the AI to approve), or reuse an invoice
   already submitted on another milestone. Each is put **on hold** with the reason shown, even
   if the AI on its own would have said release. The owner can override a hold only by ticking
   a confirmation box, and the override is logged.
6. On the project page, use **Buy materials**: the buyer agent reads the request, looks up a real
   market price through Channel3, then negotiates up to three rounds with three simulated suppliers.
   The quotes appear side by side. ProofPay rules replace any pick that breaks the budget, deadline
   or stock. The agent has no payment tools.
7. Switch to **NGO** mode on the home page. The same engine runs a flood-recovery project: pay a
   field partner with `demo/invoice-ngo-cleanup.png`, then open the **public donor impact page**
   (no sign-in) to see what was paid, to whom, and the proof. Emails and review notes are never shown.
8. **Reset demo** (top right) restores the starting data.

## Run it locally

Requires Node.js 22.13 or later (22.x).

```sh
npm ci
cp .env.example .env.local   # then fill in your sandbox keys
npm run dev
```

## PayPal webhooks

Payout status updates arrive at `/api/paypal/webhook`. Each delivery is verified with
PayPal's verify-webhook-signature API before anything changes, duplicates are ignored, and
status only moves forward. To receive them on your own deployment, register a webhook on your
sandbox app (Developer Dashboard > your app > Webhooks) for `https://<your-host>/api/paypal/webhook`
with the `PAYMENT.PAYOUTS-ITEM.*` and `PAYMENT.PAYOUTSBATCH.*` events. Set `PUBLIC_URL` (Render
sets `RENDER_EXTERNAL_URL` for you) or `PAYPAL_WEBHOOK_ID`. Locally, without webhooks, the owner
can use "Refresh status from PayPal".

## Checks

```sh
npm run build && npm test && npm run lint && npm run typecheck
```

## Licence

MIT. See `LICENSE`.
