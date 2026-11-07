import Link from "next/link";
import { DeleteArticleButton } from "@/components/DeleteArticleButton";
import { NewArticleForm } from "@/components/NewArticleForm";
import { Card, LangBadge, Stat, num, pct } from "@/components/ui";
import { getAiStatus } from "@/lib/ai-settings";
import { requireUser } from "@/lib/dal";
import { computeStats, listArticles, listCompletedSessions } from "@/lib/queries";
import { unitLabel } from "@/lib/text";

export default async function Home() {
  const user = await requireUser();
  const [articleRows, completed, ai] = await Promise.all([
    listArticles(),
    listCompletedSessions(),
    getAiStatus(user.id),
  ]);
  const stats = computeStats(completed).filter((s) => s.sessions > 0);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Read faster. Understand more. Remember it.</h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-600 dark:text-stone-400">
          Each session follows an evidence-based loop: <b>preview</b> the structure, set a <b>purpose</b>,{" "}
          <b>read</b> against the clock, then <b>recall</b> from memory and check your understanding. Your
          score is <b>effective speed</b> = speed × comprehension — speed without understanding doesn’t count.
        </p>
        {!ai.configured && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            AI is off, so there are no quizzes, phrase pacing or feedback yet.{" "}
            <Link href="/settings" className="font-medium underline">
              Add your AI API key
            </Link>{" "}
            (Gemini has a free tier).
          </p>
        )}
      </section>

      {stats.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-2">
          {stats.map((s) => (
            <Card key={s.language}>
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <LangBadge language={s.language} /> Last 5 sessions · {s.sessions} total
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Speed" value={num(s.avgWpm)} hint={`${unitLabel(s.language)}/min`} />
                <Stat label="Comprehension" value={pct(s.avgComprehension)} />
                <Stat label="Effective" value={num(s.avgEffectiveWpm)} hint={`${unitLabel(s.language)}/min`} />
              </div>
            </Card>
          ))}
        </section>
      )}

      <section className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
        <Card>
          <h2 className="mb-3 font-semibold">New reading</h2>
          <NewArticleForm />
        </Card>
        <div>
          <h2 className="mb-3 font-semibold">Library</h2>
          {articleRows.length === 0 ? (
            <p className="text-sm text-stone-500">Nothing here yet. Add a document you actually need to read.</p>
          ) : (
            <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
              {articleRows.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/read/${a.id}`} className="block truncate font-medium hover:text-amber-600">
                      {a.title}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-500">
                      <LangBadge language={a.language} />
                      {a.wordCount} {unitLabel(a.language)}
                      {a.sessions > 0 && (
                        <span>
                          · {a.sessions} session{a.sessions > 1 ? "s" : ""} · last {num(a.lastWpm)}/min
                        </span>
                      )}
                    </div>
                  </div>
                  <DeleteArticleButton id={a.id} title={a.title} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
