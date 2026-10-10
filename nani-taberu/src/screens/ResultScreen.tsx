import type { Dish } from '../logic/types';
import type { ParsedInput } from '../logic/freeText';
import { rank, type SessionState } from '../logic/engine';
import { tagLabel } from '../logic/questions';
import Tags from './Tags';

interface Props {
  dishes: Dish[];
  session: SessionState;
  tags: ParsedInput['tags'];
  onReject: (name: string) => void;
  onRestart: () => void;
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

export default function ResultScreen({ dishes, session, tags, onReject, onRestart }: Props) {
  const ranked = rank(dishes, session);
  const [first, ...rest] = ranked;

  if (!first) {
    return (
      <main className="screen">
        <h2 className="question">候補がなくなりました…</h2>
        <button className="btn btn-primary btn-big" onClick={onRestart}>
          もう一度
        </button>
      </main>
    );
  }

  return (
    <main className="screen result">
      <Tags tags={tags} />
      <p className="result-lead">今日のごはんは…</p>
      <section className="result-main" aria-live="polite">
        <h2 className="dish-name">{first.dish.name}</h2>
        <ul className="dish-tags">
          {describe(first.dish).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      {rest.length > 0 && (
        <section className="result-sub">
          <h3>ほかの候補</h3>
          <ol start={2}>
            {rest.slice(0, 2).map((r) => (
              <li key={r.dish.name}>{r.dish.name}</li>
            ))}
          </ol>
        </section>
      )}

      <div className="stack">
        <button className="btn btn-secondary btn-big" onClick={() => onReject(first.dish.name)}>
          違う！（次の候補を見る）
        </button>
        <button className="btn btn-primary btn-big" onClick={onRestart}>
          もう一度
        </button>
      </div>
    </main>
  );
}
