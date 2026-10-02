import "server-only";
import { db } from "./supabase";
import { addDays, isDateString, jstDate, jstStartOfDay } from "./date";
import { ingest } from "./rss";
import { errorMessage, finishRun, startRun, withRun, type Trigger } from "./logs";
import { makeDigest, makeStudyIdeas, selectArticles, summarizeArticles, tagArticles } from "./ai";
import { getDigest, getPopularTags, getRecommended, getStudyIdeas, getTrends, since48h } from "./queries";
import type { Article, Keyword, StudyIdea } from "./types";

const MAX_RECOMMEND = 10;
const MAX_CANDIDATES = 150;
const MAX_TAG = 150;
const SAVE_CHUNK = 20;

export type DailyResult = {
  date: string;
  fetched: number;
  inserted: number;
  tagged: number;
  recommended: number;
  digest: "existing" | "created" | "failed" | "skipped";
  ideas: "existing" | "created" | "failed" | "skipped";
  message: string;
};

function mergeTags(current: string[] | null, keywords: Keyword[]): string[] {
  return [...new Set([...(current ?? []), ...keywords.map((k) => k.term)])];
}

async function inChunks<T>(items: T[], size: number, fn: (item: T) => PromiseLike<{ error: unknown }>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    const results = await Promise.all(items.slice(i, i + size).map(fn));
    const failed = results.find((r) => r.error);
    if (failed) throw failed.error;
  }
}

/** tags が空（null）の記事にタグを付ける。付けた件数を返す */
export async function tagUntagged(): Promise<number> {
  const { data, error } = await db()
    .from("articles")
    .select("id, title, snippet")
    .is("tags", null)
    .order("fetched_at", { ascending: false })
    .limit(MAX_TAG);
  if (error) throw error;
  const articles = (data ?? []) as Pick<Article, "id" | "title" | "snippet">[];
  if (articles.length === 0) return 0;

  const existing = await getPopularTags(60);
  const tagMap = await tagArticles(articles, existing);
  // 返ってこなかった記事も空配列で保存し、毎回やり直さないようにする
  await inChunks(articles.map((a, i) => ({ id: a.id, tags: tagMap.get(i) ?? [] })), SAVE_CHUNK, (u) =>
    db().from("articles").update({ tags: u.tags }).eq("id", u.id),
  );
  return articles.length;
}

/** 記事IDを指定して要約する（要約済みのものは呼ばない）。要約した件数を返す */
export async function summarizeByIds(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await db()
    .from("articles")
    .select("id, title, snippet, tags")
    .in("id", ids)
    .is("summary", null);
  if (error) throw error;
  const articles = (data ?? []) as Pick<Article, "id" | "title" | "snippet" | "tags">[];
  if (articles.length === 0) return 0;

  const results = await summarizeArticles(articles);
  await inChunks(results, SAVE_CHUNK, (r) => {
    const a = articles[r.index];
    return db()
      .from("articles")
      .update({ summary: r.summary, keywords: r.keywords, tags: mergeTags(a.tags, r.keywords) })
      .eq("id", a.id);
  });
  return results.length;
}

async function getCandidates(date: string, isToday: boolean): Promise<Article[]> {
  let q = db().from("articles").select("*").is("recommended_on", null);
  if (isToday) {
    const since = since48h();
    q = q.or(`fetched_at.gte.${since},published_at.gte.${since}`);
  } else {
    q = q.gte("published_at", jstStartOfDay(date)).lt("published_at", jstStartOfDay(addDays(date, 1)));
  }
  const { data, error } = await q.order("published_at", { ascending: false, nullsFirst: false }).limit(MAX_CANDIDATES);
  if (error) throw error;
  return (data ?? []) as Article[];
}

/** おすすめを選んで要約し保存する。保存したおすすめを返す */
async function recommend(date: string, isToday: boolean): Promise<Article[]> {
  const candidates = await getCandidates(date, isToday);
  if (candidates.length === 0) return [];

  const picked = await selectArticles(candidates, MAX_RECOMMEND);
  if (picked.length === 0) return [];
  const chosen = picked.map((p) => ({ article: candidates[p.index], reason: p.reason }));

  // 一度要約した記事は二度と要約しない
  const needSummary = chosen.filter((c) => !c.article.summary).map((c) => c.article);
  const summaries = await summarizeArticles(needSummary);
  const summaryById = new Map(summaries.map((s) => [needSummary[s.index].id, s]));

  const saved: Article[] = [];
  await inChunks(chosen, SAVE_CHUNK, ({ article, reason }) => {
    const s = summaryById.get(article.id);
    const update: Partial<Article> = { reason, recommended_on: date };
    if (s) {
      update.summary = s.summary;
      update.keywords = s.keywords;
      update.tags = mergeTags(article.tags, s.keywords);
    }
    saved.push({ ...article, ...update });
    return db().from("articles").update(update).eq("id", article.id);
  });
  return saved;
}

/** 総括と学習ネタのうち、まだ無いものだけ作る。失敗しても投げない */
async function ensureExtras(
  date: string,
  recs: Article[],
  notes: string[],
): Promise<Pick<DailyResult, "digest" | "ideas">> {
  const result: Pick<DailyResult, "digest" | "ideas"> = { digest: "existing", ideas: "existing" };
  const inputs = recs.map((a) => ({ title: a.title, summary: a.summary ?? a.snippet.slice(0, 200) }));

  try {
    if (!(await getDigest(date))) {
      const { rising } = await getTrends(date);
      const d = await makeDigest(inputs, rising);
      const { error } = await db().from("daily_digests").insert({ date, overview: d.overview, highlights: d.highlights });
      if (error) throw error;
      result.digest = "created";
    }
  } catch (e) {
    console.error("[daily] digest failed", e);
    notes.push(`総括の作成に失敗: ${errorMessage(e)}`);
    result.digest = "failed";
  }

  try {
    if ((await getStudyIdeas(date)) === null) {
      const raw = await makeStudyIdeas(inputs);
      const ideas: StudyIdea[] = raw.map((r) => ({
        title: r.title,
        why: r.why,
        steps: r.steps,
        time: r.time,
        articleIds: r.articleIndexes.map((i) => recs[i].id),
      }));
      // 0件でも空配列で保存して「まだ作っていない日」と区別する
      const { error } = await db().from("study_ideas").insert({ date, ideas });
      if (error) throw error;
      result.ideas = "created";
    }
  } catch (e) {
    console.error("[daily] ideas failed", e);
    notes.push(`学習ネタの作成に失敗: ${errorMessage(e)}`);
    result.ideas = "failed";
  }
  return result;
}

/**
 * 日次処理。何回実行しても、すでにあるものは作り直さない。
 * date を省略すると今日（日本時間）。過去の日の分を作るときはRSSを取得しない。
 */
export async function runDaily({ trigger, date }: { trigger: Trigger; date?: string }): Promise<DailyResult> {
  const today = jstDate();
  const target = date ?? today;
  if (!isDateString(target) || target > today) throw new Error(`日付が不正です: ${target}`);
  const isToday = target === today;
  const startedAt = Date.now();
  const runId = await startRun(trigger, target);

  return withRun(runId, async () => {
    const notes: string[] = [];
    const result: DailyResult = {
      date: target,
      fetched: 0,
      inserted: 0,
      tagged: 0,
      recommended: 0,
      digest: "skipped",
      ideas: "skipped",
      message: "",
    };
    try {
      if (isToday) {
        const r = await ingest();
        result.fetched = r.fetched;
        result.inserted = r.inserted;
      }

      try {
        result.tagged = await tagUntagged();
      } catch (e) {
        console.error("[daily] tag failed", e);
        notes.push(`タグ付けに失敗: ${errorMessage(e)}`);
      }

      let recs = await getRecommended(target);
      if (recs.length > 0) {
        notes.push("おすすめは作成済み");
      } else {
        recs = await recommend(target, isToday);
        result.recommended = recs.length;
        if (recs.length === 0) notes.push("おすすめ候補の記事がありません");
      }

      if (recs.length > 0) Object.assign(result, await ensureExtras(target, recs, notes));

      result.message = notes.join(" / ");
      await finishRun(runId, { status: "success", startedAt, ...result });
      return result;
    } catch (e) {
      await finishRun(runId, { status: "failed", startedAt, ...result, message: notes.join(" / "), error: errorMessage(e) });
      throw e;
    }
  });
}
