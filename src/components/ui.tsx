import type { ReactNode } from "react";
import type { Language } from "@/db/schema";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900 ${className}`}
    >
      {children}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-stone-500">{hint}</div>}
    </div>
  );
}

export function LangBadge({ language }: { language: Language }) {
  return (
    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-stone-600 dark:bg-stone-800 dark:text-stone-300">
      {language}
    </span>
  );
}

export const buttonPrimary =
  "inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed";
export const buttonSecondary =
  "inline-flex items-center justify-center rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:hover:bg-stone-800";
export const input =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-stone-700 dark:bg-stone-950";

export function pct(v: number | null | undefined) {
  return v === null || v === undefined ? "–" : `${Math.round(v * 100)}%`;
}
export function num(v: number | null | undefined) {
  return v === null || v === undefined ? "–" : Math.round(v).toString();
}
