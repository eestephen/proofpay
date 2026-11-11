import Link from "next/link";
import { Suspense } from "react";
import { app } from "@/server/app";
import { ownerCredential } from "@/server/session";
import { LedgerView } from "./ledger-view";

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-7xl p-8 font-sans">
      <h1 className="text-3xl font-bold">Ledger</h1>
      <p className="mb-6 text-gray-600">Every payment, order and decision across all projects.</p>
      <Suspense fallback={<p>Loading ledger…</p>}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const credential = await ownerCredential();
  if (!app().isOwner(credential)) {
    return (
      <p className="rounded bg-gray-100 p-3 text-sm">
        The ledger shows payee details and the full audit trail.{" "}
        <Link className="underline" href="/login">
          Sign in as owner
        </Link>{" "}
        to see it.
      </p>
    );
  }
  return <LedgerView ledger={app().getLedger(credential)} />;
}
