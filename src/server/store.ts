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
    sample_request TEXT NOT NULL,
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

const CAFE: SeedMilestone[] = [
  [
    "Electrical rewiring and lighting",
    "Rewire the shop unit to the new layout, install 14 pendant lights and 6 power points, and provide the certificate of compliance.",
    280000,
    "Volt Electrical Pte Ltd",
  ],
  [
    "Service counter carpentry",
    "Build and install the 4 m service counter with a quartz top, display shelving and under-counter storage.",
    350000,
    "Ong Carpentry",
  ],
  [
    "Shopfront signage",
    "Fabricate and mount the illuminated shopfront sign (2.4 m x 0.6 m) and window decals.",
    160000,
    "BrightSign Studio",
  ],
  [
    "Deep clean and handover",
    "Post-construction deep clean of the whole unit, ready for opening day.",
    60000,
    "Sparkle Cleaning Services",
  ],
];

const BATHROOM: SeedMilestone[] = [
  [
    "Waterproofing",
    "Strip the old floor, apply a two-coat waterproofing membrane and run a 24-hour flood test.",
    140000,
    "AquaSeal Waterproofing",
  ],
  [
    "Wall and floor tiling",
    "Tile 18 m2 of bathroom walls and floor, including grout and sealing.",
    120000,
    "Tan Tiling Works",
  ],
  [
    "Sanitary fittings",
    "Install the vanity, WC, shower set and accessories, and test for leaks.",
    100000,
    "Rahman M&E Contractors",
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
    const insertProject = db.prepare(
      `INSERT INTO project (name, sample_request, budget_minor, currency) VALUES (?, ?, ?, ?)`,
    );
    const insert = db.prepare(
      `INSERT INTO milestone (project_id, position, title, description, amount_minor, payee_name, payee_email)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    // The bathroom budget (3,000) is deliberately below its milestones (3,600) to demo the fund limit.
    const projects: [string, string, number, SeedMilestone[]][] = [
      [
        "Kitchen renovation, 14 Elm St",
        "Buy 40 m2 of porcelain floor tiles for the kitchen, max 2,000 SGD, delivered within 5 days",
        seed.budgetMinor ?? 800000,
        KITCHEN,
      ],
      [
        "Cafe fit-out, 22 Tiong Bahru Rd",
        "Buy 14 pendant lights for the cafe, max 1,500 SGD, delivered within 4 days",
        1200000,
        CAFE,
      ],
      [
        "Bathroom remodel, 8 Jalan Kayu",
        "Buy 20 bags of tile grout, max 400 SGD, delivered within 3 days",
        300000,
        BATHROOM,
      ],
    ];
    for (const [name, sampleRequest, budget, milestones] of projects) {
      const { lastInsertRowid: projectId } = insertProject.run(name, sampleRequest, budget, seed.currency);
      milestones.forEach(([title, description, amount, payee], i) =>
        insert.run(projectId, i + 1, title, description, amount, payee, seed.payeeEmail),
      );
    }
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
