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
5. **Reset demo** (top right) restores the starting data.

## Run it locally

Requires Node.js 22.13 or later (22.x).

```sh
npm ci
cp .env.example .env.local   # then fill in your sandbox keys
npm run dev
```

## Checks

```sh
npm run build && npm test && npm run lint && npm run typecheck
```

## Licence

MIT. See `LICENSE`.
