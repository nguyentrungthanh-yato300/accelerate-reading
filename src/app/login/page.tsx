import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { Card } from "@/components/ui";
import { devEmailLogin, enabledProviders } from "@/lib/auth";
import { getCurrentUser } from "@/lib/dal";

const ERRORS: Record<string, string> = {
  invite_required: "New accounts need a valid invite code. Enter it below, then sign in again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { error } = await searchParams;
  const message = typeof error === "string" ? (ERRORS[error] ?? "Sign-in failed. Please try again.") : null;

  return (
    <div className="mx-auto max-w-sm space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-stone-500">Your library, sessions and AI key are private to your account.</p>
      </div>
      {message && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{message}</p>
      )}
      <Card>
        <LoginForm providers={enabledProviders} devEmailLogin={devEmailLogin} />
      </Card>
    </div>
  );
}
