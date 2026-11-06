import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { app } from "@/server/app";
import { FundSummary } from "./fund-summary";
import { parseMode, WORDS } from "./words";

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

export default function Page({ searchParams }: Props) {
  return (
    <main className="mx-auto w-full max-w-4xl p-8 font-sans">
      <h1 className="text-3xl font-bold">ProofPay</h1>
      <p className="mb-6 text-gray-600">AI agents that buy and pay, but only for verified work.</p>
      <Suspense fallback={<p>Loading projects…</p>}>
        <Projects searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Projects({ searchParams }: Props) {
  await connection();
  const mode = parseMode((await searchParams).mode);
  const projects = app().listProjects({ mode });
  return (
    <>
      <nav aria-label="Mode" className="mb-4 inline-flex rounded-lg border p-1 text-sm">
        {(["sme", "ngo"] as const).map((m) => (
          <Link
            aria-current={m === mode ? "page" : undefined}
            className={`rounded px-4 py-1.5 ${m === mode ? "bg-black text-white" : "hover:bg-gray-100"}`}
            href={`/?mode=${m}`}
            key={m}
          >
            {m === "sme" ? "SME: pay subcontractors and suppliers" : "NGO: relief projects and donors"}
          </Link>
        ))}
      </nav>
      <ul className="space-y-3">
        {projects.map((p) => (
          <li className="rounded-lg border p-5" key={p.id}>
            <Link className="mb-3 block text-lg font-semibold hover:underline" href={`/projects/${p.id}`}>
              {p.name}
            </Link>
            <FundSummary fund={p.fund} />
            {p.mode === "ngo" && (
              <Link className="mt-3 inline-block text-sm underline" href={`/impact/${p.id}`}>
                Public donor impact page →
              </Link>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-gray-500">
        Same engine in both modes: {WORDS[mode].payee.toLowerCase()}s are paid per verified milestone and{" "}
        {WORDS[mode].supplier.toLowerCase()}s per approved order.
      </p>
    </>
  );
}
