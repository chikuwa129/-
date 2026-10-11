import { describe, expect, it } from 'vitest';
import dishesJson from '../data/dishes.json';
import { TOOLS, type Dish, type Tool } from './types';
import { EFFORT_QUESTION } from './questions';
import { answerQuestion, createSession, evaluate, excludeDish, type SessionState } from './engine';
import { reasonLine } from './display';
import { dishQuery, searchUrl, SHOP_QUERY, conditionsFrom } from './search';

const dishes = dishesJson as Dish[];
const withTools = (tools: Tool[] | null) => createSession(dishes, () => 0.5, { tools });
const names = (s: SessionState) => evaluate(dishes, s).pool.map((d) => d.name);

describe('調理器具のデータ', () => {
  it('every dish has valid required/optional tools that do not overlap, cook minutes and washing', () => {
    for (const d of dishes) {
      expect(d.kind).toBe('meal');
      for (const t of [...d.toolsRequired, ...d.toolsOptional]) expect(TOOLS, d.name).toContain(t);
      expect(d.toolsRequired.filter((t) => d.toolsOptional.includes(t)), d.name).toEqual([]);
      expect(d.cookMinutes, d.name).toBeGreaterThan(0);
      expect(['少', '普', '多']).toContain(d.washing);
    }
  });
});

describe('器具による絞り込み', () => {
  it('unregistered tools (null) never filter', () => {
    expect(evaluate(dishes, withTools(null)).pool).toHaveLength(63);
  });

  it('dishes needing a tool you do not have are excluded', () => {
    const s = withTools(['電子レンジ', 'フライパン', '炊飯器']);
    const pool = evaluate(dishes, s).pool;
    expect(pool.length).toBeGreaterThanOrEqual(3);
    for (const d of pool) for (const t of d.toolsRequired) expect(['電子レンジ', 'フライパン', '炊飯器'], d.name).toContain(t);
    expect(names(s)).not.toContain('たこ焼き'); // ホットプレートが必須
    expect(names(s)).not.toContain('ざるそば'); // 鍋が必須
  });

  it('is not relaxed when few dishes remain, and says so honestly', () => {
    // 器具なしで作れる料理を1品だけ残す
    let s = withTools([]);
    const noTool = dishes.filter((d) => d.toolsRequired.length === 0).map((d) => d.name);
    for (const n of noTool.slice(1)) s = excludeDish(s, n);
    const ev = evaluate(dishes, s);
    expect(ev.pool.map((d) => d.name)).toEqual([noTool[0]]);
    expect(ev.pool.length).toBeLessThan(3);
    expect(ev.toolShort).toBe(true);
    expect(ev.notices).toContain(`持っている器具で作れる料理は${ev.pool.length}品でした`);
  });

  it('takeout/deli dishes (level 0) are not filtered by tools', () => {
    const s = answerQuestion(withTools([]), EFFORT_QUESTION, '0');
    const ev = evaluate(dishes, s);
    expect(ev.pool.map((d) => d.name)).toEqual(expect.arrayContaining(['たこ焼き', 'ラーメン']));
  });

  it('missing optional tools lower the rank a little and appear in the reason', () => {
    const s = withTools(['フライパン']);
    const ev = evaluate(dishes, s);
    const oyako = dishes.find((d) => d.name === '親子丼')!;
    expect(reasonLine(oyako, ev)).toContain('炊飯器があるともっと楽です');
    const score = (n: string) => ev.ranked.find((r) => r.dish.name === n)!.score;
    expect(score('親子丼')).toBeLessThan(score('回鍋肉')); // 回鍋肉はあれば便利な器具なし
  });

  it('excluded dishes stay excluded together with the tool filter', () => {
    let s = withTools(['フライパン', '鍋']);
    s = excludeDish(s, '親子丼');
    expect(names(s)).not.toContain('親子丼');
  });
});

describe('説明画面の検索', () => {
  const c = conditionsFrom(withTools(null), evaluate(dishes, withTools(null)));
  it('材料・分量 uses the recipe target; shop search is スーパー on maps', () => {
    expect(dishQuery('親子丼', c, 'ingredients')).toBe('親子丼 材料 分量');
    expect(searchUrl('ingredients', '親子丼 材料 分量', 'youtube')).toContain('youtube.com/results?search_query=');
    expect(searchUrl('maps', SHOP_QUERY)).toBe(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('スーパー')}`);
    expect(dishQuery('親子丼', c, 'ingredients').split(' ').length).toBeLessThanOrEqual(5);
  });
});
