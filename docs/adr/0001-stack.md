# ADR 0001: Stack

- **Status:** accepted
- **Date:** 2026-11-04

## Context

ProofPay is a 9-day hackathon build (deadline 2026-11-13 04:00 SGT) with a
budget of $0. Judges need a hosted demo, a public repo and clear setup
instructions. The project must use PayPal and AI in a meaningful way.

## Decision

| Concern | Choice | Pinned |
|---|---|---|
| Runtime | Node.js 22 LTS | `>=22.13 <23` (built-in `node:sqlite`) |
| App + API | Next.js App Router, TypeScript | next 16.4.4, typescript 5.9.3 |
| UI | React, Tailwind CSS | react 19.3.0, tailwindcss 4.3.4 |
| AI | Vercel AI SDK with the Gemini provider (free tier) | ai 7.0.162, @ai-sdk/google 4.0.111 |
| Validation | zod | 4.6.7 |
| Data | SQLite through built-in `node:sqlite`, reseeded on every boot | no dependency |
| Tests | Vitest | 5.1.0 |
| Lint | ESLint with eslint-config-next | eslint 9.39.5 |
| PayPal | REST API (sandbox); `@paypal/agent-toolkit` for read and invoice tools | toolkit added with its first slice |
| Hosting | Render free web service | — |

## Reasons

- **One Next.js codebase** covers UI, API routes and webhook endpoints, so
  there's one deploy and one set of instructions for judges.
- **Vercel AI SDK** is what `@paypal/agent-toolkit` integrates with, and it can
  switch providers (Gemini, or Groq as a fallback) without a rewrite.
- **Gemini Flash** is free, supports tool calling and accepts image input, which
  receipt and photo checks need.
- **`node:sqlite`** avoids native build dependencies, which matters because the
  network here is slow and unreliable. Render's free disk is wiped on restart, so
  reseeding at boot is how the demo gets a known state.
- **Payouts through REST, not the toolkit:** the toolkit has no Payouts tool, and
  keeping money-moving calls out of agent tool sets is a product rule anyway.

## Consequences

- `node:sqlite` is marked experimental and logs a warning. The API could change
  within Node 22.x, so Node is pinned to 22.
- Demo data does not survive restarts. That's intended, and it's documented for
  judges.
- Next 16 differs from older Next versions. Read `node_modules/next/dist/docs/`
  before using any framework API.
- The repo lives in `C:\dev\ProofPay` because OneDrive sync broke `npm install`
  (it replaced the `node_modules` junction).
