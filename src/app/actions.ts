"use server";

import { redirect } from "next/navigation";
import { app } from "@/server/app";

// Thin wrappers: parse input, call the app service, then redirect back to the
// milestone. Errors become a message on the page instead of a 500.
// Auth arrives in ticket 02.

function milestoneId(formData: FormData): number {
  const id = Number(formData.get("milestoneId"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid milestone id");
  return id;
}

async function run(formData: FormData, action: (id: number) => Promise<unknown>): Promise<never> {
  const id = milestoneId(formData);
  let error: string | null = null;
  try {
    await action(id);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  // redirect() throws, so it must stay outside the try block.
  redirect(error ? `/milestones/${id}?error=${encodeURIComponent(error)}` : `/milestones/${id}`);
}

export async function submitProof(formData: FormData) {
  await run(formData, async (id) => {
    const file = formData.get("proof");
    if (!(file instanceof File) || file.size === 0) throw new Error("No file uploaded");
    await app().submitProof(id, { data: new Uint8Array(await file.arrayBuffer()), mediaType: file.type });
  });
}

export async function approveRelease(formData: FormData) {
  await run(formData, (id) => app().approveRelease(id));
}

export async function refreshPayout(formData: FormData) {
  await run(formData, (id) => app().refreshPayout(id));
}
