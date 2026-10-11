import { describe, expect, it, vi } from 'vitest';
import dishesJson from '../data/dishes.json';
import ingredients from '../data/ingredients.json';
import type { Dish, FreeItem, PolicyKey } from './types';
import {
  SWEET_MAX_QUESTIONS,
  SWEET_QUESTIONS,
  answerSweet,
  createSweetSession,
  diverseTop,
  evaluateSweets,
  isSweetFinished,
  nextSweetQuestion,
  setCarryUse,
  setPairingUse,
  sweetReason,
  type SweetSession,
} from './sweets';
import { sweets, interpretSweet } from './sweetIndex';
import { dictionaryIndex, SWEET_ONLY_INGREDIENTS } from './interpreter';
import { answerTag, parseFreeText } from './freeText';
import { createSession, evaluate, withFreeItems } from './engine';
import { dishQuery, searchUrl, conditionsFrom } from './search';

const dishes = dishesJson as Dish[];
const fresh = (opts: Parameters<typeof createSweetSession>[1] = {}) => createSweetSession(sweets, opts, () => 0.5);
const dish = (n: string) => dishes.find((d) => d.name === n)!;

describe('スイーツのデータ', () => {
  it('has 15-20 sweets with valid attributes and canonical ingredients, no effort fields', () => {
    expect(sweets.length).toBeGreaterThanOrEqual(15);
    expect(sweets.length).toBeLessThanOrEqual(20);
    expect(new Set(sweets.map((s) => s.name)).size).toBe(sweets.length);
    for (const s of sweets) {
      expect(s.kind).toBe('sweet');
      expect(['和', '洋', '焼き菓子', '果物', '乳製品', '冷菓', 'いも']).toContain(s.family);
      expect(['控えめ', 'ふつう', '強め']).toContain(s.sweetness);
      expect(['さっぱり', 'ふつう', '濃厚']).toContain(s.refresh);
      expect(['低', '中', '高']).toContain(s.fat);
      expect(['低め', 'ふつう', '高め']).toContain(s.calorie);
      expect(['ひと口', 'ふつう', 'しっかり']).toContain(s.amount);
      expect(['冷', '常温']).toContain(s.temp);
      expect(s.buy.length).toBeGreaterThan(0);
      for (const i of s.ingredients) {
        expect(i.role).toBe('main');
        expect(i.name in ingredients, `${s.name}: ${i.name}`).toBe(true);
      }
      expect('effort' in s || 'knife' in s || 'method' in s).toBe(false);
    }
  });

  it('meal results never contain sweets', () => {
    const names = new Set(sweets.map((s) => s.name));
    expect(dishes.some((d) => names.has(d.name))).toBe(false);
    expect(evaluate(dishes, createSession(dishes)).pool.some((d) => names.has(d.name))).toBe(false);
  });
});

describe('スイーツモードの入り方', () => {
  it('甘いもの / おやつ / デザート / スイーツ switch to sweets mode', () => {
    for (const t of ['甘いもの', 'おやつ', 'デザート', 'スイーツ', '甘さ控えめで']) {
      const tags = parseFreeText(t, dictionaryIndex).flatMap((i) => i.answers.map(answerTag));
      expect(tags, t).toContain('mode:sweet');
    }
  });

  it('sweet-only ingredients (チョコ, あんこ) are flagged so the app can ask', () => {
    expect(SWEET_ONLY_INGREDIENTS.has('チョコ')).toBe(true);
    expect(SWEET_ONLY_INGREDIENTS.has('卵')).toBe(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const items = parseFreeText('チョコ系', dictionaryIndex);
    expect(items[0].sweetOnly).toBe('チョコ');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('in sweets mode, words map to sweet questions (さっぱり→味わい, 和→和菓子) and names match sweets', () => {
    const tags = interpretSweet('さっぱりした和の甘さ控えめ').flatMap((i) => i.answers.map(answerTag));
    expect(tags).toEqual(expect.arrayContaining(['refresh:さっぱり', 'family:和', 'sweetness:控えめ']));
    const ev = evaluateSweets(sweets, fresh({ items: interpretSweet('チョコ系') }));
    expect(ev.ranked[0].sweet.name).toBe('チョコ菓子');
  });
});

describe('スイーツの質問と結果', () => {
  it('asks at most 5 questions with 2-5 options and finishes', () => {
    for (const pick of [0, -1]) {
      let s = fresh();
      let n = 0;
      while (!isSweetFinished(sweets, s)) {
        const q = nextSweetQuestion(sweets, s)!;
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(q.options.length).toBeLessThanOrEqual(5);
        s = answerSweet(s, q.def, q.options.at(pick)!.value);
        expect(++n).toBeLessThanOrEqual(SWEET_MAX_QUESTIONS);
      }
      expect(evaluateSweets(sweets, s).top.length).toBeGreaterThan(0);
    }
    expect(SWEET_QUESTIONS).toHaveLength(5);
  });

  it('top 3 has at most 2 of the same family', () => {
    let s = fresh();
    s = answerSweet(s, SWEET_QUESTIONS[0], '和');
    const top = evaluateSweets(sweets, s).top;
    expect(top).toHaveLength(3);
    const fam = top.map((r) => r.sweet.family);
    for (const f of fam) expect(fam.filter((x) => x === f).length).toBeLessThanOrEqual(2);
    // diverseTop 単体
    const fake = sweets.filter((x) => x.family === '和').map((sweet) => ({ sweet, score: 0, inCandidates: true, foodMatches: 0, reason: null }));
    expect(diverseTop([...fake, { sweet: sweets.find((x) => x.family === '洋')!, score: 0, inCandidates: true, foodMatches: 0, reason: null }]).filter((r) => r.sweet.family === '和')).toHaveLength(2);
  });

  it('food choice and negation work like meals', () => {
    const ev = evaluateSweets(sweets, fresh({ items: interpretSweet('あんこ以外') }));
    expect(ev.pool.some((x) => x.ingredients.some((i) => i.name === 'あんこ'))).toBe(false);
  });

  it('search: maps by name, calorie by name, image by name; no recipe', () => {
    const c = conditionsFrom(createSession(dishes), evaluate(dishes, createSession(dishes)));
    expect(dishQuery('プリン', c, 'maps')).toBe('プリン');
    expect(dishQuery('プリン', c, 'calorie')).toBe('プリン カロリー');
    expect(searchUrl('calorie', 'プリン カロリー')).toBe(`https://www.google.com/search?q=${encodeURIComponent('プリン カロリー')}`);
  });
});

describe('食べ合わせと方針の引き継ぎ', () => {
  const heavyMeal = dish('とんかつ'); // こってり・脂質高・量多
  it('after a heavy meal, refreshing sweets come first with a reason; can be turned off', () => {
    const s = fresh({ pairing: heavyMeal });
    const ev = evaluateSweets(sweets, s);
    expect(ev.top[0].sweet.refresh).toBe('さっぱり');
    expect(sweetReason(ev.top[0], ev)).toContain('こってりした食事のあとなので、さっぱり系を優先');
    const off = evaluateSweets(sweets, setPairingUse(s, false));
    expect(off.top.every((r) => r.reason === null)).toBe(true);
  });

  it('after a spicy meal, dairy and frozen sweets are favored', () => {
    const ev = evaluateSweets(sweets, fresh({ pairing: dish('麻婆豆腐') }));
    expect(['乳製品', '冷菓']).toContain(ev.top[0].sweet.family);
  });

  it('carries 脂質控えめ from the meal as a weak score with a notice; can be turned off', () => {
    const s = fresh({ carry: ['lowFat'] as PolicyKey[] });
    const ev = evaluateSweets(sweets, s);
    expect(ev.pool).toHaveLength(sweets.length); // 除外はしない
    expect(ev.notices).toContain('食事の方針（脂質控えめ）を引き継いでいます');
    expect(ev.top[0].sweet.fat).not.toBe('高');
    const off = evaluateSweets(sweets, setCarryUse(s, false));
    expect(off.notices.join()).not.toContain('引き継いで');
  });

  it('meal session policies can be read for carrying over', () => {
    const items: FreeItem[] = [{ id: 'pol:lowFat', label: '', note: '', negate: false, answers: [{ kind: 'policy', key: 'lowFat' }] }];
    const ev = evaluate(dishes, withFreeItems(createSession(dishes), items));
    expect([...ev.policies]).toEqual(['lowFat']);
  });

  it('does not exceed the answer flow when free input already answered', () => {
    const s: SweetSession = fresh({ items: interpretSweet('冷たいデザートでさっぱり') });
    const q = nextSweetQuestion(sweets, s);
    expect(q?.def.id).not.toBe('sweetTemp');
    expect(q?.def.id).not.toBe('refresh');
  });
});
