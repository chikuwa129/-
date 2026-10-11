import { evaluateSweets, sweetBadges, sweetReason, type Sweet, type SweetSession } from '../logic/sweets';
import { searchUrl } from '../logic/search';
import { POLICY_LABEL } from '../logic/questions';
import Tags from './Tags';
import Notices from './Notices';
import SearchAction from './SearchAction';

interface Props {
  sweets: Sweet[];
  session: SweetSession;
  onReject: (name: string) => void;
  onRemoveTag: (id: string) => void;
  onPairing: (use: boolean) => void;
  onCarry: (use: boolean) => void;
  onRestart: () => void;
}

/** スイーツの結果（買う前提。レシピ検索は出さない） */
export default function SweetResultScreen({ sweets, session, onReject, onRemoveTag, onPairing, onCarry, onRestart }: Props) {
  const ev = evaluateSweets(sweets, session);
  const [first, ...rest] = ev.top;
  const searches = (name: string, big = false) => (
    <div className="search-row">
      <SearchAction label="近くのお店で探す" kind="maps" query={name} variant={big ? 'secondary' : 'small'} />
      <SearchAction label="画像を見る" kind="image" query={name} />
      <SearchAction label="カロリーを調べる" kind="calorie" query={`${name} カロリー`} />
    </div>
  );
  const banners = (
    <>
      {session.pairing && (
        <div className="shift-bar">
          <p>
            {session.pairing.use
              ? `食べ合わせ：${session.pairing.dish.name}のあとに合うものを優先しています`
              : '食べ合わせを使っていません'}
          </p>
          <button type="button" className="btn btn-ghost btn-reset" onClick={() => onPairing(!session.pairing!.use)}>
            {session.pairing.use ? '食べ合わせを使わない' : '食べ合わせを使う'}
          </button>
        </div>
      )}
      {session.carry && (
        <div className="shift-bar">
          <p>
            {session.carry.use
              ? `食事の方針（${session.carry.policies.map((p) => POLICY_LABEL[p]).join('・')}）を引き継いでいます`
              : '食事の方針を引き継いでいません'}
          </p>
          <button type="button" className="btn btn-ghost btn-reset" onClick={() => onCarry(!session.carry!.use)}>
            {session.carry.use ? '引き継がない' : '引き継ぐ'}
          </button>
        </div>
      )}
    </>
  );

  if (!first) {
    return (
      <main className="screen sweet">
        {banners}
        <h2 className="question">候補がなくなりました…</h2>
        <a className="btn btn-primary btn-open" href={searchUrl('recipe', '甘いもの おすすめ')} target="_blank" rel="noopener noreferrer">
          検索で探す ↗
        </a>
        <button className="btn btn-secondary btn-big" onClick={onRestart}>
          もう一度
        </button>
      </main>
    );
  }

  const card = (r: (typeof ev.top)[number], big: boolean) => {
    const why = sweetReason(r, ev);
    return (
      <>
        <ul className="buy-badges" aria-label="買える場所">
          {r.sweet.buy.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <ul className={big ? 'nutri-badges' : 'nutri-badges inline'} aria-label="甘さ・脂質・カロリーの目安">
          {sweetBadges(r.sweet).map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        {why && <p className={big ? 'reason' : 'sub-reason'}>{why}</p>}
        {searches(r.sweet.name, big)}
      </>
    );
  };

  return (
    <main className="screen result sweet">
      <Tags items={session.freeItems} onRemove={onRemoveTag} />
      {banners}
      <Notices notices={ev.notices.filter((n) => !n.startsWith('食事の方針'))} />
      <p className="result-lead">甘いものなら…</p>
      <section className="result-main" aria-live="polite">
        <h2 className="dish-name">{first.sweet.name}</h2>
        {card(first, true)}
      </section>
      {rest.length > 0 && (
        <section className="result-sub">
          <h3>ほかの候補</h3>
          <ol start={2}>
            {rest.map((r) => (
              <li key={r.sweet.name}>
                <span className="sub-name">{r.sweet.name}</span>
                {card(r, false)}
              </li>
            ))}
          </ol>
        </section>
      )}
      <div className="stack">
        <button className="btn btn-secondary btn-big" onClick={() => onReject(first.sweet.name)}>
          違う！（次の候補を見る）
        </button>
        <button className="btn btn-primary btn-big" onClick={onRestart}>
          もう一度
        </button>
      </div>
      <p className="hint small">甘さ・脂質・カロリーは品名からの目安です（栄養指導ではありません）。正確な数値は［カロリーを調べる］で確認を。</p>
    </main>
  );
}
