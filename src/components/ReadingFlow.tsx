"use client";

import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { checkPurpose, finishReading, startSession, submitRecall } from "@/app/actions";
import type { ChunkPlan, Language, PurposeCoach, PurposeType, Quiz, ReadingMode } from "@/db/schema";
import type { ChunksResult } from "@/lib/chunker";
import { chunkDurations, endsSentence, rulePlan, segmentEnds, segmentWords } from "@/lib/chunks";
import type { QuizResult } from "@/lib/quiz";
import {
  MAX_PLAUSIBLE_WPM,
  PACER_MAX_WPM,
  PACER_MIN_WPM,
  LANGUAGE_NAMES,
  PURPOSE_TYPES,
  buildPreview,
  formatDuration,
  parseBlocks,
  splitParts,
  unitLabel,
  type Block,
} from "@/lib/text";
import { ExplainStep, type Explanation } from "./ExplainStep";
import { buttonPrimary, buttonSecondary, input } from "./ui";

type Step = "preview" | "purpose" | "read" | "recall" | "explain" | "quiz";

const STEPS: { id: Step; label: string }[] = [
  { id: "preview", label: "Preview" },
  { id: "purpose", label: "Purpose" },
  { id: "read", label: "Read" },
  { id: "recall", label: "Recall" },
  { id: "explain", label: "Explain" },
  { id: "quiz", label: "Check" },
];

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
  const [purposeType, setPurposeType] = useState<PurposeType | null>(null);
  const [coach, setCoach] = useState<PurposeCoach | null>(null);
  const [coaching, setCoaching] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [preAnswers, setPreAnswers] = useState<string[]>([]);
  const [mode, setMode] = useState<ReadingMode>("deep");
  const [pacerOn, setPacerOn] = useState(false);
  const [pacerWpm, setPacerWpm] = useState(suggestedWpm);
  const [showBreaks, setShowBreaks] = useState(false);
  const [aiPlan, setAiPlan] = useState<ChunkPlan | null>(null);
  const [chunksFailed, setChunksFailed] = useState(false);
  const segments = useMemo(() => segmentWords(blocks, article.language), [blocks, article.language]);
  const fallbackPlan = useMemo(() => rulePlan(segments, article.language), [segments, article.language]);
  const plan = aiPlan ?? fallbackPlan;
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [wpm, setWpm] = useState<number | null>(null);
  const [summary, setSummary] = useState("");
  const [explanation, setExplanation] = useState<Explanation | null>(null);
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

  // How long the pacer ran, and at what speeds, while the reading clock was running. The pacer can
  // be switched and re-paced mid-read, so the session records a time-weighted summary at the end.
  const pacerUse = useRef({ ms: 0, wpmMs: 0, wpm: 0, since: null as number | null });
  useEffect(() => {
    const u = pacerUse.current;
    if (u.since !== null) {
      const d = performance.now() - u.since;
      u.ms += d;
      u.wpmMs += d * u.wpm;
      u.since = null;
    }
    if (step === "read" && readClock.running && pacerOn) {
      u.since = performance.now();
      u.wpm = pacerWpm;
    }
  }, [step, readClock.running, pacerOn, pacerWpm]);

  // Pause the reading clock when the tab is hidden.
  const { pause: pauseRead, running: readRunning } = readClock;
  useEffect(() => {
    const onVis = () => document.hidden && pauseRead();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pauseRead]);

  const loadQuiz = useCallback(() => {
    if (!aiConfigured) return Promise.resolve();
    quizPromise.current ??= fetch(`/api/articles/${article.id}/quiz`, { method: "POST" })
      .then((res) => res.json() as Promise<QuizResult>)
      .catch((): QuizResult => ({ quiz: null, error: "Could not reach the server." }))
      .then((r) => {
        setQuiz(r.quiz);
        setQuizError(r.error ?? null);
        if (r.quiz) {
          setAnswers(r.quiz.questions.map(() => null));
          setPreAnswers((r.quiz.preQuestions ?? []).map(() => ""));
        }
      });
    return quizPromise.current;
  }, [aiConfigured, article.id]);

  // Generate questions during Preview: the warm-up questions are needed at the Purpose step.
  useEffect(() => {
    void loadQuiz();
  }, [loadQuiz]);

  // AI phrase segmentation, in parallel with the quiz; punctuation rules cover the wait.
  useEffect(() => {
    if (!aiConfigured) return;
    let cancelled = false;
    fetch(`/api/articles/${article.id}/chunks`, { method: "POST" })
      .then((res) => res.json() as Promise<ChunksResult>)
      .catch((): ChunksResult => ({ plan: null }))
      .then((r) => {
        if (cancelled) return;
        if (r.plan) setAiPlan(r.plan);
        else setChunksFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [aiConfigured, article.id]);

  function applyPurposeType(t: PurposeType) {
    setPurposeType(t);
    setMode(PURPOSE_TYPES[t].mode);
  }

  async function askCoach() {
    setCoaching(true);
    setCoachError(null);
    try {
      const r = await checkPurpose(article.id, purpose);
      if ("error" in r) {
        setCoachError(r.error);
      } else {
        setCoach(r.coach);
        if (purpose.trim()) applyPurposeType(r.coach.purposeType);
      }
    } catch {
      setCoachError("Could not check your question.");
    } finally {
      setCoaching(false);
    }
  }

  const preQuestions = quiz?.preQuestions ?? [];

  async function beginReading() {
    setBusy(true);
    setError(null);
    try {
      previewClock.pause();
      const id = await startSession({
        articleId: article.id,
        mode,
        purpose,
        purposeType: purpose.trim() ? purposeType : null,
        prediction,
        preAnswers: preQuestions.length ? preAnswers : null,
        previewMs: previewClock.read(),
      });
      setSessionId(id);
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
    const ms = readClock.read();
    if (
      article.wordCount / (ms / 60_000) > MAX_PLAUSIBLE_WPM &&
      !confirm(`That pace is over ${MAX_PLAUSIBLE_WPM} ${unit}/min, faster than reading with understanding allows. Finish anyway?`)
    ) {
      readClock.start();
      return;
    }
    setBusy(true);
    try {
      const u = pacerUse.current;
      const open = u.since !== null ? performance.now() - u.since : 0;
      const pacedMs = u.ms + open;
      // A session counts as paced when the pacer ran for most of the reading time.
      const pacer =
        pacedMs >= ms / 2
          ? { wpm: Math.round((u.wpmMs + open * u.wpm) / pacedMs / 10) * 10, chunks: plan.source }
          : null;
      const r = await finishReading(sessionId, ms, pacer);
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
        explanation,
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

  function goToExplain() {
    if (!aiConfigured) return submit(false);
    setStep("explain");
    window.scrollTo({ top: 0 });
  }

  async function goToQuiz() {
    setStep("quiz");
    window.scrollTo({ top: 0 });
    await loadQuiz();
  }

  // Explain and Check both need AI feedback, so without AI the session ends after Recall.
  const steps = aiConfigured ? STEPS : STEPS.filter((s) => s.id !== "explain" && s.id !== "quiz");
  const stepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{article.title}</h1>
        <p className="mt-1 text-sm text-stone-500">
          {article.wordCount} {unit} · {LANGUAGE_NAMES[article.language]}
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
              onChange={(e) => {
                setPurpose(e.target.value);
                // feedback and purpose type described the previous wording
                setCoach(null);
                setPurposeType(null);
              }}
              placeholder="e.g. How does the cache invalidation work, and when should I use it?"
              className={`${input} mt-1`}
            />
          </label>
          {aiConfigured && (
            <div className="space-y-3">
              <button type="button" className={buttonSecondary} disabled={coaching} onClick={askCoach}>
                {coaching ? "Thinking…" : purpose.trim() ? "Check my question" : "Suggest questions"}
              </button>
              {coachError && <p className="text-sm text-red-600">{coachError}</p>}
              {coach && (
                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40">
                  {purposeType && (
                    <p className="font-medium">
                      {PURPOSE_TYPES[purposeType].label}
                      {!coach.specific && <span className="font-normal text-amber-700 dark:text-amber-400"> · too broad</span>}
                      {!coach.answerable && (
                        <span className="font-normal text-amber-700 dark:text-amber-400"> · this text may not answer it</span>
                      )}
                    </p>
                  )}
                  <p>{coach.feedback}</p>
                  {coach.suggestions.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-stone-500">Use a suggestion, or edit your own:</p>
                      {coach.suggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setPurpose(s);
                            applyPurposeType(coach.purposeType);
                          }}
                          className="block w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-left hover:border-amber-500 dark:border-stone-700 dark:bg-stone-900"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
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
                <div className="font-medium">
                  {label}
                  {purposeType && PURPOSE_TYPES[purposeType].mode === value && (
                    <span className="ml-2 rounded bg-amber-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                      Suggested
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-stone-500">{desc}</div>
              </button>
            ))}
          </div>
          {purposeType && (
            <p className="text-sm text-stone-500">
              For “{PURPOSE_TYPES[purposeType].label}”: {PURPOSE_TYPES[purposeType].hint}
            </p>
          )}
          {aiConfigured && (!quiz || preQuestions.length > 0) && (
            <div className="space-y-3 rounded-xl border border-stone-200 p-4 dark:border-stone-800">
              <div>
                <div className="text-sm font-medium">Warm-up: guess before you read</div>
                <p className="mt-1 text-sm text-stone-500">
                  Trying to answer before reading — even wrongly — primes you to notice and remember the answers. One
                  line each; “no idea” is fine. You’ll see the real answers with your results.
                </p>
              </div>
              {!quiz && !quizError && <p className="text-sm text-stone-500">Preparing questions…</p>}
              {quizError && <p className="text-sm text-stone-500">Warm-up unavailable: {quizError}</p>}
              {preQuestions.map((q, i) => (
                <label key={i} className="block text-sm">
                  {i + 1}. {q.question}
                  <input
                    value={preAnswers[i] ?? ""}
                    onChange={(e) => setPreAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
                    placeholder="Your guess"
                    className={`${input} mt-1`}
                  />
                </label>
              ))}
            </div>
          )}
          <p className="text-sm text-stone-500">
            While reading you can turn on a <b>pacer</b> that highlights one meaningful phrase at a time, and{" "}
            <b>phrase breaks</b> that space phrases apart — and change them, or the pacer speed, at any moment.
          </p>
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
          segments={segments}
          plan={plan}
          language={article.language}
          showBreaks={showBreaks}
          onTogglePacer={() => setPacerOn((on) => !on)}
          onToggleBreaks={() => setShowBreaks((on) => !on)}
          onNudgeSpeed={(delta) =>
            setPacerWpm((w) => Math.min(PACER_MAX_WPM, Math.max(PACER_MIN_WPM, w + delta)))
          }
          controls={
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <label
                className="flex items-center gap-2 font-medium"
                title="Highlights one meaningful phrase at a time, lingering on dense phrases and sentence ends. The full text stays visible, so you can still look back."
              >
                <input
                  type="checkbox"
                  checked={pacerOn}
                  onChange={(e) => {
                    setPacerOn(e.target.checked);
                    e.target.blur(); // keep Space for pause/resume
                  }}
                />
                Pacer
              </label>
              {pacerOn && (
                <label className="flex items-center gap-2">
                  <input
                    type="range"
                    min={PACER_MIN_WPM}
                    max={PACER_MAX_WPM}
                    step={10}
                    value={pacerWpm}
                    onChange={(e) => setPacerWpm(Number(e.target.value))}
                    className="w-32 sm:w-44"
                    aria-label="Pacer speed"
                  />
                  <span className="w-24 tabular-nums text-stone-600 dark:text-stone-400">
                    {pacerWpm} {unit}/min
                  </span>
                </label>
              )}
              <label
                className="flex items-center gap-2 font-medium"
                title="Adds a little space between phrases. A stepping stone: the goal is to group words into phrases on your own."
              >
                <input
                  type="checkbox"
                  checked={showBreaks}
                  onChange={(e) => {
                    setShowBreaks(e.target.checked);
                    e.target.blur();
                  }}
                />
                Phrase breaks
              </label>
              {(pacerOn || showBreaks) && (
                <span className="text-xs text-stone-500">
                  {aiPlan
                    ? "Phrases grouped by AI"
                    : aiConfigured && !chunksFailed
                      ? "Phrases at punctuation for now — AI phrasing on its way…"
                      : "Phrases at punctuation and linking words"}
                </span>
              )}
            </div>
          }
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
          <button className={buttonPrimary} disabled={busy || summary.trim().length < 20} onClick={goToExplain}>
            {aiConfigured ? "Continue" : busy ? "Saving…" : "Finish"}
          </button>
        </StepPanel>
      )}

      {step === "explain" && (
        <StepPanel
          title="Explain it in 60 seconds"
          why="Explaining to someone else exposes the gaps that reading hides (the self-explanation effect), and saying the conclusion first is how busy colleagues want to hear it. Optional — skip it when you are short on time."
        >
          <ExplainStep
            language={article.language}
            onDone={(result) => {
              setExplanation(result);
              void goToQuiz();
            }}
          />
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

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="mx-0.5 rounded border border-stone-300 px-1 font-sans text-[11px] dark:border-stone-700">
      {children}
    </kbd>
  );
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
  segments: string[][];
  plan: ChunkPlan;
  language: Language;
  showBreaks: boolean;
  onTogglePacer: () => void;
  onToggleBreaks: () => void;
  onNudgeSpeed: (delta: number) => void;
  /** Pacer and phrase-break settings, shown in the toolbar so they can change mid-read. */
  controls: ReactNode;
}) {
  const { blocks, running, pacerWpm, segments, plan, language, showBreaks } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  // Word index of the current phrase's first word: survives pauses and a plan swap mid-read.
  const pos = useRef(0);
  // Bumped by keyboard jumps to restart the pacer at the new position.
  const [jump, setJump] = useState(0);

  // Chunk indices where a sentence (or a heading, paragraph or list item) begins.
  const sentenceStarts = useMemo(() => {
    const words = segments.flat();
    const ends = segmentEnds(segments);
    const starts = [0];
    plan.chunks.forEach((c, i) => {
      if (i + 1 < plan.chunks.length && (ends.has(c.end) || endsSentence(words[c.end - 1] ?? ""))) starts.push(i + 1);
    });
    return starts;
  }, [plan, segments]);

  /** Moves the pacer a phrase or a sentence. Back goes to the start of the current sentence first,
   * then to the previous one, like a media player's back button. */
  const move = useCallback(
    (unit: "phrase" | "sentence", dir: -1 | 1) => {
      const { chunks } = plan;
      if (!chunks.length) return;
      const cur = Math.max(0, chunks.findIndex((c) => c.end > pos.current));
      let next = cur + dir;
      if (unit === "sentence") {
        const beyond = sentenceStarts.filter((s) => (dir > 0 ? s > cur : s < cur));
        const start = sentenceStarts.filter((s) => s <= cur).at(-1) ?? 0;
        next = dir > 0 ? (beyond[0] ?? cur) : start < cur ? start : (beyond.at(-1) ?? 0);
      }
      pos.current = chunks[Math.min(chunks.length - 1, Math.max(0, next))].start;
      setJump((j) => j + 1);
    },
    [plan, sentenceStarts],
  );

  // Keyboard: Space pauses or resumes; ←/→ move a sentence, Shift+←/→ a phrase;
  // P toggles the pacer, B the phrase breaks, -/+ change the pacer speed.
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(TEXTAREA|SELECT)$/.test(target.tagName))) return;
      // Checkboxes and sliders don't take text, so only the keys they use themselves are left to them.
      if (target?.tagName === "INPUT" && !/^(checkbox|range)$/.test((target as HTMLInputElement).type)) return;
      const key = e.key.toLowerCase();
      if (e.key === " ") {
        // a focused button or checkbox already handles Space itself
        if (target?.tagName === "BUTTON" || (target as HTMLInputElement | null)?.type === "checkbox") return;
        e.preventDefault();
        if (!e.repeat) latest.current.onToggle();
      } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && pacerWpm) {
        if ((target as HTMLInputElement | null)?.type === "range") return; // the slider uses arrows
        e.preventDefault();
        move(e.shiftKey ? "phrase" : "sentence", e.key === "ArrowLeft" ? -1 : 1);
      } else if (!e.repeat && key === "p") {
        latest.current.onTogglePacer();
      } else if (!e.repeat && key === "b") {
        latest.current.onToggleBreaks();
      } else if ((e.key === "-" || e.key === "+" || e.key === "=") && pacerWpm) {
        latest.current.onNudgeSpeed(e.key === "-" ? -10 : 10);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, pacerWpm]);

  // Render words as spans once; the pacer then toggles classes imperatively.
  // Word numbering must match splitWords/segmentWords, which the chunk plan indexes into.
  const rendered = useMemo(() => {
    let w = 0;
    const words = (text: string) =>
      splitParts(text, language).map((part, i) =>
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
  }, [blocks, language]);

  // Pacer: one phrase at a time, each shown for a time that follows its length, density and the
  // pause after it, so the reader is never pushed through a hard phrase or held on an easy one.
  // While paused the current phrase stays highlighted, so the reader can reflect and step around.
  useEffect(() => {
    if (!pacerWpm) return;
    const spans = Array.from(containerRef.current?.querySelectorAll<HTMLElement>("[data-w]") ?? []);
    const { chunks } = plan;
    if (!spans.length || !chunks.length) return;
    const durations = chunkDurations(plan, segments, pacerWpm, language);
    let index = Math.max(0, chunks.findIndex((c) => c.end > pos.current));
    const show = (on: boolean) => {
      for (let i = chunks[index].start; i < chunks[index].end; i++) spans[i]?.classList.toggle("pacer-on", on);
    };
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      pos.current = chunks[index].start;
      show(true);
      const first = spans[chunks[index].start];
      const rect = first.getBoundingClientRect();
      if (rect.top > window.innerHeight * 0.7 || rect.top < 0) first.scrollIntoView({ block: "center", behavior: "smooth" });
      if (!running || index === chunks.length - 1) return; // hold while paused or on the last phrase
      timer = setTimeout(() => {
        show(false);
        index++;
        step();
      }, durations[index]);
    };
    step();
    return () => {
      clearTimeout(timer);
      show(false);
    };
  }, [pacerWpm, running, plan, segments, language, jump]);

  // Optional phrase breaks: a little extra space after each phrase (visual-syntactic formatting).
  useEffect(() => {
    if (!showBreaks) return;
    const spans = Array.from(containerRef.current?.querySelectorAll<HTMLElement>("[data-w]") ?? []);
    const ends = segmentEnds(segments);
    const marked = plan.chunks.filter((c) => !ends.has(c.end)).map((c) => spans[c.end - 1]).filter(Boolean);
    for (const s of marked) s.classList.add("chunk-end");
    return () => {
      for (const s of marked) s.classList.remove("chunk-end");
    };
  }, [showBreaks, plan, segments]);

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
        <div className="flex basis-full flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {props.controls}
          <span className="hidden text-xs text-stone-400 lg:inline">
            <Kbd>Space</Kbd> pause · <Kbd>P</Kbd> pacer · <Kbd>B</Kbd> breaks
            {pacerWpm && (
              <>
                {" · "}
                <Kbd>←</Kbd>
                <Kbd>→</Kbd> sentence · <Kbd>Shift</Kbd>+<Kbd>←</Kbd>
                <Kbd>→</Kbd> phrase · <Kbd>−</Kbd>
                <Kbd>+</Kbd> speed
              </>
            )}
          </span>
        </div>
      </div>
      {/* lang picks the right CJK glyphs and line breaking */}
      <div ref={containerRef} lang={language} className="reader mx-auto max-w-[68ch]">
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
