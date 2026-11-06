import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { checkRelease, formatMinor, nextPayoutStatus, parseAmountMinor, type MilestoneStatus } from "@/domain/release";
import { PayoutRejected, type PayPalPort, type ProofFile, type VerifierPort } from "./ports";
import { seedStore, type SeedOptions } from "./store";
import type { Verification } from "./verify";

/** released = paid out; committed = approved and in flight; remaining = what can still be released. */
export type Fund = { budget: string; released: string; committed: string; remaining: string; currency: string };

/** One milestone row for the project board. No images, emails or audit detail. */
export type BoardRow = {
  id: number;
  position: number;
  title: string;
  payeeName: string;
  /** Major units, as a number so the grid can sort and filter it. */
  amount: number;
  currency: string;
  status: MilestoneStatus;
  recommendation: "release" | "hold" | null;
  fraudChecks: number;
  payoutStatus: string | null;
  lastEvent: AuditKind | null;
  lastEventAt: string | null;
};

export type Board = ProjectSummary & { rows: BoardRow[] };

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
  | "verification_failed"
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
  /** Clock, for session expiry. */
  now?: () => number;
};

export const OWNER_SESSION_MS = 12 * 60 * 60 * 1000;

export type WebhookDelivery = { headers: Record<string, string>; body: string };

export type WebhookResult = { result: "applied" | "ignored" | "duplicate" | "rejected"; reason: string };

/** Pulls the batch id and status out of a PayPal payout batch or payout item event. */
function payoutEvent(event: {
  event_type?: string;
  resource?: {
    payout_batch_id?: string;
    transaction_status?: string;
    batch_header?: { payout_batch_id?: string; batch_status?: string };
  };
}): { batchId: string; status: string } | null {
  const r = event.resource;
  if (event.event_type?.startsWith("PAYMENT.PAYOUTS-ITEM.") && r?.payout_batch_id && r.transaction_status) {
    return { batchId: r.payout_batch_id, status: r.transaction_status };
  }
  if (event.event_type?.startsWith("PAYMENT.PAYOUTSBATCH.") && r?.batch_header?.payout_batch_id && r.batch_header.batch_status) {
    return { batchId: r.batch_header.payout_batch_id, status: r.batch_header.batch_status };
  }
  return null;
}

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
  payout_request_id: string | null;
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
      committed: formatMinor(r.in_flight_minor),
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

export function createService({ db, seed, paypal, verifier, ownerPasscode, secret, now = Date.now }: Deps) {
  const sign = (value: string) => createHmac("sha256", secret).update(value).digest("base64url");
  // Bound to the passcode, so changing the passcode signs everyone out.
  const ownerSig = (issuedAt: number) => sign(`owner:${ownerPasscode}:${issuedAt}`);

  function isOwner(credential: Credential): boolean {
    if (!ownerPasscode || typeof credential !== "string") return false;
    const [issued, sig] = credential.split(".");
    const issuedAt = Number(issued);
    if (!Number.isSafeInteger(issuedAt) || !sig || !safeEqual(sig, ownerSig(issuedAt))) return false;
    const age = now() - issuedAt;
    return age >= 0 && age <= OWNER_SESSION_MS;
  }

  function epoch(): string {
    return (db.prepare(`SELECT value FROM meta WHERE key = 'epoch'`).get() as { value: string }).value;
  }

  /** Throws if a demo reset happened while an AI or PayPal call was in flight. */
  function assertSameEpoch(started: string) {
    if (epoch() !== started) throw new Error("The demo was reset while this was in progress; nothing was saved");
  }

  function requireOwner(credential: Credential) {
    if (!isOwner(credential)) throw new Error("Owner passcode required");
  }

  function payeeTokenFor(milestoneId: number): string {
    return sign(`payee:${epoch()}:${milestoneId}`);
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

  /**
   * Records a payout status PayPal reported. A failure moves the milestone back
   * to payout_failed and out of the released total; otherwise status only moves
   * forward. Returns whether anything changed.
   */
  function applyPayoutStatus(row: MilestoneRow, status: string, source: string): boolean {
    if (row.status !== "paid" || !row.payout_batch_id) return false;
    const next = nextPayoutStatus(row.payout_status, status);
    if (!next.apply) return false;
    if (next.failed) {
      db.prepare(
        `UPDATE milestone SET status = 'payout_failed', payout_status = ?, payout_error = ?, payout_request_id = NULL WHERE id = ?`,
      ).run(status, `PayPal batch ${row.payout_batch_id} ended ${status}`, row.id);
      audit(row.id, "payout_failed", `batch ${row.payout_batch_id}: ${status} (${source})`);
    } else {
      db.prepare(`UPDATE milestone SET payout_status = ? WHERE id = ?`).run(status, row.id);
      audit(row.id, "payout_status", `batch ${row.payout_batch_id}: ${status} (${source})`);
    }
    return true;
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
    const label = (i: number) => (i === 0 ? "The invoice" : `Work photo ${i}`);
    hashes.forEach((hash, i) => {
      const first = hashes.indexOf(hash);
      if (first < i) flags.push(`${label(i)} is the same file as ${label(first).toLowerCase()}`);
      const title = usedElsewhere(hash, row.id);
      if (title) flags.push(`${label(i)} was already submitted as proof for "${title}"`);
    });
    const totalMinor = parseAmountMinor(v.extractedTotal);
    if (totalMinor === null) {
      flags.push("Could not read a total from the invoice, so the amount cannot be checked");
    } else if (totalMinor > row.amount_minor) {
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
      if (!ownerPasscode || !safeEqual(passcode, ownerPasscode)) return null;
      const issuedAt = now();
      return `${issuedAt}.${ownerSig(issuedAt)}`;
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
      const started = epoch();
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
        assertSameEpoch(started);
        // Leave the milestone where it was so proof can be retried.
        db.prepare(`UPDATE milestone SET status = ? WHERE id = ?`).run(previous, id);
        audit(id, "verification_failed", err instanceof Error ? err.message : String(err));
        throw err;
      }
      assertSameEpoch(started);

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
      // After an unclear failure PayPal may have created the batch, so reuse its request id.
      const started = epoch();
      const requestId = row.payout_request_id ?? `proofpay-${started.slice(0, 12)}-m${id}-a${row.payout_attempts + 1}`;
      const { changes } = db
        .prepare(
          `UPDATE milestone SET status = 'approved', payout_attempts = payout_attempts + 1, payout_request_id = ?
           WHERE id = ? AND status IN ${fromStatuses}`,
        )
        .run(requestId, id);
      if (changes === 0) throw new Error("Release refused: not_ready");
      if (override) {
        const reasons = row.verification ? (JSON.parse(row.verification) as Assessment).reasons.join("; ") : "";
        audit(id, "override", `owner released despite hold: ${reasons}`);
      }
      const attempt = mustGet(id).payout_attempts;
      audit(id, "approved", `attempt ${attempt}: ${formatMinor(row.amount_minor)} ${row.currency} to ${row.payee_email}`);

      try {
        const payout = await paypal.createPayout({
          requestId,
          receiverEmail: row.payee_email,
          amount: formatMinor(row.amount_minor),
          currency: row.currency,
          note: `${row.project_name}: ${row.title}`,
        });
        assertSameEpoch(started);
        db.prepare(
          `UPDATE milestone SET status = 'paid', payout_batch_id = ?, payout_status = ?, payout_error = NULL WHERE id = ?`,
        ).run(payout.batchId, payout.status, id);
        audit(id, "payout_sent", `batch ${payout.batchId}: ${payout.status}`);
      } catch (err) {
        assertSameEpoch(started);
        const message = err instanceof Error ? err.message : String(err);
        const definite = err instanceof PayoutRejected;
        db.prepare(
          `UPDATE milestone SET status = 'payout_failed', payout_error = ?, payout_request_id = ? WHERE id = ?`,
        ).run(message, definite ? null : requestId, id);
        audit(id, "payout_failed", `${definite ? "rejected" : "unclear, retry reuses the same request id"}: ${message}`);
      }
      return view(id);
    },

    async refreshPayout(id: number, credential: Credential): Promise<MilestoneView> {
      requireOwner(credential);
      const row = mustGet(id);
      if (row.payout_batch_id && row.status === "paid") {
        const started = epoch();
        const status = await paypal.getPayoutStatus(row.payout_batch_id);
        assertSameEpoch(started);
        applyPayoutStatus(mustGet(id), status, "manual refresh");
      }
      return view(id);
    },

    /**
     * A PayPal webhook delivery. Verified with PayPal before anything changes,
     * deduplicated by event id, and only ever moves payout status forward.
     */
    async handleWebhook(delivery: WebhookDelivery): Promise<WebhookResult> {
      let event: Parameters<typeof payoutEvent>[0] & { id?: string };
      try {
        event = JSON.parse(delivery.body);
      } catch {
        return { result: "rejected", reason: "body is not JSON" };
      }
      if (typeof event.id !== "string") return { result: "rejected", reason: "event has no id" };
      const started = epoch();
      if (!(await paypal.verifyWebhook(delivery.headers, delivery.body))) {
        return { result: "rejected", reason: "PayPal did not confirm the signature" };
      }
      if (epoch() !== started) return { result: "ignored", reason: "demo was reset" };
      const { changes } = db
        .prepare(`INSERT OR IGNORE INTO webhook_event (id, type, received_at) VALUES (?, ?, ?)`)
        .run(event.id, event.event_type ?? "", new Date(now()).toISOString());
      if (changes === 0) return { result: "duplicate", reason: `event ${event.id} already handled` };

      const payout = payoutEvent(event);
      if (!payout) return { result: "ignored", reason: `unhandled event type ${event.event_type}` };
      const row = db.prepare(`${MILESTONE_SQL} WHERE m.payout_batch_id = ?`).get(payout.batchId) as
        | MilestoneRow
        | undefined;
      if (!row) return { result: "ignored", reason: `no milestone for batch ${payout.batchId}` };
      return applyPayoutStatus(row, payout.status, `webhook ${event.event_type}`)
        ? { result: "applied", reason: `${payout.batchId}: ${payout.status}` }
        : { result: "ignored", reason: `${payout.status} does not move ${row.payout_status} forward` };
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

    getBoard(projectId: number): Board | undefined {
      const p = project(projectId);
      if (!p) return undefined;
      const rows = db
        .prepare(
          `SELECT m.id, m.position, m.title, m.payee_name, m.amount_minor, m.status, m.verification, m.payout_status,
                  (SELECT kind FROM audit a WHERE a.milestone_id = m.id ORDER BY a.id DESC LIMIT 1) AS last_kind,
                  (SELECT at FROM audit a WHERE a.milestone_id = m.id ORDER BY a.id DESC LIMIT 1) AS last_at
           FROM milestone m WHERE m.project_id = ? ORDER BY m.position`,
        )
        .all(projectId) as {
        id: number;
        position: number;
        title: string;
        payee_name: string;
        amount_minor: number;
        status: MilestoneStatus;
        verification: string | null;
        payout_status: string | null;
        last_kind: AuditKind | null;
        last_at: string | null;
      }[];
      return {
        ...toSummary(p),
        rows: rows.map((r) => {
          const a = r.verification ? (JSON.parse(r.verification) as Assessment) : null;
          return {
            id: r.id,
            position: r.position,
            title: r.title,
            payeeName: r.payee_name,
            amount: r.amount_minor / 100,
            currency: p.currency,
            status: r.status,
            recommendation: a?.recommendation ?? null,
            fraudChecks: a?.flags.length ?? 0,
            payoutStatus: r.payout_status,
            lastEvent: r.last_kind,
            lastEventAt: r.last_at,
          };
        }),
      };
    },

    getMilestone(id: number): MilestoneView | undefined {
      return getMilestoneRow(id) ? view(id) : undefined;
    },
  };
}

export type Service = ReturnType<typeof createService>;
