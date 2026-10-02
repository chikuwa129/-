"use client";

import { useState, useTransition } from "react";
import { summarizeAction } from "@/app/actions";
import type { Article } from "@/lib/types";
import { ArticleCard } from "./ArticleCard";

const MAX_SELECT = 10;

/** その他の記事。未要約の記事はチェックして画面下のバーから要約できる */
export function OtherArticles({ articles }: { articles: Article[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(id: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked && next.size < MAX_SELECT) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function summarize() {
    const ids = [...selected];
    setMessage(null);
    startTransition(async () => {
      const r = await summarizeAction(ids);
      setMessage(r.message);
      if (r.ok) setSelected(new Set());
    });
  }

  return (
    <>
      <div className="space-y-3">
        {articles.map((a) => (
          <ArticleCard
            key={a.id}
            article={a}
            selectable={{
              checked: selected.has(a.id),
              disabled: selected.size >= MAX_SELECT,
              onChange: (c) => toggle(a.id, c),
            }}
          />
        ))}
      </div>
      {(selected.size > 0 || message) && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 text-sm">
            {selected.size > 0 && (
              <>
                <span>
                  {selected.size}件選択中（{MAX_SELECT}件まで）
                </span>
                <button
                  type="button"
                  onClick={summarize}
                  disabled={pending}
                  className="rounded bg-blue-600 px-3 py-1 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {pending ? "要約中…" : "選んだ記事を要約"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  disabled={pending}
                  className="rounded border border-zinc-300 px-3 py-1 dark:border-zinc-600"
                >
                  選択解除
                </button>
              </>
            )}
            {message && (
              <span className="text-zinc-600 dark:text-zinc-300">
                {message}
                <button type="button" onClick={() => setMessage(null)} className="ml-2 text-xs underline">
                  閉じる
                </button>
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
