import "server-only";
import { eq } from "drizzle-orm";
import type { LanguageModel } from "ai";
import { getDb } from "@/db";
import { aiSettings } from "@/db/schema";
import { getModel } from "@/lib/ai";
import { decrypt } from "@/lib/crypto";
import { AI_PROVIDERS } from "@/lib/providers";

/** What the UI may know about a user's AI settings: never the key itself. */
export type AiStatus =
  | { configured: false }
  | { configured: true; provider: string; model: string; keyHint: string; baseUrl: string | null };

export async function getAiStatus(userId: string): Promise<AiStatus> {
  const db = await getDb();
  const row = await db.query.aiSettings.findFirst({ where: eq(aiSettings.userId, userId) });
  if (!row) return { configured: false };
  return {
    configured: true,
    provider: row.provider,
    model: row.model || AI_PROVIDERS[row.provider].defaultModel,
    keyHint: row.apiKeyHint,
    baseUrl: row.baseUrl,
  };
}

/** The user's model with their decrypted API key, or null when they have not set one up. */
export async function getUserModel(userId: string): Promise<LanguageModel | null> {
  const db = await getDb();
  const row = await db.query.aiSettings.findFirst({ where: eq(aiSettings.userId, userId) });
  if (!row) return null;
  return getModel({ provider: row.provider, model: row.model, baseUrl: row.baseUrl, apiKey: decrypt(row.apiKeyEncrypted) });
}
