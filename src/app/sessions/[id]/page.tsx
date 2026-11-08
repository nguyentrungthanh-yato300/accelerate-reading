import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Stat, buttonPrimary, buttonSecondary, num, pct } from "@/components/ui";
import type { ReadingSession } from "@/db/schema";
import { getSessionWithArticle, listCompletedSessions } from "@/lib/queries";
import { PURPOSE_TYPES, formatDuration, unitLabel } from "@/lib/text";

export default async function SessionPage({ params }: PageProps<"/sessions/[id]">) {
  const { id } = await params;
  const data = await getSessionWithArticle(Number(id));
  if (!data) notFound();
  const { session, article } = data;
  const unit = unitLabel(article.language);
  const fb = session.summaryFeedback;
  const quiz = article.quiz;
  const warmUp =
    quiz?.preQuestions && session.preAnswers
      ? quiz.preQuestions.map((q, i) => ({ ...q, guess: session.preAnswers![i] ?? "" }))
      : [];

  // Compare with your previous sessions in the same language.
  const previous = (await listCompletedSessions()).filter(
    (s) => s.language === article.language && s.id !== session.id && s.createdAt <= session.createdAt,
  );
  const prevEff = previous.map((s) => s.effectiveWpm).filter((v): v is number => v !== null).slice(0, 5);
  const prevAvg = prevEff.length ? prevEff.reduce((a, b) => a + b, 0) / prevEff.length : null;
  const delta = prevAvg && session.effectiveWpm ? (session.effectiveWpm - prevAvg) / prevAvg : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-stone-500">Session results · {session.mode === "skim" ? "Skim" : "Deep read"}</p>
        <h1 className="text-xl font-semibold tracking-tight">{article.title}</h1>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-5">
          <Stat label="Speed" value={num(session.wpm)} hint={`${unit}/min`} />
          <Stat label="Comprehension" value={pct(session.quizScore)} hint="quiz" />
          <Stat
            label="Effective speed"
            value={num(session.effectiveWpm)}
            hint={
              delta !== null ? (
                <span className={delta >= 0 ? "text-emerald-600" : "text-red-600"}>
                  {delta >= 0 ? "+" : ""}
                  {Math.round(delta * 100)}% vs your recent avg
                </span>
              ) : (
                "speed × comprehension"
              )
            }
          />
          <Stat label="Recall" value={session.summaryScore !== null ? `${Math.round(session.summaryScore)}` : "–"} hint="summary /100" />
          <Stat label="Time" value={formatDuration(session.readMs)} hint={`preview ${formatDuration(session.previewMs)}`} />
        </div>
      </Card>

      {fb && (
        <Card className="space-y-4">
          <h2 className="font-semibold">Feedback on your summary</h2>
          <p className="text-sm">{fb.feedback}</p>
          {fb.purposeAnswered !== null && (
            <p className="text-sm">
              {fb.purposeAnswered ? "✅ Your summary answers your purpose question." : "⚠️ Your summary does not clearly answer your purpose question."}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <PointList title="Captured" items={fb.coveredPoints} tone="text-emerald-700 dark:text-emerald-400" />
            <PointList title="Missed" items={fb.missedPoints} tone="text-amber-700 dark:text-amber-400" />
          </div>
          {fb.inaccuracies.length > 0 && (
            <PointList title="Inaccurate" items={fb.inaccuracies} tone="text-red-700 dark:text-red-400" />
          )}
        </Card>
      )}

      {session.explanation && <ExplanationCard session={session} />}

      {(session.purpose || session.prediction || warmUp.length > 0) && (
        <Card className="space-y-4">
          <h2 className="font-semibold">Before vs after reading</h2>
          {session.purpose && (
            <div className="text-sm">
              <h3 className="font-medium">
                Your purpose
                {session.purposeType && (
                  <span className="ml-2 font-normal text-stone-500">· {PURPOSE_TYPES[session.purposeType].label}</span>
                )}
              </h3>
              <p className="mt-1 text-stone-700 dark:text-stone-300">{session.purpose}</p>
            </div>
          )}
          {session.prediction && (
            <div className="text-sm">
              <h3 className="font-medium">Your prediction</h3>
              <p className="mt-1 text-stone-700 dark:text-stone-300">{session.prediction}</p>
              {fb?.predictionCheck && <p className="mt-1 text-amber-700 dark:text-amber-400">{fb.predictionCheck}</p>}
            </div>
          )}
          {warmUp.length > 0 && (
            <div className="space-y-3 text-sm">
              <h3 className="font-medium">Warm-up questions</h3>
              {warmUp.map((w, i) => (
                <div key={i}>
                  <p className="font-medium">
                    {i + 1}. {w.question}
                  </p>
                  <p className="mt-1 text-stone-500">Your guess: {w.guess || "–"}</p>
                  <p className="mt-1 text-emerald-700 dark:text-emerald-400">From the text: {w.answer}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">Your summary</h2>
          <p className="whitespace-pre-wrap text-sm text-stone-700 dark:text-stone-300">{session.summary ?? "–"}</p>
        </Card>
        {quiz && (
          <Card>
            <h2 className="mb-2 font-semibold">Key points</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {quiz.keyPoints.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {quiz && session.quizAnswers && (
        <Card className="space-y-4">
          <h2 className="font-semibold">Quiz review</h2>
          {quiz.questions.map((q, qi) => {
            const chosen = session.quizAnswers![qi];
            const right = chosen === q.answerIndex;
            return (
              <div key={qi} className="text-sm">
                <p className="font-medium">
                  {right ? "✅" : "❌"} {qi + 1}. {q.question}
                </p>
                {!right && (
                  <p className="mt-1 text-red-700 dark:text-red-400">Your answer: {q.options[chosen] ?? "–"}</p>
                )}
                <p className="mt-1 text-emerald-700 dark:text-emerald-400">Correct: {q.options[q.answerIndex]}</p>
                <p className="mt-1 text-stone-500">{q.explanation}</p>
              </div>
            );
          })}
        </Card>
      )}

      <div className="flex gap-3">
        <Link href={`/read/${article.id}`} className={buttonSecondary}>
          Read again
        </Link>
        <Link href="/" className={buttonPrimary}>
          Next reading
        </Link>
      </div>
    </div>
  );
}

/** The 60-second explanation and its review: scores, the message that came through, where it
 * wandered, and a tighter version to compare with. */
function ExplanationCard({ session }: { session: ReadingSession }) {
  const ex = session.explanationFeedback;
  const seconds = session.explanationMs ? Math.round(session.explanationMs / 1000) : null;
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Your 60-second explanation</h2>
        <span className="text-xs text-stone-500">
          {session.explanationSpoken ? "spoken" : "typed"}
          {seconds !== null && (
            <span className={seconds > 75 ? "text-amber-600" : ""}> · {seconds}s</span>
          )}
        </span>
      </div>

      {ex ? (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Clarity" value={`${ex.clarity}/10`} />
            <Stat label="Completeness" value={`${ex.completeness}/10`} />
            <Stat label="Accuracy" value={`${ex.accuracy}/10`} />
          </div>
          <p className="text-sm">{ex.feedback}</p>
          <div className="text-sm">
            <h3 className="font-medium">What a listener takes away</h3>
            <p className="mt-1 text-stone-700 dark:text-stone-300">
              {ex.mainMessage ?? "No single main message came through."}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              {ex.conclusionFirst ? "✅ You led with the conclusion." : "⚠️ Lead with the conclusion, then support it."}
            </p>
          </div>
          {ex.rambling.length > 0 && (
            <div className="space-y-2 text-sm">
              <h3 className="font-medium text-amber-700 dark:text-amber-400">Where it wandered</h3>
              {ex.rambling.map((r, i) => (
                <div key={i}>
                  <p className="text-stone-500 line-through decoration-stone-400">“{r.quote}”</p>
                  <p className="text-emerald-700 dark:text-emerald-400">→ {r.suggestion}</p>
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <PointList title="Worth mentioning" items={ex.missedPoints} tone="text-amber-700 dark:text-amber-400" />
            <PointList title="Inaccurate" items={ex.inaccuracies} tone="text-red-700 dark:text-red-400" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-1 text-sm font-medium">What you said</h3>
              <p className="whitespace-pre-wrap text-sm text-stone-700 dark:text-stone-300">{session.explanation}</p>
            </div>
            <div>
              <h3 className="mb-1 text-sm font-medium">A tighter version</h3>
              <p className="whitespace-pre-wrap text-sm text-stone-700 dark:text-stone-300">{ex.improved}</p>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-stone-500">No AI review for this one (check your AI settings).</p>
          <p className="whitespace-pre-wrap text-sm text-stone-700 dark:text-stone-300">{session.explanation}</p>
        </>
      )}
    </Card>
  );
}

function PointList({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div>
      <h3 className={`mb-1 text-sm font-semibold ${tone}`}>{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-stone-500">None</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {items.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
