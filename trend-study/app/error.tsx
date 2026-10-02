"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-lg font-bold">読み込みに失敗しました</h1>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
        環境変数（SUPABASE_URL / SUPABASE_SECRET_KEY）とデータベースのテーブルを確認してください。
      </p>
      <pre className="mb-4 overflow-x-auto rounded bg-zinc-100 p-3 text-xs dark:bg-zinc-800">{error.message}</pre>
      <button type="button" onClick={reset} className="rounded bg-blue-600 px-4 py-2 text-sm text-white">
        再読み込み
      </button>
    </div>
  );
}
