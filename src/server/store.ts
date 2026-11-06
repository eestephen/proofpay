import { DatabaseSync } from "node:sqlite";

export type SeedOptions = { currency: string; payeeEmail: string; budgetMinor?: number };

const SCHEMA = `
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
    proof_image TEXT,
    proof_mime TEXT,
    verification TEXT,
    payout_batch_id TEXT,
    payout_status TEXT,
    payout_attempts INTEGER NOT NULL DEFAULT 0,
    payout_error TEXT
  );
  CREATE TABLE audit (
    id INTEGER PRIMARY KEY,
    milestone_id INTEGER NOT NULL REFERENCES milestone(id),
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

/** Opens a SQLite store with a fresh schema and the demo seed data. */
export function openStore(location: string, seed: SeedOptions): DatabaseSync {
  const db = new DatabaseSync(location);
  db.exec(SCHEMA);
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
  return db;
}
