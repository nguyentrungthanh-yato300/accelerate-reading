@AGENTS.md

# Accelerate Reading

A personal web app for reading technical documents (English, Vietnamese and Chinese) faster, understanding them and remembering them. It is built on reading research, not speed-reading myths.

- **Product and business context (Vietnamese):** read @docs/PRODUCT.md first. It covers goals, the science behind each feature, metrics, decisions made, status and roadmap.
- **Setup and code layout:** see README.md.

## Working rules

- **Node 22+.** Install with `npm ci`. Never run `npm audit fix --force`.
- **Check before committing:** `npm run typecheck`, `npm run lint`, `npm run build`.
- **UI text is in English.** The user discusses the project in Vietnamese.
- **AI calls are provider-agnostic.** They go through `src/lib/ai.ts`; don't call a provider SDK directly elsewhere.
- **Measure languages separately.** English speed is counted in words, Vietnamese in syllables, Chinese in characters. Never compare them directly. Chinese has no spaces, so text is split into units with `splitWords` in `src/lib/text.ts`, never on whitespace alone.
- **Science first.** Don't add techniques that research contradicts, such as RSVP or "eliminating subvocalization". The primary metric is effective speed = speed × comprehension.
