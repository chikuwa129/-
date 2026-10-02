"use client";

import { useState, useSyncExternalStore } from "react";
import { AI_SERVICES, DEFAULT_AI } from "@/lib/ask";

// 質問に使うAIの選択（localStorage に保存し、全ボタンで共有する）
const STORAGE_KEY = "trend-study:ask-ai";
const listeners = new Set<() => void>();

function readChoice(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && AI_SERVICES.some((s) => s.id === v) ? v : DEFAULT_AI;
  } catch {
    return DEFAULT_AI;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function useAiChoice(): string {
  return useSyncExternalStore(subscribe, readChoice, () => DEFAULT_AI);
}

function setAiChoice(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // 保存できなくてもこの画面では選択を反映する
  }
  listeners.forEach((l) => l());
}

export function AiSelector() {
  const choice = useAiChoice();
  return (
    <div className="flex flex-wrap gap-1.5">
      {AI_SERVICES.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => setAiChoice(s.id)}
          aria-pressed={choice === s.id}
          className={`rounded-full border px-3 py-1 text-xs ${
            choice === s.id
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }`}
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}

export function AskAiButton({
  text,
  label = "AIに聞く",
  onAsk,
  className = "",
}: {
  text: string;
  label?: string;
  onAsk?: () => void;
  className?: string;
}) {
  const choice = useAiChoice();
  const [note, setNote] = useState<string | null>(null);
  const service = AI_SERVICES.find((s) => s.id === choice) ?? AI_SERVICES[0];

  function handleClick() {
    let copied = false;
    const done = () =>
      setNote(service.acceptsQuery ? "質問文をコピーしました" : copied ? "コピーしました。貼り付けて使ってください" : "コピーできませんでした");
    // クリップボードはhttpsのサイトでのみ動く
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        copied = true;
      })
      .catch(() => {})
      .finally(done);
    window.open(service.url(text), "_blank", "noopener,noreferrer");
    onAsk?.();
    setTimeout(() => setNote(null), 3000);
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={handleClick}
        title={`${service.name}で開く`}
        className={`rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 ${className}`}
      >
        💬 {label}
      </button>
      {note && (
        <span className="absolute left-0 top-full z-10 mt-1 whitespace-nowrap rounded bg-zinc-800 px-2 py-1 text-xs text-white shadow">
          {note}
        </span>
      )}
    </span>
  );
}
