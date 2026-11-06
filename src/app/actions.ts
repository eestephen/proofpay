"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { app } from "@/server/app";
import { OWNER_COOKIE, ownerCredential } from "@/server/session";

// Thin wrappers: parse input, attach the caller's credential, call the app
// service, then redirect. The service does the authorisation; errors become a
// message on the page instead of a 500.

function milestoneId(formData: FormData): number {
  const id = Number(formData.get("milestoneId"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid milestone id");
  return id;
}

async function run(back: string, action: () => Promise<unknown>): Promise<never> {
  let error: string | null = null;
  try {
    await action();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  // redirect() throws, so it must stay outside the try block.
  const sep = back.includes("?") ? "&" : "?";
  redirect(error ? `${back}${sep}error=${encodeURIComponent(error)}` : back);
}

async function proofFile(formData: FormData) {
  const file = formData.get("proof");
  if (!(file instanceof File) || file.size === 0) throw new Error("No file uploaded");
  return { data: new Uint8Array(await file.arrayBuffer()), mediaType: file.type };
}

export async function submitProof(formData: FormData) {
  const id = milestoneId(formData);
  await run(`/milestones/${id}`, async () => app().submitProof(id, await proofFile(formData), await ownerCredential()));
}

export async function submitProofAsPayee(formData: FormData) {
  const id = milestoneId(formData);
  const token = String(formData.get("t") ?? "");
  await run(`/payee/${id}?t=${encodeURIComponent(token)}`, async () =>
    app().submitProof(id, await proofFile(formData), token),
  );
}

export async function approveRelease(formData: FormData) {
  const id = milestoneId(formData);
  await run(`/milestones/${id}`, async () => app().approveRelease(id, await ownerCredential()));
}

export async function refreshPayout(formData: FormData) {
  const id = milestoneId(formData);
  await run(`/milestones/${id}`, () => app().refreshPayout(id));
}

export async function signIn(formData: FormData) {
  const token = app().ownerSession(String(formData.get("passcode") ?? ""));
  if (!token) redirect("/login?error=Wrong%20passcode");
  (await cookies()).set(OWNER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  redirect("/");
}

export async function signOut() {
  (await cookies()).delete(OWNER_COOKIE);
  redirect("/");
}

export async function resetDemo() {
  await run("/", async () => app().resetDemo(await ownerCredential()));
}
