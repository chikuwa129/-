"use client";

import { useState, useTransition } from "react";
import { runDailyAction } from "@/app/actions";

export function RunButton({ date, label }: { date?: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const r = await runDailyAction(date);
            setMessage({ ok: r.ok, text: r.message });
          })
        }
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "処理中…（1〜2分かかることがあります）" : label}
      </button>
      {message && (
        <p className={`mt-2 text-sm ${message.ok ? "text-zinc-600 dark:text-zinc-300" : "text-red-600 dark:text-red-400"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
