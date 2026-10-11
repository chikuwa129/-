import type { Dish } from '../logic/types';
import { evaluate, sessionTags, type SessionState } from '../logic/engine';
import { rangeNumbers } from '../logic/effort';
import { tagLabel } from '../logic/questions';
import { badges, reasonLine } from '../logic/display';
import { conditionQuery, conditionsFrom, dishQuery, type RecipeTarget } from '../logic/search';
import Tags from './Tags';
import Notices from './Notices';
import SearchAction from './SearchAction';

interface Props {
  dishes: Dish[];
  session: SessionState;
  onReject: (name: string) => void;
  onRemoveTag: (id: string) => void;
  onShift: (delta: number) => void;
  onResetShift: () => void;
  onRestart: () => void;
  searchTarget: RecipeTarget;
  /** ［これにする］で説明画面へ */
  onChoose: (name: string) => void;
  onSettings: () => void;
}

const GENRE_LABEL: Record<string, string> = { 和: '和食', 洋: '洋食', 中: '中華', 韓: '韓国', エスニック: 'エスニック' };

function describe(d: Dish): string[] {
  return [
    GENRE_LABEL[d.genre],
    d.temp === '温' ? 'あったか' : 'ひんやり',
    ...d.taste.map((t) => tagLabel('taste', t)),
    ...d.main.map((m) => tagLabel('main', m)),
  ];
}

export default function ResultScreen({
  dishes,
  session,
  onReject,
  onRemoveTag,
  onShift,
  onResetShift,
  onRestart,
  searchTarget,
  onChoose,
  onSettings,
}: Props) {
  const ev = evaluate(dishes, session);
  const cond = conditionsFrom(session, ev);
  const [first, ...rest] = ev.ranked;

  const shift = ev.shift;
  const shiftBar = shift && shift.n !== 0 && ev.effort && (
    <div className="shift-bar" role="status">
      <p>
        いまの表示：『{Math.abs(shift.n) > 1 ? 'さらに' : 'もう少し'}
        {shift.n < 0 ? '楽な' : '凝った'}（{rangeNumbers(ev.effort)}）』で出し直しました
      </p>
      <button type="button" className="btn btn-ghost btn-reset" onClick={onResetShift}>
        元の設定に戻す
      </button>
    </div>
  );
  const shiftButtons = shift && (
    <div className="shift-buttons">
      <button type="button" className="btn btn-shift" disabled={!shift.canEasier} onClick={() => onShift(-1)}>
        もっと楽なのも見る
      </button>
      <button type="button" className="btn btn-shift" disabled={!shift.canHarder} onClick={() => onShift(1)}>
        もっと凝ったのも見る
      </button>
      {!shift.canHarder && <p className="hint shift-note">これ以上凝ったものはデータにありません</p>}
      {!shift.canEasier && <p className="hint shift-note">これ以上楽な表示はありません</p>}
    </div>
  );

  if (!first) {
    return (
      <main className="screen">
        <Tags items={sessionTags(session)} onRemove={onRemoveTag} />
        {shiftBar}
        <Notices notices={ev.notices} />
        <h2 className="question">候補がなくなりました…</h2>
        <p className="hint">アプリの料理データでは見つかりませんでした。条件をまとめて検索できます。</p>
        {ev.toolShort && (
          <button type="button" className="btn btn-ghost" onClick={onSettings}>
            設定で器具を見直す
          </button>
        )}
        <SearchAction
          label="検索で探す"
          kind="recipe"
          target={searchTarget}
          query={conditionQuery(cond, 'recipe', searchTarget)}
          variant="primary"
        />
        {shiftButtons}
        <button className="btn btn-secondary btn-big" onClick={onRestart}>
          もう一度
        </button>
      </main>
    );
  }

  const reason = reasonLine(first.dish, ev);
  const lazy = ev.deliMode;
  const dishSearches = (d: Dish) => (
    <div className="search-row">
      <button type="button" className="btn btn-primary btn-choose" onClick={() => onChoose(d.name)}>
        これにする
      </button>
      <SearchAction label="レシピを探す" kind="recipe" target={searchTarget} query={dishQuery(d.name, cond, 'recipe', searchTarget)} />
      <SearchAction label="画像を見る" kind="image" query={dishQuery(d.name, cond, 'image')} />
    </div>
  );
  const nearby = (variant: 'primary' | 'secondary') => (
    <SearchAction label="近くのお店で探す" kind="maps" query={dishQuery(first.dish.name, cond, 'maps')} variant={variant} />
  );

  return (
    <main className="screen result">
      <Tags items={sessionTags(session)} onRemove={onRemoveTag} />
      {shiftBar}
      <Notices notices={ev.notices} />
      {lazy && nearby('primary')}
      <p className="result-lead">今日のごはんは…</p>
      <section className="result-main" aria-live="polite">
        <h2 className="dish-name">{first.dish.name}</h2>
        <ul className="effort-badges" aria-label="手間">
          {badges(first.dish, ev).map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        {reason && <p className="reason">{reason}</p>}
        <ul className="dish-tags">
          {describe(first.dish).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        {dishSearches(first.dish)}
      </section>

      {rest.length > 0 && (
        <section className="result-sub">
          <h3>ほかの候補</h3>
          <ol start={2}>
            {rest.slice(0, 2).map((r) => {
              const why = reasonLine(r.dish, ev);
              return (
                <li key={r.dish.name}>
                  <span className="sub-name">{r.dish.name}</span>
                  <span className="sub-badges">
                    {badges(r.dish, ev).map((b) => (
                      <span key={b} className="mini-badge">
                        {b}
                      </span>
                    ))}
                  </span>
                  {why && <span className="sub-reason">{why}</span>}
                  {dishSearches(r.dish)}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {ev.toolShort && (
        <div className="notice">
          <p>持っている器具では候補が少なめです。</p>
          <button type="button" className="btn btn-ghost" onClick={onSettings}>
            設定で器具を見直す
          </button>
        </div>
      )}
      {(ev.toolShort || session.freeItems.some((i) => i.notFound)) && (
        <SearchAction
          label="検索で探す（入力した条件で）"
          kind="recipe"
          target={searchTarget}
          query={conditionQuery(cond, 'recipe', searchTarget)}
          variant="secondary"
        />
      )}

      {shiftButtons}

      <div className="stack">
        <button className="btn btn-secondary btn-big" onClick={() => onReject(first.dish.name)}>
          違う！（次の候補を見る）
        </button>
        <button className="btn btn-primary btn-big" onClick={onRestart}>
          もう一度
        </button>
      </div>
      {!lazy && nearby('secondary')}
    </main>
  );
}
