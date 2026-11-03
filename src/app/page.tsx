import { Suspense } from "react";
import { connection } from "next/server";
import { getMilestone } from "@/server/db";
import type { Verification } from "@/server/verify";
import { approveRelease, refreshPayout, submitProof } from "./actions";

export default function Page() {
  return (
    <main className="mx-auto max-w-2xl p-8 font-sans">
      <h1 className="text-3xl font-bold">ProofPay</h1>
      <p className="mb-6 text-gray-600">Pay only for verified work.</p>
      <Suspense fallback={<p>Loading milestone…</p>}>
        <MilestoneCard />
      </Suspense>
    </main>
  );
}

async function MilestoneCard() {
  await connection();
  const m = getMilestone(1);
  if (!m) return <p>No milestone seeded.</p>;
  const v = m.verification ? (JSON.parse(m.verification) as Verification) : null;

  return (
    <section className="space-y-4 rounded-lg border p-6">
      <div>
        <p className="text-sm text-gray-500">{m.project}</p>
        <h2 className="text-xl font-semibold">{m.title}</h2>
        <p className="text-gray-700">{m.description}</p>
        <p className="mt-2">
          <b>
            {m.amount} {m.currency}
          </b>{" "}
          to {m.payeeName} ({m.payeeEmail}) · status: <code>{m.status}</code>
        </p>
      </div>

      {m.status === "awaiting_proof" && (
        <form action={submitProof} className="space-y-2">
          <p className="font-medium">Payee: upload proof (invoice or work photo)</p>
          <input type="file" name="proof" accept="image/*" required />
          <button className="rounded bg-black px-4 py-2 text-white" type="submit">
            Submit proof for AI verification
          </button>
        </form>
      )}

      {m.proofImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt="Submitted proof"
          className="max-h-64 rounded border"
          src={`data:${m.proofMime};base64,${m.proofImage}`}
        />
      )}

      {v && (
        <div className={`rounded p-4 ${v.recommendation === "release" ? "bg-green-50" : "bg-amber-50"}`}>
          <p className="font-medium">
            AI verifier recommends: <b>{v.recommendation.toUpperCase()}</b> (document total: {v.extractedTotal})
          </p>
          <ul className="ml-5 list-disc">
            {v.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {m.status === "proof_submitted" && (
        <form action={approveRelease}>
          <button className="rounded bg-blue-600 px-4 py-2 text-white" type="submit">
            Owner: approve and release {m.amount} {m.currency} via PayPal
          </button>
        </form>
      )}

      {m.payoutBatchId && (
        <div className="rounded bg-blue-50 p-4">
          <p>
            PayPal payout batch <code>{m.payoutBatchId}</code>: <b>{m.payoutStatus}</b>
          </p>
          <form action={refreshPayout}>
            <button className="mt-2 underline" type="submit">
              Refresh status from PayPal
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
