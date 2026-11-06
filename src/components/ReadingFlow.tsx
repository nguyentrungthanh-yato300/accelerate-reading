"use client";

import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ensureQuiz, finishReading, startSession, submitRecall } from "@/app/actions";
import type { Language, Quiz, ReadingMode } from "@/db/schema";
import { buildPreview, formatDuration, parseBlocks, unitLabel, type Block } from "@/lib/text";
import { buttonPrimary, buttonSecondary, input } from "./ui";

type Step = "preview" | "purpose" | "read" | "recall" | "quiz";

const STEPS: { id: Step; label: string }[] = [
  { id: "preview", label: "Preview" },
  { id: "purpose", label: "Purpose" },
  { id: "read", label: "Read" },
  { id: "recall", label: "Recall" },
  { id: "quiz", label: "Check" },
];

const PACER_CHUNK = 3;

export type ReadingFlowProps = {
  article: { id: number; title: string; content: string; language: Language; wordCount: number };
  aiConfigured: boolean;
  suggestedWpm: number;
};

/** Stopwatch that only counts while running and the tab is visible. */
function useStopwatch() {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const acc = useRef(0);
  const since = useRef<number | null>(null);

  const read = useCallback(() => acc.current + (since.current ? performance.now() - since.current : 0), []);
  const start = useCallback(() => {
    if (since.current === null) since.current = performance.now();
    setRunning(true);
  }, []);
  const pause = useCallback(() => {
    if (since.current !== null) acc.current += performance.now() - since.current;
    since.current = null;
    setRunning(false);
  }, []);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed(read()), 250);
    return () => clearInterval(t);
  }, [running, read]);

  return { running, elapsed, start, pause, read };
}

export function ReadingFlow({ article, aiConfigured, suggestedWpm }: ReadingFlowProps) {
  const router = useRouter();
  const blocks = useMemo(() => parseBlocks(article.content), [article.content]);
  const preview = useMemo(() => buildPreview(blocks), [blocks]);
  const unit = unitLabel(article.language);

  const [step, setStep] = useState<Step>("preview");
  const [prediction, setPrediction] = useState("");
  const [purpose, setPurpose] = useState("");
  const [mode, setMode] = useState<ReadingMode>("deep");
  const [pacerOn, setPacerOn] = useState(false);
  const [pacerWpm, setPacerWpm] = useState(suggestedWpm);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [wpm, setWpm] = useState<number | null>(null);
  const [summary, setSummary] = useState("");
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewClock = useStopwatch();
  const readClock = useStopwatch();
  const quizPromise = useRef<Promise<void> | null>(null);

  // Preview timer starts immediately.
  const { start: startPreview } = previewClock;
  useEffect(() => startPreview(), [startPreview]);

  // Pause the reading clock when the tab is hidden.
  const { pause: pauseRead, running: readRunning } = readClock;
  useEffect(() => {
    const onVis = () => document.hidden && pauseRead();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pauseRead]);

  const loadQuiz = useCallback(() => {
    if (!aiConfigured) return Promise.resolve();
    quizPromise.current ??= ensureQuiz(article.id).then((r) => {
      setQuiz(r.quiz);
      setQuizError(r.error ?? null);
      if (r.quiz) setAnswers(r.quiz.questions.map(() => null));
    });
    return quizPromise.current;
  }, [aiConfigured, article.id]);

  async function beginReading() {
    setBusy(true);
    setError(null);
    try {
      previewClock.pause();
      const id = await startSession({
        articleId: article.id,
        mode,
        purpose,
        prediction,
        previewMs: previewClock.read(),
        pacerWpm: pacerOn ? pacerWpm : null,
      });
      setSessionId(id);
      void loadQuiz(); // generate questions while the user reads
      setStep("read");
      window.scrollTo({ top: 0 });
      readClock.start();
    } catch {
      setError("Could not start the session.");
    } finally {
      setBusy(false);
    }
  }

  async function doneReading() {
    if (!sessionId) return;
    readClock.pause();
    setBusy(true);
    try {
      const r = await finishReading(sessionId, readClock.read());
      setWpm(r.wpm);
      setStep("recall");
      window.scrollTo({ top: 0 });
    } catch {
      setError("Could not save reading time.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(withQuiz: boolean) {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await submitRecall({
        sessionId,
        summary,
        answers: withQuiz && quiz ? answers.map((a) => a ?? -1) : null,
      });
      if (res.ok) {
        router.push(`/sessions/${sessionId}`);
        return; // stay busy while navigating
      }
      setError(res.error);
    } catch {
      setError("Could not submit.");
    }
    setBusy(false);
  }

  async function goToQuiz() {
    if (!aiConfigured) return submit(false);
    setStep("quiz");
    window.scrollTo({ top: 0 });
    await loadQuiz();
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const steps = aiConfigured ? STEPS : STEPS.filter((s) => s.id !== "quiz");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{article.title}</h1>
        <p className="mt-1 text-sm text-stone-500">
          {article.wordCount} {unit} · {article.language === "vi" ? "Vietnamese" : "English"}
        </p>
      </div>

      <ol className="flex flex-wrap gap-2 text-xs font-medium">
        {steps.map((s, i) => (
          <li
            key={s.id}
            className={`rounded-full px-3 py-1 ${
              i === stepIndex
                ? "bg-amber-600 text-white"
                : i < stepIndex
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  : "bg-stone-100 text-stone-500 dark:bg-stone-800"
            }`}
          >
            {i + 1}. {s.label}
          </li>
        ))}
      </ol>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {step === "preview" && (
        <StepPanel
          title="Preview the structure"
          why="Skimming headings and lead sentences first builds a mental map (schema). Readers with a map process the details faster and remember them better."
          aside={<span className="tabular-nums">{formatDuration(previewClock.elapsed)}</span>}
        >
          <div className="reader rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
            {preview.length === 0 && <p className="text-stone-500">No structure found — go straight on.</p>}
            {preview.map((p, i) =>
              p.kind === "heading" ? (
                <HeadingTag key={i} level={p.level}>
                  {p.text}
                </HeadingTag>
              ) : (
                <p key={i} className="text-stone-600 dark:text-stone-400">
                  {p.text}
                </p>
              ),
            )}
          </div>
          <label className="block text-sm font-medium">
            What do you expect this text to explain? <span className="font-normal text-stone-500">(optional)</span>
            <textarea
              value={prediction}
              onChange={(e) => setPrediction(e.target.value)}
              rows={2}
              className={`${input} mt-1`}
            />
          </label>
          <button className={buttonPrimary} onClick={() => setStep("purpose")}>
            Continue
          </button>
        </StepPanel>
      )}

      {step === "purpose" && (
        <StepPanel
          title="Set your purpose"
          why="Reading with a question in mind tells your attention what to keep and what to skip. The right speed depends on the goal: skim for the gist, read deeply to learn or apply."
        >
          <label className="block text-sm font-medium">
            What question should this reading answer for you?
            <input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. How does the cache invalidation work, and when should I use it?"
              className={`${input} mt-1`}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["skim", "Skim", "Get the gist and the structure. Expect lower detail recall."],
                ["deep", "Deep read", "Understand how and why, so you can explain or apply it."],
              ] as const
            ).map(([value, label, desc]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`rounded-xl border p-4 text-left ${
                  mode === value
                    ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40"
                    : "border-stone-200 dark:border-stone-800"
                }`}
              >
                <div className="font-medium">{label}</div>
                <div className="mt-1 text-sm text-stone-500">{desc}</div>
              </button>
            ))}
          </div>
          <div className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={pacerOn} onChange={(e) => setPacerOn(e.target.checked)} />
              Use a pacer
            </label>
            <p className="mt-1 text-sm text-stone-500">
              Highlights words at a steady pace to keep attention from drifting. The full text stays visible, so you
              can still look back — unlike one-word-at-a-time apps, which hurt comprehension.
            </p>
            {pacerOn && (
              <label className="mt-3 flex items-center gap-3 text-sm">
                <input
                  type="range"
                  min={100}
                  max={600}
                  step={10}
                  value={pacerWpm}
                  onChange={(e) => setPacerWpm(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="w-28 tabular-nums">
                  {pacerWpm} {unit}/min
                </span>
              </label>
            )}
          </div>
          <button className={buttonPrimary} disabled={busy} onClick={beginReading}>
            {busy ? "Starting…" : "Start reading"}
          </button>
        </StepPanel>
      )}

      {step === "read" && (
        <ReadStep
          blocks={blocks}
          purpose={purpose}
          running={readRunning}
          elapsed={readClock.elapsed}
          onToggle={() => (readRunning ? readClock.pause() : readClock.start())}
          onDone={doneReading}
          busy={busy}
          pacerWpm={pacerOn ? pacerWpm : null}
        />
      )}

      {step === "recall" && (
        <StepPanel
          title="Recall from memory"
          why="Retrieving information — without looking — strengthens memory far more than re-reading (the testing effect). It also shows you what you actually understood."
          aside={
            wpm !== null && (
              <span className="tabular-nums">
                {Math.round(wpm)} {unit}/min
              </span>
            )
          }
        >
          {purpose && (
            <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm dark:bg-stone-800">
              <b>Your question:</b> {purpose}
            </p>
          )}
          <label className="block text-sm font-medium">
            Write a summary as if briefing a colleague: the main idea, the key points, and the answer to your question.
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={9}
              autoFocus
              className={`${input} mt-1`}
              placeholder="Main idea: …&#10;Key points: …&#10;Answer: …"
            />
          </label>
          <button className={buttonPrimary} disabled={busy || summary.trim().length < 20} onClick={goToQuiz}>
            {aiConfigured ? "Continue to check" : busy ? "Saving…" : "Finish"}
          </button>
        </StepPanel>
      )}

      {step === "quiz" && (
        <StepPanel
          title="Check your understanding"
          why="These questions measure comprehension, so your speed can be weighed against how much you understood."
        >
          {!quiz && !quizError && <p className="text-sm text-stone-500">Generating questions…</p>}
          {quizError && (
            <div className="space-y-3">
              <p className="text-sm text-red-600">{quizError}</p>
              <button className={buttonSecondary} disabled={busy} onClick={() => submit(false)}>
                Finish without quiz
              </button>
            </div>
          )}
          {quiz && (
            <>
              {quiz.questions.map((q, qi) => (
                <fieldset key={qi} className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
                  <legend className="px-1 text-sm font-medium">
                    {qi + 1}. {q.question}
                  </legend>
                  <div className="mt-2 space-y-1.5">
                    {q.options.map((o, oi) => (
                      <label key={oi} className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="radio"
                          name={`q${qi}`}
                          checked={answers[qi] === oi}
                          onChange={() => setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))}
                          className="mt-1"
                        />
                        {o}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <button
                className={buttonPrimary}
                disabled={busy || answers.some((a) => a === null)}
                onClick={() => submit(true)}
              >
                {busy ? "Grading your summary…" : "See results"}
              </button>
            </>
          )}
        </StepPanel>
      )}
    </div>
  );
}

function StepPanel(props: { title: string; why: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{props.title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-stone-500">{props.why}</p>
        </div>
        {props.aside && <div className="text-sm text-stone-500">{props.aside}</div>}
      </div>
      {props.children}
    </section>
  );
}

function HeadingTag({ level, children }: { level: number; children: ReactNode }) {
  if (level <= 1) return <h1>{children}</h1>;
  if (level === 2) return <h2>{children}</h2>;
  if (level === 3) return <h3>{children}</h3>;
  return <h4>{children}</h4>;
}

function ReadStep(props: {
  blocks: Block[];
  purpose: string;
  running: boolean;
  elapsed: number;
  onToggle: () => void;
  onDone: () => void;
  busy: boolean;
  pacerWpm: number | null;
}) {
  const { blocks, running, pacerWpm } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const pos = useRef(0);

  // Render words as spans once; the pacer then toggles classes imperatively.
  const rendered = useMemo(() => {
    let w = 0;
    const words = (text: string) =>
      text.split(/(\s+)/).map((part, i) =>
        /\S/.test(part) ? (
          <span key={i} data-w={w++}>
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      );
    return blocks.map((b, i) => {
      switch (b.type) {
        case "heading":
          return (
            <HeadingTag key={i} level={b.level}>
              {words(b.text)}
            </HeadingTag>
          );
        case "paragraph":
          return <p key={i}>{words(b.text)}</p>;
        case "list":
          return (
            <ul key={i}>
              {b.items.map((it, j) => (
                <li key={j}>{words(it)}</li>
              ))}
            </ul>
          );
        case "code":
          return <pre key={i}>{b.text}</pre>;
      }
    });
  }, [blocks]);

  useEffect(() => {
    if (!pacerWpm || !running) return;
    const spans = Array.from(containerRef.current?.querySelectorAll<HTMLElement>("[data-w]") ?? []);
    if (!spans.length) return;
    const show = (on: boolean) => {
      for (let i = pos.current; i < Math.min(pos.current + PACER_CHUNK, spans.length); i++)
        spans[i].classList.toggle("pacer-on", on);
    };
    show(true);
    const t = setInterval(
      () => {
        show(false);
        pos.current = Math.min(pos.current + PACER_CHUNK, spans.length - 1);
        show(true);
        const rect = spans[pos.current].getBoundingClientRect();
        if (rect.top > window.innerHeight * 0.7 || rect.top < 0)
          spans[pos.current].scrollIntoView({ block: "center", behavior: "smooth" });
      },
      (60_000 / pacerWpm) * PACER_CHUNK,
    );
    return () => {
      clearInterval(t);
      show(false);
    };
  }, [pacerWpm, running]);

  return (
    <section className="space-y-4">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-b border-stone-200 bg-background/95 px-4 py-3 backdrop-blur dark:border-stone-800">
        <span className="font-mono text-lg tabular-nums">{formatDuration(props.elapsed)}</span>
        {!running && <span className="text-xs font-medium text-amber-600">Paused</span>}
        {props.purpose && (
          <span className="hidden min-w-0 flex-1 truncate text-sm text-stone-500 sm:block">
            Purpose: {props.purpose}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button className={buttonSecondary} onClick={props.onToggle}>
            {running ? "Pause" : "Resume"}
          </button>
          <button className={buttonPrimary} disabled={props.busy} onClick={props.onDone}>
            Done reading
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className={`reader mx-auto max-w-[68ch] transition ${running ? "" : "opacity-30 blur-[2px]"}`}
      >
        {rendered}
      </div>
      <div className="mx-auto max-w-[68ch]">
        <button className={`${buttonPrimary} w-full`} disabled={props.busy} onClick={props.onDone}>
          Done reading
        </button>
      </div>
    </section>
  );
}
