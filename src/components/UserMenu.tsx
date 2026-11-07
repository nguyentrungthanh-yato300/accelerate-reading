import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { SignOutButton } from "./SignOutButton";

/** Reads the session, so the layout renders it behind a Suspense boundary. */
export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className="ml-auto flex items-center gap-4 text-sm">
      <Link href="/settings" className="text-stone-600 hover:text-foreground dark:text-stone-400">
        Settings
      </Link>
      <span className="hidden max-w-40 truncate text-stone-500 sm:inline">{user.name || user.email}</span>
      <SignOutButton />
    </div>
  );
}
