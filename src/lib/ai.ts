import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import type { AiProvider, Language, PurposeCoach, Quiz, ReadingMode, SummaryFeedback } from "@/db/schema";
import { AI_PROVIDERS } from "@/lib/providers";

/** A user's provider settings, with the API key decrypted (see src/lib/ai-settings.ts). */
export type AiConfig = { provider: AiProvider; model: string | null; baseUrl: string | null; apiKey: string };

/** Provider-agnostic model selection from the user's own settings and API key. */
export function getModel(config: AiConfig): LanguageModel {
  const modelId = config.model?.trim() || AI_PROVIDERS[config.provider].defaultModel;
  const apiKey = config.apiKey;
  switch (config.provider) {
    case "google":
      return createGoogle({ apiKey })(modelId);
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "openai":
      return createOpenAI({ apiKey })(modelId);
    case "deepseek":
      return createDeepSeek({ apiKey })(modelId);
    case "openai-compatible": {
      if (!config.baseUrl || !modelId) throw new Error("An OpenAI-compatible provider needs a base URL and a model.");
      return createOpenAICompatible({ name: "custom", baseURL: config.baseUrl, apiKey })(modelId);
    }
  }
}

function langName(language: Language) {
  return {
    en: "English",
    vi: "Vietnamese",
    zh: "Chinese, in the same script (simplified or traditional) as the text",
  }[language];
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

const chunkSchema = z.object({
  segments: z.array(
    z.object({
      id: z.number().int(),
      chunks: z.array(z.string()).describe("The segment's words, in order and unchanged, grouped into phrases."),
      hard: z
        .array(z.number().int())
        .describe("0-based indices of chunks that carry a likely-new technical term or the core of a definition or mechanism."),
    }),
  ),
});

export type ChunkedSegment = z.infer<typeof chunkSchema>["segments"][number];

/** Groups each segment's words into meaningful phrases for the pacer. The caller must verify that
 * the words come back unchanged. */
export async function generateChunks(
  model: LanguageModel,
  segments: { id: number; text: string }[],
  language: Language,
): Promise<ChunkedSegment[]> {
  const unit = {
    en: "2-5 words",
    vi: "2-6 syllables. Never split a multi-syllable Vietnamese word (e.g. keep 'cơ sở dữ liệu' or 'máy ảo' whole)",
    zh:
      "3-8 characters. Never split a multi-character Chinese word (e.g. keep '虚拟机' or '数据库' whole), and keep " +
      "punctuation such as '，' or '。' at the end of the chunk it follows",
  }[language];
  const { output } = await generateText({
    model,
    output: Output.object({ schema: chunkSchema }),
    // Segmenting is mechanical: reasoning made it many times slower (e.g. 83s vs ~10s per article
    // on DeepSeek) without better phrases. Options for other providers are ignored.
    providerOptions: {
      deepseek: { thinking: { type: "disabled" } },
      google: { thinkingConfig: { thinkingLevel: "minimal" } },
    },
    system:
      "You segment text into phrases (thought groups) for a reading pacer. Each chunk is a unit of meaning a " +
      "reader takes in at once: a noun phrase, a verb with its object, a prepositional phrase, a short clause. " +
      "Never cut inside a phrase, e.g. not 'the storage | class must | be enabled' but " +
      "'the storage class | must be enabled'.",
    prompt:
      `Split every segment below into chunks of usually ${unit}. A single word is fine when it stands alone. ` +
      `Copy the words exactly, keeping punctuation attached and the original order: joining a segment's ` +
      `chunks ${language === "zh" ? "" : "with spaces "}must reproduce its text. ` +
      `Do not add, drop, fix or translate anything. ` +
      `Mark as hard only the densest chunks, at most about 1 in 7. Return every segment id.\n\n` +
      JSON.stringify(segments),
  });
  return output.segments;
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
