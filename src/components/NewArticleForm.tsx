"use client";

import { useActionState, useState } from "react";
import { createArticle, type FormState } from "@/app/actions";
import { buttonPrimary, input } from "./ui";

export function NewArticleForm() {
  const [tab, setTab] = useState<"text" | "url">("text");
  const [state, action, pending] = useActionState<FormState, FormData>(createArticle, {});

  return (
    <form action={action} className="space-y-3">
      <div className="flex gap-1 rounded-lg bg-stone-100 p-1 text-sm dark:bg-stone-800">
        {(["text", "url"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium ${
              tab === t ? "bg-white shadow-sm dark:bg-stone-950" : "text-stone-500"
            }`}
          >
            {t === "text" ? "Paste text" : "Import URL"}
          </button>
        ))}
      </div>
      <input name="title" placeholder="Title (optional)" className={input} />
      {tab === "text" ? (
        <textarea
          name="content"
          required
          rows={8}
          placeholder={"Paste a document, article or chapter (English, Vietnamese or Chinese).\nMarkdown headings (#, ##) are used for the preview step."}
          className={`${input} font-mono text-xs`}
        />
      ) : (
        <input name="url" type="url" required placeholder="https://…" className={input} />
      )}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className={`${buttonPrimary} w-full`}>
        {pending ? (tab === "url" ? "Importing…" : "Saving…") : "Add & start reading"}
      </button>
    </form>
  );
}
