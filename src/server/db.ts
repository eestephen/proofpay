import { DatabaseSync } from "node:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import type { MilestoneStatus } from "@/domain/release";

export type Milestone = {
  id: number;
  project: string;
  title: string;
  description: string;
  amount: string;
  currency: string;
  payeeName: string;
  payeeEmail: string;
  status: MilestoneStatus;
  proofImage: string | null;
  proofMime: string | null;
  verification: string | null;
  payoutBatchId: string | null;
  payoutStatus: string | null;
};

const DB_PATH = path.join(process.cwd(), "data", "proofpay.db");

const globalForDb = globalThis as unknown as { proofpayDb?: DatabaseSync };

function open(): DatabaseSync {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  // Reseed on every process start: the demo always begins from a known state.
  rmSync(DB_PATH, { force: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE milestone (
      id INTEGER PRIMARY KEY,
      project TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      amount TEXT NOT NULL,
      currency TEXT NOT NULL,
      payee_name TEXT NOT NULL,
      payee_email TEXT NOT NULL,
      status TEXT NOT NULL,
      proof_image TEXT,
      proof_mime TEXT,
      verification TEXT,
      payout_batch_id TEXT,
      payout_status TEXT
    );
  `);
  db.prepare(
    `INSERT INTO milestone (id, project, title, description, amount, currency, payee_name, payee_email, status)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, 'awaiting_proof')`,
  ).run(
    "Kitchen renovation, 14 Elm St",
    "Stage 2: Wall and floor tiling",
    "Tile 40 m2 of kitchen floor and backsplash with supplied ceramic tiles, including grout and sealing. Expected invoice total about $1,200 for labour.",
    "1200.00",
    // Must be a currency the sandbox business account holds (this one holds SGD).
    process.env.PAYOUT_CURRENCY ?? "SGD",
    "Tan Tiling Works",
    process.env.PAYOUT_RECEIVER_EMAIL ?? "",
  );
  return db;
}

export function db(): DatabaseSync {
  globalForDb.proofpayDb ??= open();
  return globalForDb.proofpayDb;
}

export function getMilestone(id: number): Milestone | undefined {
  const row = db()
    .prepare(
      `SELECT id, project, title, description, amount, currency,
              payee_name AS payeeName, payee_email AS payeeEmail, status,
              proof_image AS proofImage, proof_mime AS proofMime, verification,
              payout_batch_id AS payoutBatchId, payout_status AS payoutStatus
       FROM milestone WHERE id = ?`,
    )
    .get(id);
  return row as Milestone | undefined;
}
