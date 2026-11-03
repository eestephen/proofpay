# AGENTS.md — ProofPay

ProofPay: AI agents that buy and pay, but only for verified work. It runs on the
PayPal sandbox with Gemini. Read `docs/brief.md` first.

## Commands

Run from the repo root (`C:\dev\ProofPay`). Node 22.13+ (tested on 22.19).

```sh
npm ci              # install exactly what package-lock.json pins
npm run build       # next build
npm test            # vitest run
npm run lint        # eslint, zero warnings allowed
npm run typecheck   # next typegen && tsc --noEmit
```

During development: `npm run dev` for the app, `npm run test:watch` for tests.

CI runs exactly those four commands (`.github/workflows/ci.yml`).

## Rules

- **The AI never moves money.** Payout and payment-capture calls must not be in
  any agent's tool set. They run only after `checkRelease`
  (`src/domain/release.ts`) passes and a human has approved.
- Sandbox only. Never commit secrets. Put keys in `.env.local`; `.env.example`
  lists the variable names.
- Dependencies are pinned exactly (`.npmrc` has `save-exact=true`).
- The repo lives outside OneDrive because OneDrive sync breaks `npm install`.
  Don't move it back.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` - verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Agent skills

### Issue tracker

Markdown files in the OneDrive knowledge base (`...\Hackhathon\ProofPay\tracker\`)
come first; Jira project `PP` mirrors them. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels (`needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the root. See `docs/agents/domain.md`.
