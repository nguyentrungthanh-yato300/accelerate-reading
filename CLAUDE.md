@AGENTS.md

# Accelerate Reading

A personal web app for reading technical documents (English, Vietnamese and Chinese) faster, understanding them and remembering them. It is built on reading research, not speed-reading myths.

- **Product and business context (Vietnamese):** read @docs/PRODUCT.md first. It covers goals, the science behind each feature, metrics, decisions made, status and roadmap.
- **Setup and code layout:** see README.md.

## Working rules

- **Node 22+.** Install with `npm ci`. Never run `npm audit fix --force`.
- **Check before committing:** `npm run typecheck`, `npm run lint`, `npm run build`.
- **UI text is in English.** The user discusses the project in Vietnamese.
- **AI calls are provider-agnostic.** They go through `src/lib/ai.ts` with the user's own model from `getUserModel` (`src/lib/ai-settings.ts`); don't call a provider SDK directly elsewhere, and never read AI keys from the environment.
- **All user data is scoped.** Read and write through `requireUser()` (`src/lib/dal.ts`) and filter by `userId`; Server Actions and Route Handlers check ownership of every record they touch.
- **Database is Postgres.** Neon via `DATABASE_URL` on Vercel, PGlite in `data/pglite` locally (one process at a time). Never open the database at import time: `next build` imports modules in parallel workers.
- **Measure languages separately.** English speed is counted in words, Vietnamese in syllables, Chinese in characters. Never compare them directly. Chinese has no spaces, so text is split into units with `splitWords` in `src/lib/text.ts`, never on whitespace alone.
- **Science first.** Don't add techniques that research contradicts, such as RSVP or "eliminating subvocalization". The primary metric is effective speed = speed × comprehension.
