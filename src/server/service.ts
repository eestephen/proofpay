import { createHmac, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { checkRelease, formatMinor, type MilestoneStatus } from "@/domain/release";
import type { PayPalPort, ProofFile, VerifierPort } from "./ports";
import { seedStore, type SeedOptions } from "./store";
import type { Verification } from "./verify";

export type Fund = { budget: string; released: string; remaining: string; currency: string };

export type ProjectSummary = { id: number; name: string; fund: Fund };

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
  proof: { image: string; mime: string } | null;
  verification: Verification | null;
  payout: { batchId: string; status: string } | null;
  payoutError: string | null;
  history: AuditEntry[];
};

export type AuditKind =
  | "proof_submitted"
  | "verified"
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
  proof_image: string | null;
  proof_mime: string | null;
  verification: string | null;
  payout_batch_id: string | null;
  payout_status: string | null;
  payout_attempts: number;
  payout_error: string | null;
};

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

function toMilestone(r: MilestoneRow, history: AuditEntry[]): MilestoneView {
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
    proof: r.proof_image && r.proof_mime ? { image: r.proof_image, mime: r.proof_mime } : null,
    verification: r.verification ? (JSON.parse(r.verification) as Verification) : null,
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

  function view(id: number): MilestoneView {
    return toMilestone(mustGet(id), history(id));
  }

  function project(id: number): ProjectRow | undefined {
    return db.prepare(`${PROJECT_SQL} WHERE p.id = ?`).get(id) as ProjectRow | undefined;
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

    /** Owner or the milestone's own payee may submit proof. */
    async submitProof(id: number, file: ProofFile, credential: Credential): Promise<MilestoneView> {
      if (!isOwner(credential) && !isPayee(id, credential)) throw new Error("Invalid upload link");
      if (!file.mediaType.startsWith("image/")) throw new Error("Proof must be an image");
      if (file.data.byteLength === 0) throw new Error("Proof file is empty");
      const row = mustGet(id);
      if (row.status !== "awaiting_proof") throw new Error(`Proof already submitted (status: ${row.status})`);

      db.prepare(`UPDATE milestone SET status = 'under_review', proof_image = ?, proof_mime = ? WHERE id = ?`).run(
        Buffer.from(file.data).toString("base64"),
        file.mediaType,
        id,
      );
      audit(id, "proof_submitted", `${file.mediaType}, ${file.data.byteLength} bytes`);
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
          file,
        );
      } catch (err) {
        // Leave the milestone retryable rather than stuck in review.
        db.prepare(
          `UPDATE milestone SET status = 'awaiting_proof', proof_image = NULL, proof_mime = NULL WHERE id = ?`,
        ).run(id);
        throw err;
      }
      const status: MilestoneStatus = verification.recommendation === "release" ? "ready" : "on_hold";
      db.prepare(`UPDATE milestone SET status = ?, verification = ? WHERE id = ?`).run(
        status,
        JSON.stringify(verification),
        id,
      );
      audit(id, "verified", `${verification.recommendation} (${verification.model}): ${verification.reasons.join("; ")}`);
      return view(id);
    },

    /**
     * Owner approval. Sends one PayPal payout. A PayPal failure does not throw:
     * the milestone moves to payout_failed with the error, and can be retried.
     */
    async approveRelease(id: number, credential: Credential): Promise<MilestoneView> {
      requireOwner(credential);
      const row = mustGet(id);
      const p = project(row.project_id)!;
      const check = checkRelease({
        status: row.status,
        ownerApproved: true,
        amountMinor: row.amount_minor,
        remainingMinor: p.budget_minor - p.released_minor - p.in_flight_minor,
      });
      if (!check.ok) throw new Error(`Release refused: ${check.reason}`);
      // Conditional update: only one caller can move ready/payout_failed -> approved.
      const { changes } = db
        .prepare(
          `UPDATE milestone SET status = 'approved', payout_attempts = payout_attempts + 1
           WHERE id = ? AND status IN ('ready', 'payout_failed')`,
        )
        .run(id);
      if (changes === 0) throw new Error("Release refused: not_ready");
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
      ).map((m) => toMilestone(m, history(m.id)));
      return { ...toSummary(row), milestones };
    },

    getMilestone(id: number): MilestoneView | undefined {
      return getMilestoneRow(id) ? view(id) : undefined;
    },
  };
}

export type Service = ReturnType<typeof createService>;
