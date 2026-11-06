import type { DatabaseSync } from "node:sqlite";
import { checkRelease, formatMinor, type MilestoneStatus } from "@/domain/release";
import type { PayPalPort, ProofFile, VerifierPort } from "./ports";
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
};

export type ProjectView = ProjectSummary & { milestones: MilestoneView[] };

export type Deps = { db: DatabaseSync; paypal: PayPalPort; verifier: VerifierPort };

type ProjectRow = { id: number; name: string; budget_minor: number; currency: string; released_minor: number };

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
};

const PROJECT_SQL = `
  SELECT p.id, p.name, p.budget_minor, p.currency,
         COALESCE((SELECT SUM(amount_minor) FROM milestone m WHERE m.project_id = p.id AND m.status = 'paid'), 0) AS released_minor
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
      remaining: formatMinor(r.budget_minor - r.released_minor),
      currency: r.currency,
    },
  };
}

function toMilestone(r: MilestoneRow): MilestoneView {
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
  };
}

export function createService({ db, paypal, verifier }: Deps) {
  function getMilestoneRow(id: number): MilestoneRow | undefined {
    return db.prepare(`${MILESTONE_SQL} WHERE m.id = ?`).get(id) as MilestoneRow | undefined;
  }

  function mustGet(id: number): MilestoneRow {
    const row = getMilestoneRow(id);
    if (!row) throw new Error(`Milestone ${id} not found`);
    return row;
  }

  return {
    async submitProof(id: number, file: ProofFile): Promise<MilestoneView> {
      if (!file.mediaType.startsWith("image/")) throw new Error("Proof must be an image");
      if (file.data.byteLength === 0) throw new Error("Proof file is empty");
      const row = mustGet(id);
      if (row.status !== "awaiting_proof") throw new Error(`Proof already submitted (status: ${row.status})`);

      db.prepare(`UPDATE milestone SET status = 'under_review', proof_image = ?, proof_mime = ? WHERE id = ?`).run(
        Buffer.from(file.data).toString("base64"),
        file.mediaType,
        id,
      );
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
        db.prepare(`UPDATE milestone SET status = 'awaiting_proof', proof_image = NULL, proof_mime = NULL WHERE id = ?`).run(id);
        throw err;
      }
      const status: MilestoneStatus = verification.recommendation === "release" ? "ready" : "on_hold";
      db.prepare(`UPDATE milestone SET status = ?, verification = ? WHERE id = ?`).run(
        status,
        JSON.stringify(verification),
        id,
      );
      return toMilestone(mustGet(id));
    },

    async approveRelease(id: number): Promise<MilestoneView> {
      const row = mustGet(id);
      const check = checkRelease({ status: row.status, ownerApproved: true });
      if (!check.ok) throw new Error(`Release refused: ${check.reason}`);
      // Conditional update: only one caller can move ready -> approved.
      const { changes } = db
        .prepare(`UPDATE milestone SET status = 'approved' WHERE id = ? AND status = 'ready'`)
        .run(id);
      if (changes === 0) throw new Error("Release refused: not_ready");

      try {
        const payout = await paypal.createPayout({
          requestId: `proofpay-milestone-${id}`,
          receiverEmail: row.payee_email,
          amount: formatMinor(row.amount_minor),
          currency: row.currency,
          note: `${row.project_name}: ${row.title}`,
        });
        db.prepare(`UPDATE milestone SET status = 'paid', payout_batch_id = ?, payout_status = ? WHERE id = ?`).run(
          payout.batchId,
          payout.status,
          id,
        );
      } catch (err) {
        db.prepare(`UPDATE milestone SET status = 'ready' WHERE id = ?`).run(id);
        throw err;
      }
      return toMilestone(mustGet(id));
    },

    async refreshPayout(id: number): Promise<MilestoneView> {
      const row = mustGet(id);
      if (row.payout_batch_id) {
        const status = await paypal.getPayoutStatus(row.payout_batch_id);
        db.prepare(`UPDATE milestone SET payout_status = ? WHERE id = ?`).run(status, id);
      }
      return toMilestone(mustGet(id));
    },

    listProjects(): ProjectSummary[] {
      return (db.prepare(`${PROJECT_SQL} ORDER BY p.id`).all() as ProjectRow[]).map(toSummary);
    },

    getProject(id: number): ProjectView | undefined {
      const row = db.prepare(`${PROJECT_SQL} WHERE p.id = ?`).get(id) as ProjectRow | undefined;
      if (!row) return undefined;
      const milestones = (
        db.prepare(`${MILESTONE_SQL} WHERE m.project_id = ? ORDER BY m.position`).all(id) as MilestoneRow[]
      ).map(toMilestone);
      return { ...toSummary(row), milestones };
    },

    getMilestone(id: number): MilestoneView | undefined {
      const row = getMilestoneRow(id);
      return row && toMilestone(row);
    },
  };
}

export type Service = ReturnType<typeof createService>;
