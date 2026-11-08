"use client";

import { useEffect, useRef, useState } from "react";
import type { Language } from "@/db/schema";
import { buttonPrimary, buttonSecondary, input } from "./ui";

export type Explanation = { text: string; ms: number; spoken: boolean };

const TARGET_MS = 60_000;

const SPEECH_LANGS: { value: string; label: string; language: Language }[] = [
  { value: "en-US", label: "English", language: "en" },
  { value: "vi-VN", label: "Tiếng Việt", language: "vi" },
  { value: "zh-CN", label: "中文", language: "zh" },
];

// The Web Speech API is not in TypeScript's DOM types; this is the part used here.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Explain the text to a colleague in about a minute, by voice or typing (Feynman technique). */
export function ExplainStep(props: { language: Language; onDone: (explanation: Explanation | null) => void }) {
  const [speechSupported] = useState(() => recognitionCtor() !== null);
  const [mode, setMode] = useState<"speak" | "type">(speechSupported ? "speak" : "type");
  const [speechLang, setSpeechLang] = useState(
    SPEECH_LANGS.find((l) => l.language === props.language)?.value ?? "en-US",
  );
  const [text, setText] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const keepListening = useRef(false);
  const finalText = useRef("");
  // Spoken explanations are graded leniently on transcription errors.
  const usedMic = useRef(false);

  useEffect(() => {
    if (startedAt === null) return;
    const t = setInterval(() => setElapsed(performance.now() - startedAt), 250);
    return () => clearInterval(t);
  }, [startedAt]);

  // Stop the microphone if the step is left mid-recording.
  useEffect(() => () => {
    keepListening.current = false;
    recognition.current?.stop();
  }, []);

  function startClock() {
    if (startedAt === null) setStartedAt(performance.now());
  }

  function startListening() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setMicError(null);
    finalText.current = text ? `${text.trim()} ` : "";
    const rec = new Ctor();
    rec.lang = speechLang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText.current += `${r[0].transcript.trim()} `;
        else interim += r[0].transcript;
      }
      setText(finalText.current + interim);
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      keepListening.current = false;
      setMicError(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Microphone access is blocked. Allow it for this site in the browser, or type instead."
          : `Speech recognition stopped (${e.error}). You can continue by typing.`,
      );
    };
    // Browsers end recognition after a pause; keep going until the reader stops.
    rec.onend = () => {
      if (keepListening.current) rec.start();
      else setListening(false);
    };
    recognition.current = rec;
    keepListening.current = true;
    usedMic.current = true;
    rec.start();
    setListening(true);
    startClock();
  }

  function stopListening() {
    keepListening.current = false;
    recognition.current?.stop();
    setText(finalText.current.trim());
  }

  function finish() {
    if (listening) {
      keepListening.current = false;
      recognition.current?.stop();
    }
    props.onDone({
      text: text.trim(),
      ms: startedAt === null ? 0 : performance.now() - startedAt,
      spoken: usedMic.current,
    });
  }

  const seconds = Math.floor(elapsed / 1000);
  const over = elapsed > TARGET_MS;
  const left = Math.max(0, TARGET_MS / 1000 - seconds);
  const clock = over ? `+${seconds - TARGET_MS / 1000}s` : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-stone-200 p-4 text-sm dark:border-stone-800">
        <p className="font-medium">Explain it to a colleague in about a minute, without looking:</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-stone-600 dark:text-stone-400">
          <li>
            <b>Main message first</b> — the one thing they should remember.
          </li>
          <li>
            <b>Three supporting points</b> — how it works, why it matters, what to watch out for.
          </li>
          <li>Plain words, no wandering. If you get stuck, that is the part to re-read.</li>
        </ol>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {speechSupported && (
          <div className="flex gap-1 rounded-lg bg-stone-100 p-1 text-sm dark:bg-stone-800">
            {(["speak", "type"] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={listening}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 font-medium ${
                  mode === m ? "bg-white shadow-sm dark:bg-stone-950" : "text-stone-500"
                }`}
              >
                {m === "speak" ? "Speak" : "Type"}
              </button>
            ))}
          </div>
        )}
        {mode === "speak" && (
          <select
            value={speechLang}
            onChange={(e) => setSpeechLang(e.target.value)}
            disabled={listening}
            aria-label="Speaking language"
            className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-950"
          >
            {SPEECH_LANGS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        )}
        <span
          className={`ml-auto font-mono text-lg tabular-nums ${over ? "text-amber-600" : ""}`}
          aria-live="off"
        >
          {clock}
        </span>
      </div>

      {mode === "speak" && (
        <div className="flex items-center gap-3">
          {listening ? (
            <button type="button" className={buttonSecondary} onClick={stopListening}>
              ■ Stop
            </button>
          ) : (
            <button type="button" className={buttonPrimary} onClick={startListening}>
              {text ? "● Continue speaking" : "● Start speaking"}
            </button>
          )}
          {listening && <span className="text-sm text-red-600">Listening…</span>}
        </div>
      )}
      {micError && <p className="text-sm text-red-600">{micError}</p>}

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          finalText.current = e.target.value;
          startClock();
        }}
        readOnly={listening}
        rows={7}
        className={`${input} ${listening ? "opacity-80" : ""}`}
        placeholder={
          mode === "speak"
            ? "Your words appear here as you speak. You can fix misheard words afterwards."
            : "Main message: …\n1. …\n2. …\n3. …"
        }
      />
      {mode === "speak" && (
        <p className="text-xs text-stone-500">
          Your browser transcribes the speech (Chrome and Edge use their own online speech service).
        </p>
      )}

      <div className="flex gap-3">
        <button type="button" className={buttonPrimary} disabled={text.trim().length < 20} onClick={finish}>
          Done — continue to check
        </button>
        <button type="button" className={buttonSecondary} onClick={() => props.onDone(null)}>
          Skip
        </button>
      </div>
    </div>
  );
}
