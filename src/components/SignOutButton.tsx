"use client";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() =>
        authClient.signOut({
          fetchOptions: {
            // A full page load, not a client navigation: the router keeps earlier pages' UI around,
            // which must not outlive the session on a shared computer.
            onSuccess: () => window.location.replace("/login"),
          },
        })
      }
      className="text-stone-500 hover:text-foreground"
    >
      Sign out
    </button>
  );
}
