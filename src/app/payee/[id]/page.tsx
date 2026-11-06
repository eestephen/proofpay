import { Suspense } from "react";
import { connection } from "next/server";
import { app } from "@/server/app";
import { submitProofAsPayee } from "../../actions";
import { AutoRefresh } from "../../auto-refresh";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/** The payee's private upload page. The link token is the only credential. */
export default function Page({ params, searchParams }: Props) {
  return (
    <main className="mx-auto max-w-2xl p-8 font-sans">
      <Suspense fallback={<p>Loading…</p>}>
        <PayeeCard params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const STATUS_TEXT: Record<string, string> = {
  awaiting_proof: "Waiting for your proof of work",
  under_review: "Your proof is being checked",
  ready: "Proof accepted, waiting for the owner to release payment",
  on_hold: "On hold: see the reasons below",
  approved: "Payment approved, sending now",
  payout_failed: "Payment approved, the owner is retrying the transfer",
  paid: "Paid",
};

async function PayeeCard({ params, searchParams }: Props) {
  await connection();
  const id = Number((await params).id);
  const { t, error } = await searchParams;
  const token = typeof t === "string" ? t : "";
  const m = app().getPayeeView(id, token);
  if (!m) return <p role="alert">This upload link is invalid or has expired. Ask the owner for a new one.</p>;
  const v = m.verification;

  return (
    <>
      <p className="text-sm text-gray-500">{m.projectName}</p>
      <h1 className="text-xl font-semibold">{m.title}</h1>
      <p className="text-gray-700">{m.description}</p>
      <p className="mt-2">
        <b>
          {m.amount} {m.currency}
        </b>{" "}
        to {m.payeeName}
      </p>
      <p className="mt-2 rounded bg-gray-100 p-3">
        Status: <b>{STATUS_TEXT[m.status] ?? m.status}</b>
        {m.payout && ` (PayPal: ${m.payout.status})`}
      </p>

      {(m.status === "approved" || (m.status === "paid" && m.payout?.status !== "SUCCESS")) && <AutoRefresh />}

      {typeof error === "string" && (
        <p className="mt-3 rounded bg-red-50 p-3 text-red-800" role="alert">
          {error}
        </p>
      )}

      {v && (
        <div className={`mt-4 rounded p-4 ${v.recommendation === "release" ? "bg-green-50" : "bg-amber-50"}`}>
          <p className="font-medium">Check result: {v.recommendation === "release" ? "accepted" : "on hold"}</p>
          <ul className="ml-5 list-disc">
            {v.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {(m.status === "awaiting_proof" || m.status === "on_hold") && (
        <form action={submitProofAsPayee} className="mt-4 space-y-2">
          <input name="milestoneId" type="hidden" value={m.id} />
          <input name="t" type="hidden" value={token} />
          <p className="font-medium">
            {m.status === "on_hold" ? "Fix the issue and resubmit" : "Upload your invoice"}
          </p>
          <label className="block text-sm">
            Invoice (PNG, JPEG or WebP, up to 4 MB)
            <input accept="image/png,image/jpeg,image/webp" className="block" name="proof" required type="file" />
          </label>
          <label className="block text-sm">
            Photos of the finished work (optional, up to 2)
            <input accept="image/png,image/jpeg,image/webp" className="block" multiple name="photos" type="file" />
          </label>
          <button className="rounded bg-black px-4 py-2 text-white" type="submit">
            Submit proof
          </button>
        </form>
      )}
    </>
  );
}
