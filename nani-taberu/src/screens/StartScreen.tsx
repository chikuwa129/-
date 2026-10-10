interface Props {
  onAkinator: () => void;
  onFree: () => void;
}

export default function StartScreen({ onAkinator, onFree }: Props) {
  return (
    <main className="screen start">
      <div className="hero">
        <div className="hero-icon" aria-hidden="true">🍽️</div>
        <h1>
          なに食べる？
          <br />
          <span className="accent">アキネーター</span>
        </h1>
        <p className="lead">いくつかの質問に答えるだけで、今日食べたい料理を当てます。</p>
      </div>
      <div className="stack">
        <button className="btn btn-primary btn-big" onClick={onAkinator}>
          <span className="btn-title">質問に答えて決める</span>
          <span className="btn-sub">アキネーターモード</span>
        </button>
        <button className="btn btn-secondary btn-big" onClick={onFree}>
          <span className="btn-title">ざっくり言ってみる</span>
          <span className="btn-sub">フリー入力モード</span>
        </button>
      </div>
    </main>
  );
}
