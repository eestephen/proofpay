import type { Mode } from "@/server/service";

/** Same engine, different words. */
export const WORDS: Record<Mode, { owner: string; payee: string; supplier: string; project: string; mode: string }> = {
  sme: { owner: "Owner", payee: "Subcontractor", supplier: "Supplier", project: "Project", mode: "SME" },
  ngo: { owner: "Coordinator", payee: "Field partner", supplier: "Relief supplier", project: "Relief project", mode: "NGO" },
};

export function parseMode(value: unknown): Mode {
  return value === "ngo" ? "ngo" : "sme";
}
