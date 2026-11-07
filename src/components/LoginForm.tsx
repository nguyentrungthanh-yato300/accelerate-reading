"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { prepareSignup } from "@/app/actions";
import { authClient } from "@/lib/auth-client";
import { buttonPrimary, buttonSecondary, input } from "./ui";

type Provider = "google" | "github";
const LABELS: Record<Provider, string> = { google: "Continue with Google", github: "Continue with GitHub" };

export function LoginForm(props: { providers: Record<Provider, boolean>; devEmailLogin: boolean }) {
  const router = useRouter();
  const [invite, setInvite] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** A typed invite code is checked and kept for the account creation that may follow. Social
   * sign-in redirects to the provider by itself; email sign-in returns, so it navigates home. */
  async function withInvite(
    signIn: () => Promise<{ error?: { message?: string; code?: string } | null }>,
    goHome = false,
  ) {
    setBusy(true);
    setError(null);
    try {
      if (invite.trim() && !(await prepareSignup(invite)).ok) {
        setError("That invite code is not valid.");
        return;
      }
      const res = await signIn();
      if (res.error) {
        setError(
          res.error.code === "INVITE_REQUIRED" || /invite/i.test(res.error.message ?? "")
            ? "New accounts need a valid invite code."
            : (res.error.message ?? "Sign-in failed."),
        );
      } else if (goHome) {
        router.push("/");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const providers = (Object.keys(LABELS) as Provider[]).filter((p) => props.providers[p]);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {providers.map((p) => (
          <button
            key={p}
            className={`${buttonSecondary} w-full`}
            disabled={busy}
            onClick={() => withInvite(() => authClient.signIn.social({ provider: p, callbackURL: "/" }))}
          >
            {LABELS[p]}
          </button>
        ))}
        {!providers.length && !props.devEmailLogin && (
          <p className="text-sm text-stone-500">No sign-in method is configured yet.</p>
        )}
      </div>

      <label className="block text-sm font-medium">
        Invite code <span className="font-normal text-stone-500">(only for a new account)</span>
        <input value={invite} onChange={(e) => setInvite(e.target.value)} className={`${input} mt-1`} autoComplete="off" />
      </label>

      {props.devEmailLogin && (
        <div className="space-y-2 border-t border-stone-200 pt-4 dark:border-stone-800">
          <p className="text-xs text-stone-500">Local development only — disabled in production.</p>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={input} />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Password (8+ characters)"
            className={input}
          />
          <div className="flex gap-2">
            <button
              className={`${buttonPrimary} flex-1`}
              disabled={busy}
              onClick={() => withInvite(() => authClient.signIn.email({ email, password }), true)}
            >
              Sign in
            </button>
            <button
              className={`${buttonSecondary} flex-1`}
              disabled={busy}
              onClick={() =>
                withInvite(() => authClient.signUp.email({ email, password, name: email.split("@")[0] }), true)
              }
            >
              Create account
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
