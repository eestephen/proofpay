import { mkdirSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { catalogAdapter } from "./catalog";
import { geminiNegotiator } from "./negotiate";
import { paypalAdapter } from "./paypal";
import { createService, type Service } from "./service";
import { openStore, type SeedOptions } from "./store";
import { geminiVerifier } from "./verify";

const DB_PATH = path.join(process.cwd(), "data", "proofpay.db");

const globalForApp = globalThis as unknown as { proofpay?: Service };

function boot(): Service {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  // Reseed on every process start: the demo always begins from a known state.
  rmSync(DB_PATH, { force: true });
  const seed: SeedOptions = {
    currency: process.env.PAYOUT_CURRENCY ?? "SGD",
    payeeEmail: process.env.PAYOUT_RECEIVER_EMAIL ?? "",
  };
  return createService({
    db: openStore(DB_PATH, seed),
    seed,
    paypal: paypalAdapter,
    verifier: geminiVerifier,
    catalog: catalogAdapter,
    negotiator: geminiNegotiator,
    ownerPasscode: process.env.OWNER_PASSCODE || undefined,
    // Without a fixed secret, sessions and payee links last until the next restart,
    // which is also when the demo data resets.
    secret: process.env.SESSION_SECRET || randomBytes(32).toString("hex"),
  });
}

/** The production service, wired to real PayPal sandbox and Gemini. */
export function app(): Service {
  globalForApp.proofpay ??= boot();
  return globalForApp.proofpay;
}
