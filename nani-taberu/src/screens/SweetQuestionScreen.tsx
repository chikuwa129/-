import type { QuestionDef } from '../logic/types';
import { evaluateSweets, nextSweetQuestion, sweetQuestionLimit, type Sweet, type SweetSession } from '../logic/sweets';
import Tags from './Tags';
import Notices from './Notices';

interface Props {
  sweets: Sweet[];
  session: SweetSession;
  onAnswer: (def: QuestionDef, value: string) => void;
  onSkip: (def: QuestionDef) => void;
  onRemoveTag: (id: string) => void;
  onBack: () => void;
}

export default function SweetQuestionScreen({ sweets, session, onAnswer, onSkip, onRemoveTag, onBack }: Props) {
  const q = nextSweetQuestion(sweets, session);
  if (!q) return null;
  const ev = evaluateSweets(sweets, session);
  const current = session.askedCount + 1;
  const limit = sweetQuestionLimit(session);
  return (
    <main className="screen sweet">
      <header className="topbar">
        <button className="link" onClick={onBack}>
          ← はじめから
        </button>
        <span className="progress-label">
          甘いもの Q{current}/{limit}
        </span>
      </header>
      <div className="progress" aria-hidden="true">
        <div className="progress-bar" style={{ width: `${(current / limit) * 100}%` }} />
      </div>
      <Tags items={session.freeItems} onRemove={onRemoveTag} />
      <Notices notices={ev.notices} />
      {session.pairing?.use && <p className="hint">{session.pairing.dish.name}のあとに合う甘いものを探しています</p>}
      <h2 className="question">{q.def.text}</h2>
      <p className="hint">候補 あと{ev.candidates.length}品</p>
      <div className="stack">
        {q.options.map((o) => (
          <button key={o.value} className="btn btn-option" onClick={() => onAnswer(q.def, o.value)}>
            <span className="btn-title">{o.label}</span>
          </button>
        ))}
      </div>
      <button className="btn btn-ghost" onClick={() => onSkip(q.def)}>
        スキップ（どれでもいい）
      </button>
    </main>
  );
}
