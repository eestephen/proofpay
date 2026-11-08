import { cookies } from "next/headers";
import { connection } from "next/server";

export const OWNER_COOKIE = "proofpay_owner";

/**
 * The owner session token from the request cookie, if any. Checking it reads the clock
 * (session expiry), so it must run at request time, never while Next.js prerenders.
 */
export async function ownerCredential(): Promise<string | undefined> {
  await connection();
  return (await cookies()).get(OWNER_COOKIE)?.value;
}
