# ProofPay

**AI agents that buy and pay, but only for verified work.**

ProofPay releases a project budget in two ways. Suppliers are paid for goods an
AI buyer agent negotiated, and subcontractors are paid for milestones an AI
verifier checked. A human approves every payment, and PayPal (sandbox) settles
it. The AI never moves money on its own.

Built for the PayPal AI Hackathon. Status: early development. See `docs/brief.md`.

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
