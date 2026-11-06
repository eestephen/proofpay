import { Suspense } from "react";
import { signIn } from "../actions";

export default function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  return (
    <main className="mx-auto max-w-sm p-8 font-sans">
      <h1 className="mb-4 text-2xl font-bold">Owner sign in</h1>
      <Suspense fallback={null}>
        <ErrorNote searchParams={searchParams} />
      </Suspense>
      <form action={signIn} className="space-y-3">
        <label className="block">
          <span className="text-sm">Owner passcode</span>
          <input autoComplete="current-password" className="mt-1 w-full rounded border px-3 py-2" name="passcode" required type="password" />
        </label>
        <button className="rounded bg-black px-4 py-2 text-white" type="submit">
          Sign in
        </button>
      </form>
      <p className="mt-4 text-sm text-gray-600">Judges: the demo passcode is in the README.</p>
    </main>
  );
}

async function ErrorNote({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { error } = await searchParams;
  return typeof error === "string" ? (
    <p className="mb-3 rounded bg-red-50 p-3 text-red-800" role="alert">
      {error}
    </p>
  ) : null;
}
