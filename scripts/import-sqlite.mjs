// Copies articles and reading sessions from the old SQLite database (data/reading.db) into the
// Postgres database, owned by an existing account.
//
//   npm run db:import-sqlite -- you@example.com [path/to/reading.db]
//
// Target: DATABASE_URL (e.g. Neon) when set, otherwise the local PGlite database in data/pglite —
// stop `npm run dev` first in that case, since PGlite allows one process at a time.
// Sign in to the app once before running it, so the account exists.
import path from "node:path";
import { createClient } from "@libsql/client";

const [email, sqlitePath = "data/reading.db"] = process.argv.slice(2);
if (!email) {
  console.error("Usage: npm run db:import-sqlite -- <account email> [path/to/reading.db]");
  process.exit(1);
}

/** Runs parameterized SQL on Postgres or PGlite through the same small interface. */
async function connectTarget() {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    return { label: "DATABASE_URL", query: (sql, params) => client.query(sql, params), close: () => client.end() };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(path.join(process.cwd(), "data", "pglite"));
  return { label: "local PGlite (data/pglite)", query: (sql, params) => db.query(sql, params), close: () => db.close() };
}

const toDate = (seconds) => (seconds == null ? null : new Date(Number(seconds) * 1000));
const json = (text) => (text == null ? null : text); // already JSON text; cast with ::jsonb

const source = createClient({ url: `file:${sqlitePath}` });
const target = await connectTarget();
console.log(`Importing ${sqlitePath} → ${target.label} for ${email}`);

try {
  const users = await target.query(`select id from "user" where email = $1`, [email]);
  if (!users.rows.length) throw new Error(`No account with email ${email}. Sign in to the app once first.`);
  const userId = users.rows[0].id;

  const articles = (await source.execute("select * from articles order by id")).rows;
  const sessions = (await source.execute("select * from sessions order by id")).rows;

  await target.query("begin");
  const articleIds = new Map();
  for (const a of articles) {
    const res = await target.query(
      `insert into articles (user_id, title, content, source_url, language, word_count, quiz, chunks, created_at)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9) returning id`,
      [userId, a.title, a.content, a.source_url, a.language, a.word_count, json(a.quiz), json(a.chunks ?? null), toDate(a.created_at)],
    );
    articleIds.set(Number(a.id), res.rows[0].id);
  }
  let imported = 0;
  for (const s of sessions) {
    const articleId = articleIds.get(Number(s.article_id));
    if (!articleId) continue;
    await target.query(
      `insert into reading_sessions (user_id, article_id, status, mode, purpose, purpose_type, prediction, pre_answers,
         preview_ms, read_ms, pacer_wpm, pacer_chunks, wpm, summary, summary_score, summary_feedback, quiz_answers,
         quiz_score, effective_wpm, created_at, completed_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb,
         $18, $19, $20, $21)`,
      [
        userId, articleId, s.status, s.mode, s.purpose, s.purpose_type ?? null, s.prediction, json(s.pre_answers ?? null),
        s.preview_ms, s.read_ms, s.pacer_wpm, s.pacer_chunks ?? null, s.wpm, s.summary, s.summary_score,
        json(s.summary_feedback), json(s.quiz_answers), s.quiz_score, s.effective_wpm, toDate(s.created_at),
        toDate(s.completed_at),
      ],
    );
    imported++;
  }
  await target.query("commit");
  console.log(`Done: ${articles.length} articles, ${imported} reading sessions.`);
} catch (e) {
  await target.query("rollback").catch(() => {});
  console.error(`Import failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await target.close();
  source.close();
}
