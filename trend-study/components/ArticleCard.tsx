"use client";

import Link from "next/link";
import { useState } from "react";
import { markOpenedAction, setFlagAction } from "@/app/actions";
import { articlePrompt } from "@/lib/ask";
import { formatDateTime } from "@/lib/date";
import type { Article } from "@/lib/types";
import { AskAiButton } from "./AskAi";

const keywordHref = (term: string) => `/?keyword=${encodeURIComponent(term)}`;

function FlagButton({
  id,
  flag,
  initial,
  on,
  off,
  title,
}: {
  id: number;
  flag: "read_later" | "favorite";
  initial: boolean;
  on: string;
  off: string;
  title: string;
}) {
  const [value, setValue] = useState(initial);
  async function toggle() {
    const next = !value;
    setValue(next); // すぐ見た目を切り替え、保存は裏で行う
    try {
      if (!(await setFlagAction(id, flag, next))) setValue(!next);
    } catch {
      setValue(!next);
    }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={value}
      title={title}
      className={`rounded border px-2 py-0.5 text-xs ${
        value
          ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-300"
          : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
      }`}
    >
      {value ? on : off}
    </button>
  );
}

export function ArticleCard({
  article: a,
  showReason = false,
  selectable,
}: {
  article: Article;
  showReason?: boolean;
  selectable?: { checked: boolean; disabled: boolean; onChange: (checked: boolean) => void };
}) {
  const opened = () => {
    markOpenedAction(a.id).catch(() => {});
  };
  const roleColor = a.role === "learn" ? "border-l-emerald-500" : "border-l-orange-400";

  return (
    <article className={`rounded-lg border border-l-4 border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900 ${roleColor}`}>
      <div className="flex gap-2">
        {selectable && !a.summary && (
          <input
            type="checkbox"
            aria-label="要約する記事に選ぶ"
            className="mt-1.5 h-4 w-4 shrink-0"
            checked={selectable.checked}
            disabled={selectable.disabled && !selectable.checked}
            onChange={(e) => selectable.onChange(e.target.checked)}
          />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-snug">
            <a
              href={a.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={opened}
              onAuxClick={opened}
              className="hover:text-blue-600 hover:underline dark:hover:text-blue-400"
            >
              {a.title}
            </a>
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>{a.source_name}</span>
            <span>{formatDateTime(a.published_at ?? a.fetched_at)}</span>
            {a.bookmarks != null && <span className="text-rose-600 dark:text-rose-400">{a.bookmarks} users</span>}
            {a.recommended_on && !showReason && <span className="text-blue-600 dark:text-blue-400">おすすめ {a.recommended_on}</span>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <FlagButton id={a.id} flag="read_later" initial={a.read_later} on="🔖 後で見る" off="＋後で見る" title="後で見る" />
            <FlagButton id={a.id} flag="favorite" initial={a.favorite} on="★" off="☆" title="お気に入り" />
            <AskAiButton text={articlePrompt(a)} onAsk={opened} />
          </div>

          {showReason && a.reason && (
            <p className="mt-2 text-sm text-blue-700 dark:text-blue-300">💡 {a.reason}</p>
          )}
          {a.summary && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{a.summary}</p>}

          {a.keywords && a.keywords.length > 0 && (
            <dl className="mt-2 space-y-1 rounded bg-zinc-50 p-2 text-sm dark:bg-zinc-800/60">
              {a.keywords.map((k) => (
                <div key={k.term}>
                  <dt className="inline">
                    <Link href={keywordHref(k.term)} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                      {k.term}
                    </Link>
                  </dt>
                  <dd className="inline text-zinc-600 dark:text-zinc-300">：{k.explanation}</dd>
                </div>
              ))}
            </dl>
          )}

          {!a.summary && a.tags && a.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {a.tags.map((t) => (
                <Link
                  key={t}
                  href={keywordHref(t)}
                  className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  #{t}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
