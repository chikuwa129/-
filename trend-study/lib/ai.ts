import "server-only";
import { Type, type Schema } from "@google/genai";
import { generateJson } from "./gemini";
import { SELECT_CRITERIA, SELECT_DEPRIORITIZE, STUDY_CONDITIONS } from "./config";
import type { Keyword, RisingWord } from "./types";

const bullets = (items: string[]) => items.map((s) => `- ${s}`).join("\n");

const isValidIndex = (i: unknown, length: number): i is number =>
  Number.isInteger(i) && (i as number) >= 0 && (i as number) < length;

// ---------- おすすめの選別 ----------

export type SelectInput = { title: string; source_name: string; bookmarks: number | null };

const selectSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      index: { type: Type.INTEGER },
      reason: { type: Type.STRING },
    },
    required: ["index", "reason"],
  },
};

export async function selectArticles(candidates: SelectInput[], max = 10): Promise<{ index: number; reason: string }[]> {
  const list = candidates
    .map((c, i) => `${i}. ${c.title}（${c.source_name}${c.bookmarks != null ? `・${c.bookmarks}ブクマ` : ""}）`)
    .join("\n");
  const prompt = `あなたは、IT・AIのトレンドを追いながら学びたいエンジニアのための編集者です。
次の記事一覧から、今日読むべき記事を最大${max}件選んでください。

選ぶ基準:
${bullets(SELECT_CRITERIA)}

優先度を下げるもの:
${bullets(SELECT_DEPRIORITIZE)}

注意:
- ブクマ数が多い記事は話題になっている目安として参考にしてください
- 同じ話題の記事が複数あれば、最も内容が濃そうな1件だけを選んでください
- reason には、その記事を読む価値を日本語1文で書いてください
- index には一覧の番号をそのまま入れてください

記事一覧:
${list}`;
  const result = await generateJson<{ index: number; reason: string }[]>("select", prompt, selectSchema);
  const seen = new Set<number>();
  const picked: { index: number; reason: string }[] = [];
  for (const r of Array.isArray(result) ? result : []) {
    if (!isValidIndex(r?.index, candidates.length) || seen.has(r.index)) continue;
    seen.add(r.index);
    picked.push({ index: r.index, reason: String(r.reason ?? "").trim() });
    if (picked.length >= max) break;
  }
  return picked;
}

// ---------- 要約 ----------

export type SummarizeInput = { title: string; snippet: string };
export type SummaryResult = { index: number; summary: string; keywords: Keyword[] };

const keywordSchema: Schema = {
  type: Type.OBJECT,
  properties: { term: { type: Type.STRING }, explanation: { type: Type.STRING } },
  required: ["term", "explanation"],
};

const summarizeSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      index: { type: Type.INTEGER },
      summary: { type: Type.STRING },
      keywords: { type: Type.ARRAY, items: keywordSchema },
    },
    required: ["index", "summary", "keywords"],
  },
};

export async function summarizeArticles(articles: SummarizeInput[]): Promise<SummaryResult[]> {
  if (articles.length === 0) return [];
  const list = articles
    .map((a, i) => `[${i}] タイトル: ${a.title}\n冒頭文: ${a.snippet || "（なし）"}`)
    .join("\n\n");
  const prompt = `次の記事それぞれについて、要約とキーワードを作ってください。

ルール:
- summary は日本語で3行以内。冒頭文が短い・無い場合は、タイトルから分かる範囲で書いてください
- keywords は、その記事を理解するために知っておくべき専門用語を2〜3個。各用語に初学者向けの1文の解説（explanation）を付けてください
- 用語名（term）は一般的な正式名称に統一してください（例：「検索拡張生成」ではなく「RAG」）
- index には記事の番号をそのまま入れてください

記事:
${list}`;
  const result = await generateJson<SummaryResult[]>("summarize", prompt, summarizeSchema);
  const out: SummaryResult[] = [];
  const seen = new Set<number>();
  for (const r of Array.isArray(result) ? result : []) {
    if (!isValidIndex(r?.index, articles.length) || seen.has(r.index)) continue;
    seen.add(r.index);
    out.push({
      index: r.index,
      summary: String(r.summary ?? "").trim(),
      keywords: (Array.isArray(r.keywords) ? r.keywords : [])
        .filter((k) => k && typeof k.term === "string" && k.term.trim())
        .map((k) => ({ term: k.term.trim(), explanation: String(k.explanation ?? "").trim() })),
    });
  }
  return out;
}

// ---------- タグ付け ----------

export type TagInput = { title: string; snippet: string };

const tagSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      index: { type: Type.INTEGER },
      tags: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ["index", "tags"],
  },
};

export async function tagArticles(articles: TagInput[], existingTags: string[]): Promise<Map<number, string[]>> {
  const list = articles.map((a, i) => `${i}. ${a.title}｜${a.snippet.slice(0, 80)}`).join("\n");
  const prompt = `次の記事それぞれに、内容を表すタグを1〜3個付けてください。

ルール:
- タグは技術・サービス・分野の名前にしてください（例：RAG、Next.js、セキュリティ）
- 一般的な正式名称に統一してください
- 既存のタグに同じ意味のものがあれば、必ずその表記を使ってください
- 当てはまるものが無ければ空配列にしてください
- index には記事の番号をそのまま入れてください

既存のよく使われているタグ:
${existingTags.length ? existingTags.join("、") : "（まだありません）"}

記事:
${list}`;
  const result = await generateJson<{ index: number; tags: string[] }[]>("tag", prompt, tagSchema);
  const map = new Map<number, string[]>();
  for (const r of Array.isArray(result) ? result : []) {
    if (!isValidIndex(r?.index, articles.length) || map.has(r.index)) continue;
    const tags = (Array.isArray(r.tags) ? r.tags : []).map((t) => String(t).trim()).filter(Boolean);
    map.set(r.index, [...new Set(tags)].slice(0, 3));
  }
  return map;
}

// ---------- 今日の総括 ----------

const digestSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    overview: { type: Type.STRING },
    highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["overview", "highlights"],
};

export async function makeDigest(
  articles: { title: string; summary: string | null }[],
  rising: RisingWord[],
): Promise<{ overview: string; highlights: string[] }> {
  const list = articles.map((a, i) => `${i + 1}. ${a.title}\n   ${a.summary ?? ""}`).join("\n");
  const risingText = rising.length
    ? rising.map((r) => `- ${r.term}：今日${r.count}件（普段 ${r.average.toFixed(1)}件/日）`).join("\n")
    : "（特になし）";
  const prompt = `あなたはIT・AIニュースの編集者です。次の「今日のおすすめ記事」をもとに、今日の総括を書いてください。
忙しい人が最初にこれだけ読めば、今日の流れが分かるようにしてください。

ルール:
- overview は全体の動きや傾向を3〜4文で。個々の記事の言い換えではなく、全体を俯瞰して書いてください
- highlights は今日の注目点を最大3つ、それぞれ短い1文で
- 専門用語はなるべく避け、初学者にも分かる言葉で書いてください
- 急上昇ワードに目立つものがあれば「今日は○○の話題が増えています」のように触れてください

今日のおすすめ記事:
${list}

急上昇ワード:
${risingText}`;
  const r = await generateJson<{ overview: string; highlights: string[] }>("digest", prompt, digestSchema);
  return {
    overview: String(r?.overview ?? "").trim(),
    highlights: (Array.isArray(r?.highlights) ? r.highlights : []).map((h) => String(h).trim()).filter(Boolean).slice(0, 3),
  };
}

// ---------- 学習ネタ ----------

export type IdeaResult = { title: string; why: string; steps: string[]; time: string; articleIndexes: number[] };

const ideasSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      why: { type: Type.STRING },
      steps: { type: Type.ARRAY, items: { type: Type.STRING } },
      time: { type: Type.STRING },
      articleIndexes: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    },
    required: ["title", "why", "steps", "time", "articleIndexes"],
  },
};

export async function makeStudyIdeas(articles: { title: string; summary: string | null }[]): Promise<IdeaResult[]> {
  const list = articles.map((a, i) => `${i}. ${a.title}\n   ${a.summary ?? ""}`).join("\n");
  const prompt = `次の「今日のおすすめ記事」をもとに、記事を読むだけで終わらず、実際に手を動かして試し、その結果を技術記事にまとめられる学習ネタを2〜3件考えてください。

利用者の条件:
${bullets(STUDY_CONDITIONS)}

ルール:
- 条件に合わない記事からは無理に作らないでください。合うものが無ければ空配列で構いません
- title はネタの名前、why は試す価値（1〜2文）、time は時間の目安（例：「約1時間」）
- steps は具体的な手順を3〜5個
- 確実でない仕様や手順は書かず、「公式ドキュメントで〜を確認する」という手順にしてください
- articleIndexes には、きっかけになった記事の番号を入れてください

今日のおすすめ記事:
${list}`;
  const result = await generateJson<IdeaResult[]>("ideas", prompt, ideasSchema);
  return (Array.isArray(result) ? result : [])
    .filter((r) => r && typeof r.title === "string" && r.title.trim())
    .slice(0, 3)
    .map((r) => ({
      title: r.title.trim(),
      why: String(r.why ?? "").trim(),
      steps: (Array.isArray(r.steps) ? r.steps : []).map((s) => String(s).trim()).filter(Boolean).slice(0, 5),
      time: String(r.time ?? "").trim(),
      articleIndexes: (Array.isArray(r.articleIndexes) ? r.articleIndexes : []).filter((i) => isValidIndex(i, articles.length)),
    }));
}
