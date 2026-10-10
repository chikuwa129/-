import { describe, expect, it, vi } from 'vitest';
import dishesJson from '../data/dishes.json';
import type { Dish } from './types';
import { EFFORT_QUESTION } from './questions';
import {
  DELI_NOTICE,
  RELAX_NOTICE,
  answerQuestion,
  createSession,
  evaluate,
  excludeDish,
  nextQuestion,
  removeTag,
  resetEffortShift,
  sessionTags,
  shiftEffort,
  skipQuestion,
  withFreeItems,
  EFFORT_TAG_ID,
  type SessionState,
} from './engine';
import { isDeliDish, rangeText, selToRange, shiftRange, effortTagLabel } from './effort';
import { parseFreeText } from './freeText';
import { dictionaryIndex } from './interpreter';
import { conditionsFrom, dishQuery } from './search';

const dishes = dishesJson as Dish[];
const fresh = () => createSession(dishes, () => 0.5);
const pick = (levels: number[], s: SessionState = fresh()) => answerQuestion(s, EFFORT_QUESTION, levels.join(','));
const free = (text: string, s: SessionState = fresh()) => withFreeItems(s, parseFreeText(text, dictionaryIndex));
const selRangeSession = (a: number, b: number) => pick([a, b]);
const efforts = (s: SessionState) => evaluate(dishes, s).pool.map((d) => d.effort);

describe('やる気度の複数選択', () => {
  it('one level = that level or below (upper bound only)', () => {
    const ev = evaluate(dishes, pick([2]));
    expect(ev.pool.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...efforts(pick([2])))).toBeLessThanOrEqual(2);
    expect(efforts(pick([2]))).toContain(1);
  });

  it('two or more levels = min..max range (3 and 4 → only effort 3-4)', () => {
    const e = efforts(pick([3, 4]));
    expect(e.length).toBeGreaterThanOrEqual(3);
    expect(e.every((x) => x >= 3 && x <= 4)).toBe(true);
  });

  it('non-adjacent levels are treated as a continuous range (1 and 3 → 1-3)', () => {
    const e = efforts(pick([1, 3]));
    expect(e.every((x) => x >= 1 && x <= 3)).toBe(true);
    expect(new Set(e)).toEqual(new Set([1, 2, 3]));
  });

  it('level 0 with other levels = takeout/deli dishes + cooking dishes in range (union)', () => {
    const ev = evaluate(dishes, pick([0, 2]));
    const inCook = (d: Dish) => d.effort <= 2;
    expect(ev.pool.every((d) => isDeliDish(d) || inCook(d))).toBe(true);
    // 自炊の範囲外でも外食・お惣菜向きなら入る（例：レベル4のカツ丼）
    expect(ev.pool.some((d) => d.effort > 2 && isDeliDish(d))).toBe(true);
    // 外食・お惣菜向きでない自炊料理も入る
    expect(ev.pool.some((d) => !isDeliDish(d) && inCook(d))).toBe(true);
    expect(ev.deliOnly).toBe(false);
  });

  it('level 0 alone = takeout/deli only with the notice', () => {
    const ev = evaluate(dishes, pick([0]));
    expect(ev.pool.every(isDeliDish)).toBe(true);
    expect(ev.deliOnly).toBe(true);
    expect(ev.notices).toContain(DELI_NOTICE);
  });

  it('relaxing raises only the upper bound and keeps the lower bound', () => {
    // 2〜3 から、その範囲の料理を2品だけ残して除外する
    let s = pick([2, 3]);
    const inRange = evaluate(dishes, s).pool.map((d) => d.name);
    for (const n of inRange.slice(0, inRange.length - 2)) s = excludeDish(s, n);
    const ev = evaluate(dishes, s);
    expect(ev.effort?.cook).toEqual({ min: 2, max: 4 });
    expect(ev.pool.every((d) => d.effort >= 2)).toBe(true);
    expect(ev.notices).toContain(RELAX_NOTICE);
  });

  it('the range text and tag show the selection', () => {
    expect(rangeText(selToRange({ type: 'levels', levels: [1, 2] }))).toBe('手間：温めるだけ〜炒めるだけ');
    expect(rangeText(selToRange({ type: 'levels', levels: [0, 2] }))).toBe('外食・お惣菜 ＋ 手間：温めるだけ〜炒めるだけ');
    expect(effortTagLabel(selToRange({ type: 'levels', levels: [1, 3] }))).toBe('やる気 1〜3');
    expect(effortTagLabel(selToRange({ type: 'levels', levels: [3] }))).toBe('やる気 1〜3');
    expect(effortTagLabel(selToRange({ type: 'levels', levels: [0] }))).toBe('やる気 0（作らない）');
    expect(effortTagLabel(selToRange({ type: 'levels', levels: [0, 3, 4] }))).toBe('やる気 0・3〜4');
  });

  it('the chosen range appears as a tag that can be removed', () => {
    let s = pick([1, 3]);
    expect(sessionTags(s).map((t) => t.label)).toEqual(['やる気 1〜3']);
    s = removeTag(s, EFFORT_TAG_ID);
    expect(sessionTags(s)).toEqual([]);
    expect(evaluate(dishes, s).pool).toHaveLength(63);
    expect(nextQuestion(dishes, s)?.def.id).toBe('effort');
  });

  it('skip = no effort filtering', () => {
    const s = skipQuestion(fresh(), EFFORT_QUESTION);
    expect(evaluate(dishes, s).effort).toBeNull();
    expect(evaluate(dishes, s).pool).toHaveLength(63);
  });
});

describe('フリー入力の範囲の言葉', () => {
  const sels = (text: string) =>
    parseFreeText(text, dictionaryIndex).flatMap((i) => i.answers.flatMap((a) => (a.kind === 'effort' ? [a.sel] : [])));

  it('凝ったのも見たい → 3-4, 楽なのも見たい → 1-2, どっちでもいい → no filter; all skip the effort question', () => {
    expect(sels('凝ったのも見たい')).toEqual([{ type: 'range', min: 3, max: 4 }]);
    expect(sels('簡単なのも')).toEqual([{ type: 'range', min: 1, max: 2 }]);
    expect(sels('どっちでもいい')).toEqual([{ type: 'any' }]);
    expect(efforts(free('凝ったのも見たい')).every((e) => e >= 3)).toBe(true);
    expect(evaluate(dishes, free('どっちでもいい')).pool).toHaveLength(63);
    for (const t of ['凝ったのも見たい', '楽なのも見たい', 'どっちでもいい']) {
      expect(nextQuestion(dishes, free(t))?.def.id, t).not.toBe('effort');
    }
  });

  it('several limit words still take the lower one; explicit ranges are used as ranges', () => {
    expect(evaluate(dishes, free('めんどくさいし温めるだけ')).effort?.cook?.max).toBe(1);
    expect(evaluate(dishes, free('めんどくさいけど凝ったのも見たい')).effort?.cook).toEqual({ min: 3, max: 4 });
  });

  it('「なんでもいい」alone is still not understood', () => {
    expect(parseFreeText('なんでもいい', dictionaryIndex)).toEqual([]);
  });
});

describe('結果画面での楽／凝る切り替え', () => {
  it('shiftRange moves both ends; single level shifts from that exact level', () => {
    const one2 = selToRange({ type: 'levels', levels: [2] })!;
    expect(shiftRange(one2, 1)?.cook).toEqual({ min: 3, max: 3 });
    const r34 = selToRange({ type: 'levels', levels: [3, 4] })!;
    expect(shiftRange(r34, -1)?.cook).toEqual({ min: 2, max: 3 });
    expect(shiftRange(r34, 1)).toBeNull(); // 4 を超える
    // 楽で 1 を下回ると外食・お惣菜（レベル0）に切り替わる
    const one1 = selToRange({ type: 'levels', levels: [1] })!;
    expect(shiftRange(one1, -1)).toEqual({ deli: true, cook: null, upperOnly: false });
    expect(shiftRange(selToRange({ type: 'range', min: 1, max: 2 })!, -1)).toEqual({
      deli: true,
      cook: { min: 1, max: 1 },
      upperOnly: false,
    });
  });

  it('凝る: shows the next level up without padding, keeping other conditions', () => {
    let s = free('卵でこってり以外、トマト抜き、包丁なし');
    s = pick([1], s);
    const before = evaluate(dishes, s);
    s = excludeDish(s, before.ranked[0].dish.name);
    const excluded = s.excluded[0];
    s = shiftEffort(s, 1);
    const ev = evaluate(dishes, s);
    expect(ev.shift?.n).toBe(1);
    expect(ev.effort?.cook).toEqual({ min: 2, max: 2 });
    for (const d of ev.pool) {
      expect(d.effort).toBe(2);
      expect(d.ingredients.some((i) => i.name === 'トマト'), d.name).toBe(false);
      expect(d.knife).toBe('不要');
      expect(d.name).not.toBe(excluded);
    }
    // 少なければ水増しせず、正直に件数を出す
    if (ev.pool.length < 3) expect(ev.notices).toContain(`このレベルの料理は${ev.pool.length}品でした`);
    expect(ev.notices).not.toContain(RELAX_NOTICE);
  });

  it('楽 below level 1 switches to takeout/deli with the notice', () => {
    const s = shiftEffort(pick([1]), -1);
    const ev = evaluate(dishes, s);
    expect(ev.deliOnly).toBe(true);
    expect(ev.notices).toContain(DELI_NOTICE);
    expect(ev.pool.every(isDeliDish)).toBe(true);
    expect(ev.shift?.canEasier).toBe(false);
  });

  it('楽 below level 1 on a range also switches to the takeout/deli guidance', () => {
    const ev = evaluate(dishes, shiftEffort(selRangeSession(1, 2), -1));
    expect(ev.effort).toEqual({ deli: true, cook: { min: 1, max: 1 }, upperOnly: false });
    expect(ev.deliMode).toBe(true);
    expect(ev.notices).toContain(DELI_NOTICE);
  });

  it('凝る is disabled past level 4', () => {
    expect(evaluate(dishes, pick([3, 4])).shift?.canHarder).toBe(false);
    expect(evaluate(dishes, pick([4])).shift?.canHarder).toBe(false);
    expect(evaluate(dishes, pick([2])).shift?.canHarder).toBe(true);
  });

  it('can be pressed repeatedly and reset; the original choice is kept', () => {
    let s = pick([2]);
    s = shiftEffort(shiftEffort(shiftEffort(s, -1), -1), 1); // 楽→楽→凝る
    expect(evaluate(dishes, s).effort?.cook).toEqual({ min: 1, max: 1 });
    expect(evaluate(dishes, s).chosenEffort?.cook).toEqual({ min: 1, max: 2 });
    s = resetEffortShift(s);
    expect(evaluate(dishes, s).effort).toEqual(evaluate(dishes, pick([2])).effort);
    expect(evaluate(dishes, s).ranked.map((r) => r.dish.name)).toEqual(
      evaluate(dishes, pick([2])).ranked.map((r) => r.dish.name),
    );
  });

  it('without an effort choice, shifts from the first result dish', () => {
    const s = skipQuestion(fresh(), EFFORT_QUESTION);
    const top = evaluate(dishes, s).ranked[0].dish;
    const ev = evaluate(dishes, shiftEffort(s, -1));
    if (top.effort > 1) expect(ev.pool.every((d) => d.effort === top.effort - 1)).toBe(true);
    else expect(ev.deliOnly).toBe(true);
  });

  it('effort badges and search terms follow the shown dishes after shifting', () => {
    const s = shiftEffort(free('トマト系で凝りたい'), -2);
    const ev = evaluate(dishes, s);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = conditionsFrom(s, ev);
    warn.mockRestore();
    expect(c.effortMax).toBe(ev.effort?.cook?.max ?? null);
    const d = ev.ranked[0].dish;
    expect(dishQuery(d.name, c, 'recipe').startsWith(d.name)).toBe(true);
  });
});
