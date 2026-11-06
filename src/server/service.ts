import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { checkRelease, formatMinor, parseAmountMinor, type MilestoneStatus } from "@/domain/release";
import type { PayPalPort, ProofFile, VerifierPort } from "./ports";
import { seedStore, type SeedOptions } from "./store";
import type { Verification } from "./verify";

export type Fund = { budget: string; released: string; remaining: string; currency: string };

export type ProjectSummary = { id: number; name: string; fund: Fund };

/** The verifier's output after ProofPay's hard rules are applied. */
export type Assessment = Verification & {
  /** What the AI alone recommended, before hard rules. */
  aiRecommendation: Verification["recommendation"];
  /** Hard-rule findings that forced a hold. Also listed first in `reasons`. */
  flags: string[];
};

export type ProofImage = { image: string; mime: string };

export type MilestoneView = {
  id: number;
  projectId: number;
  projectName: string;
  title: string;
  description: string;
  amount: string;
  currency: string;
  payeeName: string;
  payeeEmail: string;
  status: MilestoneStatus;
  /** The current invoice. */
  proof: ProofImage | null;
  /** Current work photos, at most 2. */
  photos: ProofImage[];
  verification: Assessment | null;
  payout: { batchId: string; status: string } | null;
  payoutError: string | null;
  history: AuditEntry[];
};

export type AuditKind =
  | "proof_submitted"
  | "verified"
  | "override"
  | "approved"
  | "payout_sent"
  | "payout_failed"
  | "payout_status";

export type AuditEntry = { at: string; kind: AuditKind; detail: string };

export type ProjectView = ProjectSummary & { milestones: MilestoneView[] };

export type Deps = {
  db: DatabaseSync;
  seed: SeedOptions;
  paypal: PayPalPort;
  verifier: VerifierPort;
  /** Owner sign-in is disabled when unset. */
  ownerPasscode: string | undefined;
  /** Signs owner sessions and payee links. */
  secret: string;
};

/** What a payee sees through their upload link: no audit trail. */
export type PayeeView = Omit<MilestoneView, "history">;

/** An owner session token or a payee link token, as presented by the caller. */
export type Credential = string | null | undefined;

export const MAX_PHOTOS = 2;
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type ProjectRow = {
  id: number;
  name: string;
  budget_minor: number;
  currency: string;
  released_minor: number;
  in_flight_minor: number;
};

type MilestoneRow = {
  id: number;
  project_id: number;
  project_name: string;
  title: string;
  description: string;
  amount_minor: number;
  currency: string;
  payee_name: string;
  payee_email: string;
  status: MilestoneStatus;
  verification: string | null;
  payout_batch_id: string | null;
  payout_status: string | null;
  payout_attempts: number;
  payout_error: string | null;
};

type FileRow = { role: "invoice" | "photo"; mime: string; data: string };

const PROJECT_SQL = `
  SELECT p.id, p.name, p.budget_minor, p.currency,
         COALESCE((SELECT SUM(amount_minor) FROM milestone m WHERE m.project_id = p.id AND m.status = 'paid'), 0) AS released_minor,
         COALESCE((SELECT SUM(amount_minor) FROM milestone m WHERE m.project_id = p.id AND m.status = 'approved'), 0) AS in_flight_minor
  FROM project p`;

const MILESTONE_SQL = `
  SELECT m.*, p.name AS project_name, p.currency
  FROM milestone m JOIN project p ON p.id = m.project_id`;

function toSummary(r: ProjectRow): ProjectSummary {
  return {
    id: r.id,
    name: r.name,
    fund: {
      budget: formatMinor(r.budget_minor),
      released: formatMinor(r.released_minor),
      remaining: formatMinor(r.budget_minor - r.released_minor - r.in_flight_minor),
      currency: r.currency,
    },
  };
}

function toMilestone(r: MilestoneRow, files: FileRow[], history: AuditEntry[]): MilestoneView {
  const invoice = files.find((f) => f.role === "invoice");
  return {
    id: r.id,
    projectId: r.project_id,
    projectName: r.project_name,
    title: r.title,
    description: r.description,
    amount: formatMinor(r.amount_minor),
    currency: r.currency,
    payeeName: r.payee_name,
    payeeEmail: r.payee_email,
    status: r.status,
    proof: invoice ? { image: invoice.data, mime: invoice.mime } : null,
    photos: files.filter((f) => f.role === "photo").map((f) => ({ image: f.data, mime: f.mime })),
    verification: r.verification ? (JSON.parse(r.verification) as Assessment) : null,
    payout: r.payout_batch_id ? { batchId: r.payout_batch_id, status: r.payout_status ?? "UNKNOWN" } : null,
    payoutError: r.payout_error,
    history,
  };
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

function validateProof(files: ProofFile[]) {
  if (files.length === 0) throw new Error("No file uploaded");
  if (files.length > 1 + MAX_PHOTOS) throw new Error(`Upload one invoice and at most ${MAX_PHOTOS} work photos`);
  for (const f of files) {
    if (!ALLOWED_TYPES.has(f.mediaType)) throw new Error("Proof must be a PNG, JPEG or WebP image");
    if (f.data.byteLength === 0) throw new Error("Proof file is empty");
    if (f.data.byteLength > MAX_FILE_BYTES) throw new Error("Each file must be 4 MB or smaller");
  }
}

export function createService({ db, seed, paypal, verifier, ownerPasscode, secret }: Deps) {
  const sign = (value: string) => createHmac("sha256", secret).update(value).digest("base64url");
  const ownerToken = sign("owner");

  function isOwner(credential: Credential): boolean {
    return typeof credential === "string" && safeEqual(credential, ownerToken);
  }

  function requireOwner(credential: Credential) {
    if (!isOwner(credential)) throw new Error("Owner passcode required");
  }

  function payeeTokenFor(milestoneId: number): string {
    const { value: epoch } = db.prepare(`SELECT value FROM meta WHERE key = 'epoch'`).get() as { value: string };
    return sign(`payee:${epoch}:${milestoneId}`);
  }

  function isPayee(milestoneId: number, credential: Credential): boolean {
    return typeof credential === "string" && safeEqual(credential, payeeTokenFor(milestoneId));
  }

  function getMilestoneRow(id: number): MilestoneRow | undefined {
    return db.prepare(`${MILESTONE_SQL} WHERE m.id = ?`).get(id) as MilestoneRow | undefined;
  }

  function mustGet(id: number): MilestoneRow {
    const row = getMilestoneRow(id);
    if (!row) throw new Error(`Milestone ${id} not found`);
    return row;
  }

  function audit(milestoneId: number, kind: AuditKind, detail: string) {
    db.prepare(`INSERT INTO audit (milestone_id, at, kind, detail) VALUES (?, ?, ?, ?)`).run(
      milestoneId,
      new Date().toISOString(),
      kind,
      detail,
    );
  }

  function history(milestoneId: number): AuditEntry[] {
    return db
      .prepare(`SELECT at, kind, detail FROM audit WHERE milestone_id = ? ORDER BY id DESC`)
      .all(milestoneId) as AuditEntry[];
  }

  function currentFiles(milestoneId: number): FileRow[] {
    return db
      .prepare(`SELECT role, mime, data FROM proof_file WHERE milestone_id = ? AND superseded = 0 ORDER BY id`)
      .all(milestoneId) as FileRow[];
  }

  function view(id: number): MilestoneView {
    return toMilestone(mustGet(id), currentFiles(id), history(id));
  }

  function project(id: number): ProjectRow | undefined {
    return db.prepare(`${PROJECT_SQL} WHERE p.id = ?`).get(id) as ProjectRow | undefined;
  }

  /** Title of another milestone that already used this exact file as proof. */
  function usedElsewhere(hash: string, milestoneId: number): string | undefined {
    const hit = db
      .prepare(
        `SELECT m.title FROM proof_file f JOIN milestone m ON m.id = f.milestone_id
         WHERE f.sha256 = ? AND f.milestone_id != ? ORDER BY f.id LIMIT 1`,
      )
      .get(hash, milestoneId) as { title: string } | undefined;
    return hit?.title;
  }

  /** Hard rules run after the AI. Any finding forces a hold, whatever the AI said. */
  function assess(row: MilestoneRow, v: Verification, hashes: string[]): Assessment {
    const flags: string[] = [];
    hashes.forEach((hash, i) => {
      const title = usedElsewhere(hash, row.id);
      const label = i === 0 ? "The invoice" : `Work photo ${i}`;
      if (title) flags.push(`${label} was already submitted as proof for "${title}"`);
    });
    const totalMinor = parseAmountMinor(v.extractedTotal);
    if (totalMinor !== null && totalMinor > row.amount_minor) {
      flags.push(
        `Document total ${v.extractedTotal} is above the milestone amount ${formatMinor(row.amount_minor)} ${row.currency}`,
      );
    }
    if (v.injectionDetected) {
      flags.push(`Instructions aimed at the reviewer were found in the document${v.injectionNote ? `: "${v.injectionNote}"` : ""}`);
    }
    return {
      ...v,
      recommendation: flags.length > 0 ? "hold" : v.recommendation,
      aiRecommendation: v.recommendation,
      flags,
      reasons: [...flags, ...v.reasons],
    };
  }

  return {
    ownerSession(passcode: string): string | null {
      if (!ownerPasscode) return null;
      return safeEqual(passcode, ownerPasscode) ? ownerToken : null;
    },

    isOwner,

    /** The token for a milestone's private payee upload link. Owner only. */
    payeeToken(id: number, credential: Credential): string {
      requireOwner(credential);
      mustGet(id);
      return payeeTokenFor(id);
    },

    getPayeeView(id: number, credential: Credential): PayeeView | undefined {
      if (!getMilestoneRow(id) || !isPayee(id, credential)) return undefined;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { history, ...rest } = view(id);
      return rest;
    },

    resetDemo(credential: Credential): void {
      requireOwner(credential);
      seedStore(db, seed);
    },

    /**
     * Owner or the milestone's own payee submits proof: one invoice, then up to
     * two work photos. Allowed while awaiting proof or after a hold.
     */
    async submitProof(id: number, proof: ProofFile | ProofFile[], credential: Credential): Promise<MilestoneView> {
      if (!isOwner(credential) && !isPayee(id, credential)) throw new Error("Invalid upload link");
      const files = Array.isArray(proof) ? proof : [proof];
      validateProof(files);
      const row = mustGet(id);
      const previous = row.status;
      const { changes } = db
        .prepare(`UPDATE milestone SET status = 'under_review' WHERE id = ? AND status IN ('awaiting_proof', 'on_hold')`)
        .run(id);
      if (changes === 0) throw new Error(`Proof cannot be submitted now (status: ${row.status})`);
      audit(id, "proof_submitted", files.map((f, i) => `${i === 0 ? "invoice" : "photo"} ${f.mediaType} ${f.data.byteLength} B`).join(", "));

      let verification: Verification;
      try {
        verification = await verifier.verify(
          {
            title: row.title,
            description: row.description,
            amount: formatMinor(row.amount_minor),
            currency: row.currency,
            payeeName: row.payee_name,
          },
          files,
        );
      } catch (err) {
        // Leave the milestone where it was so proof can be retried.
        db.prepare(`UPDATE milestone SET status = ? WHERE id = ?`).run(previous, id);
        throw err;
      }

      const hashes = files.map((f) => sha256(f.data));
      const assessment = assess(row, verification, hashes);
      db.prepare(`UPDATE proof_file SET superseded = 1 WHERE milestone_id = ?`).run(id);
      const insert = db.prepare(`INSERT INTO proof_file (milestone_id, role, mime, sha256, data) VALUES (?, ?, ?, ?, ?)`);
      files.forEach((f, i) =>
        insert.run(id, i === 0 ? "invoice" : "photo", f.mediaType, hashes[i], Buffer.from(f.data).toString("base64")),
      );
      db.prepare(`UPDATE milestone SET status = ?, verification = ? WHERE id = ?`).run(
        assessment.recommendation === "release" ? "ready" : "on_hold",
        JSON.stringify(assessment),
        id,
      );
      audit(id, "verified", `${assessment.recommendation} (${assessment.model}): ${assessment.reasons.join("; ")}`);
      return view(id);
    },

    /**
     * Owner approval. Sends one PayPal payout. A PayPal failure does not throw:
     * the milestone moves to payout_failed with the error, and can be retried.
     * `override` releases a milestone the verifier put on hold.
     */
    async approveRelease(id: number, credential: Credential, opts: { override?: boolean } = {}): Promise<MilestoneView> {
      requireOwner(credential);
      const row = mustGet(id);
      const p = project(row.project_id)!;
      const override = opts.override === true && row.status === "on_hold";
      const check = checkRelease({
        status: row.status,
        ownerApproved: true,
        amountMinor: row.amount_minor,
        remainingMinor: p.budget_minor - p.released_minor - p.in_flight_minor,
        override,
      });
      if (!check.ok) throw new Error(`Release refused: ${check.reason}`);
      const fromStatuses = override ? "('on_hold')" : "('ready', 'payout_failed')";
      // Conditional update: only one caller can move the milestone to approved.
      const { changes } = db
        .prepare(
          `UPDATE milestone SET status = 'approved', payout_attempts = payout_attempts + 1
           WHERE id = ? AND status IN ${fromStatuses}`,
        )
        .run(id);
      if (changes === 0) throw new Error("Release refused: not_ready");
      if (override) {
        const reasons = row.verification ? (JSON.parse(row.verification) as Assessment).reasons.join("; ") : "";
        audit(id, "override", `owner released despite hold: ${reasons}`);
      }
      const attempt = mustGet(id).payout_attempts;
      audit(id, "approved", `attempt ${attempt}: ${formatMinor(row.amount_minor)} ${row.currency} to ${row.payee_email}`);

      try {
        const payout = await paypal.createPayout({
          requestId: `proofpay-milestone-${id}-attempt-${attempt}`,
          receiverEmail: row.payee_email,
          amount: formatMinor(row.amount_minor),
          currency: row.currency,
          note: `${row.project_name}: ${row.title}`,
        });
        db.prepare(
          `UPDATE milestone SET status = 'paid', payout_batch_id = ?, payout_status = ?, payout_error = NULL WHERE id = ?`,
        ).run(payout.batchId, payout.status, id);
        audit(id, "payout_sent", `batch ${payout.batchId}: ${payout.status}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        db.prepare(`UPDATE milestone SET status = 'payout_failed', payout_error = ? WHERE id = ?`).run(message, id);
        audit(id, "payout_failed", message);
      }
      return view(id);
    },

    async refreshPayout(id: number): Promise<MilestoneView> {
      const row = mustGet(id);
      if (row.payout_batch_id) {
        const status = await paypal.getPayoutStatus(row.payout_batch_id);
        if (status !== row.payout_status) {
          db.prepare(`UPDATE milestone SET payout_status = ? WHERE id = ?`).run(status, id);
          audit(id, "payout_status", `batch ${row.payout_batch_id}: ${status}`);
        }
      }
      return view(id);
    },

    listProjects(): ProjectSummary[] {
      return (db.prepare(`${PROJECT_SQL} ORDER BY p.id`).all() as ProjectRow[]).map(toSummary);
    },

    getProject(id: number): ProjectView | undefined {
      const row = project(id);
      if (!row) return undefined;
      const milestones = (
        db.prepare(`${MILESTONE_SQL} WHERE m.project_id = ? ORDER BY m.position`).all(id) as MilestoneRow[]
      ).map((m) => toMilestone(m, currentFiles(m.id), history(m.id)));
      return { ...toSummary(row), milestones };
    },

    getMilestone(id: number): MilestoneView | undefined {
      return getMilestoneRow(id) ? view(id) : undefined;
    },
  };
}

export type Service = ReturnType<typeof createService>;
