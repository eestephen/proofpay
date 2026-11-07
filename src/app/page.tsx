import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { app } from "@/server/app";
import { FundSummary } from "./fund-summary";

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-4xl p-8 font-sans">
      <h1 className="text-3xl font-bold">ProofPay</h1>
      <p className="mb-2 text-gray-600">AI agents that buy and pay, but only for verified work.</p>
      <p className="mb-6 text-sm">
        New here?{" "}
        <Link className="font-medium underline" href="/scenarios">
          Follow the demo scenarios →
        </Link>
      </p>
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
        <li className="rounded-lg border p-5" key={p.id}>
          <Link className="mb-3 block text-lg font-semibold hover:underline" href={`/projects/${p.id}`}>
            {p.name}
          </Link>
          <FundSummary fund={p.fund} />
        </li>
      ))}
    </ul>
  );
}
