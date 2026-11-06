"use client";

import { useFormStatus } from "react-dom";

/** Submit button that shows progress while the agent negotiates (takes ~30 s). */
export function NegotiateButton() {
  const { pending } = useFormStatus();
  return (
    <button className="rounded bg-black px-4 py-2 text-white disabled:opacity-60" disabled={pending} type="submit">
      {pending ? "Agent is negotiating with 3 suppliers…" : "Ask the buyer agent"}
    </button>
  );
}
