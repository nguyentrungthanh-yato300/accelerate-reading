import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import type { Language, Quiz, ReadingMode, SummaryFeedback } from "@/db/schema";

/**
 * Provider-agnostic model selection. Configure with env vars:
 *   AI_PROVIDER = google | anthropic | openai | openai-compatible | ollama
 *   AI_MODEL    = model id (optional, sensible default per provider)
 */
const DEFAULT_MODELS: Record<string, string> = {
  google: "gemini-flash-latest",
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-5.5",
  ollama: "qwen3",
};

function resolveProvider(): string | null {
  const p = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (p) return p;
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return "google";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

export function getModel(): LanguageModel | null {
  const provider = resolveProvider();
  if (!provider) return null;
  const modelId = process.env.AI_MODEL?.trim() || DEFAULT_MODELS[provider];

  switch (provider) {
    case "google":
      return createGoogle()(modelId);
    case "anthropic":
      return createAnthropic()(modelId);
    case "openai":
      return createOpenAI()(modelId);
    case "ollama":
      return createOpenAICompatible({
        name: "ollama",
        baseURL: process.env.AI_BASE_URL ?? "http://localhost:11434/v1",
      })(modelId);
    case "openai-compatible": {
      const baseURL = process.env.AI_BASE_URL;
      if (!baseURL || !modelId) throw new Error("openai-compatible needs AI_BASE_URL and AI_MODEL");
      return createOpenAICompatible({ name: "custom", baseURL, apiKey: process.env.AI_API_KEY })(modelId);
    }
    default:
      throw new Error(`Unknown AI_PROVIDER "${provider}"`);
  }
}

export function aiStatus(): { configured: boolean; label: string } {
  const provider = resolveProvider();
  if (!provider) return { configured: false, label: "AI not configured" };
  return { configured: true, label: `${provider} · ${process.env.AI_MODEL || DEFAULT_MODELS[provider] || "?"}` };
}

function langName(language: Language) {
  return language === "vi" ? "Vietnamese" : "English";
}

const MAX_CHARS = 60_000;

const quizSchema = z.object({
  keyPoints: z
    .array(z.string())
    .describe("The 4-8 most important ideas a reader must retain, each one short sentence."),
  questions: z
    .array(
      z.object({
        question: z.string(),
        options: z.array(z.string()).length(4),
        answerIndex: z.number().int().min(0).max(3),
        explanation: z.string().describe("One sentence explaining why the answer is correct."),
      }),
    )
    .describe("5 multiple-choice comprehension questions."),
});

export async function generateQuiz(model: LanguageModel, text: string, language: Language): Promise<Quiz> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: quizSchema }),
    system:
      "You are a reading-comprehension assessor for professionals who read technical documentation. " +
      "You write questions that test understanding of the text's main ideas, mechanisms, trade-offs and " +
      "implications — not trivia such as exact numbers or names unless they are central.",
    prompt:
      `Write the key points and exactly 5 multiple-choice questions for the text below. ` +
      `Mix levels: 2 questions on main ideas, 2 on how/why something works, 1 on applying or inferring. ` +
      `Distractors must be plausible. Vary the position of the correct answer. ` +
      `Write everything in ${langName(language)}.\n\n<text>\n${text.slice(0, MAX_CHARS)}\n</text>`,
  });
  return output;
}

const feedbackSchema = z.object({
  score: z.number().min(0).max(100).describe("Overall recall quality 0-100."),
  coveredPoints: z.array(z.string()).describe("Key points the summary captured."),
  missedPoints: z.array(z.string()).describe("Important key points the summary missed."),
  inaccuracies: z.array(z.string()).describe("Statements in the summary that contradict the text."),
  purposeAnswered: z
    .boolean()
    .nullable()
    .describe("Whether the summary answers the reader's purpose question; null if none was given."),
  feedback: z.string().describe("2-3 sentences of specific, encouraging coaching for the next read."),
});

export async function evaluateSummary(
  model: LanguageModel,
  args: {
    text: string;
    language: Language;
    keyPoints: string[];
    summary: string;
    purpose: string | null;
    mode: ReadingMode;
  },
): Promise<SummaryFeedback> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: feedbackSchema }),
    system:
      "You grade free-recall summaries written from memory right after reading (retrieval practice). " +
      "Be fair: paraphrases count, brevity is fine, and a skim-mode summary is expected to be less detailed. " +
      "Grade understanding, not writing style or language choice.",
    prompt:
      `Reading mode: ${args.mode === "skim" ? "skim (gist expected)" : "deep (detail expected)"}\n` +
      `Reader's purpose question: ${args.purpose?.trim() || "(none)"}\n` +
      `Key points:\n${args.keyPoints.map((p) => `- ${p}`).join("\n")}\n\n` +
      `<text>\n${args.text.slice(0, MAX_CHARS)}\n</text>\n\n` +
      `<summary>\n${args.summary}\n</summary>\n\n` +
      `Write the feedback fields in ${langName(args.language)}.`,
  });
  return output;
}
