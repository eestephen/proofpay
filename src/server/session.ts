import { cookies } from "next/headers";

export const OWNER_COOKIE = "proofpay_owner";

/** The owner session token from the request cookie, if any. */
export async function ownerCredential(): Promise<string | undefined> {
  return (await cookies()).get(OWNER_COOKIE)?.value;
}
