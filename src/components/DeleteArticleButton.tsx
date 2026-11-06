"use client";

import { useTransition } from "react";
import { deleteArticle } from "@/app/actions";

export function DeleteArticleButton({ id, title }: { id: number; title: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm(`Delete "${title}" and its sessions?`)) start(() => deleteArticle(id));
      }}
      className="text-xs text-stone-400 hover:text-red-600"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
