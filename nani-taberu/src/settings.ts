import type { RecipeTarget } from './logic/search';
import type { FatOrder } from './logic/engine';
import { TOOLS, type Tool } from './logic/types';

/** 端末内（localStorage）だけに保存する設定 */
export interface Settings {
  recipeSearch: RecipeTarget;
  /** 「器具で絞り込む」スイッチ（初期値オン） */
  useToolFilter: boolean;
  /** 脂質とカロリーが食い違うときの優先 */
  fatCalorieOrder: FatOrder;
  /** スイーツに引き継ぐ方針の範囲（食事で選んだとおり＝脂質＋カロリー／脂質のみ） */
  sweetCarryOver: 'fatAndCalorie' | 'fatOnly';
}

/** プロフィール（今回は持っている調理器具だけ。未登録は undefined） */
export interface Profile {
  tools?: Tool[];
}

const SETTINGS_KEY = 'nani-taberu:settings';
const PROFILE_KEY = 'nani-taberu:profile';
const PANTRY_KEY = 'nani-taberu:pantry';
export const DEFAULT_SETTINGS: Settings = {
  recipeSearch: 'google',
  useToolFilter: true,
  fatCalorieOrder: 'fatFirst',
  sweetCarryOver: 'fatAndCalorie',
};

function read<T>(key: string): Partial<T> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<T>) : {};
  } catch {
    return {};
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できない環境（プライベートモードなど）では、この起動中だけ有効
  }
}

export function loadSettings(): Settings {
  const p = read<Settings>(SETTINGS_KEY);
  return {
    recipeSearch: ['google', 'cookpad', 'youtube'].includes(p.recipeSearch ?? '')
      ? (p.recipeSearch as RecipeTarget)
      : DEFAULT_SETTINGS.recipeSearch,
    useToolFilter: typeof p.useToolFilter === 'boolean' ? p.useToolFilter : DEFAULT_SETTINGS.useToolFilter,
    fatCalorieOrder: ['fatFirst', 'calorieFirst', 'equal'].includes(p.fatCalorieOrder ?? '')
      ? (p.fatCalorieOrder as FatOrder)
      : DEFAULT_SETTINGS.fatCalorieOrder,
    sweetCarryOver: p.sweetCarryOver === 'fatOnly' ? 'fatOnly' : 'fatAndCalorie',
  };
}

export const saveSettings = (s: Settings) => write(SETTINGS_KEY, s);

export function loadProfile(): Profile {
  const p = read<Profile>(PROFILE_KEY);
  return Array.isArray(p.tools) ? { ...p, tools: p.tools.filter((t): t is Tool => TOOLS.includes(t)) } : {};
}

export function saveProfile(p: Profile): void {
  write(PROFILE_KEY, { ...read<Profile>(PROFILE_KEY), ...p });
}

/** 家にあるもの（「これにする」後の画面で選ぶ。次回の初期値にする） */
export function loadPantry(): string[] {
  try {
    const raw = localStorage.getItem(PANTRY_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const savePantry = (items: string[]) => write(PANTRY_KEY, items);
