import type { Answer, Dish, EffortLevel, FoodTarget, FreeItem, QuestionDef, QuestionOption } from './types';
import { EFFORT_QUESTION, MAX_QUESTIONS, QUESTIONS } from './questions';
import { normalize } from './text';
import ingredientsJson from '../data/ingredients.json';

export const MATCH_SCORE = 1;
export const MISMATCH_SCORE = -1;
/** 食材・料理名の指定は属性より強く効かせる */
export const FOOD_MAIN_SCORE = 3;
export const FOOD_SUB_SCORE = 1;
export const DISH_NAME_SCORE = 3;
export const FINISH_CANDIDATES = 3;
/** 絞り込み後にこれ未満なら条件をゆるめる */
export const MIN_POOL = 3;

const CATEGORY_OF: Record<string, string> = Object.fromEntries(
  Object.entries(ingredientsJson as Record<string, { category: string }>).map(([k, v]) => [k, v.category]),
);

/** セッションの状態。スコアや候補はここから毎回計算し直す（純粋関数） */
export interface SessionState {
  /** 質問画面での回答 */
  questionAnswers: Answer[];
  /** フリー入力で拾った言葉（タグ）。外すと回答も消える */
  freeItems: FreeItem[];
  /** スキップした質問ID */
  skipped: string[];
  /** 「違う！」で除外した料理名 */
  excluded: string[];
  /** 質問画面で回答した数（スキップ含む）。フリー入力の分は含めない */
  askedCount: number;
  /** 同点の並びを毎回変えるための乱数（料理名→値） */
  tieBreak: Record<string, number>;
}

export function createSession(dishes: Dish[], random: () => number = Math.random): SessionState {
  const tieBreak: Record<string, number> = {};
  for (const d of dishes) tieBreak[d.name] = random();
  return { questionAnswers: [], freeItems: [], skipped: [], excluded: [], askedCount: 0, tieBreak };
}

export function allAnswers(state: SessionState): Answer[] {
  return [...state.freeItems.flatMap((i) => i.answers), ...state.questionAnswers];
}

export function dishHas(dish: Dish, attr: string, value: string): boolean {
  const v = (dish as unknown as Record<string, unknown>)[attr];
  return Array.isArray(v) ? (v as string[]).includes(value) : v === value;
}

/**
 * 一致ならプラス、不一致ならマイナス。否定の回答は符号が逆になる。
 * 調理法（「炒めるだけ」の炒める）は手間の絞り込みの補足なので、ここでは数えず methodBonus で軽く足す。
 */
export function attrScore(dish: Dish, answers: Answer[]): number {
  let sum = 0;
  for (const a of answers) {
    if (a.kind !== 'attr' || a.attr === 'method') continue;
    const hit = dishHas(dish, a.attr, a.value);
    sum += (a.negate ? !hit : hit) ? MATCH_SCORE : MISMATCH_SCORE;
  }
  return sum;
}

/** 調理法が合う料理を軽く加点（合わなくても減点しない） */
export function methodBonus(dish: Dish, answers: Answer[]): number {
  return answers.filter((a) => a.kind === 'attr' && a.attr === 'method' && dishHas(dish, 'method', a.value)).length;
}

export type FoodMatch = 'main' | 'sub' | 'name' | null;

/** 料理が食材・料理名の指定に当たるか */
export function foodMatch(dish: Dish, target: FoodTarget): FoodMatch {
  if (target.type === 'dish') {
    return [dish.name, ...dish.aliases].some((n) => normalize(n).includes(target.word)) ? 'name' : null;
  }
  const roles = dish.ingredients
    .filter((i) => (target.type === 'ingredient' ? i.name === target.name : CATEGORY_OF[i.name] === target.category))
    .map((i) => i.role);
  return roles.includes('main') ? 'main' : roles.includes('sub') ? 'sub' : null;
}

/** 指定した食材・料理名のうち、いくつに当たるか（AND を優先して並べるため） */
export function foodMatchCount(dish: Dish, answers: Answer[]): number {
  return answers.filter((a) => a.kind === 'food' && !a.negate && foodMatch(dish, a.target) !== null).length;
}

const MATCH_POINTS: Record<Exclude<FoodMatch, null>, number> = {
  main: FOOD_MAIN_SCORE,
  sub: FOOD_SUB_SCORE,
  name: DISH_NAME_SCORE,
};

/** 当たらない料理は加点なし（減点はしない）。複数指定は足し算なので、両方使う料理（AND）が上位に来る */
export function foodScore(dish: Dish, answers: Answer[]): number {
  let sum = 0;
  for (const a of answers) {
    if (a.kind !== 'food' || a.negate) continue;
    const m = foodMatch(dish, a.target);
    if (m) sum += MATCH_POINTS[m];
  }
  return sum;
}

/** やる気レベルの絞り込み。0 は外食・お惣菜向きのみ、1〜4 は手間がそのレベル以下 */
export function effortOk(dish: Dish, level: EffortLevel): boolean {
  if (level === 0) return dish.style.includes('外食') || dish.deliAlt;
  return dish.effort <= level;
}

export interface Ranked {
  dish: Dish;
  score: number;
  inCandidates: boolean;
  /** 当たった食材・料理名の指定の数 */
  foodMatches: number;
  /** 緩和前のやる気レベルの範囲内か */
  inChosenRange: boolean;
}

export interface Evaluation {
  /** ハードフィルタ後の料理 */
  pool: Dish[];
  /** 残り候補（質問の分割と終了判定に使う） */
  candidates: Dish[];
  /** 結果表示の順番 */
  ranked: Ranked[];
  /** 画面に出す案内 */
  notices: string[];
  /** 実際に適用したやる気レベル（緩和後）。指定なしは null */
  effortLevel: EffortLevel | null;
  /** 包丁の絞り込み（緩和後） */
  knife: 'none' | 'little' | null;
  /** 加点に使った食材・料理名の指定 */
  foodAnswers: Extract<Answer, { kind: 'food' }>[];
}

function foodWhat(answers: Extract<Answer, { kind: 'food' }>[]): string {
  const labels = answers.map((a) => `『${a.label}』`).join('');
  return answers.every((a) => a.target.type === 'dish') ? `${labels}の料理` : `${labels}を使う料理`;
}

export function evaluate(dishes: Dish[], state: SessionState): Evaluation {
  const answers = allAnswers(state);
  const notices: string[] = [];
  const food = answers.filter((a): a is Extract<Answer, { kind: 'food' }> => a.kind === 'food');
  const posFood = food.filter((a) => !a.negate);
  const negFood = food.filter((a) => a.negate);

  for (const a of posFood) {
    if (a.target.type === 'category' && a.target.fallbackFor) {
      notices.push(
        `『${a.target.fallbackFor}』を使う料理はデータにありませんでした。代わりに${a.target.category}を使う料理を候補にしています`,
      );
    }
  }

  // 1. 除外：「違う！」と、食材・料理名の否定（sub にだけ含まれる料理も除外）
  let base = dishes.filter(
    (d) => !state.excluded.includes(d.name) && !negFood.some((a) => foodMatch(d, a.target) !== null),
  );

  // 2. 包丁なし（足りなければ「少し」まで、それでも足りなければ外す）
  let knife: Evaluation['knife'] = null;
  if (answers.some((a) => a.kind === 'knife')) {
    const none = base.filter((d) => d.knife === '不要');
    const little = base.filter((d) => d.knife !== '必要');
    if (none.length >= MIN_POOL) {
      base = none;
      knife = 'none';
    } else if (little.length >= MIN_POOL) {
      base = little;
      knife = 'little';
      notices.push('包丁なしの料理が少なかったので、少しだけ切る料理も入れています');
    } else {
      notices.push('包丁なしの料理が見つからなかったので、包丁を使う料理も入れています');
    }
  }

  // 3. やる気度（複数あれば低い方）と食材・料理名の指定
  const efforts = answers.filter((a): a is Extract<Answer, { kind: 'effort' }> => a.kind === 'effort');
  const chosen = efforts.length ? (Math.min(...efforts.map((a) => a.level)) as EffortLevel) : null;
  const isHit = (d: Dish) => foodScore(d, posFood) > 0;
  const baseHits = posFood.length ? base.filter(isHit).length : 0;
  const wantHits = Math.min(MIN_POOL, baseHits);

  let level = chosen;
  let pool: Dish[];
  let guaranteed: Dish[] = [];
  for (;;) {
    // レベル0から緩和するときは、外食・お惣菜向きの料理も残したまま広げる
    const inRange =
      level === null
        ? base
        : base.filter((d) => effortOk(d, level!) || (chosen === 0 && effortOk(d, 0)));
    const hits = wantHits > 0 ? inRange.filter(isHit) : [];
    const enough = inRange.length >= MIN_POOL && hits.length >= wantHits;
    if (enough || level === null || level >= 4) {
      if (hits.length >= MIN_POOL) {
        pool = hits; // 3品以上当たったら、当たった料理だけに絞る
      } else {
        pool = inRange;
        guaranteed = hits; // 1〜2品なら必ず残し、近い料理も候補に入れる
        if (hits.length > 0) notices.push(`${foodWhat(posFood)}は${hits.length}品でした。近い料理も入れています`);
      }
      break;
    }
    level = (level + 1) as EffortLevel;
  }
  if (chosen !== null && level !== chosen) {
    notices.push('やる気の範囲では候補が少なかったので、少しだけ手間が増える料理も入れています');
  }
  if (level === 0) notices.push('作らない前提で、外食・お惣菜向きの料理を出しています');

  // 4. 残り候補 = 属性スコアが最高の料理（＋必ず残す料理）
  const attr = new Map(pool.map((d) => [d.name, attrScore(d, answers)]));
  const top = Math.max(...pool.map((d) => attr.get(d.name)!), -Infinity);
  const candidates = pool.filter((d) => attr.get(d.name) === top || guaranteed.includes(d));
  const ranked = pool
    .map((dish) => ({
      dish,
      score: attr.get(dish.name)! + foodScore(dish, posFood) + methodBonus(dish, answers),
      inChosenRange: chosen === null || effortOk(dish, chosen),
      inCandidates: candidates.includes(dish),
      foodMatches: foodMatchCount(dish, posFood),
    }))
    // 候補 → 指定に多く当たる（AND）→ 本来のやる気の範囲内 → スコア → 同点はランダム
    .sort(
      (a, b) =>
        Number(b.inCandidates) - Number(a.inCandidates) ||
        b.foodMatches - a.foodMatches ||
        Number(b.inChosenRange) - Number(a.inChosenRange) ||
        b.score - a.score ||
        (state.tieBreak[a.dish.name] ?? 0) - (state.tieBreak[b.dish.name] ?? 0),
    );

  return { pool, candidates, ranked, notices, effortLevel: level, knife, foodAnswers: posFood };
}

export const rank = (dishes: Dish[], state: SessionState) => evaluate(dishes, state).ranked;
export const candidates = (dishes: Dish[], state: SessionState) => evaluate(dishes, state).candidates;

export function answeredQuestionIds(state: SessionState): Set<string> {
  const ids = allAnswers(state).flatMap((a) => (a.kind === 'attr' || a.kind === 'effort' ? [a.questionId] : []));
  return new Set([...ids, ...state.skipped]);
}

export interface PreparedQuestion {
  def: QuestionDef;
  options: (QuestionOption & { count: number })[];
  /** 分割の良さ（エントロピー）。大きいほど候補をきれいに分けられる */
  gain: number;
}

/**
 * 残り候補に対する質問の分割の良さを計算する。
 * 各選択肢に当てはまる料理の数と「どれにも当てはまらない」料理の数からエントロピーを出す。
 */
export function prepareQuestion(def: QuestionDef, pool: Dish[], state: SessionState): PreparedQuestion {
  // 否定済みの値（例:「辛くない」）は選択肢から外す
  const negated = new Set(
    allAnswers(state).flatMap((a) => (a.kind === 'attr' && a.negate && a.attr === def.attr ? [a.value] : [])),
  );
  const options = def.options
    .filter((o) => !negated.has(o.value))
    .map((o) => ({ ...o, count: pool.filter((d) => dishHas(d, def.attr, o.value)).length }))
    .filter((o) => o.count > 0);

  const none = pool.filter((d) => !options.some((o) => dishHas(d, def.attr, o.value))).length;
  const buckets = [...options.map((o) => o.count), none].filter((c) => c > 0);
  const total = buckets.reduce((s, c) => s + c, 0);
  let gain = 0;
  for (const c of buckets) {
    const p = c / total;
    gain -= p * Math.log2(p);
  }
  // 1つの選択肢が全候補に当てはまるなら、聞いても絞り込めない
  if (options.some((o) => o.count === pool.length)) gain = 0;
  if (options.length < 2) gain = 0;
  return { def, options, gain };
}

/** 次に聞く質問。やる気度を最初に聞き、あとは分割の良い順。もう聞く意味がなければ null */
export function nextQuestion(dishes: Dish[], state: SessionState): PreparedQuestion | null {
  const done = answeredQuestionIds(state);
  if (!done.has(EFFORT_QUESTION.id)) {
    return { def: EFFORT_QUESTION, options: EFFORT_QUESTION.options.map((o) => ({ ...o, count: 0 })), gain: Infinity };
  }
  const pool = evaluate(dishes, state).candidates;
  let best: PreparedQuestion | null = null;
  for (const def of QUESTIONS) {
    if (done.has(def.id) || def.attr === 'effort') continue;
    const q = prepareQuestion(def, pool, state);
    if (q.gain <= 0) continue;
    if (!best || q.gain > best.gain) best = q;
  }
  return best;
}

/** 質問画面で最大何問になるか（進捗表示 Q3/8 の分母）。フリー入力で埋まった質問の分だけ減る */
export function questionLimit(state: SessionState): number {
  const done = answeredQuestionIds(state);
  const remaining = QUESTIONS.filter((q) => !done.has(q.id)).length;
  return Math.min(MAX_QUESTIONS, state.askedCount + remaining);
}

export function isFinished(dishes: Dish[], state: SessionState): boolean {
  if (state.askedCount >= MAX_QUESTIONS) return true;
  if (evaluate(dishes, state).candidates.length <= FINISH_CANDIDATES) return true;
  return nextQuestion(dishes, state) === null;
}

export function answerQuestion(state: SessionState, def: QuestionDef, value: string): SessionState {
  const answer: Answer =
    def.attr === 'effort'
      ? { kind: 'effort', questionId: 'effort', level: Number(value) as EffortLevel }
      : { kind: 'attr', questionId: def.id, attr: def.attr, value, negate: false };
  return { ...state, questionAnswers: [...state.questionAnswers, answer], askedCount: state.askedCount + 1 };
}

export function skipQuestion(state: SessionState, def: QuestionDef): SessionState {
  return { ...state, skipped: [...state.skipped, def.id], askedCount: state.askedCount + 1 };
}

export function excludeDish(state: SessionState, name: string): SessionState {
  return { ...state, excluded: [...state.excluded, name] };
}

export function withFreeItems(state: SessionState, items: FreeItem[]): SessionState {
  return { ...state, freeItems: items };
}

export function removeFreeItem(state: SessionState, id: string): SessionState {
  return { ...state, freeItems: state.freeItems.filter((i) => i.id !== id) };
}
