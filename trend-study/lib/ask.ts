// 「AIに聞く」ボタンで使う質問文とAIの一覧（クライアントで使う）
import { STUDY_CONDITIONS } from "./config";
import type { Article, StudyIdea } from "./types";

export type AiService = { id: string; name: string; url: (q: string) => string; acceptsQuery: boolean };

export const AI_SERVICES: AiService[] = [
  { id: "claude", name: "Claude", url: (q) => `https://claude.ai/new?q=${encodeURIComponent(q)}`, acceptsQuery: true },
  { id: "chatgpt", name: "ChatGPT", url: (q) => `https://chatgpt.com/?q=${encodeURIComponent(q)}`, acceptsQuery: true },
  { id: "gemini", name: "Gemini", url: () => "https://gemini.google.com/app", acceptsQuery: false },
  {
    id: "perplexity",
    name: "Perplexity",
    url: (q) => `https://www.perplexity.ai/search?q=${encodeURIComponent(q)}`,
    acceptsQuery: true,
  },
];

export const DEFAULT_AI = "claude";

export function articlePrompt(a: Pick<Article, "title" | "link" | "summary" | "snippet" | "keywords">): string {
  const lines = [
    "次の記事について、初学者にも分かるように解説してください。そのあと、私から追加で質問します。",
    "",
    `タイトル: ${a.title}`,
    `URL: ${a.link}`,
  ];
  if (a.summary) lines.push(`要約: ${a.summary}`);
  else if (a.snippet) lines.push(`冒頭: ${a.snippet.slice(0, 300)}`);
  if (a.keywords?.length) lines.push(`キーワード: ${a.keywords.map((k) => k.term).join("、")}`);
  return lines.join("\n");
}

export function ideaPrompt(idea: StudyIdea, refs: { title: string; link: string }[]): string {
  return [
    "次の学習ネタを、実際に手を動かして試し、記事にまとめたいです。",
    "",
    "私の環境・条件:",
    ...STUDY_CONDITIONS.map((c) => `- ${c}`),
    "",
    `ネタ: ${idea.title}`,
    `狙い: ${idea.why}`,
    "流れ:",
    ...idea.steps.map((s, i) => `${i + 1}. ${s}`),
    ...(refs.length ? ["", "参考記事:", ...refs.map((r) => `- ${r.title} ${r.link}`)] : []),
  ].join("\n");
}
