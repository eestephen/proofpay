import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { app } from "@/server/app";
import { ownerCredential } from "@/server/session";
import type { PurchaseView } from "@/server/service";
import { requestMaterials } from "../../actions";
import { FundSummary } from "../../fund-summary";
import { MilestoneGrid } from "./milestone-grid";
import { NegotiateButton } from "./negotiate-button";
import { QuotesGrid } from "./quotes-grid";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default function Page({ params, searchParams }: Props) {
  return (
    <main className="mx-auto w-full max-w-6xl p-8 font-sans">
      <Link className="text-sm underline" href="/">
        ← All projects
      </Link>
      <Suspense fallback={<p>Loading project…</p>}>
        <Project params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Project({ params, searchParams }: Props) {
  await connection();
  const board = app().getBoard(Number((await params).id));
  if (!board) notFound();
  const owner = app().isOwner(await ownerCredential());
  const purchases = app().listPurchases(board.id);
  const { error } = await searchParams;
  return (
    <>
      <h1 className="mb-4 mt-2 text-2xl font-bold">{board.name}</h1>
      <FundSummary fund={board.fund} />
      <h2 className="mb-2 mt-6 font-semibold">Milestones</h2>
      <MilestoneGrid rows={board.rows} />
      <p className="mt-2 text-sm text-gray-500">Click a column header to sort, the menu to filter, a row to open it.</p>

      <h2 className="mb-2 mt-10 text-xl font-semibold">Buy materials</h2>
      <p className="mb-3 text-sm text-gray-600">
        The buyer agent looks up a real market price (Channel3), asks three suppliers for quotes and negotiates up to
        three rounds each. It cannot buy or pay: you approve the purchase.
      </p>
      {typeof error === "string" && (
        <p className="mb-3 rounded bg-red-50 p-3 text-red-800" role="alert">
          {error}
        </p>
      )}
      {owner ? (
        <form action={requestMaterials} className="mb-6 space-y-2">
          <input name="projectId" type="hidden" value={board.id} />
          <textarea
            className="w-full rounded border p-3"
            defaultValue="Buy 40 m2 of porcelain floor tiles for the kitchen, max 2,000 SGD, delivered within 5 days"
            maxLength={500}
            name="request"
            required
            rows={2}
          />
          <NegotiateButton />
        </form>
      ) : (
        <p className="mb-6 rounded bg-gray-100 p-3 text-sm">Sign in as owner to ask the buyer agent.</p>
      )}
      {purchases.map((p) => (
        <Purchase key={p.id} p={p} />
      ))}
    </>
  );
}

function Purchase({ p }: { p: PurchaseView }) {
  return (
    <section className="mb-8 rounded-lg border p-4">
      <p className="text-sm text-gray-500">&ldquo;{p.text}&rdquo;</p>
      <p className="mt-1">
        <b>
          {p.quantity} {p.unit} {p.item}
        </b>{" "}
        · budget {p.budget} {p.currency} · within {p.deadlineDays} days
      </p>
      <p className="mt-1 text-sm">
        Market reference:{" "}
        {p.reference.url ? (
          <a className="underline" href={p.reference.url} rel="noreferrer" target="_blank">
            {p.reference.title}
          </a>
        ) : (
          p.reference.title
        )}{" "}
        ({p.reference.merchant}, {p.reference.listedPrice}) → {p.reference.unitPrice} {p.currency} per {p.unit}
        <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs">
          {p.reference.source === "channel3" ? "via Channel3" : "fallback price list"}
        </span>
      </p>
      <div className="mt-3">
        <QuotesGrid currency={p.currency} rows={p.rows} />
      </div>
      <div className={`mt-3 rounded p-3 ${p.recommendation ? "bg-emerald-50" : "bg-amber-50"}`}>
        {p.recommendation ? (
          <p>
            Recommended: <b>{p.recommendation.supplierName}</b>, {p.recommendation.total.toFixed(2)} {p.currency},
            delivery in {p.recommendation.leadDays} days.
          </p>
        ) : (
          <p>
            <b>No supplier fits</b> the budget, deadline and quantity. Raise the budget or allow more time.
          </p>
        )}
        {p.overruled && <p className="mt-1 text-sm font-semibold text-red-800">ProofPay rule: {p.overruled}.</p>}
        <p className="mt-1 text-sm text-gray-700">
          Agent ({p.model}): {p.reasoning}
        </p>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer">Negotiation log ({p.log.length} quotes)</summary>
        <ol className="mt-2 space-y-1">
          {p.log.map((q, i) => (
            <li className="border-l-2 pl-3" key={i}>
              {q.supplierName}, round {q.round}
              {q.counterUnitMinor !== null && ` (we offered ${(q.counterUnitMinor / 100).toFixed(2)})`}:{" "}
              {(q.unitMinor / 100).toFixed(2)}/{p.unit} — {q.note}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
