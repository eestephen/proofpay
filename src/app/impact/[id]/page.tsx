import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { app } from "@/server/app";

/** Public page for donors. No sign-in; shows only what was paid, with the proof. */
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-3xl p-8 font-sans">
      <Suspense fallback={<p>Loading…</p>}>
        <Impact params={params} />
      </Suspense>
    </main>
  );
}

async function Impact({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const impact = app().getImpact(Number((await params).id));
  if (!impact) notFound();
  const { fund } = impact;
  return (
    <>
      <p className="text-sm uppercase tracking-wide text-gray-500">Where your donation went</p>
      <h1 className="text-3xl font-bold">{impact.name}</h1>
      <p className="mt-2 text-lg">
        <b>
          {fund.released} {fund.currency}
        </b>{" "}
        of {fund.budget} {fund.currency} released, only against verified work or delivered supplies.
      </p>

      <h2 className="mb-2 mt-8 text-xl font-semibold">Work completed and paid</h2>
      {impact.paid.length === 0 && (
        <p className="text-gray-600">Nothing paid yet. Payments appear here once work is verified.</p>
      )}
      <ul className="space-y-4">
        {impact.paid.map((m) => (
          <li className="rounded-lg border p-4" key={m.title}>
            <p className="font-semibold">{m.title}</p>
            <p className="text-gray-700">{m.description}</p>
            <p className="mt-1 text-sm">
              Paid{" "}
              <b>
                {m.amount} {fund.currency}
              </b>{" "}
              to {m.partner}
              {m.paidAt && ` on ${new Date(m.paidAt).toLocaleDateString("en-SG")}`}, after AI verification and
              coordinator approval.
            </p>
            {m.proof.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.proof.map((img, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={`Proof ${i + 1} for ${m.title}`}
                    className="max-h-48 rounded border"
                    key={img.image.slice(0, 64) + i}
                    src={`data:${img.mime};base64,${img.image}`}
                  />
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      <h2 className="mb-2 mt-8 text-xl font-semibold">Relief supplies bought</h2>
      {impact.supplies.length === 0 && <p className="text-gray-600">No supplies ordered yet.</p>}
      <ul className="space-y-2">
        {impact.supplies.map((s, i) => (
          <li className="rounded-lg border p-3" key={i}>
            {s.quantity} {s.unit} {s.item} from {s.supplierName}: {s.total} {fund.currency}
            {s.expectedBy && `, arriving by ${s.expectedBy}`}
          </li>
        ))}
      </ul>
      <p className="mt-8 text-xs text-gray-500">
        Demo on the PayPal sandbox. Partner contact details and internal review notes are never shown here.
      </p>
    </>
  );
}
