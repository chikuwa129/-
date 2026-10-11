import type { Dish, FreeItem } from './types';
import { buildIndex, parseFreeText, type CategoryDict, type IngredientDict, type KeywordDict } from './freeText';
import keywords from '../data/keywords.json';
import ingredients from '../data/ingredients.json';
import categories from '../data/categories.json';
import dishes from '../data/dishes.json';
import sweets from '../data/sweets.json';

/**
 * フリー入力の解釈器。今は辞書ベースだけだが、将来 LLM API で
 * 入力文を属性タグに変換する実装を同じインターフェースで差し込めるようにしている。
 * 入力文はどこにも保存しない。
 */
export interface FreeTextInterpreter {
  interpret(text: string): Promise<FreeItem[]>;
}

/** スイーツでしか使わない食材（食事で入力されたら「甘いものとして探しますか？」と聞く） */
const mealIngredients = new Set((dishes as Dish[]).flatMap((d) => d.ingredients.map((i) => i.name)));
export const SWEET_ONLY_INGREDIENTS = new Set(
  sweets.flatMap((s) => s.ingredients.map((i) => i.name)).filter((n) => !mealIngredients.has(n)),
);

export const dictionaryIndex = buildIndex(
  {
    keywords: keywords as KeywordDict,
    ingredients: ingredients as IngredientDict,
    categories: categories as CategoryDict,
    dishes: dishes as Dish[],
  },
  { otherModeIngredients: SWEET_ONLY_INGREDIENTS },
);

export const dictionaryInterpreter: FreeTextInterpreter = {
  async interpret(text) {
    return parseFreeText(text, dictionaryIndex);
  },
};
