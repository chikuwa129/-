import { describe, expect, it } from 'vitest';
import dishesJson from '../data/dishes.json';
import keywords from '../data/keywords.json';
import type { Dish } from './types';
import { QUESTIONS, MAX_QUESTIONS } from './questions';
import {
  answerQuestion,
  applyAnswers,
  candidates,
  createSession,
  excludeDish,
  isFinished,
  nextQuestion,
  questionLimit,
  rank,
  skipQuestion,
} from './engine';
import { parseFreeText } from './freeText';

const dishes = dishesJson as Dish[];
const fixed = () => 0.5;

describe('data', () => {
  it('has about 60 dishes with valid attributes', () => {
    expect(dishes.length).toBeGreaterThanOrEqual(55);
    const names = new Set(dishes.map((d) => d.name));
    expect(names.size).toBe(dishes.length);
    for (const d of dishes) {
      for (const q of QUESTIONS) {
        const allowed = new Set(QUESTIONS.filter((x) => x.attr === q.attr).flatMap((x) => x.options.map((o) => o.value)));
        const vals = ([] as string[]).concat(d[q.attr] as string | string[]);
        expect(vals.length, `${d.name}.${q.attr}`).toBeGreaterThan(0);
        for (const v of vals) expect(allowed.has(v), `${d.name}.${q.attr}=${v}`).toBe(true);
      }
    }
  });

  it('keywords only map to known attribute values', () => {
    for (const [word, tags] of Object.entries(keywords)) {
      for (const [attr, value] of Object.entries(tags)) {
        const ok = QUESTIONS.some((q) => q.attr === attr && q.options.some((o) => o.value === value));
        expect(ok, `${word} -> ${attr}:${value}`).toBe(true);
      }
    }
  });
});

describe('akinator mode', () => {
  it('runs from start to a result within 8 questions, always offering 2-5 options', () => {
    // 毎回先頭の選択肢を選ぶ／スキップを混ぜる、のパターンで最後まで進める
    for (const strategy of ['first', 'last', 'skip-odd'] as const) {
      let s = createSession(dishes, fixed);
      let guard = 0;
      while (!isFinished(dishes, s)) {
        const q = nextQuestion(dishes, s)!;
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(q.options.length).toBeLessThanOrEqual(5);
        if (strategy === 'skip-odd' && s.askedCount % 2 === 1) s = skipQuestion(s, q.def);
        else s = answerQuestion(s, q.def, strategy === 'last' ? q.options.at(-1)!.value : q.options[0].value);
        expect(++guard).toBeLessThanOrEqual(MAX_QUESTIONS);
      }
      expect(rank(dishes, s).length).toBe(dishes.length);
    }
  });

  it('adds score for matches and subtracts for mismatches', () => {
    let s = createSession(dishes, fixed);
    const temp = QUESTIONS.find((q) => q.id === 'temp')!;
    s = answerQuestion(s, temp, '冷');
    const r = rank(dishes, s);
    expect(r[0].score).toBe(1);
    expect(r.at(-1)!.score).toBe(-1);
    expect(candidates(dishes, s).every((d) => d.temp === '冷')).toBe(true);
  });

  it('skip does not change scores', () => {
    let s = createSession(dishes, fixed);
    s = skipQuestion(s, QUESTIONS[0]);
    expect(rank(dishes, s).every((r) => r.score === 0)).toBe(true);
    expect(nextQuestion(dishes, s)!.def.id).not.toBe(QUESTIONS[0].id);
  });

  it('"違う！" excludes the dish and shows the next one', () => {
    let s = createSession(dishes, fixed);
    const first = rank(dishes, s)[0].dish.name;
    s = excludeDish(s, first);
    expect(rank(dishes, s)[0].dish.name).not.toBe(first);
    expect(rank(dishes, s).some((r) => r.dish.name === first)).toBe(false);
  });
});

describe('free text', () => {
  const tagsOf = (text: string) =>
    parseFreeText(text, keywords).answers.map((a) => `${a.negate ? '!' : ''}${a.attr}:${a.value}`);

  it('reads the example phrases', () => {
    expect(tagsOf('こってりした肉系')).toEqual(['taste:こってり', 'main:肉']);
    expect(tagsOf('あったかくてさっぱり')).toEqual(['temp:温', 'taste:さっぱり']);
    expect(tagsOf('麺で辛いの')).toEqual(['main:麺', 'taste:辛い']);
  });

  it('handles negation of the preceding keyword', () => {
    expect(tagsOf('肉じゃなくて魚')).toEqual(['!main:肉', 'main:魚']);
    expect(tagsOf('辛くないもの')).toEqual(['!taste:辛い']);
    expect(tagsOf('中華以外で')).toEqual(['!genre:中']);
    expect(tagsOf('辛いのは嫌')).toEqual(['!taste:辛い']);
    expect(tagsOf('甘辛いのがいい')).toEqual(['taste:甘辛']);
  });

  it('returns nothing for unknown phrases', () => {
    expect(tagsOf('なんでもいい')).toEqual([]);
  });

  it('marks positive attributes as asked and continues with the rest', () => {
    let s = createSession(dishes, fixed);
    s = applyAnswers(s, parseFreeText('こってりした肉系', keywords).answers);
    expect(questionLimit(s)).toBe(QUESTIONS.length - 2);
    const asked: string[] = [];
    while (!isFinished(dishes, s)) {
      const q = nextQuestion(dishes, s)!;
      asked.push(q.def.id);
      s = answerQuestion(s, q.def, q.options[0].value);
    }
    expect(asked).not.toContain('taste');
    expect(asked).not.toContain('main_protein');
    const top = rank(dishes, s)[0].dish;
    expect(top.taste).toContain('こってり');
    expect(top.main).toContain('肉');
  });

  it('negated values are removed from later options', () => {
    let s = createSession(dishes, fixed);
    s = applyAnswers(s, parseFreeText('辛くないもの', keywords).answers);
    const taste = candidates(dishes, s);
    expect(taste.every((d) => !d.taste.includes('辛い'))).toBe(true);
    const q = nextQuestion(dishes, s);
    if (q?.def.id === 'taste') expect(q.options.map((o) => o.value)).not.toContain('辛い');
  });
});
