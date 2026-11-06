"use server";

import { refresh } from "next/cache";
import { app } from "@/server/app";

// Thin wrappers: parse input, call the app service. Auth arrives in ticket 02.

function milestoneId(formData: FormData): number {
  const id = Number(formData.get("milestoneId"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid milestone id");
  return id;
}

export async function submitProof(formData: FormData) {
  const file = formData.get("proof");
  if (!(file instanceof File)) throw new Error("No file uploaded");
  await app().submitProof(milestoneId(formData), {
    data: new Uint8Array(await file.arrayBuffer()),
    mediaType: file.type,
  });
  refresh();
}

export async function approveRelease(formData: FormData) {
  await app().approveRelease(milestoneId(formData));
  refresh();
}

export async function refreshPayout(formData: FormData) {
  await app().refreshPayout(milestoneId(formData));
  refresh();
}
