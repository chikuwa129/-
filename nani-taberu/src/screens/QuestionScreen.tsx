import type { Dish, QuestionDef } from '../logic/types';
import { evaluate, nextQuestion, questionLimit, type SessionState } from '../logic/engine';
import Tags from './Tags';
import Notices from './Notices';

interface Props {
  dishes: Dish[];
  session: SessionState;
  onAnswer: (def: QuestionDef, value: string) => void;
  onSkip: (def: QuestionDef) => void;
  onRemoveTag: (id: string) => void;
  onBack: () => void;
}

export default function QuestionScreen({ dishes, session, onAnswer, onSkip, onRemoveTag, onBack }: Props) {
  const q = nextQuestion(dishes, session);
  if (!q) return null; // App 側で結果画面に切り替わる

  const ev = evaluate(dishes, session);
  const current = session.askedCount + 1;
  const limit = questionLimit(session);

  return (
    <main className="screen">
      <header className="topbar">
        <button className="link" onClick={onBack}>
          ← はじめから
        </button>
        <span className="progress-label">
          Q{current}/{limit}
        </span>
      </header>
      <div className="progress" aria-hidden="true">
        <div className="progress-bar" style={{ width: `${(current / limit) * 100}%` }} />
      </div>
      <Tags items={session.freeItems} onRemove={onRemoveTag} />
      <Notices notices={ev.notices} />
      <h2 className="question">{q.def.text}</h2>
      <p className="hint">候補 あと{ev.candidates.length}品</p>
      <div className="stack">
        {q.options.map((o) => (
          <button key={o.value} className="btn btn-option" onClick={() => onAnswer(q.def, o.value)}>
            <span className="btn-title">{o.label}</span>
            {o.sub && <span className="btn-sub">{o.sub}</span>}
          </button>
        ))}
      </div>
      <button className="btn btn-ghost" onClick={() => onSkip(q.def)}>
        スキップ（どれでもいい）
      </button>
    </main>
  );
}
