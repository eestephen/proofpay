import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { app } from "@/server/app";
import { ownerCredential } from "@/server/session";
import { approveRelease, overrideRelease, refreshPayout, submitProof } from "../../actions";
import { AutoRefresh } from "../../auto-refresh";
import { WORDS } from "../../words";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default function Page({ params, searchParams }: Props) {
  return (
    <main className="mx-auto max-w-2xl p-8 font-sans">
      <Suspense fallback={<p>Loading milestone…</p>}>
        <MilestoneCard params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function MilestoneCard({ params, searchParams }: Props) {
  await connection();
  const m = app().getMilestone(Number((await params).id));
  if (!m) notFound();
  const error = (await searchParams).error;
  const w = WORDS[m.projectMode];
  const credential = await ownerCredential();
  const owner = app().isOwner(credential);
  const payeeLink = owner ? `/payee/${m.id}?t=${encodeURIComponent(app().payeeToken(m.id, credential))}` : null;
  const v = m.verification;
  const idField = <input name="milestoneId" type="hidden" value={m.id} />;

  return (
    <>
      <Link className="text-sm underline" href={`/projects/${m.projectId}`}>
        ← {m.projectName}
      </Link>
      {typeof error === "string" && (
        <p className="mt-3 rounded bg-red-50 p-3 text-red-800" role="alert">
          {error}
        </p>
      )}
      <section className="mt-3 space-y-4 rounded-lg border p-6">
        <div>
          <h1 className="text-xl font-semibold">{m.title}</h1>
          <p className="text-gray-700">{m.description}</p>
          <p className="mt-2">
            <b>
              {m.amount} {m.currency}
            </b>{" "}
            to {m.payeeName}
            {owner && ` (${m.payeeEmail})`} · status: <code>{m.status}</code>
          </p>
        </div>

        {!owner && (
          <p className="rounded bg-gray-100 p-3 text-sm">
            Viewing as a visitor.{" "}
            <Link className="underline" href="/login">
              Sign in as {w.owner.toLowerCase()}
            </Link>{" "}
            to upload proof or release payment.
          </p>
        )}

        {payeeLink && m.status === "awaiting_proof" && (
          <p className="rounded bg-gray-100 p-3 text-sm">
            {w.payee} upload link (share with {m.payeeName}):{" "}
            <Link className="break-all underline" href={payeeLink}>
              {payeeLink}
            </Link>
          </p>
        )}

        {owner && (m.status === "awaiting_proof" || m.status === "on_hold") && (
          <form action={submitProof} className="space-y-2">
            {idField}
            <p className="font-medium">
              {m.status === "on_hold" ? "Resubmit proof" : `Upload proof on the ${w.payee.toLowerCase()}'s behalf`}
            </p>
            <label className="block text-sm">
              Invoice (PNG, JPEG or WebP, up to 4 MB)
              <input accept="image/png,image/jpeg,image/webp" className="block" name="proof" required type="file" />
            </label>
            <label className="block text-sm">
              Work photos (optional, up to 2)
              <input accept="image/png,image/jpeg,image/webp" className="block" multiple name="photos" type="file" />
            </label>
            <button className="rounded bg-black px-4 py-2 text-white" type="submit">
              Submit proof for AI verification
            </button>
          </form>
        )}

        {m.proof && (
          <div className="flex flex-wrap gap-2">
            {[m.proof, ...m.photos].map((img, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={i === 0 ? "Submitted invoice" : `Work photo ${i}`}
                className="max-h-64 rounded border"
                key={img.image.slice(0, 64) + i}
                src={`data:${img.mime};base64,${img.image}`}
              />
            ))}
          </div>
        )}

        {v && (
          <div className={`rounded p-4 ${v.recommendation === "release" ? "bg-green-50" : "bg-amber-50"}`}>
            <p className="font-medium">
              AI verifier recommends: <b>{v.recommendation.toUpperCase()}</b> (document total: {v.extractedTotal})
            </p>
            <ul className="ml-5 list-disc">
              {v.reasons.map((r) => (
                <li className={v.flags?.includes(r) ? "font-semibold text-red-800" : undefined} key={r}>
                  {v.flags?.includes(r) ? "Fraud check: " : ""}
                  {r}
                </li>
              ))}
            </ul>
            {v.flags?.length > 0 && v.aiRecommendation === "release" && (
              <p className="mt-2 text-sm">The AI alone said release; ProofPay&apos;s hard rules overruled it.</p>
            )}
          </div>
        )}

        {owner && m.status === "on_hold" && (
          <form action={overrideRelease} className="space-y-2 rounded border border-red-200 p-4">
            {idField}
            <label className="flex items-start gap-2 text-sm">
              <input name="confirm" required type="checkbox" value="yes" />I have reviewed the hold reasons above and
              want to release {m.amount} {m.currency} anyway.
            </label>
            <button className="rounded border border-red-600 px-4 py-2 text-red-700" type="submit">
              Override hold and release
            </button>
          </form>
        )}

        {owner && m.status === "payout_failed" && (
          <div className="rounded bg-red-50 p-4" role="alert">
            <p className="font-medium">PayPal payout failed</p>
            <p className="break-all text-sm text-red-800">{m.payoutError}</p>
            <form action={approveRelease}>
              {idField}
              <button className="mt-2 rounded bg-blue-600 px-4 py-2 text-white" type="submit">
                Retry payout of {m.amount} {m.currency}
              </button>
            </form>
          </div>
        )}

        {owner && m.status === "ready" && (
          <form action={approveRelease}>
            {idField}
            <button className="rounded bg-blue-600 px-4 py-2 text-white" type="submit">
              {w.owner}: approve and release {m.amount} {m.currency} via PayPal
            </button>
          </form>
        )}

        {(m.status === "approved" || (m.status === "paid" && m.payout?.status !== "SUCCESS")) && <AutoRefresh />}

        {m.payout && (
          <div className="rounded bg-blue-50 p-4">
            <p>
              PayPal payout batch <code>{m.payout.batchId}</code>: <b>{m.payout.status}</b>
              {m.payout.status !== "SUCCESS" && (
                <span className="text-sm text-gray-600"> (updates automatically when PayPal confirms)</span>
              )}
            </p>
            {owner && (
              <form action={refreshPayout}>
                {idField}
                <button className="mt-2 underline" type="submit">
                  Refresh status from PayPal
                </button>
              </form>
            )}
          </div>
        )}
      </section>

      {owner && m.history.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-semibold">Audit trail</h2>
          <ol className="space-y-1 text-sm">
            {m.history.map((h) => (
              <li className="border-l-2 pl-3" key={`${h.at}-${h.kind}-${h.detail}`}>
                <span className="text-gray-500">{new Date(h.at).toLocaleString("en-SG")}</span> <code>{h.kind}</code>{" "}
                {h.detail}
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
