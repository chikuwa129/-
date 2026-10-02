import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "./supabase";

// 動作記録。記録の保存に失敗しても本来の処理は止めない。

export type Trigger = "cron" | "button" | "api";

const runContext = new AsyncLocalStorage<{ runId: number | null }>();

export function currentRunId(): number | null {
  return runContext.getStore()?.runId ?? null;
}

export function withRun<T>(runId: number | null, fn: () => Promise<T>): Promise<T> {
  return runContext.run({ runId }, fn);
}

export async function startRun(trigger: Trigger, targetDate: string): Promise<number | null> {
  try {
    const { data, error } = await db()
      .from("run_logs")
      .insert({ trigger, target_date: targetDate })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as number;
  } catch (e) {
    console.error("[run_logs] start failed", e);
    return null;
  }
}

export type RunResult = {
  status: "success" | "failed";
  startedAt: number;
  fetched?: number;
  inserted?: number;
  tagged?: number;
  recommended?: number;
  message?: string;
  error?: string;
};

export async function finishRun(runId: number | null, r: RunResult): Promise<void> {
  if (runId == null) return;
  try {
    const { error } = await db()
      .from("run_logs")
      .update({
        status: r.status,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - r.startedAt,
        fetched: r.fetched ?? null,
        inserted: r.inserted ?? null,
        tagged: r.tagged ?? null,
        recommended: r.recommended ?? null,
        message: r.message ?? null,
        error: r.error ?? null,
      })
      .eq("id", runId);
    if (error) throw error;
  } catch (e) {
    console.error("[run_logs] finish failed", e);
  }
}

export async function logGemini(row: {
  purpose: string;
  model: string;
  attempt: number;
  status: "ok" | "busy" | "missing" | "error";
  error_code?: string | null;
  duration_ms: number;
}): Promise<void> {
  try {
    const { error } = await db()
      .from("gemini_logs")
      .insert({ ...row, error_code: row.error_code ?? null, run_id: currentRunId() });
    if (error) throw error;
  } catch (e) {
    console.error("[gemini_logs] insert failed", e);
  }
}

export async function logFeeds(
  rows: { source_id: string; source_name: string; ok: boolean; items: number; duration_ms: number; error?: string | null }[],
): Promise<void> {
  if (rows.length === 0) return;
  try {
    const runId = currentRunId();
    const { error } = await db()
      .from("feed_logs")
      .insert(rows.map((r) => ({ ...r, error: r.error ?? null, run_id: runId })));
    if (error) throw error;
  } catch (e) {
    console.error("[feed_logs] insert failed", e);
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}
