import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "@/lib/auth";

export type CurrentUser = { id: string; name: string; email: string; image: string | null };

/** The signed-in user, or null. Reads the request, so callers render behind a Suspense boundary.
 * Memoized per request, so pages can call it from every query. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email, image } = session.user;
  return { id, name, email, image: image ?? null };
});

/** Data access layer: every read and write of user data goes through this, so it is always scoped
 * to the signed-in user. Pages redirect to /login without a session. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
