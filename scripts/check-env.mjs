// Runs first in `npm run vercel-build`: lists every missing or invalid environment variable with
// where to get it, instead of failing later with a terse driver error.
const problems = [];
const need = (name, hint) => {
  if (!process.env[name]?.trim()) problems.push(`${name} is not set — ${hint}`);
};

if (!process.env.DATABASE_URL?.trim() && !process.env.POSTGRES_URL?.trim()) {
  problems.push(
    "DATABASE_URL is not set — add a Neon database: Vercel project → Storage → Create → Neon, connected to this environment",
  );
}
need("BETTER_AUTH_SECRET", "a random secret, e.g. `openssl rand -base64 32`");
need("BETTER_AUTH_URL", "the site's public URL, e.g. https://your-app.vercel.app");
need("INVITE_CODE", "the code new users must enter to create an account");
need("ENCRYPTION_KEY", "32 random bytes, base64: `openssl rand -base64 32`");

const key = process.env.ENCRYPTION_KEY?.trim();
if (key && Buffer.from(key, "base64").length !== 32) {
  problems.push("ENCRYPTION_KEY must decode to exactly 32 bytes — generate it with `openssl rand -base64 32`");
}
const url = process.env.BETTER_AUTH_URL?.trim();
if (url && !/^https?:\/\/[^/]+\/?$/.test(url)) {
  problems.push(`BETTER_AUTH_URL should be just the origin, like https://your-app.vercel.app (got ${url})`);
}
const google = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET;
const github = process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET;
if (!google && !github) {
  problems.push(
    "No sign-in provider — set GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET and/or GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET",
  );
}

if (problems.length) {
  console.error("\nMissing or invalid environment variables (Vercel → Settings → Environment Variables):\n");
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error("\nAdd them, then redeploy. See README → Deploy to Vercel.\n");
  process.exit(1);
}
console.log("Environment variables OK.");
