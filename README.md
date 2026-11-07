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

## Setup

Requires **Node.js 22 or newer** (the AI SDK does not support Node 20).

```bash
npm install
cp .env.example .env.local   # then add one AI provider key (Gemini has a free tier)
npm run dev                  # http://localhost:3000
```

Without an AI key the app still works: you get speed tracking and recall, but no quiz or feedback.

### AI providers

The app uses the provider-agnostic [AI SDK](https://ai-sdk.dev). Set `AI_PROVIDER` to `google`, `anthropic`, `openai`, `deepseek` (very cheap), `ollama` (local and private), or `openai-compatible` (OpenRouter, Groq, …). See `.env.example`.

### Database

The database is SQLite through Drizzle ORM, stored in `data/reading.db` and created and migrated automatically on first run. Back it up by copying that file. To use it from several devices, point `DATABASE_URL` at a [Turso](https://turso.tech) database.

After changing `src/db/schema.ts`, run `npm run db:generate` to create a migration.

## Project structure

```
src/app/              pages (home/library, read/[id], sessions/[id], history) and server actions
src/components/       ReadingFlow (session steps + pacer), forms, UI helpers
src/lib/ai.ts         model selection, quiz generation, summary grading
src/lib/text.ts       language detection, word counting, markdown parsing, preview skeleton
src/lib/extract.ts    URL import with Mozilla Readability
src/db/               Drizzle schema and client
drizzle/              SQL migrations
```
