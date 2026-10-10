import type { Dish } from './types';

/**
 * やる気度の指定の種類
 * - levels: 質問で選んだレベル（複数可）
 * - max: 「炒めるだけ」など上限だけを決める言葉（0 は作りたくない）
 * - range: 「凝ったのも見たい」など範囲を明示する言葉
 * - any: 「どっちでもいい」（絞り込みなし。質問済みにはする）
 */
export type EffortSel =
  | { type: 'levels'; levels: number[] }
  | { type: 'max'; level: number }
  | { type: 'range'; min: number; max: number }
  | { type: 'any' };

/**
 * 絞り込みに使う手間の範囲。
 * deli=外食・お惣菜向きの料理を含む（レベル0）、cook=自炊料理の effort の範囲（1〜4）。
 * upperOnly=1つだけ選んだ（上限だけの）指定。楽／凝るでずらすときはそのレベルちょうどを基準にする。
 */
export interface EffortRange {
  deli: boolean;
  cook: { min: number; max: number } | null;
  upperOnly: boolean;
}

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 4;

export function selToRange(sel: EffortSel): EffortRange | null {
  switch (sel.type) {
    case 'any':
      return null;
    case 'max':
      return sel.level <= 0
        ? { deli: true, cook: null, upperOnly: false }
        : { deli: false, cook: { min: MIN_LEVEL, max: sel.level }, upperOnly: true };
    case 'range':
      return { deli: false, cook: { min: sel.min, max: sel.max }, upperOnly: false };
    case 'levels': {
      const deli = sel.levels.includes(0);
      const nz = [...new Set(sel.levels.filter((l) => l > 0))].sort((a, b) => a - b);
      if (nz.length === 0) return deli ? { deli: true, cook: null, upperOnly: false } : null;
      // 1つだけなら「そのレベル以下」、2つ以上なら「最小〜最大」（飛び飛びも連続範囲として扱う）
      if (nz.length === 1) return { deli, cook: { min: MIN_LEVEL, max: nz[0] }, upperOnly: true };
      return { deli, cook: { min: nz[0], max: nz[nz.length - 1] }, upperOnly: false };
    }
  }
}

/**
 * 複数の指定をまとめる。質問での選択（levels）があればそれを使い、
 * なければ範囲を明示する言葉（range）をまとめ、それもなければ上限の言葉のうち低い方を採る。
 */
export function combineSels(sels: EffortSel[]): EffortRange | null {
  const levels = sels.filter((s) => s.type === 'levels');
  if (levels.length) return selToRange(levels[levels.length - 1]);
  const ranges = sels.filter((s): s is Extract<EffortSel, { type: 'range' }> => s.type === 'range');
  if (ranges.length) {
    return selToRange({
      type: 'range',
      min: Math.min(...ranges.map((r) => r.min)),
      max: Math.max(...ranges.map((r) => r.max)),
    });
  }
  const maxes = sels.filter((s): s is Extract<EffortSel, { type: 'max' }> => s.type === 'max');
  if (maxes.length) return selToRange({ type: 'max', level: Math.min(...maxes.map((m) => m.level)) });
  return null;
}

export const isDeliDish = (d: Dish) => d.style.includes('外食') || d.deliAlt;

export function inEffortRange(d: Dish, r: EffortRange): boolean {
  if (r.deli && isDeliDish(d)) return true;
  return r.cook !== null && d.effort >= r.cook.min && d.effort <= r.cook.max;
}

/** 候補が足りないときの緩和：上限を1つ上げる（下限は動かさない）。これ以上広げられなければ null */
export function relaxRange(r: EffortRange): EffortRange | null {
  if (!r.cook) return { ...r, cook: { min: MIN_LEVEL, max: MIN_LEVEL } };
  if (r.cook.max >= MAX_LEVEL) return null;
  return { ...r, cook: { ...r.cook, max: r.cook.max + 1 } };
}

/** ずらすときの基準の数値範囲（0=外食・お惣菜） */
function shiftSpan(base: EffortRange): [number, number] {
  if (!base.cook) return [0, 0];
  return base.upperOnly ? [base.cook.max, base.cook.max] : [base.cook.min, base.cook.max];
}

/**
 * 結果画面の［もっと楽なのも見る］［もっと凝ったのも見る］で、範囲の下限と上限をともに n だけずらす。
 * 下限が1を下回ったら外食・お惣菜（レベル0）を含める。上限が4を超える・0を下回るなら null（押せない）。
 */
export function shiftRange(base: EffortRange, n: number): EffortRange | null {
  const [lo0, hi0] = shiftSpan(base);
  const lo = lo0 + n;
  const hi = hi0 + n;
  if (hi > MAX_LEVEL || hi < 0) return null;
  // 元の選択に外食・お惣菜が入っていれば、それは残す（自炊の範囲だけをずらす）
  const keepDeli = base.deli && base.cook !== null;
  if (lo < MIN_LEVEL) {
    return { deli: true, cook: hi >= MIN_LEVEL ? { min: MIN_LEVEL, max: hi } : null, upperOnly: false };
  }
  return { deli: keepDeli, cook: { min: lo, max: hi }, upperOnly: false };
}

const SHORT: Record<number, string> = { 1: '温めるだけ', 2: '炒めるだけ', 3: 'ふつう', 4: '凝る' };

/** 「手間：温めるだけ〜炒めるだけ」 */
export function rangeText(r: EffortRange | null): string {
  if (!r) return '手間：しぼらない';
  const cook = r.cook
    ? r.cook.min === r.cook.max
      ? `手間：${SHORT[r.cook.min]}`
      : `手間：${SHORT[r.cook.min]}〜${SHORT[r.cook.max]}`
    : '';
  if (r.deli && cook) return `外食・お惣菜 ＋ ${cook}`;
  if (r.deli) return '作らない（外食・お惣菜）';
  return cook;
}

/** 「手間 3」「手間 2〜3」など（切り替え中の表示用） */
export function rangeNumbers(r: EffortRange): string {
  const cook = r.cook ? (r.cook.min === r.cook.max ? `手間 ${r.cook.min}` : `手間 ${r.cook.min}〜${r.cook.max}`) : '';
  if (r.deli && cook) return `外食・お惣菜＋${cook}`;
  if (r.deli) return '作らない・外食・お惣菜';
  return cook;
}

/** タグの表示（［やる気 1〜3］） */
export function effortTagLabel(r: EffortRange | null): string {
  if (!r) return '手間はどれでも';
  if (!r.cook) return 'やる気 0（作らない）';
  const span = r.cook.min === r.cook.max ? `${r.cook.min}` : `${r.cook.min}〜${r.cook.max}`;
  if (!r.deli) return `やる気 ${span}`;
  return r.cook.min === MIN_LEVEL ? `やる気 0〜${r.cook.max}` : `やる気 0・${span}`;
}
