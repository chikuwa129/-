import type { ListResult } from "@/lib/queries";
import { ArticleCard } from "./ArticleCard";
import { WordCloud } from "./Sidebar";

export function ListView({ title, result, empty }: { title: string; result: ListResult; empty: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">
        {title} <span className="text-base font-normal text-zinc-500">{result.articles.length}件</span>
      </h1>
      {result.related.length > 0 && (
        <section className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-sm font-semibold">関連キーワード</h2>
          <WordCloud words={result.related} />
        </section>
      )}
      {result.articles.length === 0 ? (
        <p className="text-sm text-zinc-500">{empty}</p>
      ) : (
        <div className="space-y-3">
          {result.articles.map((a) => (
            <ArticleCard key={a.id} article={a} showReason={!!a.reason} />
          ))}
        </div>
      )}
    </div>
  );
}
