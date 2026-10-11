import type { Answer, Attr, FreeItem, PolicyKey } from './types';
import { EFFORT_SHORT, POLICY_LABEL, questionFor, tagLabel } from './questions';
import { isHiragana, isKana, normalize, normalizeWidth, toKatakana } from './text';

/** keywords.json の形式: 言葉 → 属性タグ・やる気・包丁 */
export type KeywordTags = Partial<Record<Attr, string>> & {
  effortLevel?: number;
  effortMax?: number;
  /** 範囲を明示する言葉（「凝ったのも見たい」→[3, 4]） */
  effortRange?: number[];
  /** 「どっちでもいい」：やる気度で絞らない（質問済みにはする） */
  effortAny?: boolean;
  knife?: string;
  /** 今日の方針（「あっさり」→["lowFat"]、「ヘルシー」→["lowFat","lowCalorie"]） */
  policy?: PolicyKey[];
  /** 「甘いもの」などでスイーツモードへ */
  mode?: 'sweet';
};
export type KeywordDict = Record<string, KeywordTags>;
/** ingredients.json の形式: 正規名 → 別名とカテゴリ */
export type IngredientDict = Record<string, { aliases: string[]; category: string }>;
/** categories.json の形式: カテゴリ → カテゴリ語 */
export type CategoryDict = Record<string, string[]>;

/** 名前照合の対象（食事 dishes.json もスイーツ sweets.json もこの形を満たす） */
export interface Matchable {
  name: string;
  aliases: string[];
  ingredients: { name: string }[];
}

export interface Dictionaries {
  keywords: KeywordDict;
  ingredients: IngredientDict;
  categories: CategoryDict;
  dishes: Matchable[];
}

/** 属性語をそのモードの質問に当てはめる（食事とスイーツで変える） */
export type AttrMapper = (attr: Attr, value: string) => { attr: Attr; value: string; questionId: string; label: string } | null;

const mealAttr: AttrMapper = (attr, value) => {
  const q = questionFor(attr, value);
  return q ? { attr, value, questionId: q.id, label: tagLabel(attr, value) } : null;
};

export interface IndexOptions {
  mapAttr?: AttrMapper;
  /** 別のモード（スイーツ）でだけ使う食材。辞書にあってこのモードのデータにないとき、警告を出さず sweetOnly にする */
  otherModeIngredients?: Set<string>;
}

type EntryKind = 'keyword' | 'ingredient' | 'category' | 'dish';

interface Entry {
  /** 正規化済みの言葉 */
  word: string;
  kind: EntryKind;
  /** keyword=辞書の言葉 / ingredient=正規名 / category=カテゴリ名 / dish=照合語 */
  key: string;
  /**
   * 同じ長さで当たったときの優先度（小さいほど優先）。
   * 属性語 > 食材 > 料理名。属性語には「肉」「魚」「麺」のような主材料の言葉だけを置き、
   * 具体的な食材・料理名は ingredients.json と料理名照合に任せる。
   */
  priority: number;
}

const PRIORITY: Record<EntryKind, number> = { keyword: 0, ingredient: 1, category: 1, dish: 2 };

export interface ParserIndex {
  entries: Entry[];
  dicts: Dictionaries;
  usedIngredients: Set<string>;
  mapAttr: AttrMapper;
  otherModeIngredients: Set<string>;
}

/** 料理名の照合語：料理名・別名に加えて、名前の中のカタカナ語・漢字語（「カレー」「丼」など） */
function dishWords(dish: Matchable): string[] {
  const words = new Set<string>([dish.name, ...dish.aliases]);
  for (const name of [dish.name, ...dish.aliases]) {
    for (const m of name.match(/[ァ-ヺー]{2,}/g) ?? []) words.add(m);
    for (const m of name.match(/[一-鿿々]+/g) ?? []) {
      if (m.length >= 2 || m === '丼' || m === '鍋') words.add(m);
    }
  }
  return [...words];
}

export function buildIndex(dicts: Dictionaries, opts: IndexOptions = {}): ParserIndex {
  const entries: Entry[] = [];
  const add = (word: string, kind: EntryKind, key: string) => {
    const w = normalize(word);
    if (w) entries.push({ word: w, kind, key, priority: PRIORITY[kind] });
  };
  for (const word of Object.keys(dicts.keywords)) add(word, 'keyword', word);
  for (const [name, ing] of Object.entries(dicts.ingredients)) {
    add(name, 'ingredient', name);
    for (const a of ing.aliases) add(a, 'ingredient', name);
  }
  for (const [cat, words] of Object.entries(dicts.categories)) for (const w of words) add(w, 'category', cat);
  for (const dish of dicts.dishes) for (const w of dishWords(dish)) add(w, 'dish', normalize(w));
  entries.sort((a, b) => b.word.length - a.word.length || a.priority - b.priority);

  const usedIngredients = new Set(dicts.dishes.flatMap((d) => d.ingredients.map((i) => i.name)));
  return {
    entries,
    dicts,
    usedIngredients,
    mapAttr: opts.mapAttr ?? mealAttr,
    otherModeIngredients: opts.otherModeIngredients ?? new Set(),
  };
}

/** キーワードの直後にこれが続いたら否定（「肉じゃない」「肉以外」「トマト抜き」「辛くない」など） */
const NEGATION = new RegExp(
  toKatakana(
    '^(?:の|もの|物|系|料理|っぽいの|みたいなの|は使わ|を使わ|入り)?(?:は|が|も|で)?\\s*く?' +
      '(?:じゃな|ではな|でな|以外|嫌|いや|やだ|いらな|要らな|抜き|ぬき|なし|無し|ない|苦手|ng|やめ|パス|気分じゃ)',
  ),
);

/**
 * 2文字以下のかなの言葉（「いか」「なす」「タイ」）は、文の途中のひらがなに埋もれた一致を拾わない。
 * ただし日常的にひらがなで書く短い食材名（なす・ねぎ・えび）は、後ろが文の終わり・助詞・ひらがな以外なら
 * 文の途中でも拾う（「辛いなす」）。「いか」「たこ」「タイ」は誤反応が多いので例外にしない。
 */
const PARTICLES = new Set(['と', 'や', 'の', 'で', 'に', 'を', 'は', 'が', 'も']);
const MIDSENTENCE_OK = new Set(['ナス', 'ネギ', 'エビ']);
function boundaryOk(entry: Entry, base: string, start: number): boolean {
  if (entry.word.length > 2 || !isKana(entry.word)) return true;
  const prev = base[start - 1];
  if (!prev || !isHiragana(prev) || PARTICLES.has(prev)) return true;
  if (!MIDSENTENCE_OK.has(entry.word)) return false;
  const next = base[start + entry.word.length];
  return !next || !isHiragana(next) || PARTICLES.has(next);
}

export interface Hit {
  entry: Entry;
  start: number;
  end: number;
  /** 入力されたままの表記 */
  typed: string;
  negate: boolean;
}

/** 左から順に、その位置で一番長い言葉を採用する（「甘辛い」は「甘辛」、「タコス」は「たこ」ではなく料理名） */
export function findHits(text: string, index: ParserIndex): Hit[] {
  const base = normalizeWidth(text);
  const kata = toKatakana(base);
  const hits: Hit[] = [];
  let i = 0;
  while (i < kata.length) {
    const entry = index.entries.find((e) => kata.startsWith(e.word, i) && boundaryOk(e, base, i));
    if (entry) {
      const end = i + entry.word.length;
      hits.push({ entry, start: i, end, typed: base.slice(i, end), negate: false });
      i = end;
    } else {
      i += 1;
    }
  }
  hits.forEach((h, idx) => {
    const until = idx + 1 < hits.length ? hits[idx + 1].start : kata.length;
    h.negate = NEGATION.test(kata.slice(h.end, until));
  });
  return hits;
}

function keywordItem(hit: Hit, tags: KeywordTags, mapAttr: AttrMapper): FreeItem | null {
  const answers: Answer[] = [];
  const labels: string[] = [];
  let kindLabel = '条件';
  for (const [key, raw] of Object.entries(tags)) {
    if (key === 'effortLevel' || key === 'effortMax') {
      if (hit.negate) continue; // 「めんどくさくない」などは扱わない
      const level = Number(raw);
      answers.push({ kind: 'effort', questionId: 'effort', sel: { type: 'max', level } });
      if (!tags.method) labels.push(EFFORT_SHORT[level]);
      kindLabel = 'やる気';
    } else if (key === 'effortRange') {
      if (hit.negate) continue;
      const [min, max] = raw as number[];
      answers.push({ kind: 'effort', questionId: 'effort', sel: { type: 'range', min, max } });
      labels.push(`やる気 ${min}〜${max}`);
      kindLabel = 'やる気';
    } else if (key === 'effortAny') {
      if (hit.negate) continue;
      answers.push({ kind: 'effort', questionId: 'effort', sel: { type: 'any' } });
      labels.push('手間はどれでも');
      kindLabel = 'やる気';
    } else if (key === 'policy') {
      if (hit.negate) continue;
      for (const p of raw as PolicyKey[]) {
        answers.push({ kind: 'policy', key: p });
        labels.push(POLICY_LABEL[p]);
      }
      kindLabel = '今日の方針';
    } else if (key === 'mode') {
      if (hit.negate) continue;
      answers.push({ kind: 'mode', mode: 'sweet' });
      labels.push('甘いもの');
      kindLabel = '甘いものを探す合図';
    } else if (key === 'knife') {
      if (hit.negate) continue;
      answers.push({ kind: 'knife' });
      labels.push('包丁なし');
      kindLabel = 'やる気';
    } else if (key === 'method') {
      const value = String(raw);
      answers.push({ kind: 'attr', questionId: 'method', attr: 'method', value, negate: hit.negate });
      labels.push(`${value}だけ`);
    } else {
      const m = mapAttr(key as Attr, String(raw));
      if (!m) continue;
      answers.push({
        kind: 'attr',
        // 肯定の属性はその質問を「質問済み」にする。否定は質問済みにしない
        // （「辛くない」と言われても、さっぱり／こってりはまだ聞く価値があるため）
        questionId: hit.negate ? `${m.questionId}:not:${m.value}` : m.questionId,
        attr: m.attr,
        value: m.value,
        negate: hit.negate,
      });
      labels.push(m.label);
    }
  }
  if (answers.length === 0) return null;
  const label = labels.join('・') + (hit.negate ? ' 以外' : '');
  return {
    id: `kw:${hit.entry.key}:${hit.negate}`,
    label,
    note: hit.negate ? `『${hit.typed}』を除外する条件として読み取りました` : `『${hit.typed}』を${kindLabel}として読み取りました`,
    negate: hit.negate,
    answers,
  };
}

function ingredientItem(hit: Hit, index: ParserIndex): FreeItem {
  const name = hit.entry.key;
  const id = `ing:${name}:${hit.negate}`;
  if (index.usedIngredients.has(name)) {
    return {
      id,
      label: name + (hit.negate ? ' 以外' : ''),
      note: hit.negate ? `『${name}』を使う料理を除外します` : `『${name}』を食材として読み取りました`,
      negate: hit.negate,
      answers: [{ kind: 'food', target: { type: 'ingredient', name }, label: name, negate: hit.negate }],
    };
  }
  // 辞書にはあるが料理データに出てこない食材：同じカテゴリの料理で代わりに探す
  const category = index.dicts.ingredients[name].category;
  const sweetOnly = index.otherModeIngredients.has(name);
  if (!sweetOnly) {
    console.warn(`[nani-taberu] 食材「${name}」は ingredients.json にありますが、このモードの料理データには使われていません`);
  }
  if (hit.negate) {
    return { id, label: `${name} 以外`, note: `『${name}』を使う料理はもともとデータにありません`, negate: true, answers: [], notFound: true, sweetOnly: sweetOnly ? name : undefined };
  }
  return {
    id,
    label: name,
    note: `『${name}』を使う料理はデータにありませんでした。代わりに${category}を使う料理を探します`,
    negate: false,
    notFound: true,
    sweetOnly: sweetOnly ? name : undefined,
    answers: [
      { kind: 'food', target: { type: 'category', category, fallbackFor: name }, label: name, negate: false },
    ],
  };
}

/**
 * 入力文を「拾った言葉」の列に変換する。入力文そのものは保存しない。
 * 同じものを指す言葉は一度だけ数える。
 */
export function parseFreeText(text: string, index: ParserIndex): FreeItem[] {
  const items: FreeItem[] = [];
  const seen = new Set<string>();
  for (const hit of findHits(text, index)) {
    let item: FreeItem | null = null;
    const { kind, key } = hit.entry;
    if (kind === 'keyword') item = keywordItem(hit, index.dicts.keywords[key], index.mapAttr);
    else if (kind === 'ingredient') item = ingredientItem(hit, index);
    else if (kind === 'category') {
      item = {
        id: `cat:${key}:${hit.negate}`,
        label: key + (hit.negate ? ' 以外' : ''),
        note: hit.negate ? `『${hit.typed}』を使う料理を除外します` : `『${hit.typed}』を食材の種類として読み取りました`,
        negate: hit.negate,
        answers: [{ kind: 'food', target: { type: 'category', category: key }, label: key, negate: hit.negate }],
      };
    } else {
      item = {
        id: `dish:${key}:${hit.negate}`,
        label: hit.typed + (hit.negate ? ' 以外' : ''),
        note: hit.negate ? `『${hit.typed}』の料理を除外します` : `『${hit.typed}』を料理名として読み取りました`,
        negate: hit.negate,
        answers: [{ kind: 'food', target: { type: 'dish', word: key }, label: hit.typed, negate: hit.negate }],
      };
    }
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items;
}

/** 回答をテストやケース集で比べやすい文字列にする（例: "taste:辛い" "!food:トマト" "policy:lowFat"） */
export function answerTag(a: Answer): string {
  switch (a.kind) {
    case 'attr':
      return `${a.negate ? '!' : ''}${a.attr}:${a.value}`;
    case 'effort': {
      const e = a.sel;
      return e.type === 'max'
        ? `effort:${e.level}`
        : e.type === 'range'
          ? `effort:${e.min}-${e.max}`
          : e.type === 'any'
            ? 'effort:any'
            : `effort:[${e.levels}]`;
    }
    case 'knife':
      return 'knife:不要';
    case 'policy':
      return `policy:${a.key}`;
    case 'mode':
      return `mode:${a.mode}`;
    case 'food': {
      const t = a.target;
      const name = t.type === 'dish' ? t.word : t.type === 'ingredient' ? t.name : t.category;
      return `${a.negate ? '!' : ''}food:${name}`;
    }
  }
}
