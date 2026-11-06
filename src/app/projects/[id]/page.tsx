import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { app } from "@/server/app";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto max-w-3xl p-8 font-sans">
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
  const project = app().getProject(Number((await params).id));
  if (!project) notFound();
  const { fund } = project;
  return (
    <>
      <h1 className="mt-2 text-2xl font-bold">{project.name}</h1>
      <p className="mb-6 text-gray-600">
        Budget {fund.budget} {fund.currency} · released {fund.released} · remaining <b>{fund.remaining}</b>
      </p>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Milestone</th>
            <th>Payee</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {project.milestones.map((m) => (
            <tr className="border-b" key={m.id}>
              <td className="py-2">
                <Link className="underline" href={`/milestones/${m.id}`}>
                  {m.title}
                </Link>
              </td>
              <td>{m.payeeName}</td>
              <td>
                {m.amount} {m.currency}
              </td>
              <td>
                <code>{m.status}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
