import Link from "next/link";
import { ideaPrompt } from "@/lib/ask";
import { formatJpDate } from "@/lib/date";
import type { Article, Digest, StudyIdea } from "@/lib/types";
import { ArticleCard } from "./ArticleCard";
import { AskAiButton } from "./AskAi";
import { OtherArticles } from "./OtherArticles";
import { RunButton } from "./RunButton";
import { OpenCalendarButton } from "./SidebarShell";

function DigestSection({ digest, label }: { digest: Digest; label: string }) {
  const sentences = digest.overview.split(/(?<=[。！？])\s*/).filter((s) => s.trim());
  return (
    <section className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/30">
      <h2 className="mb-2 font-bold">📰 {label}の総括</h2>
      <div className="space-y-2 text-sm leading-relaxed">
        {sentences.map((s, i) => (
          <p key={i}>{s}</p>
        ))}
      </div>
      {digest.highlights.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {digest.highlights.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function IdeasSection({ ideas, recs, label }: { ideas: StudyIdea[]; recs: Article[]; label: string }) {
  const byId = new Map(recs.map((a) => [a.id, a]));
  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
      <h2 className="mb-2 font-bold">🧪 {label}の学習ネタ</h2>
      {ideas.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">条件に合う学習ネタはありませんでした。</p>
      ) : (
        <div className="space-y-4">
          {ideas.map((idea, i) => {
            const refs = idea.articleIds.map((id) => byId.get(id)).filter((a): a is Article => !!a);
            return (
              <div key={i} className="rounded border border-emerald-200 bg-white p-3 dark:border-emerald-900 dark:bg-zinc-900">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{idea.title}</h3>
                  {idea.time && <span className="text-xs text-zinc-500">⏱ {idea.time}</span>}
                </div>
                {idea.why && <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{idea.why}</p>}
                <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm">
                  {idea.steps.map((s, j) => (
                    <li key={j}>{s}</li>
                  ))}
                </ol>
                {refs.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {refs.map((a) => (
                      <li key={a.id}>
                        📎{" "}
                        <a href={a.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
                          {a.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2">
                  <AskAiButton text={ideaPrompt(idea, refs.map((a) => ({ title: a.title, link: a.link })))} label="AIに手順を相談する" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const navLink = "rounded border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800";

export function DateView({
  date,
  isToday,
  recommended,
  digest,
  ideas,
  others,
  prevDate,
  nextDate,
}: {
  date: string;
  isToday: boolean;
  recommended: Article[];
  digest: Digest | null;
  ideas: StudyIdea[] | null;
  others: Article[];
  prevDate: string | null;
  nextDate: string | null;
}) {
  const label = isToday ? "今日" : "この日";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{isToday ? "今日のおすすめ" : `${formatJpDate(date)}のおすすめ`}</h1>
        <nav className="flex items-center gap-1.5">
          {prevDate ? (
            <Link href={`/?date=${prevDate}`} className={navLink}>
              ← 前の日
            </Link>
          ) : (
            <span className={`${navLink} pointer-events-none opacity-40`}>← 前の日</span>
          )}
          <OpenCalendarButton />
          {nextDate ? (
            <Link href={`/?date=${nextDate}`} className={navLink}>
              次の日 →
            </Link>
          ) : (
            <span className={`${navLink} pointer-events-none opacity-40`}>次の日 →</span>
          )}
        </nav>
      </div>

      {digest && <DigestSection digest={digest} label={label} />}
      {ideas && <IdeasSection ideas={ideas} recs={recommended} label={label} />}

      {recommended.length > 0 && (!digest || ideas === null) && (
        <RunButton date={isToday ? undefined : date} label={`${isToday ? "今日" : "この日"}の総括と学習ネタを作る`} />
      )}
      {recommended.length === 0 &&
        (isToday ? (
          <RunButton label="記事を取得して今日のおすすめを作る" />
        ) : (
          <p className="text-sm text-zinc-500">この日のおすすめはありません。</p>
        ))}

      {recommended.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">⭐ おすすめ記事 {recommended.length}件</h2>
          <div className="space-y-3">
            {recommended.map((a) => (
              <ArticleCard key={a.id} article={a} showReason />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-1 font-bold">その他の記事 {others.length}件</h2>
        <p className="mb-2 text-xs text-zinc-500">
          {isToday ? "直近48時間" : "この日に取得"}の記事です。未要約の記事はチェックして要約できます（一度に10件まで）。
        </p>
        <OtherArticles key={date} articles={others} />
      </section>
    </div>
  );
}
