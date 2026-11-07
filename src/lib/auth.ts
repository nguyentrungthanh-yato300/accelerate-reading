import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb, type Db } from "@/db";
import * as schema from "@/db/schema";
import { safeEqual } from "@/lib/crypto";

export const INVITE_COOKIE = "ar_invite";

/** Social providers that have credentials set; the login page offers only these. */
export const enabledProviders = {
  google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  github: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
};

/** Email sign-in exists only for local development without OAuth apps; never in production. */
export const devEmailLogin = process.env.NODE_ENV !== "production";

/** True when the invite code a new user entered matches INVITE_CODE. */
export function isValidInvite(code: string | null | undefined): boolean {
  const expected = process.env.INVITE_CODE;
  return !!expected && !!code && safeEqual(code.trim(), expected);
}

// BETTER_AUTH_SECRET and BETTER_AUTH_URL are read from the environment.
function createAuth(db: Db) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    socialProviders: {
      ...(enabledProviders.google && {
        google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! },
      }),
      ...(enabledProviders.github && {
        github: { clientId: process.env.GITHUB_CLIENT_ID!, clientSecret: process.env.GITHUB_CLIENT_SECRET! },
      }),
    },
    emailAndPassword: { enabled: devEmailLogin },
    user: {
      // Sign-up is invite-only: a new account needs the invite code, which the login page stores in a
      // short-lived cookie before handing over to the provider. Returning users sign in freely.
      validateUserInfo: ({ source }, ctx) => {
        if (source.action !== "create-user") return;
        if (!isValidInvite(ctx.getCookie(INVITE_COOKIE))) {
          return { error: "invite_required", errorDescription: "A valid invite code is needed to create an account." };
        }
      },
    },
    onAPIError: { errorURL: "/login" },
    plugins: [nextCookies()],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

/** The auth server, created on first use: it needs the database, which must not be opened at
 * import time (see getDb). */
export async function getAuth() {
  instance ??= createAuth(await getDb());
  return instance;
}
