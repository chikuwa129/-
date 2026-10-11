import type { FreeItem } from './types';
import { buildIndex, parseFreeText, type CategoryDict, type IngredientDict, type KeywordDict } from './freeText';
import { sweetMapAttr, type Sweet } from './sweets';
import keywords from '../data/keywords.json';
import ingredients from '../data/ingredients.json';
import categories from '../data/categories.json';
import sweetsJson from '../data/sweets.json';

export const sweets = sweetsJson as Sweet[];

/** スイーツモード用の辞書（名前照合は sweets.json、属性語はスイーツの質問に当てはめる） */
export const sweetIndex = buildIndex(
  {
    keywords: keywords as KeywordDict,
    ingredients: ingredients as IngredientDict,
    categories: categories as CategoryDict,
    dishes: sweets,
  },
  { mapAttr: sweetMapAttr },
);

export const interpretSweet = (text: string): FreeItem[] => parseFreeText(text, sweetIndex);
