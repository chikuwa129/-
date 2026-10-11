import { useMemo, useState } from 'react';
import type { Dish, Tool } from '../logic/types';
import { missingOptionalTools, missingRequiredTools, type Evaluation } from '../logic/engine';
import { badges, effortBadge } from '../logic/display';
import { conditionsFrom, dishQuery, SHOP_QUERY, type RecipeTarget } from '../logic/search';
import type { SessionState } from '../logic/engine';
import ingredientsJson from '../data/ingredients.json';
import SearchAction from './SearchAction';

interface Props {
  dish: Dish;
  /** すべての料理（家にあるものの選択肢を作るため） */
  dishes: Dish[];
  session: SessionState;
  ev: Evaluation;
  /** 登録した調理器具（未登録は null。「器具で絞り込む」がオフでも警告には使う） */
  ownedTools: Tool[] | null;
  pantry: string[];
  onPantryChange: (items: string[]) => void;
  searchTarget: RecipeTarget;
  onBack: () => void;
  /** 食後の甘いもの（G） */
  onSweets?: () => void;
}

const CATEGORY_OF = ingredientsJson as Record<string, { category: string }>;
const WASHING: Record<Dish['washing'], string> = { 少: '少なめ', 普: 'ふつう', 多: '多め' };
const KNIFE: Record<Dish['knife'], string> = { 不要: '包丁なし', 少し: '包丁ちょっと', 必要: '包丁を使う' };

/**
 * 「これにする」後の説明画面。構成のざっくり説明までを出し、手順・調味料・分量は検索に任せる。
 * 今回は履歴に記録しない（第2段階で同じボタンに記録を接続する）。
 */
export default function DishDetailScreen({
  dish,
  dishes,
  session,
  ev,
  ownedTools,
  pantry,
  onPantryChange,
  searchTarget,
  onBack,
  onSweets,
}: Props) {
  const [picking, setPicking] = useState(false);
  const cond = conditionsFrom(session, ev);
  const mains = dish.ingredients.filter((i) => i.role === 'main').map((i) => i.name);
  const subs = dish.ingredients.filter((i) => i.role === 'sub').map((i) => i.name);
  const hasPantry = pantry.length > 0;
  const missing = hasPantry ? [...mains, ...subs].filter((n) => !pantry.includes(n)) : [];
  const lackRequired = missingRequiredTools(dish, ownedTools);
  const lackOptional = missingOptionalTools(dish, ownedTools);

  // 家にあるものの選択肢：料理データで使っている食材をカテゴリ別に
  const groups = useMemo(() => {
    const used = new Set(dishes.flatMap((d) => d.ingredients.map((i) => i.name)));
    const by: Record<string, string[]> = {};
    for (const name of Object.keys(CATEGORY_OF)) {
      if (!used.has(name)) continue;
      (by[CATEGORY_OF[name].category] ??= []).push(name);
    }
    return Object.entries(by);
  }, [dishes]);

  const chip = (name: string) => (
    <li key={name} className={hasPantry && !pantry.includes(name) ? 'ing ing-missing' : 'ing'}>
      {name}
      {hasPantry && !pantry.includes(name) && <span className="sr-only">（足りない）</span>}
    </li>
  );

  return (
    <main className="screen detail">
      <header className="topbar">
        <button className="link" onClick={onBack}>
          ← 結果に戻る
        </button>
      </header>
      <section className="result-main">
        <p className="result-lead">これにする</p>
        <h2 className="dish-name">{dish.name}</h2>
        <ul className="effort-badges" aria-label="手間">
          {badges(dish, ev).map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </section>

      <section className="detail-block">
        <h3>構成</h3>
        <dl className="facts">
          <dt>主役</dt>
          <dd>
            <ul className="ings">{mains.map(chip)}</ul>
          </dd>
          <dt>脇役</dt>
          <dd>{subs.length ? <ul className="ings">{subs.map(chip)}</ul> : 'なし'}</dd>
          <dt>手間</dt>
          <dd>
            {effortBadge(dish)}・{KNIFE[dish.knife]}
            <span className="method">（{dish.method.join('→')}）</span>
          </dd>
          <dt>器具</dt>
          <dd>
            必須：{dish.toolsRequired.length ? dish.toolsRequired.join('、') : 'なし'}
            <br />
            あれば便利：{dish.toolsOptional.length ? dish.toolsOptional.join('、') : 'なし'}
          </dd>
          <dt>目安</dt>
          <dd>
            調理 約{dish.cookMinutes}分・洗い物 {WASHING[dish.washing]}
          </dd>
        </dl>
        {lackRequired.length > 0 && (
          <p className="warn" role="alert">
            登録した器具には {lackRequired.join('・')} がありません。この料理はそのままでは作れないかもしれません。
          </p>
        )}
        {lackRequired.length === 0 && lackOptional.length > 0 && (
          <p className="hint">{lackOptional.join('や')}があるともっと楽です。</p>
        )}
        <p className="hint small">手順・調味料・分量はデータに持っていません。調味料・分量は検索で確認を。</p>
      </section>

      <section className="detail-block">
        <h3>家にあるもの（任意）</h3>
        {hasPantry ? (
          missing.length ? (
            <p>
              足りないもの：<strong className="missing-list">{missing.join('、')}</strong>
            </p>
          ) : (
            <p className="ok">家にあるもので作れそうです</p>
          )
        ) : (
          <p className="hint">家にある食材を選ぶと、足りないものだけを目立たせます。</p>
        )}
        <button type="button" className="btn btn-search" aria-expanded={picking} onClick={() => setPicking(!picking)}>
          {picking ? '選び終わる' : hasPantry ? `家にあるものを直す（${pantry.length}）` : '家にあるものを選ぶ'}
        </button>
        {picking && (
          <div className="pantry">
            {groups.map(([cat, names]) => (
              <fieldset key={cat}>
                <legend>{cat}</legend>
                {names.map((n) => {
                  const on = pantry.includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      className={on ? 'chip chip-on' : 'chip'}
                      aria-pressed={on}
                      onClick={() => onPantryChange(on ? pantry.filter((x) => x !== n) : [...pantry, n])}
                    >
                      {n}
                    </button>
                  );
                })}
              </fieldset>
            ))}
            {hasPantry && (
              <button type="button" className="btn btn-ghost" onClick={() => onPantryChange([])}>
                すべて外す
              </button>
            )}
          </div>
        )}
      </section>

      <section className="detail-block">
        <h3>調べる</h3>
        <div className="search-row">
          <SearchAction label="レシピを探す" kind="recipe" target={searchTarget} query={dishQuery(dish.name, cond, 'recipe', searchTarget)} />
          <SearchAction label="画像を見る" kind="image" query={dishQuery(dish.name, cond, 'image')} />
          <SearchAction label="材料・分量を調べる" kind="ingredients" target={searchTarget} query={dishQuery(dish.name, cond, 'ingredients')} />
          {missing.length > 0 && <SearchAction label="買い足しのお店を探す" kind="maps" query={SHOP_QUERY} />}
        </div>
      </section>

      {onSweets && (
        <button className="btn btn-secondary btn-big" onClick={onSweets}>
          食後の甘いものも探す
        </button>
      )}
      <p className="hint small">※ 今はまだ記録しません（食事の記録は次の段階で追加します）。</p>
      <button className="btn btn-primary btn-big" onClick={onBack}>
        結果に戻る
      </button>
    </main>
  );
}
