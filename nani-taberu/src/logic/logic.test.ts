import { describe, expect, it, vi } from 'vitest';
import dishesJson from '../data/dishes.json';
import keywords from '../data/keywords.json';
import ingredients from '../data/ingredients.json';
import type { Dish } from './types';
import { QUESTIONS, MAX_QUESTIONS, EFFORT_QUESTION } from './questions';
import {
  answerQuestion,
  createSession,
  evaluate,
  excludeDish,
  foodMatch,
  isFinished,
  nextQuestion,
  questionLimit,
  rank,
  removeFreeItem,
  skipQuestion,
  withFreeItems,
  type SessionState,
} from './engine';
import { parseFreeText } from './freeText';
import { dictionaryIndex } from './interpreter';
import { normalize } from './text';

const dishes = dishesJson as Dish[];
const fixed = () => 0.5;
const fresh = () => createSession(dishes, fixed);
const parse = (text: string) => parseFreeText(text, dictionaryIndex);
const free = (text: string, s: SessionState = fresh()) => withFreeItems(s, parse(text));
const answer = (s: SessionState, id: string, value: string) =>
  answerQuestion(s, QUESTIONS.find((q) => q.id === id)!, value);
/** 質問に先頭の選択肢で答え続けて結果まで進める */
function runToEnd(s: SessionState, pick: 'first' | 'last' = 'first'): SessionState {
  let guard = 0;
  while (!isFinished(dishes, s)) {
    const q = nextQuestion(dishes, s)!;
    if (q.def.id === 'effort') s = skipQuestion(s, q.def);
    else s = answerQuestion(s, q.def, pick === 'first' ? q.options[0].value : q.options.at(-1)!.value);
    if (++guard > MAX_QUESTIONS) throw new Error('too many questions');
  }
  return s;
}
const resultNames = (s: SessionState) => evaluate(dishes, s).ranked.map((r) => r.dish.name);
const usesIngredient = (d: Dish, name: string) => d.ingredients.some((i) => i.name === name);
const tags = (text: string) =>
  parse(text).flatMap((i) =>
    i.answers.map((a) => {
      const neg = 'negate' in a && a.negate ? '!' : '';
      if (a.kind === 'attr') return `${neg}${a.attr}:${a.value}`;
      if (a.kind === 'effort') return `effort:${a.level}`;
      if (a.kind === 'knife') return 'knife:不要';
      return `${neg}food:${a.target.type === 'dish' ? a.target.word : a.target.type === 'ingredient' ? a.target.name : a.target.category}`;
    }),
  );

describe('data', () => {
  it('has 63 dishes with valid attributes', () => {
    expect(dishes.length).toBe(63);
    expect(new Set(dishes.map((d) => d.name)).size).toBe(dishes.length);
    for (const d of dishes) {
      for (const q of QUESTIONS.filter((x) => x.attr !== 'effort')) {
        const allowed = new Set(
          QUESTIONS.filter((x) => x.attr === q.attr).flatMap((x) => x.options.map((o) => o.value)),
        );
        const vals = ([] as string[]).concat(d[q.attr as keyof Dish] as string | string[]);
        expect(vals.length, `${d.name}.${q.attr}`).toBeGreaterThan(0);
        for (const v of vals) expect(allowed.has(v), `${d.name}.${q.attr}=${v}`).toBe(true);
      }
    }
  });

  it('every dish has ingredients using canonical names (main 1-3, sub 0-5)', () => {
    for (const d of dishes) {
      const mains = d.ingredients.filter((i) => i.role === 'main');
      const subs = d.ingredients.filter((i) => i.role === 'sub');
      expect(mains.length, d.name).toBeGreaterThanOrEqual(1);
      expect(mains.length, d.name).toBeLessThanOrEqual(3);
      expect(subs.length, d.name).toBeLessThanOrEqual(5);
      for (const i of d.ingredients) expect(i.name in ingredients, `${d.name}: ${i.name}`).toBe(true);
    }
  });

  it('every dish has effort/knife/method following the level rules', () => {
    const methods = ['温める', '茹でる', '炒める', '焼く', '煮る', '揚げる', '和える', '混ぜる'];
    for (const d of dishes) {
      expect([1, 2, 3, 4]).toContain(d.effort);
      expect(['不要', '少し', '必要']).toContain(d.knife);
      expect(d.method.length, d.name).toBeGreaterThan(0);
      for (const m of d.method) expect(methods).toContain(m);
      if (d.effort === 1) expect(d.knife, d.name).toBe('不要');
      if (d.effort === 2) expect(['不要', '少し'], d.name).toContain(d.knife);
    }
  });

  it('keywords only map to known values', () => {
    for (const [word, t] of Object.entries(keywords as Record<string, Record<string, unknown>>)) {
      for (const [attr, value] of Object.entries(t)) {
        if (attr === 'effortLevel' || attr === 'effortMax') expect([0, 1, 2, 3, 4], word).toContain(value);
        else if (attr === 'knife') expect(value, word).toBe('不要');
        else if (attr === 'method') expect(typeof value).toBe('string');
        else {
          const ok = QUESTIONS.some((q) => q.attr === attr && q.options.some((o) => o.value === value));
          expect(ok, `${word} -> ${attr}:${value}`).toBe(true);
        }
      }
    }
  });
});

describe('akinator mode', () => {
  it('asks "今日のやる気は？" first, with 5 levels, and progress counts 8 questions', () => {
    const s = fresh();
    const q = nextQuestion(dishes, s)!;
    expect(q.def.id).toBe('effort');
    expect(q.def.text).toBe('今日のやる気は？');
    expect(q.options).toHaveLength(5);
    expect(questionLimit(s)).toBe(8);
  });

  it('runs from start to a result within 8 questions, always offering 2-5 options', () => {
    for (const pick of ['first', 'last'] as const) {
      let s = fresh();
      let guard = 0;
      while (!isFinished(dishes, s)) {
        const q = nextQuestion(dishes, s)!;
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(q.options.length).toBeLessThanOrEqual(5);
        s = answerQuestion(s, q.def, pick === 'first' ? q.options[0].value : q.options.at(-1)!.value);
        expect(++guard).toBeLessThanOrEqual(MAX_QUESTIONS);
      }
      expect(rank(dishes, s).length).toBeGreaterThan(0);
    }
  });

  it('adds score for matches and subtracts for mismatches', () => {
    const s = answer(fresh(), 'temp', '冷');
    const r = rank(dishes, s);
    expect(r[0].score).toBe(1);
    expect(r.at(-1)!.score).toBe(-1);
    expect(evaluate(dishes, s).candidates.every((d) => d.temp === '冷')).toBe(true);
  });

  it('skip does not change scores', () => {
    const s = skipQuestion(fresh(), EFFORT_QUESTION);
    expect(rank(dishes, s).every((r) => r.score === 0)).toBe(true);
    expect(nextQuestion(dishes, s)!.def.id).not.toBe('effort');
    expect(evaluate(dishes, s).pool).toHaveLength(63);
  });

  it('"違う！" excludes the dish and shows the next one', () => {
    let s = fresh();
    const first = rank(dishes, s)[0].dish.name;
    s = excludeDish(s, first);
    expect(rank(dishes, s)[0].dish.name).not.toBe(first);
    expect(rank(dishes, s).some((r) => r.dish.name === first)).toBe(false);
  });
});

describe('やる気度', () => {
  it('never returns dishes needing more effort than the chosen level', () => {
    for (const level of [1, 2, 3]) {
      const s = runToEnd(answer(fresh(), 'effort', String(level)));
      const ev = evaluate(dishes, s);
      expect(ev.effortLevel).toBe(level);
      for (const r of ev.ranked) expect(r.dish.effort, r.dish.name).toBeLessThanOrEqual(level);
    }
  });

  it('level 1 never returns dishes that need a knife', () => {
    const s = runToEnd(answer(fresh(), 'effort', '1'));
    for (const r of evaluate(dishes, s).ranked) expect(r.dish.knife, r.dish.name).toBe('不要');
  });

  it('level 0 returns only takeout/deli-friendly dishes and says so', () => {
    const s = runToEnd(answer(fresh(), 'effort', '0'));
    const ev = evaluate(dishes, s);
    for (const r of ev.ranked) expect(r.dish.style.includes('外食') || r.dish.deliAlt, r.dish.name).toBe(true);
    expect(ev.notices).toContain('作らない前提で、外食・お惣菜向きの料理を出しています');
  });

  it('relaxes the level by one when fewer than 3 dishes remain, and says so', () => {
    // レベル1（6品）から「冷たい・ごはん」以外を除外していくと3品未満になる
    let s = answer(fresh(), 'effort', '1');
    const level1 = evaluate(dishes, s).pool.map((d) => d.name);
    for (const name of level1.slice(0, level1.length - 2)) s = excludeDish(s, name);
    const ev = evaluate(dishes, s);
    expect(ev.effortLevel).toBe(2);
    expect(ev.pool.length).toBeGreaterThanOrEqual(3);
    expect(ev.pool.every((d) => d.effort <= 2)).toBe(true);
    expect(ev.notices).toContain('やる気の範囲では候補が少なかったので、少しだけ手間が増える料理も入れています');
  });

  it('包丁なし limits to dishes without a knife', () => {
    const s = free('包丁なしで');
    const ev = evaluate(dishes, s);
    expect(ev.knife).toBe('none');
    expect(ev.pool.every((d) => d.knife === '不要')).toBe(true);
  });

  it('free text effort words are picked up and skip the effort question', () => {
    expect(tags('炒めるだけで')).toEqual(['effort:2', 'method:炒める']);
    expect(tags('包丁なしで')).toEqual(['knife:不要']);
    expect(tags('めんどくさい')).toEqual(['effort:2']);
    expect(tags('作りたくない')).toEqual(['effort:0']);
    expect(tags('ちゃんと作りたい')).toEqual(['effort:4']);
    for (const text of ['炒めるだけで', 'めんどくさい', '作りたくない']) {
      expect(nextQuestion(dishes, free(text))?.def.id).not.toBe('effort');
    }
    // 包丁だけではやる気度は判明していないので、やる気度は聞く
    expect(nextQuestion(dishes, free('包丁なしで'))?.def.id).toBe('effort');
  });

  it('uses the lower limit when several effort words appear', () => {
    const ev = evaluate(dishes, free('疲れたし温めるだけがいい'));
    expect(ev.effortLevel).toBe(1);
  });
});

describe('free text: attributes (existing behavior)', () => {
  it('reads the example phrases', () => {
    expect(tags('こってりした肉系')).toEqual(['taste:こってり', 'main:肉']);
    expect(tags('あったかくてさっぱり')).toEqual(['temp:温', 'taste:さっぱり']);
    expect(tags('麺で辛いの')).toEqual(['main:麺', 'taste:辛い']);
  });

  it('handles negation of the preceding keyword', () => {
    expect(tags('肉じゃなくて魚')).toEqual(['!main:肉', 'main:魚']);
    expect(tags('辛くないもの')).toEqual(['!taste:辛い']);
    expect(tags('中華以外で')).toEqual(['!genre:中']);
    expect(tags('辛いのは嫌')).toEqual(['!taste:辛い']);
    expect(tags('甘辛いのがいい')).toEqual(['taste:甘辛']);
  });

  it('does not read grammar as short kana words', () => {
    expect(tags('肉が食べたい')).toEqual(['main:肉']); // 「たい」はタイ料理ではない
    expect(tags('あったかいかな')).toEqual(['temp:温']); // 「いか」は食材ではない
  });

  it('returns nothing for unknown phrases', () => {
    expect(parse('なんでもいい')).toEqual([]);
  });

  it('marks positive attributes as asked and continues with the rest', () => {
    let s = free('こってりした肉系');
    expect(questionLimit(s)).toBe(QUESTIONS.length - 2);
    const asked: string[] = [];
    while (!isFinished(dishes, s)) {
      const q = nextQuestion(dishes, s)!;
      asked.push(q.def.id);
      s = answerQuestion(s, q.def, q.def.id === 'effort' ? '4' : q.options[0].value);
    }
    expect(asked[0]).toBe('effort');
    expect(asked).not.toContain('taste');
    expect(asked).not.toContain('main_protein');
    const top = rank(dishes, s)[0].dish;
    expect(top.taste).toContain('こってり');
    expect(top.main).toContain('肉');
  });

  it('negated values are removed from later options', () => {
    const s = skipQuestion(free('辛くないもの'), EFFORT_QUESTION);
    expect(evaluate(dishes, s).candidates.every((d) => !d.taste.includes('辛い'))).toBe(true);
    const q = nextQuestion(dishes, s);
    if (q?.def.id === 'taste') expect(q.options.map((o) => o.value)).not.toContain('辛い');
  });
});

describe('free text: ingredients and dish names', () => {
  it('normalizes hiragana/katakana and width', () => {
    expect(normalize(' ﾄﾏﾄ ')).toBe('トマト');
    expect(normalize('とまと')).toBe('トマト');
    expect(normalize('ＴＯＭＡＴＯ')).toBe('tomato');
  });

  it('トマト / とまと / トマト系 narrow to dishes using tomato, with a [トマト] tag', () => {
    for (const text of ['トマト', 'とまと', 'トマト系', 'ミニトマト', 'TOMATO']) {
      const items = parse(text);
      expect(items.map((i) => i.label), text).toEqual(['トマト']);
      expect(items[0].note).toBe('『トマト』を食材として読み取りました');
      const ev = evaluate(dishes, free(text));
      expect(ev.pool.length).toBeGreaterThanOrEqual(3);
      expect(ev.pool.every((d) => usesIngredient(d, 'トマト')), text).toBe(true);
      // 主役の料理が上位
      expect(ev.ranked[0].dish.ingredients.find((i) => i.name === 'トマト')?.role).toBe('main');
    }
  });

  it('picks up 卵を使ったやつ / カレー / 丼 (ingredient and partial dish-name match)', () => {
    expect(tags('卵を使ったやつ')).toEqual(['food:卵']);
    expect(evaluate(dishes, free('卵を使ったやつ')).pool.every((d) => usesIngredient(d, '卵'))).toBe(true);

    expect(parse('カレー')[0].note).toBe('『カレー』を料理名として読み取りました');
    const curry = evaluate(dishes, free('カレー')).pool.map((d) => d.name);
    expect(curry).toEqual(expect.arrayContaining(['カレーライス', 'グリーンカレー']));
    expect(evaluate(dishes, free('カレー')).ranked.slice(0, 2).map((r) => r.dish.name).sort()).toEqual(
      ['カレーライス', 'グリーンカレー'].sort(),
    );

    const don = evaluate(dishes, free('丼')).pool;
    expect(don.length).toBeGreaterThanOrEqual(3);
    expect(don.every((d) => [d.name, ...d.aliases].some((n) => n.includes('丼')))).toBe(true);
  });

  it('1〜2 hits keep those dishes and add similar ones, with a notice', () => {
    const ev = evaluate(dishes, free('カレー'));
    expect(ev.pool.length).toBeGreaterThan(2);
    expect(ev.candidates.map((d) => d.name)).toEqual(expect.arrayContaining(['カレーライス', 'グリーンカレー']));
    expect(ev.notices).toContain('『カレー』の料理は2品でした。近い料理も入れています');
    // 質問に答えても当たった料理は残る
    const s = runToEnd(free('カレー'), 'last');
    expect(resultNames(s).slice(0, 3)).toEqual(expect.arrayContaining(['カレーライス']));
  });

  it('トマト以外 / トマト抜き / トマトなしで exclude every dish using tomato (sub included)', () => {
    for (const text of ['トマト以外', 'トマト抜き', 'トマトなしで', 'トマトは嫌', 'とまとはいや']) {
      expect(tags(text), text).toEqual(['!food:トマト']);
      const s = runToEnd(free(text));
      const names = resultNames(s);
      expect(names.length).toBeGreaterThan(0);
      for (const n of names) expect(usesIngredient(dishes.find((d) => d.name === n)!, 'トマト'), `${text}: ${n}`).toBe(false);
    }
  });

  it('カレー以外で excludes curry dishes', () => {
    expect(tags('カレー以外で')).toEqual(['!food:カレー']);
    const names = resultNames(free('カレー以外で'));
    expect(names).not.toContain('カレーライス');
    expect(names).not.toContain('グリーンカレー');
  });

  it('トマトと卵 ranks dishes using both first, then either', () => {
    const ev = evaluate(dishes, free('トマトと卵'));
    const both = (d: Dish) => usesIngredient(d, 'トマト') && usesIngredient(d, '卵');
    expect(ev.pool.every((d) => usesIngredient(d, 'トマト') || usesIngredient(d, '卵'))).toBe(true);
    const firstNonBoth = ev.ranked.findIndex((r) => !both(r.dish));
    const lastBoth = ev.ranked.map((r) => both(r.dish)).lastIndexOf(true);
    expect(lastBoth).toBeGreaterThanOrEqual(0);
    expect(lastBoth).toBeLessThan(firstNonBoth);
  });

  it('ingredients not used by any dish say so and fall back to the category', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const items = parse('ズッキーニ');
    expect(items[0].note).toContain('『ズッキーニ』を使う料理はデータにありませんでした');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    const ev = evaluate(dishes, withFreeItems(fresh(), items));
    expect(ev.notices[0]).toBe('『ズッキーニ』を使う料理はデータにありませんでした。代わりに野菜を使う料理を候補にしています');
    expect(ev.pool.length).toBeGreaterThanOrEqual(3);
    expect(ev.pool.every((d) => d.ingredients.some((i) => (ingredients as Record<string, { category: string }>)[i.name].category === '野菜'))).toBe(true);
  });

  it('category words pick every dish with an ingredient of that category', () => {
    const ev = evaluate(dishes, free('きのこ系'));
    expect(ev.pool.map((d) => d.name)).toEqual(expect.arrayContaining(['すき焼き', '寄せ鍋', 'トムヤムクン']));
    expect(ev.pool.every((d) => d.ingredients.some((i) => ['しいたけ', 'しめじ', 'えのき'].includes(i.name)))).toBe(true);
  });

  it('words that are both an ingredient and an attribute are read as the attribute', () => {
    expect(tags('肉')).toEqual(['main:肉']);
    expect(tags('魚')).toEqual(['main:魚']);
  });

  it('ingredient and effort work together', () => {
    const ev = evaluate(dishes, free('卵で炒めるだけ'));
    expect(ev.effortLevel).toBe(2);
    expect(ev.pool.every((d) => d.effort <= 2)).toBe(true);
    expect(ev.pool.every((d) => usesIngredient(d, '卵'))).toBe(true);
  });

  it('炒めるだけ does not push tomato-main dishes out; in-range dishes rank first after relaxing', () => {
    const ev = evaluate(dishes, free('トマト系の炒めるだけ'));
    expect(ev.effortLevel).toBe(3);
    expect(ev.candidates.length).toBeGreaterThanOrEqual(3);
    expect(ev.ranked[0].dish.name).toBe('冷製パスタ'); // トマトが主役でレベル2以内
  });

  it('relaxes effort first when the ingredient hits are all above the level', () => {
    // 牛肉を使う料理はレベル1にはない
    const ev = evaluate(dishes, free('牛肉で温めるだけ'));
    expect(ev.effortLevel).toBeGreaterThan(1);
    expect(ev.notices).toContain('やる気の範囲では候補が少なかったので、少しだけ手間が増える料理も入れています');
    expect(ev.ranked[0].dish.ingredients.some((i) => i.name === '牛肉')).toBe(true);
  });

  it('removing a tag restores the dishes it filtered', () => {
    let s = free('トマトこってり');
    expect(evaluate(dishes, s).pool.every((d) => usesIngredient(d, 'トマト'))).toBe(true);
    s = removeFreeItem(s, s.freeItems.find((i) => i.label === 'トマト')!.id);
    expect(evaluate(dishes, s).pool).toHaveLength(63);
    expect(s.freeItems.map((i) => i.label)).toEqual(['こってり']);
  });

  it('dish names in hiragana / aliases match', () => {
    expect(foodMatch(dishes.find((d) => d.name === 'オムライス')!, { type: 'dish', word: normalize('オム飯') })).toBe('name');
    expect(tags('ぎょうざ')).toEqual(['food:ギョウザ']);
    expect(evaluate(dishes, free('ぎょうざ')).candidates.map((d) => d.name)).toContain('餃子');
  });
});
