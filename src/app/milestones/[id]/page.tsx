import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { app } from "@/server/app";
import { approveRelease, refreshPayout, submitProof } from "../../actions";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto max-w-2xl p-8 font-sans">
      <Suspense fallback={<p>Loading milestone…</p>}>
        <MilestoneCard params={params} />
      </Suspense>
    </main>
  );
}

async function MilestoneCard({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const m = app().getMilestone(Number((await params).id));
  if (!m) notFound();
  const v = m.verification;
  const idField = <input name="milestoneId" type="hidden" value={m.id} />;

  return (
    <>
      <Link className="text-sm underline" href={`/projects/${m.projectId}`}>
        ← {m.projectName}
      </Link>
      <section className="mt-3 space-y-4 rounded-lg border p-6">
        <div>
          <h1 className="text-xl font-semibold">{m.title}</h1>
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
            {idField}
            <p className="font-medium">Payee: upload proof (invoice or work photo)</p>
            <input accept="image/*" name="proof" required type="file" />
            <button className="rounded bg-black px-4 py-2 text-white" type="submit">
              Submit proof for AI verification
            </button>
          </form>
        )}

        {m.proof && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt="Submitted proof"
            className="max-h-64 rounded border"
            src={`data:${m.proof.mime};base64,${m.proof.image}`}
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

        {m.status === "ready" && (
          <form action={approveRelease}>
            {idField}
            <button className="rounded bg-blue-600 px-4 py-2 text-white" type="submit">
              Owner: approve and release {m.amount} {m.currency} via PayPal
            </button>
          </form>
        )}

        {m.payout && (
          <div className="rounded bg-blue-50 p-4">
            <p>
              PayPal payout batch <code>{m.payout.batchId}</code>: <b>{m.payout.status}</b>
            </p>
            <form action={refreshPayout}>
              {idField}
              <button className="mt-2 underline" type="submit">
                Refresh status from PayPal
              </button>
            </form>
          </div>
        )}
      </section>
    </>
  );
}
