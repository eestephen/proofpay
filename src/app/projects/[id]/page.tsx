import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { app } from "@/server/app";
import { FundSummary } from "../../fund-summary";
import { MilestoneGrid } from "./milestone-grid";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-6xl p-8 font-sans">
      <Link className="text-sm underline" href="/">
        ← All projects
      </Link>
      <Suspense fallback={<p>Loading project…</p>}>
        <Project params={params} />
      </Suspense>
    </main>
  );
}

async function Project({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const board = app().getBoard(Number((await params).id));
  if (!board) notFound();
  return (
    <>
      <h1 className="mb-4 mt-2 text-2xl font-bold">{board.name}</h1>
      <FundSummary fund={board.fund} />
      <h2 className="mb-2 mt-6 font-semibold">Milestones</h2>
      <MilestoneGrid rows={board.rows} />
      <p className="mt-2 text-sm text-gray-500">Click a column header to sort, the menu to filter, a row to open it.</p>
    </>
  );
}
