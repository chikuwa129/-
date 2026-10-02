"use server";

import { revalidatePath } from "next/cache";
import { runDaily, summarizeByIds } from "@/lib/daily";
import { isDateString, jstDate } from "@/lib/date";
import { errorMessage } from "@/lib/logs";
import { db } from "@/lib/supabase";

export type ActionResult = { ok: boolean; message: string };

/** 画面のボタンから日次処理を実行する */
export async function runDailyAction(date?: string): Promise<ActionResult> {
  if (date !== undefined && (!isDateString(date) || date > jstDate())) {
    return { ok: false, message: "日付が不正です" };
  }
  try {
    const r = await runDaily({ trigger: "button", date });
    revalidatePath("/");
    const parts = [
      r.inserted ? `新着${r.inserted}件` : null,
      r.recommended ? `おすすめ${r.recommended}件` : null,
      r.digest === "created" ? "総括を作成" : null,
      r.ideas === "created" ? "学習ネタを作成" : null,
      r.message || null,
    ].filter(Boolean);
    return { ok: true, message: parts.join(" / ") || "完了しました" };
  } catch (e) {
    return { ok: false, message: `失敗しました: ${errorMessage(e)}` };
  }
}

/** 選んだ記事を要約する（最大10件） */
export async function summarizeAction(ids: number[]): Promise<ActionResult> {
  const valid = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (valid.length === 0) return { ok: false, message: "記事を選んでください" };
  if (valid.length > 10) return { ok: false, message: "一度に要約できるのは10件までです" };
  try {
    const n = await summarizeByIds(valid);
    revalidatePath("/");
    return { ok: true, message: `${n}件を要約しました` };
  } catch (e) {
    return { ok: false, message: `失敗しました: ${errorMessage(e)}` };
  }
}

/** 後で見る・お気に入りの切り替え */
export async function setFlagAction(id: number, flag: "read_later" | "favorite", value: boolean): Promise<boolean> {
  if (!Number.isInteger(id) || (flag !== "read_later" && flag !== "favorite")) return false;
  const { error } = await db().from("articles").update({ [flag]: value }).eq("id", id);
  if (error) {
    console.error("[setFlag]", error);
    return false;
  }
  revalidatePath("/");
  return true;
}

/** 記事を開いた記録 */
export async function markOpenedAction(id: number): Promise<void> {
  if (!Number.isInteger(id)) return;
  const { error } = await db().from("articles").update({ opened_at: new Date().toISOString() }).eq("id", id);
  if (error) console.error("[markOpened]", error);
}
