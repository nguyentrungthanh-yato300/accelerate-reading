"use client";

import { useActionState, useState, useTransition } from "react";
import { deleteAiSettings, saveAiSettings, type FormState } from "@/app/actions";
import type { AiProvider } from "@/db/schema";
import { AI_PROVIDER_IDS, AI_PROVIDERS } from "@/lib/providers";
import { buttonPrimary, input } from "./ui";

type Saved = { provider: string; model: string; keyHint: string; baseUrl: string | null };

export function AiSettingsForm({ saved }: { saved: Saved | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAiSettings, {});
  const [provider, setProvider] = useState<AiProvider>((saved?.provider as AiProvider) ?? "google");
  const [removing, startRemove] = useTransition();
  const meta = AI_PROVIDERS[provider];
  const sameProvider = saved?.provider === provider;

  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-medium">
        Provider
        <select
          name="provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value as AiProvider)}
          className={`${input} mt-1`}
        >
          {AI_PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>
              {AI_PROVIDERS[id].label}
            </option>
          ))}
        </select>
        {(meta.note || meta.keyUrl) && (
          <span className="mt-1 block text-xs font-normal text-stone-500">
            {meta.note}{" "}
            {meta.keyUrl && (
              <a href={meta.keyUrl} target="_blank" rel="noreferrer" className="underline">
                Get an API key
              </a>
            )}
          </span>
        )}
      </label>

      {meta.needsBaseUrl && (
        <label className="block text-sm font-medium">
          Base URL
          <input
            name="baseUrl"
            defaultValue={sameProvider ? (saved?.baseUrl ?? "") : ""}
            placeholder="https://openrouter.ai/api/v1"
            className={`${input} mt-1`}
          />
        </label>
      )}

      <label className="block text-sm font-medium">
        Model <span className="font-normal text-stone-500">(optional{meta.defaultModel ? `, default ${meta.defaultModel}` : ""})</span>
        <input
          key={provider}
          name="model"
          defaultValue={sameProvider && saved?.model !== meta.defaultModel ? saved?.model : ""}
          placeholder={meta.defaultModel || "model id"}
          className={`${input} mt-1`}
        />
      </label>

      <label className="block text-sm font-medium">
        API key
        <input
          name="apiKey"
          type="password"
          autoComplete="off"
          placeholder={saved ? `Saved key ends in ${saved.keyHint} — leave empty to keep it` : "Paste your API key"}
          className={`${input} mt-1`}
        />
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && !pending && <p className="text-sm text-emerald-600">Saved.</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonPrimary}>
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && (
          <button
            type="button"
            disabled={removing}
            onClick={() => {
              if (confirm("Remove your saved API key? AI features will be off until you add one again.")) {
                startRemove(() => deleteAiSettings());
              }
            }}
            className="text-sm text-stone-500 hover:text-red-600"
          >
            {removing ? "Removing…" : "Remove key"}
          </button>
        )}
      </div>
    </form>
  );
}
