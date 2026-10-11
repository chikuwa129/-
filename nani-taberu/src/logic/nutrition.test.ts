import { describe, expect, it } from 'vitest';
import dishesJson from '../data/dishes.json';
import type { Dish, FreeItem, PolicyKey } from './types';
import { QUESTIONS, MAX_QUESTIONS } from './questions';
import {
  FAT_RELAX_NOTICE,
  createSession,
  evaluate,
  excludeDish,
  fitsLowFatBig,
  policyScore,
  withFreeItems,
  type SessionState,
} from './engine';
import { nutritionBadges, reasonLine } from './display';
import { parseFreeText } from './freeText';
import { dictionaryIndex } from './interpreter';
import { conditionTerms, conditionsFrom } from './search';

const dishes = dishesJson as Dish[];
const pol = (...keys: PolicyKey[]): FreeItem[] =>
  keys.map((key) => ({ id: `pol:${key}`, label: key, note: '', negate: false, answers: [{ kind: 'policy', key }] }));
const withPolicies = (keys: PolicyKey[], s: SessionState = createSession(dishes, () => 0.5)) =>
  withFreeItems(s, [...s.freeItems, ...pol(...keys)]);

describe('量・脂質・カロリーのデータ', () => {
  it('every dish has amount, fat and calorie (no weight any more)', () => {
    for (const d of dishes) {
      expect(['少', '普', '多']).toContain(d.amount);
      expect(['低', '中', '高']).toContain(d.fat);
      expect(['低め', 'ふつう', '高め']).toContain(d.calorie);
      expect('weight' in d, d.name).toBe(false);
    }
  });

  it('the weight question became the amount question; still 8 questions in total', () => {
    expect(QUESTIONS.map((q) => q.id)).toContain('amount');
    expect(QUESTIONS.map((q) => q.id)).not.toContain('weight');
    expect(QUESTIONS).toHaveLength(MAX_QUESTIONS);
  });

  it('reports how many dishes fit both 脂質控えめ and 量しっかり', () => {
    expect(dishes.filter(fitsLowFatBig).map((d) => d.name).sort()).toEqual(['しゃぶしゃぶ', '寄せ鍋'].sort());
  });
});

describe('今日の方針', () => {
  it('脂質控えめ excludes fat 高', () => {
    const ev = evaluate(dishes, withPolicies(['lowFat']));
    expect(ev.pool.length).toBeGreaterThanOrEqual(3);
    expect(ev.pool.every((d) => d.fat !== '高')).toBe(true);
    expect(ev.ranked[0].dish.fat).toBe('低');
  });

  it('脂質控えめ is relaxed to a penalty when fewer than 3 remain, with the notice', () => {
    let s = withPolicies(['lowFat']);
    for (const d of dishes.filter((x) => x.fat !== '高').slice(2)) s = excludeDish(s, d.name);
    const ev = evaluate(dishes, s);
    expect(ev.fatRelaxed).toBe(true);
    expect(ev.notices).toContain(FAT_RELAX_NOTICE);
    expect(ev.pool.some((d) => d.fat === '高')).toBe(true);
    // 脂質「高」は下位
    expect(ev.ranked[0].dish.fat).not.toBe('高');
  });

  it('relaxes when the food choice would vanish (唐揚げ is fat 高)', () => {
    const s = withFreeItems(createSession(dishes, () => 0.5), [...parseFreeText('唐揚げ', dictionaryIndex), ...pol('lowFat')]);
    const ev = evaluate(dishes, s);
    expect(ev.fatRelaxed).toBe(true);
    expect(ev.pool.map((d) => d.name)).toContain('唐揚げ');
  });

  it('カロリー控えめ only scores (no exclusion)', () => {
    const ev = evaluate(dishes, withPolicies(['lowCalorie']));
    expect(ev.pool).toHaveLength(63);
    expect(ev.ranked[0].dish.calorie).toBe('低め');
  });

  it('脂質控えめ + 量はしっかり put dishes fitting both first and say how few there are', () => {
    const ev = evaluate(dishes, withPolicies(['lowFat', 'bigAmount']));
    expect(ev.ranked.slice(0, 2).map((r) => r.dish.name).sort()).toEqual(['しゃぶしゃぶ', '寄せ鍋'].sort());
    expect(ev.policyShort).toBe(true);
    expect(ev.notices).toContain('脂質控えめで量もしっかりの条件に合う料理は2品でした。近い料理も入れています');
    expect(reasonLine(ev.ranked[0].dish, ev)).toContain('脂質低めで量もしっかりです');
  });

  it('fat/calorie order changes the weights', () => {
    const d = dishes.find((x) => x.fat === '中' && x.calorie === '低め')!;
    const both = new Set<PolicyKey>(['lowFat', 'lowCalorie']);
    expect(policyScore(d, both, 'calorieFirst')).toBeGreaterThan(policyScore(d, both, 'fatFirst'));
  });

  it('free words: ガッツリ → amount 多, あっさり → lowFat, ヘルシー → both, 低カロリー → lowCalorie', () => {
    const tags = (t: string) => parseFreeText(t, dictionaryIndex).flatMap((i) => i.answers.map((a) => (a.kind === 'policy' ? a.key : a.kind === 'attr' ? `${a.attr}:${a.value}` : a.kind)));
    expect(tags('ガッツリ')).toEqual(['amount:多']);
    expect(tags('お腹いっぱい食べたい')).toEqual(['amount:多']);
    expect(tags('軽め')).toEqual(['amount:少']);
    expect(tags('あっさり')).toEqual(['lowFat']);
    expect(tags('ヘルシー')).toEqual(['lowFat', 'lowCalorie']);
    expect(tags('低カロリー')).toEqual(['lowCalorie']);
  });

  it('badges never say ヘルシー; search adds ヘルシー / 低カロリー after effort words', () => {
    for (const d of dishes) expect(nutritionBadges(d).join()).not.toContain('ヘルシー');
    const s = withPolicies(['lowFat', 'lowCalorie'], withFreeItems(createSession(dishes, () => 0.5), parseFreeText('トマトでこってり', dictionaryIndex)));
    const c = conditionsFrom(s, evaluate(dishes, s));
    expect(conditionTerms(c, 'recipe')).toEqual(['トマト', 'ヘルシー', '低カロリー', 'こってり']);
  });
});
