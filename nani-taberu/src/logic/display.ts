import type { Dish } from './types';
import { foodMatch, missingOptionalTools, type Evaluation } from './engine';
import { isDeliDish } from './effort';

/** 外食・お惣菜向きとして出している料理か（レベル0を含む範囲で、自炊の範囲外） */
function shownAsDeli(d: Dish, ev: Evaluation): boolean {
  const r = ev.effort;
  if (!r || !r.deli || !isDeliDish(d)) return false;
  return !r.cook || d.effort < r.cook.min || d.effort > r.cook.max;
}

/** 手間のバッジ（［炒めるだけ］など） */
export function effortBadge(d: Dish): string {
  const m = d.method;
  switch (d.effort) {
    case 1:
      return m.includes('茹でる') ? '茹でるだけ' : m.includes('温める') ? '温めるだけ' : '混ぜるだけ';
    case 2:
      if (m.includes('炒める')) return '炒めるだけ';
      if (m.includes('焼く')) return '焼くだけ';
      if (m.includes('煮る')) return '煮るだけ';
      if (m.includes('茹でる')) return m.includes('和える') || m.includes('混ぜる') ? '茹でて和えるだけ' : '茹でるだけ';
      return 'のせる・和えるだけ';
    case 3:
      return 'ふつうに作る';
    default:
      return '手間をかける';
  }
}

export function badges(d: Dish, ev: Evaluation): string[] {
  const out = [effortBadge(d)];
  if (d.knife === '不要') out.push('包丁なし');
  else if (d.knife === '少し') out.push('包丁ちょっと');
  if (shownAsDeli(d, ev)) out.push(d.deliAlt ? 'お惣菜OK' : '外食向き');
  return out;
}

function joinTo(labels: string[]): string {
  return labels.join('と');
}

/** 食材・料理名の指定に当たった理由 */
function foodReason(d: Dish, ev: Evaluation): string | null {
  const mains: string[] = [];
  const subs: string[] = [];
  const names: string[] = [];
  const fallbacks: string[] = [];
  for (const a of ev.foodAnswers) {
    const m = foodMatch(d, a.target);
    if (m && a.target.type === 'category' && a.target.fallbackFor) {
      fallbacks.push(`${a.target.fallbackFor}の代わりに、${a.target.category}を使う料理です`);
      continue;
    }
    if (m === 'main') mains.push(a.label);
    else if (m === 'sub') subs.push(a.label);
    else if (m === 'name') names.push(a.label);
  }
  if (names.length) return `『${names.join('』『')}』の料理です`;
  if (mains.length && subs.length) return `${joinTo(mains)}が主役で、${joinTo(subs)}も使う料理です`;
  if (mains.length) return `${joinTo(mains)}が主役の料理です`;
  if (subs.length) return `${joinTo(subs)}を少し使う料理です`;
  return fallbacks[0] ?? null;
}

/** やる気度を指定したときの理由 */
function effortReason(d: Dish, ev: Evaluation): string | null {
  if (ev.effort === null) return null;
  if (shownAsDeli(d, ev)) return d.deliAlt ? 'お惣菜やお弁当で買いやすい料理です' : '外食で済ませやすい料理です';
  const m = d.method;
  switch (d.effort) {
    case 1:
      return m.includes('茹でる') ? 'お湯で茹でるだけです' : m.includes('温める') ? '温めるだけで食べられます' : '混ぜるだけです';
    case 2:
      if (m.includes('炒める')) return 'フライパン1つで炒めるだけです';
      if (m.includes('焼く')) return 'フライパンで焼くだけです';
      if (m.includes('煮る')) return '鍋1つで煮るだけです';
      if (m.includes('茹でる')) return m.includes('和える') || m.includes('混ぜる') ? '茹でて和えるだけです' : '茹でるだけです';
      return 'のせる・和えるだけです';
    case 3:
      return 'ふつうの手間で作れます';
    default:
      return '手間をかける価値のある一品です';
  }
}

/** 結果画面の理由（1行） */
export function reasonLine(d: Dish, ev: Evaluation): string | null {
  const parts = [foodReason(d, ev), effortReason(d, ev), policyReason(d, ev)];
  if (ev.knife && d.knife === '不要') parts.push('包丁を使いません');
  const lacking = missingOptionalTools(d, ev.tools);
  if (lacking.length) parts.push(`${lacking.join('や')}があるともっと楽です`);
  const line = parts.filter(Boolean).join('。');
  return line ? line + '。' : null;
}

/** 脂質・カロリーのバッジ（目安。「ヘルシー」とは断定しない） */
export function nutritionBadges(d: { fat: string; calorie: string }): string[] {
  const out: string[] = [];
  if (d.fat === '低') out.push('脂質低め');
  else if (d.fat === '高') out.push('脂質多め');
  if (d.calorie === '低め') out.push('カロリー控えめ');
  else if (d.calorie === '高め') out.push('カロリー高め');
  return out;
}

/** 今日の方針に関する理由 */
export function policyReason(d: Dish, ev: Evaluation): string | null {
  const p = ev.policies;
  if (p.has('lowFat') && p.has('bigAmount') && d.fat === '低' && d.amount === '多') return '脂質低めで量もしっかりです';
  const segs: string[] = [];
  if (p.has('lowFat') && d.fat === '低') segs.push('脂質控えめ');
  if ((p.has('lowCalorie') || p.has('lowFat')) && d.calorie === '低め') segs.push(segs.length ? 'カロリーも低め' : 'カロリー控えめ');
  if (p.has('bigAmount') && d.amount === '多') segs.push(segs.length ? '量もしっかり' : '量しっかり');
  return segs.length ? `${segs.join('・')}です` : null;
}

export const NUTRITION_NOTE = '脂質・カロリーは料理名からの目安です。正確な数値は［カロリーを調べる］で確認を（栄養指導ではありません）。';
