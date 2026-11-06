import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { app } from "@/server/app";
import { FundSummary } from "./fund-summary";

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-4xl p-8 font-sans">
      <h1 className="text-3xl font-bold">ProofPay</h1>
      <p className="mb-6 text-gray-600">AI agents that buy and pay, but only for verified work.</p>
      <Suspense fallback={<p>Loading projects…</p>}>
        <Projects />
      </Suspense>
    </main>
  );
}

async function Projects() {
  await connection();
  const projects = app().listProjects();
  return (
    <ul className="space-y-3">
      {projects.map((p) => (
        <li key={p.id}>
          <Link className="block rounded-lg border p-5 hover:bg-gray-50" href={`/projects/${p.id}`}>
            <p className="mb-3 text-lg font-semibold">{p.name}</p>
            <FundSummary fund={p.fund} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
