import type { Answer, Dish, QuestionDef } from './types';
import { MAX_QUESTIONS, QUESTIONS } from './questions';

export const MATCH_SCORE = 1;
export const MISMATCH_SCORE = -1;

/** 1つの回答の状態。スコアはここから毎回計算し直す（状態を持たない純粋関数） */
export interface SessionState {
  answers: Answer[];
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
  return { answers: [], skipped: [], excluded: [], askedCount: 0, tieBreak };
}

export function dishHas(dish: Dish, attr: Answer['attr'], value: string): boolean {
  const v = dish[attr];
  return Array.isArray(v) ? (v as string[]).includes(value) : v === value;
}

/** 一致ならプラス、不一致ならマイナス。否定の回答は符号が逆になる */
export function answerScore(dish: Dish, answer: Answer): number {
  const hit = dishHas(dish, answer.attr, answer.value);
  const positive = answer.negate ? !hit : hit;
  return positive ? MATCH_SCORE : MISMATCH_SCORE;
}

export function scoreDish(dish: Dish, answers: Answer[]): number {
  return answers.reduce((sum, a) => sum + answerScore(dish, a), 0);
}

export interface Ranked {
  dish: Dish;
  score: number;
}

/** 除外されていない料理をスコア順に並べる */
export function rank(dishes: Dish[], state: SessionState): Ranked[] {
  return dishes
    .filter((d) => !state.excluded.includes(d.name))
    .map((dish) => ({ dish, score: scoreDish(dish, state.answers) }))
    .sort(
      (a, b) =>
        b.score - a.score || (state.tieBreak[a.dish.name] ?? 0) - (state.tieBreak[b.dish.name] ?? 0),
    );
}

/** 残り候補 = 最高スコアと同点の料理 */
export function candidates(dishes: Dish[], state: SessionState): Dish[] {
  const ranked = rank(dishes, state);
  if (ranked.length === 0) return [];
  const top = ranked[0].score;
  return ranked.filter((r) => r.score === top).map((r) => r.dish);
}

export function answeredQuestionIds(state: SessionState): Set<string> {
  return new Set([...state.answers.map((a) => a.questionId), ...state.skipped]);
}

export interface PreparedQuestion {
  def: QuestionDef;
  options: { value: string; label: string; count: number }[];
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
    state.answers.filter((a) => a.negate && a.attr === def.attr).map((a) => a.value),
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

/** 次に聞く質問。もう聞く意味のある質問がなければ null */
export function nextQuestion(dishes: Dish[], state: SessionState): PreparedQuestion | null {
  const pool = candidates(dishes, state);
  const done = answeredQuestionIds(state);
  let best: PreparedQuestion | null = null;
  for (const def of QUESTIONS) {
    if (done.has(def.id)) continue;
    const q = prepareQuestion(def, pool, state);
    if (q.gain <= 0) continue;
    if (!best || q.gain > best.gain) best = q;
  }
  return best;
}

export const FINISH_CANDIDATES = 3;

/** 質問画面で最大何問になるか（進捗表示 Q3/8 の分母）。フリー入力で埋まった質問の分だけ減る */
export function questionLimit(state: SessionState): number {
  const done = answeredQuestionIds(state);
  const remaining = QUESTIONS.filter((q) => !done.has(q.id)).length;
  return Math.min(MAX_QUESTIONS, state.askedCount + remaining);
}

export function isFinished(dishes: Dish[], state: SessionState): boolean {
  if (state.askedCount >= MAX_QUESTIONS) return true;
  if (candidates(dishes, state).length <= FINISH_CANDIDATES) return true;
  return nextQuestion(dishes, state) === null;
}

export function answerQuestion(state: SessionState, def: QuestionDef, value: string): SessionState {
  const answer: Answer = { questionId: def.id, attr: def.attr, value, negate: false, source: 'question' };
  return { ...state, answers: [...state.answers, answer], askedCount: state.askedCount + 1 };
}

export function skipQuestion(state: SessionState, def: QuestionDef): SessionState {
  return { ...state, skipped: [...state.skipped, def.id], askedCount: state.askedCount + 1 };
}

export function excludeDish(state: SessionState, name: string): SessionState {
  return { ...state, excluded: [...state.excluded, name] };
}

/** フリー入力などで得た回答をまとめて反映する */
export function applyAnswers(state: SessionState, answers: Answer[]): SessionState {
  return { ...state, answers: [...state.answers, ...answers] };
}
