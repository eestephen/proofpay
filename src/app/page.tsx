import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { app } from "@/server/app";

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl p-8 font-sans">
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
            <p className="text-lg font-semibold">{p.name}</p>
            <p className="text-sm text-gray-600">
              Budget {p.fund.budget} {p.fund.currency} · released {p.fund.released} · remaining{" "}
              <b>{p.fund.remaining}</b>
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
