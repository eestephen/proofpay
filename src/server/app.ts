import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { paypalAdapter } from "./paypal";
import { createService, type Service } from "./service";
import { openStore } from "./store";
import { geminiVerifier } from "./verify";

const DB_PATH = path.join(process.cwd(), "data", "proofpay.db");

const globalForApp = globalThis as unknown as { proofpay?: Service };

function boot(): Service {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  // Reseed on every process start: the demo always begins from a known state.
  rmSync(DB_PATH, { force: true });
  const db = openStore(DB_PATH, {
    currency: process.env.PAYOUT_CURRENCY ?? "SGD",
    payeeEmail: process.env.PAYOUT_RECEIVER_EMAIL ?? "",
  });
  return createService({ db, paypal: paypalAdapter, verifier: geminiVerifier });
}

/** The production service, wired to real PayPal sandbox and Gemini. */
export function app(): Service {
  globalForApp.proofpay ??= boot();
  return globalForApp.proofpay;
}
