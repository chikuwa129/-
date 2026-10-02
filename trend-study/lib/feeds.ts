// 情報源の一覧。ここを書き換えるだけで追加・削除できる。
// role: trend = トレンドを追う用 / learn = 学ぶ用（表示の色分けに使う）
export type FeedRole = "trend" | "learn";

export type Feed = {
  id: string;
  name: string;
  url: string;
  role: FeedRole;
};

export const FEEDS: Feed[] = [
  { id: "hatena-it", name: "はてブ テクノロジー", url: "https://b.hatena.ne.jp/hotentry/it.rss", role: "trend" },
  { id: "itmedia-ai", name: "ITmedia AI+", url: "https://rss.itmedia.co.jp/rss/2.0/aiplus.xml", role: "trend" },
  { id: "publickey", name: "Publickey", url: "https://www.publickey1.jp/atom.xml", role: "trend" },
  { id: "zenn-trend", name: "Zenn トレンド", url: "https://zenn.dev/feed", role: "learn" },
  { id: "zenn-ai", name: "Zenn AIトピック", url: "https://zenn.dev/topics/ai/feed", role: "learn" },
];
