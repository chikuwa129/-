import type { Attr, QuestionDef } from './types';

/**
 * 質問の定義。主材料は値が6つあるので「主食」と「メイン食材」の2問に分けている。
 * やる気度を含めて全8問。
 * 実際に表示される選択肢は、残り候補に存在する値だけに絞られる（2〜5個）。
 */
export const EFFORT_QUESTION: QuestionDef = {
  id: 'effort',
  attr: 'effort',
  text: '今日のやる気は？',
  options: [
    { value: '0', label: '作りたくない', sub: '買う・外食・お惣菜で済ませたい' },
    { value: '1', label: '温めるだけ・茹でるだけ', sub: '包丁なし。レンジやお湯で1工程' },
    { value: '2', label: '炒める・焼くだけ', sub: 'フライパン1つ。包丁はほぼ使わない' },
    { value: '3', label: 'ふつうに作れる', sub: '包丁OK。数工程あってもいい' },
    { value: '4', label: '凝りたい', sub: '煮込みや仕込みもOK' },
  ],
};

/** やる気度を最初に聞き、以降は残り候補を最も分割できる質問を選ぶ */
export const QUESTIONS: QuestionDef[] = [
  EFFORT_QUESTION,
  {
    id: 'genre',
    attr: 'genre',
    text: 'どんなジャンルの気分？',
    options: [
      { value: '和', label: '和食' },
      { value: '洋', label: '洋食' },
      { value: '中', label: '中華' },
      { value: '韓', label: '韓国' },
      { value: 'エスニック', label: 'エスニック' },
    ],
  },
  {
    id: 'weight',
    attr: 'weight',
    text: 'おなかの空き具合は？',
    options: [
      { value: '軽い', label: '軽めでいい' },
      { value: '普通', label: 'ふつう' },
      { value: '重い', label: 'ガッツリ食べたい' },
    ],
  },
  {
    id: 'temp',
    attr: 'temp',
    text: 'あったかいのと冷たいの、どっち？',
    options: [
      { value: '温', label: 'あったかいもの' },
      { value: '冷', label: 'ひんやり冷たいもの' },
    ],
  },
  {
    id: 'taste',
    attr: 'taste',
    text: 'どんな味が食べたい？',
    options: [
      { value: 'さっぱり', label: 'さっぱり' },
      { value: 'こってり', label: 'こってり' },
      { value: '辛い', label: '辛いもの' },
      { value: '甘辛', label: '甘辛' },
    ],
  },
  {
    id: 'main_carb',
    attr: 'main',
    text: '主食は何がいい？',
    options: [
      { value: '麺', label: '麺' },
      { value: '米', label: 'ごはん' },
      { value: '粉', label: '粉もの・パン' },
    ],
  },
  {
    id: 'main_protein',
    attr: 'main',
    text: 'メインの食材は？',
    options: [
      { value: '肉', label: '肉' },
      { value: '魚', label: '魚介' },
      { value: '野菜', label: '野菜' },
    ],
  },
  {
    id: 'style',
    attr: 'style',
    text: '作る？それとも外で？',
    options: [
      { value: '自炊', label: '作って食べる' },
      { value: '外食', label: '外食・テイクアウト' },
    ],
  },
];

export const MAX_QUESTIONS = 8;

/** 属性値を担当する質問を探す（フリー入力のタグを「質問済み」にするのに使う） */
export function questionFor(attr: Attr | 'effort', value: string): QuestionDef | undefined {
  return QUESTIONS.find((q) => q.attr === attr && q.options.some((o) => o.value === value));
}

/** タグ表示用のラベル */
export function tagLabel(attr: Attr | 'effort', value: string): string {
  const opt = questionFor(attr, value)?.options.find((o) => o.value === value);
  return opt?.label ?? value;
}

export const EFFORT_SHORT: Record<number, string> = {
  0: '作らない',
  1: '温めるだけ',
  2: '炒める・焼くだけ',
  3: 'ふつうに作る',
  4: '凝りたい',
};
