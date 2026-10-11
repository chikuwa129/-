import type { Answer, Attr, Dish, FoodTarget, FreeItem, PolicyKey, QuestionDef, QuestionOption } from './types';
import { normalize } from './text';
import ingredientsJson from '../data/ingredients.json';

/** スイーツ（買う前提。手間・包丁・調理法は持たない） */
export interface Sweet {
  name: string;
  aliases: string[];
  kind: 'sweet';
  family: '和' | '洋' | '焼き菓子' | '果物' | '乳製品' | '冷菓' | 'いも';
  sweetness: '控えめ' | 'ふつう' | '強め';
  refresh: 'さっぱり' | 'ふつう' | '濃厚';
  fat: '低' | '中' | '高';
  calorie: '低め' | 'ふつう' | '高め';
  amount: 'ひと口' | 'ふつう' | 'しっかり';
  temp: '冷' | '常温';
  buy: ('コンビニ' | 'スーパー' | '和菓子店' | '洋菓子店')[];
  ingredients: { name: string; role: 'main' }[];
}

export const SWEET_MAX_QUESTIONS = 5;
const MIN_POOL = 3;
const FOOD_SCORE = 3;

/**
 * スイーツの質問（最大5問）。系統は7種類あるので、選択肢をまとめて5つにしている
 * （value のカンマ区切りはどれかに当たればよい）。
 */
export const SWEET_QUESTIONS: QuestionDef[] = [
  {
    id: 'family',
    attr: 'family',
    text: 'どんな甘いもの？',
    options: [
      { value: '和', label: '和菓子' },
      { value: '洋,焼き菓子', label: '洋菓子・焼き菓子' },
      { value: '果物,冷菓', label: '果物・ゼリー・アイス' },
      { value: '乳製品', label: 'ヨーグルト' },
      { value: 'いも', label: 'おいも' },
    ],
  },
  {
    id: 'sweetness',
    attr: 'sweetness',
    text: '甘さは？',
    options: [
      { value: '控えめ', label: '控えめ' },
      { value: 'ふつう', label: 'ふつう' },
      { value: '強め', label: 'しっかり甘く' },
    ],
  },
  {
    id: 'refresh',
    attr: 'refresh',
    text: 'どんな味わい？',
    options: [
      { value: 'さっぱり', label: 'さっぱり' },
      { value: 'ふつう', label: 'ふつう' },
      { value: '濃厚', label: '濃厚' },
    ],
  },
  {
    id: 'sweetAmount',
    attr: 'amount',
    text: 'どのくらい食べたい？',
    options: [
      { value: 'ひと口', label: 'ひと口' },
      { value: 'ふつう', label: 'ふつう' },
      { value: 'しっかり', label: 'しっかり' },
    ],
  },
  {
    id: 'sweetTemp',
    attr: 'temp',
    text: '冷たいのと常温、どっち？',
    options: [
      { value: '冷', label: '冷たいもの' },
      { value: '常温', label: '常温' },
    ],
  },
];

/** 食事の属性語をスイーツの質問に当てはめる（さっぱり→味わい、こってり→濃厚、和→和菓子など） */
export function sweetMapAttr(attr: Attr, value: string) {
  let a: Attr = attr;
  let v = value;
  if (attr === 'taste') {
    if (value === 'さっぱり') [a, v] = ['refresh', 'さっぱり'];
    else if (value === 'こってり') [a, v] = ['refresh', '濃厚'];
    else return null;
  } else if (attr === 'temp') v = value === '冷' ? '冷' : '常温';
  else if (attr === 'amount') v = { 少: 'ひと口', 普: 'ふつう', 多: 'しっかり' }[value] ?? value;
  else if (attr === 'genre') {
    if (value === '和') [a, v] = ['family', '和'];
    else if (value === '洋') [a, v] = ['family', '洋,焼き菓子'];
    else return null;
  }
  const q = SWEET_QUESTIONS.find((x) => x.attr === a && x.options.some((o) => o.value === v));
  if (!q) return null;
  return { attr: a, value: v, questionId: q.id, label: q.options.find((o) => o.value === v)!.label };
}

export function sweetHas(s: Sweet, attr: string, value: string): boolean {
  const v = (s as unknown as Record<string, unknown>)[attr];
  return value.split(',').some((x) => (Array.isArray(v) ? (v as string[]).includes(x) : v === x));
}

const CATEGORY_OF: Record<string, string> = Object.fromEntries(
  Object.entries(ingredientsJson as Record<string, { category: string }>).map(([k, v]) => [k, v.category]),
);

export function sweetFoodMatch(s: Sweet, t: FoodTarget): boolean {
  if (t.type === 'dish') return [s.name, ...s.aliases].some((n) => normalize(n).includes(t.word));
  if (t.type === 'ingredient') return s.ingredients.some((i) => i.name === t.name);
  return s.ingredients.some((i) => CATEGORY_OF[i.name] === t.category);
}

/** 食べ合わせ（食事から引き継ぐ） */
export interface Pairing {
  dish: Pick<Dish, 'name' | 'taste' | 'fat' | 'amount'>;
  use: boolean;
}

export interface SweetSession {
  questionAnswers: Answer[];
  freeItems: FreeItem[];
  skipped: string[];
  excluded: string[];
  askedCount: number;
  tieBreak: Record<string, number>;
  pairing: Pairing | null;
  /** 食事の方針の引き継ぎ（弱い補正。除外はしない） */
  carry: { policies: PolicyKey[]; use: boolean } | null;
}

export function createSweetSession(
  sweets: Sweet[],
  opts: { pairing?: Pairing['dish']; carry?: PolicyKey[]; items?: FreeItem[] } = {},
  random: () => number = Math.random,
): SweetSession {
  const tieBreak: Record<string, number> = {};
  for (const s of sweets) tieBreak[s.name] = random();
  return {
    questionAnswers: [],
    freeItems: opts.items ?? [],
    skipped: [],
    excluded: [],
    askedCount: 0,
    tieBreak,
    pairing: opts.pairing ? { dish: opts.pairing, use: true } : null,
    carry: opts.carry && opts.carry.length ? { policies: opts.carry, use: true } : null,
  };
}

const allAnswers = (s: SweetSession) => [...s.freeItems.flatMap((i) => i.answers), ...s.questionAnswers];

/** 食べ合わせの補正と理由 */
export function pairingEffect(sw: Sweet, p: Pairing['dish']): { score: number; reason: string | null } {
  let score = 0;
  let reason: string | null = null;
  const heavy = p.taste.includes('こってり') || p.fat === '高' || p.amount === '多';
  if (heavy) {
    if (sw.refresh === 'さっぱり') score += 1;
    if (['果物', '冷菓', '乳製品'].includes(sw.family)) score += 0.5;
    if (sw.fat === '高') score -= 1;
    const what = p.taste.includes('こってり') ? 'こってりした' : p.fat === '高' ? '脂質の多い' : '量の多い';
    if (sw.refresh === 'さっぱり') reason = `${what}食事のあとなので、さっぱり系を優先`;
  }
  if (p.taste.includes('辛い') && ['乳製品', '冷菓'].includes(sw.family)) {
    score += 1;
    reason = '辛い食事のあとなので、乳製品や冷たいものを優先';
  }
  if (p.amount === '少' && sw.amount === 'しっかり') {
    score += 0.5;
    reason ??= '軽めの食事だったので、満足感のあるものも候補に';
  }
  return { score, reason };
}

/** 方針（脂質控えめ・カロリー控えめ）の弱い補正 */
export function sweetPolicyScore(sw: Sweet, policies: Set<PolicyKey>): number {
  let sum = 0;
  if (policies.has('lowFat')) sum += sw.fat === '高' ? -1 : sw.fat === '低' ? 0.5 : 0;
  if (policies.has('lowCalorie')) sum += sw.calorie === '高め' ? -1 : sw.calorie === '低め' ? 0.5 : 0;
  return sum;
}

export interface SweetRanked {
  sweet: Sweet;
  score: number;
  inCandidates: boolean;
  foodMatches: number;
  reason: string | null;
}

export interface SweetEvaluation {
  pool: Sweet[];
  candidates: Sweet[];
  ranked: SweetRanked[];
  /** 上位3品（同じ系統は2品まで） */
  top: SweetRanked[];
  notices: string[];
  /** いま効いている方針（直接選んだもの＋引き継ぎ） */
  policies: Set<PolicyKey>;
  /** 引き継いでいる方針 */
  carried: PolicyKey[];
  foodAnswers: Extract<Answer, { kind: 'food' }>[];
}

export function evaluateSweets(sweets: Sweet[], s: SweetSession): SweetEvaluation {
  const answers = allAnswers(s);
  const notices: string[] = [];
  const food = answers.filter((a): a is Extract<Answer, { kind: 'food' }> => a.kind === 'food');
  const pos = food.filter((a) => !a.negate);
  const neg = food.filter((a) => a.negate);
  const base = sweets.filter((x) => !s.excluded.includes(x.name) && !neg.some((a) => sweetFoodMatch(x, a.target)));

  const matches = (x: Sweet) => pos.filter((a) => sweetFoodMatch(x, a.target)).length;
  const hits = base.filter((x) => matches(x) > 0);
  let pool = base;
  let guaranteed: Sweet[] = [];
  if (pos.length && hits.length >= MIN_POOL) pool = hits;
  else if (hits.length > 0) {
    guaranteed = hits;
    notices.push(`${pos.map((a) => `『${a.label}』`).join('')}の甘いものは${hits.length}品でした。近いものも入れています`);
  }

  const attrScore = (x: Sweet) =>
    answers.reduce((sum, a) => {
      if (a.kind !== 'attr') return sum;
      const hit = sweetHas(x, a.attr, a.value);
      return sum + ((a.negate ? !hit : hit) ? 1 : -1);
    }, 0);
  const attr = new Map(pool.map((x) => [x.name, attrScore(x)]));
  const top = Math.max(...pool.map((x) => attr.get(x.name)!), -Infinity);
  const candidates = pool.filter((x) => attr.get(x.name) === top || guaranteed.includes(x));

  const direct = answers.flatMap((a) => (a.kind === 'policy' ? [a.key] : []));
  const carried = s.carry?.use ? s.carry.policies : [];
  const policies = new Set<PolicyKey>([...direct, ...carried]);
  if (carried.length) notices.push(`食事の方針（${carried.map((p) => POLICY_TEXT[p]).join('・')}）を引き継いでいます`);

  const ranked = pool
    .map((sweet) => {
      const pair = s.pairing?.use ? pairingEffect(sweet, s.pairing.dish) : { score: 0, reason: null };
      return {
        sweet,
        score: attr.get(sweet.name)! + FOOD_SCORE * matches(sweet) + pair.score + sweetPolicyScore(sweet, policies),
        inCandidates: candidates.includes(sweet),
        foodMatches: matches(sweet),
        reason: pair.reason,
      };
    })
    .sort(
      (a, b) =>
        Number(b.inCandidates) - Number(a.inCandidates) ||
        b.foodMatches - a.foodMatches ||
        b.score - a.score ||
        (s.tieBreak[a.sweet.name] ?? 0) - (s.tieBreak[b.sweet.name] ?? 0),
    );

  return { pool, candidates, ranked, top: diverseTop(ranked), notices, policies, carried, foodAnswers: pos };
}

const POLICY_TEXT: Record<PolicyKey, string> = { lowFat: '脂質控えめ', lowCalorie: 'カロリー控えめ', bigAmount: '量しっかり' };

/** 上位3品が同じ系統ばかりにならないようにする（同じ系統は2品まで） */
export function diverseTop(ranked: SweetRanked[], n = 3, perFamily = 2): SweetRanked[] {
  const out: SweetRanked[] = [];
  const count: Record<string, number> = {};
  for (const r of ranked) {
    if ((count[r.sweet.family] ?? 0) >= perFamily) continue;
    out.push(r);
    count[r.sweet.family] = (count[r.sweet.family] ?? 0) + 1;
    if (out.length === n) return out;
  }
  // 系統が足りないときは残りで埋める
  for (const r of ranked) if (out.length < n && !out.includes(r)) out.push(r);
  return out;
}

function answeredIds(s: SweetSession): Set<string> {
  return new Set([
    ...allAnswers(s).flatMap((a) => (a.kind === 'attr' ? [a.questionId] : [])),
    ...s.skipped,
  ]);
}

export interface PreparedSweetQuestion {
  def: QuestionDef;
  options: (QuestionOption & { count: number })[];
  gain: number;
}

export function nextSweetQuestion(sweets: Sweet[], s: SweetSession): PreparedSweetQuestion | null {
  const done = answeredIds(s);
  const pool = evaluateSweets(sweets, s).candidates;
  let best: PreparedSweetQuestion | null = null;
  for (const def of SWEET_QUESTIONS) {
    if (done.has(def.id)) continue;
    const options = def.options
      .map((o) => ({ ...o, count: pool.filter((x) => sweetHas(x, def.attr, o.value)).length }))
      .filter((o) => o.count > 0);
    if (options.length < 2 || options.some((o) => o.count === pool.length)) continue;
    const none = pool.filter((x) => !options.some((o) => sweetHas(x, def.attr, o.value))).length;
    const buckets = [...options.map((o) => o.count), none].filter((c) => c > 0);
    const total = buckets.reduce((a, c) => a + c, 0);
    const gain = -buckets.reduce((a, c) => a + (c / total) * Math.log2(c / total), 0);
    if (!best || gain > best.gain) best = { def, options, gain };
  }
  return best;
}

export function sweetQuestionLimit(s: SweetSession): number {
  const done = answeredIds(s);
  return Math.min(SWEET_MAX_QUESTIONS, s.askedCount + SWEET_QUESTIONS.filter((q) => !done.has(q.id)).length);
}

export function isSweetFinished(sweets: Sweet[], s: SweetSession): boolean {
  if (s.askedCount >= SWEET_MAX_QUESTIONS) return true;
  if (evaluateSweets(sweets, s).candidates.length <= MIN_POOL) return true;
  return nextSweetQuestion(sweets, s) === null;
}

export function answerSweet(s: SweetSession, def: QuestionDef, value: string): SweetSession {
  const a: Answer = { kind: 'attr', questionId: def.id, attr: def.attr as Attr, value, negate: false };
  return { ...s, questionAnswers: [...s.questionAnswers, a], askedCount: s.askedCount + 1 };
}

export const skipSweet = (s: SweetSession, def: QuestionDef): SweetSession => ({
  ...s,
  skipped: [...s.skipped, def.id],
  askedCount: s.askedCount + 1,
});
export const excludeSweet = (s: SweetSession, name: string): SweetSession => ({ ...s, excluded: [...s.excluded, name] });
export const removeSweetTag = (s: SweetSession, id: string): SweetSession => ({
  ...s,
  freeItems: s.freeItems.filter((i) => i.id !== id),
});
export const setPairingUse = (s: SweetSession, use: boolean): SweetSession =>
  s.pairing ? { ...s, pairing: { ...s.pairing, use } } : s;
export const setCarryUse = (s: SweetSession, use: boolean): SweetSession =>
  s.carry ? { ...s, carry: { ...s.carry, use } } : s;

/** 甘さ・脂質・カロリーのバッジ */
export function sweetBadges(x: Sweet): string[] {
  const out: string[] = [];
  if (x.sweetness === '控えめ') out.push('甘さ控えめ');
  else if (x.sweetness === '強め') out.push('しっかり甘い');
  if (x.fat === '低') out.push('脂質低め');
  else if (x.fat === '高') out.push('脂質多め');
  if (x.calorie === '低め') out.push('カロリー控えめ');
  else if (x.calorie === '高め') out.push('カロリー高め');
  return out;
}

/** 理由の1行（食材・名前の指定 → 食べ合わせ → 方針） */
export function sweetReason(r: SweetRanked, ev: SweetEvaluation): string | null {
  const parts: string[] = [];
  const hit = ev.foodAnswers.filter((a) => sweetFoodMatch(r.sweet, a.target)).map((a) => a.label);
  if (hit.length) parts.push(`${hit.join('と')}の甘いものです`);
  if (r.reason) parts.push(r.reason);
  const p = ev.policies;
  const segs: string[] = [];
  if (p.has('lowFat') && r.sweet.fat === '低') segs.push('脂質低め');
  if (p.has('lowCalorie') && r.sweet.calorie === '低め') segs.push('カロリー控えめ');
  if (segs.length) parts.push(`${segs.join('・')}です`);
  return parts.length ? parts.join('。') + '。' : null;
}
