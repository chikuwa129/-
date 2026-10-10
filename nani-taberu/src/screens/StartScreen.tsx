interface Props {
  onAkinator: () => void;
  onFree: () => void;
  onData: () => void;
  onSettings: () => void;
}

export default function StartScreen({ onAkinator, onFree, onData, onSettings }: Props) {
  return (
    <main className="screen start">
      <div className="hero">
        <div className="hero-icon" aria-hidden="true">🍽️</div>
        <h1>
          なに食べる？
          <br />
          <span className="accent">アキネーター</span>
        </h1>
        <p className="lead">今日のやる気に合わせて、食べたい料理を当てます。</p>
      </div>
      <div className="stack">
        <button className="btn btn-primary btn-big" onClick={onAkinator}>
          <span className="btn-title">質問に答えて決める</span>
          <span className="btn-sub">アキネーターモード</span>
        </button>
        <button className="btn btn-secondary btn-big" onClick={onFree}>
          <span className="btn-title">ざっくり言ってみる</span>
          <span className="btn-sub">フリー入力モード（食材や料理名でもOK）</span>
        </button>
      </div>
      <nav className="footer-links">
        <button className="link" onClick={onData}>
          料理データ一覧
        </button>
        <button className="link" onClick={onSettings}>
          設定
        </button>
      </nav>
    </main>
  );
}
