import "server-only";
import Parser from "rss-parser";
import { FEEDS, type Feed } from "./feeds";
import { db } from "./supabase";
import { errorMessage, logFeeds } from "./logs";

type Item = {
  title?: string;
  link?: string;
  contentSnippet?: string;
  isoDate?: string;
  pubDate?: string;
  dcDate?: string;
  bookmarkcount?: string;
};

const TIMEOUT_MS = 10_000;

// はてブは RSS 1.0 形式のため dc:date と hatena:bookmarkcount を個別に読む
const parser: Parser<Record<string, unknown>, Item> = new Parser({
  timeout: TIMEOUT_MS,
  customFields: {
    item: [
      ["dc:date", "dcDate"],
      ["hatena:bookmarkcount", "bookmarkcount"],
    ],
  },
});

export type NewArticle = {
  link: string;
  title: string;
  snippet: string;
  source_id: string;
  source_name: string;
  role: string;
  bookmarks: number | null;
  published_at: string | null;
};

function toIso(...values: (string | undefined)[]): string | null {
  for (const v of values) {
    if (!v) continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

async function fetchFeed(feed: Feed): Promise<NewArticle[]> {
  const res = await fetch(feed.url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": "trend-study/1.0 (+personal RSS reader)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const parsed = await parser.parseString(await res.text());
  const articles: NewArticle[] = [];
  for (const item of parsed.items) {
    const link = item.link?.trim();
    const title = item.title?.trim();
    if (!link || !title) continue;
    const bookmarks = item.bookmarkcount != null ? Number.parseInt(item.bookmarkcount, 10) : NaN;
    articles.push({
      link,
      title,
      snippet: (item.contentSnippet ?? "").trim().slice(0, 600),
      source_id: feed.id,
      source_name: feed.name,
      role: feed.role,
      bookmarks: Number.isNaN(bookmarks) ? null : bookmarks,
      published_at: toIso(item.isoDate, item.dcDate, item.pubDate),
    });
  }
  return articles;
}

/** すべての情報源を取得する。1つが失敗しても他は続ける。同じURLは1件にまとめる。 */
export async function fetchAllFeeds(): Promise<NewArticle[]> {
  const results = await Promise.all(
    FEEDS.map(async (feed) => {
      const started = Date.now();
      try {
        const items = await fetchFeed(feed);
        return { feed, items, ok: true, error: null, ms: Date.now() - started };
      } catch (e) {
        console.error(`[rss] ${feed.id} failed`, e);
        return { feed, items: [], ok: false, error: errorMessage(e), ms: Date.now() - started };
      }
    }),
  );
  await logFeeds(
    results.map((r) => ({
      source_id: r.feed.id,
      source_name: r.feed.name,
      ok: r.ok,
      items: r.items.length,
      duration_ms: r.ms,
      error: r.error,
    })),
  );

  const byLink = new Map<string, NewArticle>();
  for (const r of results) {
    for (const a of r.items) if (!byLink.has(a.link)) byLink.set(a.link, a);
  }
  return [...byLink.values()];
}

/** RSSを取得し、新しい記事だけ保存する */
export async function ingest(): Promise<{ fetched: number; inserted: number }> {
  const articles = await fetchAllFeeds();
  let inserted = 0;
  for (let i = 0; i < articles.length; i += 200) {
    const { data, error } = await db()
      .from("articles")
      .upsert(articles.slice(i, i + 200), { onConflict: "link", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    inserted += data?.length ?? 0;
  }
  return { fetched: articles.length, inserted };
}
