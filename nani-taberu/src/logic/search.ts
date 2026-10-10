import type { Answer } from './types';
import { allAnswers, type Evaluation, type SessionState } from './engine';

/**
 * 外部検索のURL。外部APIは使わず、検索語を URL に入れて新しいタブで開くだけ。
 * 外部に渡るのは検索語だけ（プロフィール・履歴・位置情報は含めない）。
 */
export const SEARCH_TEMPLATES = {
  google: 'https://www.google.com/search?q=',
  googleImage: 'https://www.google.com/search?tbm=isch&q=',
  googleMaps: 'https://www.google.com/maps/search/?api=1&query=',
  // 現在のクックパッドの検索結果は /jp/search/（検索語） の形
  cookpad: 'https://cookpad.com/jp/search/',
  youtube: 'https://www.youtube.com/results?search_query=',
} as const;

export type RecipeTarget = 'google' | 'cookpad' | 'youtube';
export const RECIPE_TARGET_LABEL: Record<RecipeTarget, string> = {
  google: 'Google検索',
  cookpad: 'クックパッド',
  youtube: 'YouTube',
};

export type SearchKind = 'recipe' | 'image' | 'maps';

/** 検索語の材料になる条件 */
export interface SearchConditions {
  /** 食材名・料理名（優先度1） */
  foods: string[];
  /** 否定した食材・料理名（Google のときだけ -トマト で入れる） */
  negFoods: string[];
  /** やる気度の上限。1→「レンジ 簡単」、2→「炒めるだけ 簡単」、3以上や指定なしは入れない */
  effortMax: number | null;
  knifeNone: boolean;
  /** 味（優先度3） */
  tastes: string[];
  /** 温度（優先度4） */
  temps: string[];
  /** 調理法（画像検索の「炒めもの」などに使う） */
  methods: string[];
}

export const MAX_TERMS = 5;

const EFFORT_WORDS: Record<number, string[]> = { 1: ['レンジ', '簡単'], 2: ['炒めるだけ', '簡単'] };
const METHOD_NOUN: Record<string, string> = { 炒める: '炒めもの', 煮る: '煮物', 揚げる: '揚げ物' };
const TEMP_WORD: Record<string, string> = { 温: '温かい', 冷: '冷たい' };

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

/**
 * 条件から検索に使う言葉を、優先順位（食材・料理名 ＞ やる気度・包丁 ＞ 味）どおりに最大5語まで選ぶ。
 * 「レシピ」「料理」やマイナス指定は、この5語とは別に付ける。
 */
export function conditionTerms(c: SearchConditions, kind: SearchKind): string[] {
  const groups: string[][] =
    kind === 'image'
      ? [c.foods, c.methods.map((m) => METHOD_NOUN[m]).filter(Boolean), c.tastes, c.temps.map((t) => TEMP_WORD[t])]
      : [c.foods, (c.effortMax && EFFORT_WORDS[c.effortMax]) || [], c.knifeNone ? ['包丁不要'] : [], c.tastes, c.temps.map((t) => TEMP_WORD[t])];
  return uniq(groups.flat()).slice(0, MAX_TERMS);
}

/** 開く先が Google 検索（通常・画像）のときだけ、否定した食材をマイナス指定で入れる */
function negTerms(c: SearchConditions, kind: SearchKind, target: RecipeTarget): string[] {
  const google = kind === 'image' || (kind === 'recipe' && target === 'google');
  return google ? uniq(c.negFoods).map((f) => `-${f.replace(/\s+/g, '')}`) : [];
}

function finish(terms: string[], c: SearchConditions, kind: SearchKind, target: RecipeTarget): string {
  const suffix = kind === 'recipe' ? ['レシピ'] : kind === 'image' ? ['料理'] : [];
  return [...terms, ...suffix, ...negTerms(c, kind, target)].join(' ');
}

/** 条件全体での検索語（該当なし・候補切れのとき） */
export function conditionQuery(c: SearchConditions, kind: SearchKind, target: RecipeTarget = 'google'): string {
  if (kind === 'maps') return conditionTerms(c, 'recipe').slice(0, 2).join(' ');
  return finish(conditionTerms(c, kind), c, kind, target);
}

/** 結果の料理1品についての検索語（いま表示している料理名に合わせる） */
export function dishQuery(dishName: string, c: SearchConditions, kind: SearchKind, target: RecipeTarget = 'google'): string {
  if (kind === 'maps') return dishName;
  if (kind === 'image') return [dishName, ...negTerms(c, kind, target)].join(' ');
  const rest = conditionTerms({ ...c, foods: [] }, 'recipe').filter((t) => t !== dishName);
  return finish([dishName, ...rest].slice(0, MAX_TERMS), c, kind, target);
}

/** 検索語から開く URL を作る */
export function searchUrl(kind: SearchKind, query: string, target: RecipeTarget = 'google'): string {
  const q = encodeURIComponent(query.trim());
  if (kind === 'image') return SEARCH_TEMPLATES.googleImage + q;
  if (kind === 'maps') return SEARCH_TEMPLATES.googleMaps + q;
  return SEARCH_TEMPLATES[target] + q;
}

/** いまの条件（フリー入力・質問回答・絞り込み結果）から検索の材料を集める */
export function conditionsFrom(state: SessionState, ev: Evaluation): SearchConditions {
  const answers = allAnswers(state);
  const food = answers.filter((a): a is Extract<Answer, { kind: 'food' }> => a.kind === 'food');
  const attr = (name: string) =>
    answers.flatMap((a) => (a.kind === 'attr' && a.attr === name && !a.negate ? [a.value] : []));
  const foodWord = (a: Extract<Answer, { kind: 'food' }>) =>
    a.target.type === 'category' ? (a.target.fallbackFor ?? a.target.category) : a.label;
  return {
    foods: uniq(food.filter((a) => !a.negate).map(foodWord)),
    negFoods: uniq(food.filter((a) => a.negate).map(foodWord)),
    effortMax: ev.effortMax,
    knifeNone: answers.some((a) => a.kind === 'knife'),
    tastes: attr('taste'),
    temps: attr('temp'),
    methods: attr('method'),
  };
}
