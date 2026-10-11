import { describe, expect, it, vi } from 'vitest';
import dishesJson from '../data/dishes.json';
import type { Dish } from './types';
import { createSession, evaluate, withFreeItems, answerQuestion } from './engine';
import { QUESTIONS } from './questions';
import { parseFreeText } from './freeText';
import { dictionaryIndex } from './interpreter';
import {
  MAX_TERMS,
  conditionQuery,
  conditionTerms,
  conditionsFrom,
  dishQuery,
  searchUrl,
  type SearchConditions,
} from './search';

const dishes = dishesJson as Dish[];
const condFor = (text: string) => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const s = withFreeItems(createSession(dishes, () => 0.5), parseFreeText(text, dictionaryIndex));
  warn.mockRestore();
  return conditionsFrom(s, evaluate(dishes, s));
};
const empty: SearchConditions = {
  foods: [],
  negFoods: [],
  effortMax: null,
  knifeNone: false,
  tastes: [],
  temps: [],
  methods: [],
  policies: [],
};

describe('search terms', () => {
  it('builds the spec example: ズッキーニ 炒めるだけ 包丁なし', () => {
    const c = condFor('ズッキーニを炒めるだけ、包丁なしで');
    expect(c.foods).toEqual(['ズッキーニ']);
    expect(conditionQuery(c, 'recipe')).toBe('ズッキーニ 炒めるだけ 簡単 包丁不要 レシピ');
    expect(conditionQuery(c, 'image')).toBe('ズッキーニ 炒めもの 料理');
  });

  it('uses at most 5 condition words, in priority order: food > effort/knife > taste', () => {
    const c: SearchConditions = {
      ...empty,
      foods: ['トマト', '卵', 'チーズ'],
      effortMax: 1,
      knifeNone: true,
      tastes: ['こってり'],
    };
    const terms = conditionTerms(c, 'recipe');
    expect(terms).toHaveLength(MAX_TERMS);
    expect(terms).toEqual(['トマト', '卵', 'チーズ', 'レンジ', '簡単']);
    expect(conditionTerms({ ...c, foods: ['トマト'] }, 'recipe')).toEqual(['トマト', 'レンジ', '簡単', '包丁不要', 'こってり']);
  });

  it('effort words: max 1 → レンジ 簡単, max 2 → 炒めるだけ 簡単, 3 or more → none', () => {
    expect(conditionTerms({ ...empty, effortMax: 1 }, 'recipe')).toEqual(['レンジ', '簡単']);
    expect(conditionTerms({ ...empty, effortMax: 2 }, 'recipe')).toEqual(['炒めるだけ', '簡単']);
    expect(conditionTerms({ ...empty, effortMax: 3 }, 'recipe')).toEqual([]);
    expect(conditionTerms({ ...empty, effortMax: 4 }, 'recipe')).toEqual([]);
  });

  it('adds レシピ only for recipe search', () => {
    const c = { ...empty, foods: ['トマト'] };
    expect(conditionQuery(c, 'recipe')).toBe('トマト レシピ');
    expect(conditionQuery(c, 'image')).not.toContain('レシピ');
    expect(conditionQuery(c, 'maps')).toBe('トマト');
    expect(dishQuery('親子丼', c, 'maps')).toBe('親子丼');
    expect(dishQuery('親子丼', c, 'image')).toBe('親子丼');
    expect(dishQuery('親子丼', c, 'recipe')).toBe('親子丼 レシピ');
  });

  it('puts negated foods as -トマト only for Google', () => {
    const c = condFor('トマト以外でこってり');
    expect(c.negFoods).toEqual(['トマト']);
    expect(conditionQuery(c, 'recipe', 'google')).toBe('こってり レシピ -トマト');
    expect(conditionQuery(c, 'recipe', 'cookpad')).toBe('こってり レシピ');
    expect(conditionQuery(c, 'recipe', 'youtube')).toBe('こってり レシピ');
    expect(dishQuery('とんかつ', c, 'recipe', 'google')).toBe('とんかつ こってり レシピ -トマト');
    expect(dishQuery('とんかつ', c, 'maps')).toBe('とんかつ');
  });

  it('dish recipe search follows the displayed dish and the effort/knife conditions', () => {
    let s = withFreeItems(createSession(dishes, () => 0.5), parseFreeText('包丁なしで', dictionaryIndex));
    s = answerQuestion(s, QUESTIONS[0], '1');
    const c = conditionsFrom(s, evaluate(dishes, s));
    expect(dishQuery('ざるそば', c, 'recipe')).toBe('ざるそば レンジ 簡単 包丁不要 レシピ');
  });

  it('builds URL-encoded links for each target', () => {
    const q = 'トマト 炒めるだけ レシピ';
    const enc = encodeURIComponent(q);
    expect(enc).not.toContain(' ');
    expect(searchUrl('recipe', q)).toBe(`https://www.google.com/search?q=${enc}`);
    expect(searchUrl('recipe', q, 'cookpad')).toBe(`https://cookpad.com/jp/search/${enc}`);
    expect(searchUrl('recipe', q, 'youtube')).toBe(`https://www.youtube.com/results?search_query=${enc}`);
    expect(searchUrl('image', q)).toBe(`https://www.google.com/search?tbm=isch&q=${enc}`);
    expect(searchUrl('maps', '親子丼')).toBe(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('親子丼')}`);
    // & や # を含む入力でも URL が壊れない
    expect(searchUrl('recipe', 'a&b #c')).toBe('https://www.google.com/search?q=a%26b%20%23c');
  });

  it('only passes search words: no profile, history or location fields exist in the conditions', () => {
    const c = condFor('トマトで炒めるだけ');
    expect(Object.keys(c).sort()).toEqual(['effortMax', 'foods', 'knifeNone', 'methods', 'negFoods', 'policies', 'tastes', 'temps']);
  });
});
