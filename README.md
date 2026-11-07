# Accelerate Reading

A personal web app for reading technical documents (English, Vietnamese and Chinese) faster, with better understanding and retention. The training is based on reading research, not on "speed reading" myths.

## Why it works this way

| Research finding | What the app does |
|---|---|
| Eye movements and the perceptual span limit raw speed. Speed-reading tricks trade away comprehension (Rayner et al., 2016). | Scores **effective speed = speed × comprehension**. Speed without understanding doesn't count. |
| One-word-at-a-time display (RSVP) blocks the 10–15% of eye movements that go back (regressions), and comprehension drops. | The optional **pacer** highlights a moving chunk of words, but the full text stays visible. |
| Prior knowledge (a schema) makes reading faster and memory stronger. | **Preview step:** headings and lead sentences only, before reading. |
| Reading with a question focuses attention (information-foraging theory). | **Purpose step:** you write a question and choose skim or deep reading. |
| Retrieval practice beats re-reading for long-term memory (Roediger & Karpicke, 2006). | **Recall step:** you write a summary from memory, and AI checks which key points you captured or missed. |

## Session loop

1. **Preview:** skim the skeleton of the text (timed).
2. **Purpose:** write your question and pick skim or deep mode; optionally turn on the pacer.
3. **Read:** timed; pauses automatically when the tab is hidden.
4. **Recall:** write a summary from memory, as if briefing a colleague.
5. **Check:** answer 5 AI-generated comprehension questions.
6. **Results:** speed, comprehension, effective speed, a recall score, feedback, and a quiz review.

English is measured in words/min, Vietnamese in syllables (tiếng)/min and Chinese in characters (字)/min, so each language is tracked separately on the Progress page.

## Accounts and AI keys

- **Sign-in** with Google or GitHub (Better Auth). Sign-up is **invite-only**: a new user enters the `INVITE_CODE` on the login page. Each user's library, sessions and settings are private.
- **AI keys are per user.** Each user picks a provider and pastes their own API key in **Settings**. The key is encrypted with AES-256-GCM (`ENCRYPTION_KEY`) before it is stored and is never sent back to the browser. No AI key lives in the code or the server's environment.
- Providers: Google Gemini (free tier), DeepSeek (very cheap), Anthropic, OpenAI, or any OpenAI-compatible API (OpenRouter, Groq, …), through the provider-agnostic [AI SDK](https://ai-sdk.dev).

## Local development

Requires **Node.js 22 or newer**.

```bash
npm ci
cp .env.example .env.local   # fill BETTER_AUTH_SECRET, ENCRYPTION_KEY, INVITE_CODE
npm run dev                  # http://localhost:3000
```

Without `DATABASE_URL`, the app uses an embedded Postgres (PGlite) in `data/pglite`, created and migrated on first run. PGlite allows one process at a time: stop `npm run dev` before running scripts against it.

Locally the login page also offers **email sign-in** (with the invite code), so you can work without OAuth apps. It is disabled in production.

After changing `src/db/schema.ts`, run `npm run db:generate` to create a migration.

## Deploy to Vercel

1. **Import the repository** in Vercel (Add New → Project). Framework: Next.js. Vercel runs `npm run vercel-build`, which applies database migrations and then builds.
2. **Database:** in the project, Storage → Create → **Neon** (Postgres), connected to all environments. It sets `DATABASE_URL`.
3. **OAuth apps** (at least one), with your production URL, e.g. `https://your-app.vercel.app`:
   - GitHub: Settings → Developer settings → OAuth Apps → New. Callback URL `https://your-app.vercel.app/api/auth/callback/github`.
   - Google: Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web). Redirect URI `https://your-app.vercel.app/api/auth/callback/google`.
4. **Environment variables** (Settings → Environment Variables, Production):

   | Name | Value |
   |---|---|
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
   | `BETTER_AUTH_URL` | `https://your-app.vercel.app` |
   | `ENCRYPTION_KEY` | `openssl rand -base64 32` (keep it: changing it makes saved AI keys unreadable) |
   | `INVITE_CODE` | a code you share with people you invite |
   | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | from the GitHub OAuth app |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from the Google OAuth client |

5. **Deploy** (or redeploy after setting the variables), sign in with the invite code, and add your AI key in Settings.

Preview deployments get their own URLs, which the OAuth apps don't list, so sign in on the production URL.

### Moving data from the old SQLite version

Sign in on the deployed site once, then copy `data/reading.db` into your account:

```bash
npx vercel env pull .env.production.local   # gets DATABASE_URL
node --env-file=.env.production.local scripts/import-sqlite.mjs you@example.com
```

## Project structure

```
src/app/              pages (library, read/[id], sessions/[id], history, login, settings), server actions, API routes
src/components/       ReadingFlow (session steps + pacer), forms, UI helpers
src/lib/dal.ts        current user; every data read and write is scoped to them
src/lib/auth.ts       Better Auth: providers, invite-only sign-up
src/lib/ai.ts         model selection, quiz, phrase chunking, coaching, summary grading
src/lib/ai-settings.ts  per-user provider and encrypted key
src/lib/text.ts       language detection, units (words/syllables/characters), markdown parsing, preview
src/lib/chunks.ts     phrase plans and pacer timing
src/lib/extract.ts    URL import with Mozilla Readability, blocked for private addresses
src/proxy.ts          sends signed-out visitors to /login
src/db/               Drizzle schema (Postgres) and client (Neon or PGlite)
drizzle/              SQL migrations
scripts/              one-off data import from the old SQLite version
```
