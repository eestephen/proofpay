import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export type SeedOptions = { currency: string; payeeEmail: string; budgetMinor?: number };

const SCHEMA = `
  DROP TABLE IF EXISTS audit;
  DROP TABLE IF EXISTS quote;
  DROP TABLE IF EXISTS purchase;
  DROP TABLE IF EXISTS proof_file;
  DROP TABLE IF EXISTS milestone;
  DROP TABLE IF EXISTS project;
  DROP TABLE IF EXISTS meta;
  DROP TABLE IF EXISTS webhook_event;
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE webhook_event (id TEXT PRIMARY KEY, type TEXT NOT NULL, received_at TEXT NOT NULL);
  CREATE TABLE project (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    mode TEXT NOT NULL,
    budget_minor INTEGER NOT NULL,
    currency TEXT NOT NULL
  );
  CREATE TABLE milestone (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES project(id),
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    amount_minor INTEGER NOT NULL,
    payee_name TEXT NOT NULL,
    payee_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'awaiting_proof',
    verification TEXT,
    payout_batch_id TEXT,
    payout_status TEXT,
    payout_attempts INTEGER NOT NULL DEFAULT 0,
    payout_request_id TEXT,
    payout_error TEXT
  );
  CREATE TABLE proof_file (
    id INTEGER PRIMARY KEY,
    milestone_id INTEGER NOT NULL REFERENCES milestone(id),
    role TEXT NOT NULL,
    mime TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    data TEXT NOT NULL,
    superseded INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX proof_file_sha ON proof_file(sha256);
  CREATE TABLE purchase (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES project(id),
    text TEXT NOT NULL,
    item TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit TEXT NOT NULL,
    budget_minor INTEGER NOT NULL,
    deadline_days INTEGER NOT NULL,
    reference TEXT NOT NULL,
    status TEXT NOT NULL,
    supplier_id TEXT,
    agent_supplier_id TEXT,
    reasoning TEXT NOT NULL,
    overruled TEXT,
    model TEXT NOT NULL,
    created_at TEXT NOT NULL,
    order_status TEXT,
    order_total_minor INTEGER,
    order_attempts INTEGER NOT NULL DEFAULT 0,
    order_request_id TEXT,
    order_error TEXT,
    payout_batch_id TEXT,
    payout_status TEXT,
    invoice_id TEXT,
    invoice_status TEXT,
    invoice_error TEXT,
    tracking_number TEXT,
    tracking_carrier TEXT,
    ordered_at TEXT
  );
  CREATE TABLE quote (
    id INTEGER PRIMARY KEY,
    purchase_id INTEGER NOT NULL REFERENCES purchase(id),
    supplier_id TEXT NOT NULL,
    supplier_name TEXT NOT NULL,
    round INTEGER NOT NULL,
    counter_unit_minor INTEGER,
    unit_minor INTEGER NOT NULL,
    total_minor INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    lead_days INTEGER NOT NULL,
    available INTEGER NOT NULL,
    note TEXT NOT NULL
  );
  CREATE TABLE audit (
    id INTEGER PRIMARY KEY,
    milestone_id INTEGER REFERENCES milestone(id),
    purchase_id INTEGER REFERENCES purchase(id),
    at TEXT NOT NULL,
    kind TEXT NOT NULL,
    detail TEXT NOT NULL
  );
`;

type SeedMilestone = [title: string, description: string, amountMinor: number, payeeName: string];

const KITCHEN: SeedMilestone[] = [
  [
    "Stage 1: Demolition and site prep",
    "Remove old cabinets, tiles and fittings; dispose of debris; protect adjoining rooms.",
    150000,
    "Lim Demolition Services",
  ],
  [
    "Stage 2: Wall and floor tiling",
    "Tile 40 m2 of kitchen floor and backsplash with supplied ceramic tiles, including grout and sealing. Expected invoice total about $1,200 for labour.",
    120000,
    "Tan Tiling Works",
  ],
  [
    "Stage 3: Plumbing and electrical",
    "Reroute sink plumbing, install 6 new power points and under-cabinet lighting, with certificate of compliance.",
    230000,
    "Rahman M&E Contractors",
  ],
  [
    "Stage 4: Cabinets and final fit-out",
    "Install upper and lower cabinets, quartz countertop, sink and hob; final clean.",
    300000,
    "Ong Carpentry",
  ],
];

/**
 * Drops everything and writes the demo seed. A fresh random epoch means payee
 * links issued before a reset stop working.
 */
export function seedStore(db: DatabaseSync, seed: SeedOptions): void {
  db.exec("BEGIN");
  try {
    db.exec(SCHEMA);
    db.prepare(`INSERT INTO meta (key, value) VALUES ('epoch', ?)`).run(randomBytes(16).toString("hex"));
    const { lastInsertRowid: projectId } = db
      .prepare(`INSERT INTO project (name, mode, budget_minor, currency) VALUES (?, 'sme', ?, ?)`)
      .run("Kitchen renovation, 14 Elm St", seed.budgetMinor ?? 800000, seed.currency);
    const insert = db.prepare(
      `INSERT INTO milestone (project_id, position, title, description, amount_minor, payee_name, payee_email)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    KITCHEN.forEach(([title, description, amount, payee], i) =>
      insert.run(projectId, i + 1, title, description, amount, payee, seed.payeeEmail),
    );
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Opens a SQLite store with a fresh schema and the demo seed data. */
export function openStore(location: string, seed: SeedOptions): DatabaseSync {
  const db = new DatabaseSync(location);
  seedStore(db, seed);
  return db;
}