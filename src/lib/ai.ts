import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import type { Language, PurposeCoach, Quiz, ReadingMode, SummaryFeedback } from "@/db/schema";

/**
 * Provider-agnostic model selection. Configure with env vars:
 *   AI_PROVIDER = google | anthropic | openai | deepseek | openai-compatible | ollama
 *   AI_MODEL    = model id (optional, sensible default per provider)
 */
const DEFAULT_MODELS: Record<string, string> = {
  google: "gemini-flash-latest",
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-5.5",
  deepseek: "deepseek-v4-flash",
  ollama: "qwen3",
};

function resolveProvider(): string | null {
  const p = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (p) return p;
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return "google";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.DEEPSEEK_API_KEY) return "deepseek";
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
    case "deepseek":
      return createDeepSeek()(modelId);
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
  preQuestions: z
    .array(
      z.object({
        question: z.string().describe("Open question about a central idea, answerable from the text."),
        answer: z.string().describe("The text's answer in 1-2 sentences."),
      }),
    )
    .describe("3 warm-up questions the reader guesses at before reading. Must not overlap the quiz questions."),
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
      `Also write 3 open warm-up questions that the reader will try to answer BEFORE reading: they should ` +
      `spark curiosity about the central ideas, be hard to answer without reading, and test different ideas ` +
      `than the quiz questions. ` +
      `Write everything in ${langName(language)}.\n\n<text>\n${text.slice(0, MAX_CHARS)}\n</text>`,
  });
  return output;
}

const coachSchema = z.object({
  purposeType: z
    .enum(["lookup", "gist", "mechanism", "apply"])
    .describe(
      "lookup = find a specific fact or setting; gist = get the overall picture; " +
        "mechanism = understand how or why something works; apply = decide, evaluate or put it into practice.",
    ),
  specific: z.boolean().describe("True if the question names a concrete thing to find out, not just a topic."),
  answerable: z.boolean().describe("True if this text can actually answer the question."),
  feedback: z.string().describe("1-2 sentences: what makes the question strong or how to sharpen it."),
  suggestions: z
    .array(z.string())
    .describe("2-3 sharper purpose questions this text can answer, each one sentence."),
});

/** Coaches the reader's purpose question, or proposes questions when there is none. */
export async function coachPurpose(
  model: LanguageModel,
  args: { text: string; language: Language; purpose: string },
): Promise<PurposeCoach> {
  const purpose = args.purpose.trim();
  const { output } = await generateText({
    model,
    output: Output.object({ schema: coachSchema }),
    system:
      "You coach professionals to set a reading purpose before reading technical documents. " +
      "A good purpose question is specific, answerable from the text, and tied to what the reader needs to " +
      "know or do — it focuses attention on what matters and lets the reader skip the rest. Be brief.",
    prompt:
      (purpose
        ? `Reader's purpose question: ${purpose}\n` +
          `Classify it, judge it, and suggest sharper versions that keep the reader's intent. ` +
          `Write the feedback and suggestions in the language of the reader's question.`
        : `The reader has no purpose question yet. Suggest questions a professional would most want this text ` +
          `to answer, classify the first suggestion, and set specific and answerable to true. ` +
          `In the feedback, say in one sentence what the text is most useful for. ` +
          `Write the feedback and suggestions in ${langName(args.language)}.`) +
      `\n\n<text>\n${args.text.slice(0, MAX_CHARS)}\n</text>`,
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
  predictionCheck: z
    .string()
    .nullable()
    .describe(
      "1-2 sentences comparing the reader's pre-reading prediction with what the text actually covers: " +
        "what they anticipated and what surprised them. Null if no prediction was given.",
    ),
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
    prediction: string | null;
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
      `Reader's prediction before reading: ${args.prediction?.trim() || "(none)"}\n` +
      `Key points:\n${args.keyPoints.map((p) => `- ${p}`).join("\n")}\n\n` +
      `<text>\n${args.text.slice(0, MAX_CHARS)}\n</text>\n\n` +
      `<summary>\n${args.summary}\n</summary>\n\n` +
      `Write the feedback fields in ${langName(args.language)}.`,
  });
  return output;
}
