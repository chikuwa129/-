import { describe, expect, it } from 'vitest';
import dishesJson from '../data/dishes.json';
import cases from '../../tests/accuracy-cases.json';
import type { Dish } from './types';
import { createSession, evaluate, withFreeItems } from './engine';
import { answerTag, parseFreeText } from './freeText';
import { dictionaryIndex } from './interpreter';

interface Expect {
  tags?: string[];
  noTags?: string[];
  unreadable?: boolean;
  candidatesIncludeIngredient?: string;
  topMainIngredient?: string;
  resultsExcludeIngredient?: string;
  resultsOnlyKnife?: string;
  resultsExcludeFat?: string;
}

const dishes = dishesJson as Dish[];
const uses = (d: Dish, n: string) => d.ingredients.some((i) => i.name === n);

describe('精度改善ケース集（tests/accuracy-cases.json）', () => {
  for (const c of cases.cases as { id: number; input: string; expect: Expect; note: string }[]) {
    it(`#${c.id} 「${c.input}」: ${c.note}`, () => {
      const items = parseFreeText(c.input, dictionaryIndex);
      const tags = items.flatMap((i) => i.answers.map(answerTag));
      const e = c.expect;
      if (e.unreadable) expect(items, '読み取れないはず').toEqual([]);
      for (const t of e.tags ?? []) expect(tags, `拾うはず: ${t}`).toContain(t);
      for (const t of e.noTags ?? []) expect(tags.some((x) => x.startsWith(t)), `拾わないはず: ${t}`).toBe(false);

      const ev = evaluate(dishes, withFreeItems(createSession(dishes, () => 0.5), items));
      if (e.candidatesIncludeIngredient) {
        expect(ev.candidates.some((d) => uses(d, e.candidatesIncludeIngredient!))).toBe(true);
      }
      if (e.topMainIngredient) {
        const top = ev.ranked[0].dish;
        expect(top.ingredients.find((i) => i.name === e.topMainIngredient)?.role, top.name).toBe('main');
      }
      for (const d of ev.pool) {
        if (e.resultsExcludeIngredient) expect(uses(d, e.resultsExcludeIngredient), d.name).toBe(false);
        if (e.resultsOnlyKnife) expect(d.knife, d.name).toBe(e.resultsOnlyKnife);
        if (e.resultsExcludeFat) expect(d.fat, d.name).not.toBe(e.resultsExcludeFat);
      }
    });
  }
});
