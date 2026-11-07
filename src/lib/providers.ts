import type { AiProvider } from "@/db/schema";

/** AI providers a user can pick in Settings. Shared by the settings form and the server. */
export const AI_PROVIDERS: Record<
  AiProvider,
  { label: string; defaultModel: string; keyUrl?: string; needsBaseUrl?: boolean; note?: string }
> = {
  google: {
    label: "Google Gemini",
    defaultModel: "gemini-flash-latest",
    keyUrl: "https://aistudio.google.com/apikey",
    note: "Has a free tier.",
  },
  deepseek: {
    label: "DeepSeek",
    defaultModel: "deepseek-v4-flash",
    keyUrl: "https://platform.deepseek.com/api_keys",
    note: "Very cheap.",
  },
  anthropic: { label: "Anthropic Claude", defaultModel: "claude-sonnet-5-5", keyUrl: "https://console.anthropic.com/settings/keys" },
  openai: { label: "OpenAI", defaultModel: "gpt-5.5", keyUrl: "https://platform.openai.com/api-keys" },
  "openai-compatible": {
    label: "OpenAI-compatible (OpenRouter, Groq, …)",
    defaultModel: "",
    needsBaseUrl: true,
    note: "Needs the provider's base URL and a model id.",
  },
};

export const AI_PROVIDER_IDS = Object.keys(AI_PROVIDERS) as AiProvider[];
