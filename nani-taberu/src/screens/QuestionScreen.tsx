import type { Dish, QuestionDef } from '../logic/types';
import type { ParsedInput } from '../logic/freeText';
import { candidates, nextQuestion, questionLimit, type SessionState } from '../logic/engine';
import Tags from './Tags';

interface Props {
  dishes: Dish[];
  session: SessionState;
  tags: ParsedInput['tags'];
  onAnswer: (def: QuestionDef, value: string) => void;
  onSkip: (def: QuestionDef) => void;
  onBack: () => void;
}

export default function QuestionScreen({ dishes, session, tags, onAnswer, onSkip, onBack }: Props) {
  const q = nextQuestion(dishes, session);
  if (!q) return null; // App 側で結果画面に切り替わる

  const current = session.askedCount + 1;
  const limit = questionLimit(session);
  const remaining = candidates(dishes, session).length;

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
      <Tags tags={tags} />
      <h2 className="question">{q.def.text}</h2>
      <p className="hint">候補 あと{remaining}品</p>
      <div className="stack">
        {q.options.map((o) => (
          <button key={o.value} className="btn btn-option" onClick={() => onAnswer(q.def, o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      <button className="btn btn-ghost" onClick={() => onSkip(q.def)}>
        スキップ（どれでもいい）
      </button>
    </main>
  );
}
