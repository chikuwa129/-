import type { EffortSel } from './effort';

export type Genre = '和' | '洋' | '中' | '韓' | 'エスニック';
/** 量（ガッツリ＝多） */
export type Amount = '少' | '普' | '多';
/** 脂質の目安（旧 oily） */
export type Fat = '低' | '中' | '高';
/** カロリーの目安（数値は持たない） */
export type Calorie = '低め' | 'ふつう' | '高め';
/** 今日の方針 */
export type PolicyKey = 'lowFat' | 'lowCalorie' | 'bigAmount';
export type Temp = '温' | '冷';
export type Taste = 'さっぱり' | 'こってり' | '辛い' | '甘辛';
export type Main = '肉' | '魚' | '野菜' | '麺' | '米' | '粉';
export type Style = '自炊' | '外食';
export type Knife = '不要' | '少し' | '必要';
export type Method = '温める' | '茹でる' | '炒める' | '焼く' | '煮る' | '揚げる' | '和える' | '混ぜる';
/** やる気レベル。0=作りたくない … 4=凝りたい */
export type EffortLevel = 0 | 1 | 2 | 3 | 4;
/** 調理器具（包丁・まな板は含めない。包丁は knife で扱う） */
export type Tool = '電子レンジ' | 'フライパン' | '鍋' | 'トースター' | '炊飯器' | 'オーブン' | 'ホットプレート';
export const TOOLS: Tool[] = ['電子レンジ', 'フライパン', '鍋', 'トースター', '炊飯器', 'オーブン', 'ホットプレート'];

export interface DishIngredient {
  /** ingredients.json の正規名 */
  name: string;
  role: 'main' | 'sub';
}

export interface Dish {
  name: string;
  aliases: string[];
  kind: 'meal';
  genre: Genre;
  amount: Amount;
  fat: Fat;
  calorie: Calorie;
  temp: Temp;
  taste: Taste[];
  main: Main[];
  style: Style[];
  /** お惣菜・外食で代替しやすいか */
  deliAlt: boolean;
  /** 必要な手間レベル（1〜4） */
  effort: 1 | 2 | 3 | 4;
  knife: Knife;
  method: Method[];
  /** なければ作れない器具 */
  toolsRequired: Tool[];
  /** あれば便利、なくても代わりがある器具 */
  toolsOptional: Tool[];
  /** 調理時間の目安（分） */
  cookMinutes: number;
  /** 洗い物の多さ */
  washing: '少' | '普' | '多';
  ingredients: DishIngredient[];
}

/** スコアの加減算に使う属性。method は質問はしないがフリー入力（「茹でるだけ」）で効く */
export type Attr = 'genre' | 'amount' | 'temp' | 'taste' | 'main' | 'style' | 'method';

export type FoodTarget =
  | { type: 'ingredient'; name: string }
  | { type: 'category'; category: string; /** データにない食材の代わりに使う場合の元の食材名 */ fallbackFor?: string }
  | { type: 'dish'; word: string };

/**
 * 回答1件。質問への回答もフリー入力の解釈結果も同じ形で扱う。
 * - attr: 属性の一致で ±1（negate=true は「それ以外がいい」）
 * - effort: やる気度による絞り込み（effort.ts の EffortSel：質問の複数選択・上限・範囲・指定なし）
 * - knife: 包丁なしの絞り込み
 * - food: 食材・料理名の指定（加点＋絞り込み。negate=true はその料理を除外）
 * - policy: 今日の方針（脂質控えめ・カロリー控えめ・量はしっかり）
 * - mode: 「甘いもの」などでスイーツモードに切り替える
 */
export type Answer =
  | { kind: 'attr'; questionId: string; attr: Attr; value: string; negate: boolean }
  | { kind: 'effort'; questionId: 'effort'; sel: EffortSel }
  | { kind: 'knife' }
  | { kind: 'food'; target: FoodTarget; label: string; negate: boolean }
  | { kind: 'policy'; key: PolicyKey }
  | { kind: 'mode'; mode: 'sweet' };

export interface QuestionOption {
  value: string;
  label: string;
  /** ボタンに添える一言説明 */
  sub?: string;
}

export interface QuestionDef {
  id: string;
  /** 'effort' はやる気度の質問（スコアではなく絞り込みに使う） */
  attr: Attr | 'effort';
  text: string;
  options: QuestionOption[];
}

/** フリー入力から拾った1語。タグとして表示し、タップで外せる */
export interface FreeItem {
  id: string;
  /** タグに出す文字 */
  label: string;
  /** 確認表示の一文（「『トマト』を食材として読み取りました」） */
  note: string;
  negate: boolean;
  answers: Answer[];
  /** 辞書にはあるが料理データにない食材（外部検索のボタンを出す） */
  notFound?: boolean;
}
