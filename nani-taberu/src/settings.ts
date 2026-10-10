import type { RecipeTarget } from './logic/search';

/** 端末内（localStorage）だけに保存する設定 */
export interface Settings {
  recipeSearch: RecipeTarget;
}

const KEY = 'nani-taberu:settings';
export const DEFAULT_SETTINGS: Settings = { recipeSearch: 'google' };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const recipeSearch = ['google', 'cookpad', 'youtube'].includes(parsed.recipeSearch ?? '')
      ? (parsed.recipeSearch as RecipeTarget)
      : DEFAULT_SETTINGS.recipeSearch;
    return { ...DEFAULT_SETTINGS, recipeSearch };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 保存できない環境（プライベートモードなど）では、この起動中だけ有効
  }
}
