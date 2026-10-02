import Link from "next/link";
import { DateView } from "@/components/DateView";
import { ListView } from "@/components/ListView";
import { Sidebar } from "@/components/Sidebar";
import { SidebarShell } from "@/components/SidebarShell";
import { formatDateTime, isDateString, jstDate } from "@/lib/date";
import {
  getByKeyword,
  getDigest,
  getFlagCounts,
  getFlagged,
  getLastFetchedAt,
  getOtherArticles,
  getRecommended,
  getRecommendedDates,
  getStudyIdeas,
  getTrends,
  search,
} from "@/lib/queries";

// 開くたびにデータベースを読むだけ（RSSやGeminiは呼ばない）
export const dynamic = "force-dynamic";
// ボタンからの日次処理が長くかかるため
export const maxDuration = 120;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

export default async function Page({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const q = first(sp.q);
  const keyword = first(sp.keyword);
  const view = first(sp.view);
  const dateParam = first(sp.date);

  const today = jstDate();
  const date = isDateString(dateParam) && dateParam <= today ? dateParam : today;
  const isDateView = !q && !keyword && view !== "later" && view !== "favorites";

  const [lastFetched, counts, trends, recommendedDates] = await Promise.all([
    getLastFetchedAt(),
    getFlagCounts(),
    getTrends(isDateView ? date : today),
    getRecommendedDates(),
  ]);

  let main: React.ReactNode;
  if (q) {
    main = <ListView title={`「${q}」の検索結果`} result={await search(q)} empty="見つかりませんでした。" />;
  } else if (keyword) {
    main = <ListView title={`#${keyword}`} result={await getByKeyword(keyword)} empty="このキーワードの記事はありません。" />;
  } else if (view === "later") {
    main = <ListView title="🔖 後で見る" result={await getFlagged("read_later")} empty="後で見る記事はありません。" />;
  } else if (view === "favorites") {
    main = <ListView title="★ お気に入り" result={await getFlagged("favorite")} empty="お気に入りの記事はありません。" />;
  } else {
    const [recommended, digest, ideas, others] = await Promise.all([
      getRecommended(date),
      getDigest(date),
      getStudyIdeas(date),
      getOtherArticles(date),
    ]);
    main = (
      <DateView
        date={date}
        isToday={date === today}
        recommended={recommended}
        digest={digest}
        ideas={ideas}
        others={others}
        prevDate={recommendedDates.filter((d) => d < date).at(-1) ?? null}
        nextDate={recommendedDates.find((d) => d > date) ?? null}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-3 pb-24 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4">
        <div>
          <Link href="/" className="text-lg font-bold">
            IT・AIトレンド
          </Link>
          {lastFetched && <p className="text-xs text-zinc-500">最終取得 {formatDateTime(lastFetched)}</p>}
        </div>
        <form action="/" method="get" role="search" className="flex w-full gap-1 sm:w-auto">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="記事を検索"
            aria-label="記事を検索"
            className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm sm:w-64 dark:border-zinc-600 dark:bg-zinc-900"
          />
          <button type="submit" className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-white dark:bg-zinc-200 dark:text-zinc-900">
            検索
          </button>
        </form>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
        <main className="min-w-0">{main}</main>
        <SidebarShell>
          <Sidebar
            counts={counts}
            trends={trends}
            trendDate={isDateView ? date : today}
            isToday={!isDateView || date === today}
            selectedDate={date}
            today={today}
            recommendedDates={recommendedDates}
          />
        </SidebarShell>
      </div>
    </div>
  );
}
