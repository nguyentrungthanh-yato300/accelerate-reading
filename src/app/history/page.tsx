import Link from "next/link";
import { Card, LangBadge, Stat, num, pct } from "@/components/ui";
import { computeStats, listCompletedSessions, type CompletedSession } from "@/lib/queries";
import { formatDuration, unitLabel } from "@/lib/text";

export default async function HistoryPage() {
  const sessions = await listCompletedSessions();
  const stats = computeStats(sessions).filter((s) => s.sessions > 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
        <p className="mt-1 text-sm text-stone-500">
          English is measured in words/min, Vietnamese in syllables/min and Chinese in characters/min, so each
          language is tracked separately.
        </p>
      </div>

      {sessions.length === 0 && <p className="text-sm text-stone-500">No completed sessions yet.</p>}

      {stats.map((s) => (
        <Card key={s.language} className="space-y-4">
          <div className="flex items-center gap-2 font-medium">
            <LangBadge language={s.language} /> {s.sessions} sessions
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Speed (last 5)" value={num(s.avgWpm)} hint={`${unitLabel(s.language)}/min`} />
            <Stat label="Comprehension" value={pct(s.avgComprehension)} />
            <Stat label="Effective (last 5)" value={num(s.avgEffectiveWpm)} />
            <Stat
              label="Effective (first 5)"
              value={num(s.firstEffectiveWpm)}
              hint={s.firstEffectiveWpm === null ? "after 6+ sessions" : undefined}
            />
          </div>
          <TrendChart rows={sessions.filter((x) => x.language === s.language).slice(0, 30).reverse()} />
        </Card>
      ))}

      {sessions.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
              <tr className="border-b border-stone-200 dark:border-stone-800">
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Text</th>
                <th className="px-4 py-2">Mode</th>
                <th className="px-4 py-2 text-right">Speed</th>
                <th className="px-4 py-2 text-right">Compr.</th>
                <th className="px-4 py-2 text-right">Effective</th>
                <th className="px-4 py-2 text-right">Recall</th>
                <th className="px-4 py-2 text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-stone-100 last:border-0 dark:border-stone-800">
                  <td className="whitespace-nowrap px-4 py-2 text-stone-500">{s.createdAt.toLocaleDateString("en-GB")}</td>
                  <td className="max-w-xs px-4 py-2">
                    <Link href={`/sessions/${s.id}`} className="flex items-center gap-2 hover:text-amber-600">
                      <LangBadge language={s.language} />
                      <span className="truncate">{s.title}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2 capitalize">{s.mode}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{num(s.wpm)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{pct(s.quizScore)}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">{num(s.effectiveWpm)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{num(s.summaryScore)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatDuration(s.readMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Raw speed vs effective speed per session, oldest → newest. */
function TrendChart({ rows }: { rows: CompletedSession[] }) {
  if (rows.length < 2) return <p className="text-xs text-stone-500">The trend chart appears after 2 sessions.</p>;
  const W = 600;
  const H = 140;
  const pad = 8;
  const max = Math.max(...rows.map((r) => r.wpm ?? 0), 1) * 1.1;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (rows.length - 1);
  const y = (v: number) => H - pad - (v / max) * (H - 2 * pad);
  const line = (key: "wpm" | "effectiveWpm") =>
    rows
      .map((r, i) => (r[key] === null ? null : `${x(i)},${y(r[key]!)}`))
      .filter(Boolean)
      .join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" role="img" aria-label="Speed trend">
        <polyline points={line("wpm")} fill="none" stroke="#a8a29e" strokeWidth={2} strokeDasharray="4 4" />
        <polyline points={line("effectiveWpm")} fill="none" stroke="#d97706" strokeWidth={2.5} />
        {rows.map((r, i) =>
          r.effectiveWpm === null ? null : <circle key={r.id} cx={x(i)} cy={y(r.effectiveWpm)} r={3} fill="#d97706" />,
        )}
      </svg>
      <div className="flex gap-4 text-xs text-stone-500">
        <span><span className="text-amber-600">━</span> effective speed</span>
        <span><span className="text-stone-400">┅</span> raw speed</span>
      </div>
    </div>
  );
}
