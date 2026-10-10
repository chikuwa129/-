export type Genre = '和' | '洋' | '中' | '韓' | 'エスニック';
export type Weight = '軽い' | '普通' | '重い';
export type Temp = '温' | '冷';
export type Taste = 'さっぱり' | 'こってり' | '辛い' | '甘辛';
export type Main = '肉' | '魚' | '野菜' | '麺' | '米' | '粉';
export type Style = '自炊' | '外食';

export interface Dish {
  name: string;
  genre: Genre;
  weight: Weight;
  temp: Temp;
  taste: Taste[];
  main: Main[];
  style: Style[];
}

export type Attr = 'genre' | 'weight' | 'temp' | 'taste' | 'main' | 'style';

/** 1つの属性値。例: { attr: 'taste', value: 'こってり' } */
export interface Tag {
  attr: Attr;
  value: string;
}

/**
 * 回答1件。質問への回答もフリー入力の解釈結果も同じ形で扱う。
 * negate=true は「それ以外がいい」（否定表現）を表す。
 */
export interface Answer extends Tag {
  questionId: string;
  negate: boolean;
  source: 'question' | 'free';
}

export interface QuestionDef {
  id: string;
  attr: Attr;
  text: string;
  /** 質問が扱う値と、ボタンに表示するラベル */
  options: { value: string; label: string }[];
}
