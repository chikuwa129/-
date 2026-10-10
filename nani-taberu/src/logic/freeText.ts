import type { Answer, Attr } from './types';
import { questionFor } from './questions';

/** keywords.json の形式: 言葉 → { 属性: 値 } */
export type KeywordDict = Record<string, Partial<Record<Attr, string>>>;

/** キーワードの直後にこれが続いたら否定（「肉じゃない」「肉以外」「肉は嫌」「辛くない」など） */
const NEGATION =
  /^(?:の|もの|物|系|料理|っぽいの|みたいなの)?(?:は|が|も|で)?\s*く?(?:じゃな|ではな|でな|以外|嫌|いや|イヤ|やだ|ヤダ|いらな|要らな|抜き|ぬき|なし|無し|ない|苦手|NG|やめ|パス|気分じゃ)/;

export interface KeywordHit {
  word: string;
  start: number;
  end: number;
  negate: boolean;
}

/**
 * 入力文から辞書の言葉を探す。左から順に、その位置で一番長い言葉を採用する
 * （「甘辛い」は「甘辛」として拾い、「辛い」とは重複させない）。
 */
export function findKeywords(text: string, dict: KeywordDict): KeywordHit[] {
  const words = Object.keys(dict).sort((a, b) => b.length - a.length);
  const hits: KeywordHit[] = [];
  let i = 0;
  while (i < text.length) {
    const word = words.find((w) => text.startsWith(w, i));
    if (word) {
      hits.push({ word, start: i, end: i + word.length, negate: false });
      i += word.length;
    } else {
      i += 1;
    }
  }
  // 否定判定: キーワードの直後から次のキーワードまでの文字列を見る
  hits.forEach((h, idx) => {
    const until = idx + 1 < hits.length ? hits[idx + 1].start : text.length;
    h.negate = NEGATION.test(text.slice(h.end, until));
  });
  return hits;
}

export interface ParsedInput {
  answers: Answer[];
  /** 画面上部に出すタグ */
  tags: { attr: Attr; value: string; negate: boolean }[];
}

/**
 * 入力文を回答の列に変換する。
 * 肯定の属性はその質問を「質問済み」にし、否定の属性は質問済みにしない
 * （「辛くない」と言われても、さっぱり／こってりはまだ聞く価値があるため）。
 */
export function parseFreeText(text: string, dict: KeywordDict): ParsedInput {
  const normalized = text.normalize('NFKC').trim();
  const answers: Answer[] = [];
  const seen = new Set<string>();
  for (const hit of findKeywords(normalized, dict)) {
    for (const [attr, value] of Object.entries(dict[hit.word]) as [Attr, string][]) {
      const key = `${attr}:${value}`;
      if (seen.has(key)) continue; // 同じタグは一度だけ数える
      seen.add(key);
      const q = questionFor(attr, value);
      if (!q) continue;
      answers.push({
        questionId: hit.negate ? `${q.id}:not:${value}` : q.id,
        attr,
        value,
        negate: hit.negate,
        source: 'free',
      });
    }
  }
  return {
    answers,
    tags: answers.map((a) => ({ attr: a.attr, value: a.value, negate: a.negate })),
  };
}
