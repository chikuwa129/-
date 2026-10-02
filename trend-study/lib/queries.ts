import "server-only";
import { db, fetchAll } from "./supabase";
import { addDays, jstDate, jstStartOfDay } from "./date";
import type { Article, Digest, RisingWord, StudyIdea, TermCount } from "./types";

const HOURS_48 = 48 * 60 * 60 * 1000;

const byNewest = { ascending: false, nullsFirst: false } as const;

export function since48h(): string {
  return new Date(Date.now() - HOURS_48).toISOString();
}

function countTags(rows: { tags: string[] | null }[], exclude?: string): TermCount[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const t of r.tags ?? []) {
      if (t === exclude) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term, "ja"));
}

// ---------- トレンドワード・急上昇ワード ----------

export type Trends = { rising: RisingWord[]; day: TermCount[]; week: TermCount[] };

/** date（日本時間）を最終日とする7日間に取得した記事のタグを集計する */
export async function getTrends(date: string): Promise<Trends> {
  const start = jstStartOfDay(addDays(date, -6));
  const dayStart = jstStartOfDay(date);
  const end = jstStartOfDay(addDays(date, 1));
  const rows = await fetchAll<{ tags: string[] | null; fetched_at: string }>((from, to) =>
    db()
      .from("articles")
      .select("tags, fetched_at")
      .gte("fetched_at", start)
      .lt("fetched_at", end)
      .not("tags", "is", null)
      .order("id")
      .range(from, to),
  );
  const dayRows = rows.filter((r) => new Date(r.fetched_at) >= new Date(dayStart));
  const prevRows = rows.filter((r) => new Date(r.fetched_at) < new Date(dayStart));
  const day = countTags(dayRows);
  const prevCounts = new Map(countTags(prevRows).map((t) => [t.term, t.count]));

  const rising = day
    .map(({ term, count }) => ({ term, count, average: (prevCounts.get(term) ?? 0) / 6 }))
    .filter((r) => r.count >= 2 && r.count >= r.average * 2)
    .sort((a, b) => b.count - b.average - (a.count - a.average))
    .slice(0, 5);

  return { rising, day: day.slice(0, 12), week: countTags(rows).slice(0, 20) };
}

/** 全体でよく使われているタグ（タグ付けのときに表記をそろえるため） */
export async function getPopularTags(limit = 60): Promise<string[]> {
  const { data, error } = await db()
    .from("articles")
    .select("tags")
    .not("tags", "is", null)
    .order("fetched_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return countTags(data ?? []).slice(0, limit).map((t) => t.term);
}

// ---------- 日付ごとのデータ ----------

export async function getRecommended(date: string): Promise<Article[]> {
  const { data, error } = await db()
    .from("articles")
    .select("*")
    .eq("recommended_on", date)
    .order("bookmarks", byNewest)
    .order("published_at", byNewest);
  if (error) throw error;
  return (data ?? []) as Article[];
}

export async function getDigest(date: string): Promise<Digest | null> {
  const { data, error } = await db().from("daily_digests").select("date, overview, highlights").eq("date", date).maybeSingle();
  if (error) throw error;
  return (data as Digest | null) ?? null;
}

export async function getStudyIdeas(date: string): Promise<StudyIdea[] | null> {
  const { data, error } = await db().from("study_ideas").select("ideas").eq("date", date).maybeSingle();
  if (error) throw error;
  return data ? ((data.ideas ?? []) as StudyIdea[]) : null;
}

/** おすすめ以外の記事。今日は直近48時間、過去の日はその日に取得したもの */
export async function getOtherArticles(date: string): Promise<Article[]> {
  let q = db().from("articles").select("*");
  if (date === jstDate()) {
    const since = since48h();
    q = q.or(`fetched_at.gte.${since},published_at.gte.${since}`);
  } else {
    q = q.gte("fetched_at", jstStartOfDay(date)).lt("fetched_at", jstStartOfDay(addDays(date, 1)));
  }
  const { data, error } = await q.order("published_at", byNewest).limit(400);
  if (error) throw error;
  return ((data ?? []) as Article[]).filter((a) => a.recommended_on !== date);
}

export async function getRecommendedDates(): Promise<string[]> {
  const rows = await fetchAll<{ recommended_on: string }>((from, to) =>
    db()
      .from("articles")
      .select("recommended_on")
      .not("recommended_on", "is", null)
      .order("recommended_on", { ascending: false })
      .range(from, to),
  );
  return [...new Set(rows.map((r) => r.recommended_on))].sort();
}

export async function getLastFetchedAt(): Promise<string | null> {
  const { data, error } = await db()
    .from("articles")
    .select("fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.fetched_at ?? null;
}

export async function getFlagCounts(): Promise<{ later: number; favorites: number }> {
  const [later, fav] = await Promise.all([
    db().from("articles").select("id", { count: "exact", head: true }).eq("read_later", true),
    db().from("articles").select("id", { count: "exact", head: true }).eq("favorite", true),
  ]);
  if (later.error) throw later.error;
  if (fav.error) throw fav.error;
  return { later: later.count ?? 0, favorites: fav.count ?? 0 };
}

// ---------- 一覧（キーワード・検索・後で見る・お気に入り） ----------

export type ListResult = { articles: Article[]; related: TermCount[] };

function withRelated(articles: Article[], exclude?: string): ListResult {
  return { articles, related: countTags(articles, exclude).slice(0, 12) };
}

export async function getByKeyword(keyword: string): Promise<ListResult> {
  const { data, error } = await db()
    .from("articles")
    .select("*")
    .contains("tags", [keyword])
    .order("published_at", byNewest)
    .limit(100);
  if (error) throw error;
  return withRelated((data ?? []) as Article[], keyword);
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function search(q: string): Promise<ListResult> {
  const pattern = `%${escapeLike(q)}%`;
  const base = () => db().from("articles").select("*");
  const results = await Promise.all([
    base().contains("tags", [q]).order("published_at", byNewest).limit(100),
    base().ilike("title", pattern).order("published_at", byNewest).limit(100),
    base().ilike("summary", pattern).order("published_at", byNewest).limit(100),
    base().ilike("snippet", pattern).order("published_at", byNewest).limit(100),
  ]);
  const byId = new Map<number, Article>();
  for (const r of results) {
    if (r.error) throw r.error;
    for (const a of (r.data ?? []) as Article[]) byId.set(a.id, a);
  }
  const articles = [...byId.values()].sort(
    (a, b) => (b.published_at ? Date.parse(b.published_at) : 0) - (a.published_at ? Date.parse(a.published_at) : 0),
  );
  return withRelated(articles, q);
}

export async function getFlagged(flag: "read_later" | "favorite"): Promise<ListResult> {
  const { data, error } = await db()
    .from("articles")
    .select("*")
    .eq(flag, true)
    .order("published_at", byNewest)
    .limit(300);
  if (error) throw error;
  return withRelated((data ?? []) as Article[]);
}
