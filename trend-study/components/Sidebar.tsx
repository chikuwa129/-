import Link from "next/link";
import type { Trends } from "@/lib/queries";
import type { TermCount } from "@/lib/types";
import { AiSelector } from "./AskAi";
import { Calendar } from "./Calendar";

const keywordHref = (term: string) => `/?keyword=${encodeURIComponent(term)}`;

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">{title}</h2>
      {children}
    </section>
  );
}

export function WordCloud({ words }: { words: TermCount[] }) {
  if (words.length === 0) return <p className="text-xs text-zinc-500">まだありません</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {words.map((w) => (
        <Link
          key={w.term}
          href={keywordHref(w.term)}
          className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 hover:bg-blue-100 hover:text-blue-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-blue-900 dark:hover:text-blue-200"
        >
          {w.term}
          <span className="ml-1 text-zinc-400">{w.count}</span>
        </Link>
      ))}
    </div>
  );
}

export function Sidebar({
  counts,
  trends,
  trendDate,
  isToday,
  selectedDate,
  today,
  recommendedDates,
}: {
  counts: { later: number; favorites: number };
  trends: Trends;
  trendDate: string;
  isToday: boolean;
  selectedDate: string;
  today: string;
  recommendedDates: string[];
}) {
  const dayLabel = isToday ? "今日" : "この日";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/?view=later"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-center text-sm hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        >
          🔖 後で見る <span className="text-zinc-500">{counts.later}</span>
        </Link>
        <Link
          href="/?view=favorites"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-center text-sm hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        >
          ★ お気に入り <span className="text-zinc-500">{counts.favorites}</span>
        </Link>
      </div>

      {trends.rising.length > 0 && (
        <Section title={`🔥 ${dayLabel}の急上昇ワード`}>
          <ul className="space-y-1 text-sm">
            {trends.rising.map((r) => (
              <li key={r.term} className="flex items-baseline justify-between gap-2">
                <Link href={keywordHref(r.term)} className="truncate font-medium text-blue-600 hover:underline dark:text-blue-400">
                  {r.term}
                </Link>
                <span className="shrink-0 text-xs text-zinc-500">
                  {r.count}件（普段 {r.average.toFixed(1)}件/日）
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={`${dayLabel}のトレンドワード`}>
        <WordCloud words={trends.day} />
      </Section>

      <Section title={`直近7日のトレンドワード${trendDate === today ? "" : `（〜${trendDate.slice(5).replace("-", "/")}）`}`}>
        <WordCloud words={trends.week} />
      </Section>

      <Section title="カレンダー" id="calendar">
        <Calendar key={selectedDate} selected={selectedDate} today={today} available={recommendedDates} />
      </Section>

      <Section title="質問に使うAI">
        <AiSelector />
        <p className="mt-2 text-xs text-zinc-500">「AIに聞く」で質問文をコピーし、選んだAIを新しいタブで開きます。</p>
      </Section>
    </div>
  );
}
