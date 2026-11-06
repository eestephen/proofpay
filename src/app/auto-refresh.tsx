"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches the server-rendered page every few seconds while a payout is in flight. */
export function AutoRefresh({ everyMs = 5000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs]);
  return null;
}
