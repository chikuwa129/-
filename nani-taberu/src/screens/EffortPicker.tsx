import { useState } from 'react';
import type { QuestionOption } from '../logic/types';
import { rangeText, selToRange } from '../logic/effort';

interface Props {
  options: QuestionOption[];
  /** 将来プロフィールの面倒くさがり度から決める初期選択（目印として強調するだけ） */
  suggested?: number;
  onDecide: (levels: number[]) => void;
}

/** 「今日のやる気は？」の複数選択（チェック式）。［これで決める］で確定 */
export default function EffortPicker({ options, suggested, onDecide }: Props) {
  const [picked, setPicked] = useState<number[]>([]);
  const toggle = (v: number) =>
    setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v].sort((a, b) => a - b)));
  const range = picked.length ? selToRange({ type: 'levels', levels: picked }) : null;

  return (
    <div className="stack">
      <p className="hint">いくつ選んでもOK。2つ以上選ぶと、その間の手間の料理を出します。</p>
      {options.map((o) => {
        const v = Number(o.value);
        const on = picked.includes(v);
        return (
          <button
            key={o.value}
            type="button"
            role="checkbox"
            aria-checked={on}
            className={`btn btn-option btn-check${on ? ' is-on' : ''}${suggested === v ? ' is-suggested' : ''}`}
            onClick={() => toggle(v)}
          >
            <span className="check" aria-hidden="true">
              {on ? '✓' : ''}
            </span>
            <span className="btn-title">{o.label}</span>
            {o.sub && <span className="btn-sub">{o.sub}</span>}
          </button>
        );
      })}
      <div className="picker-footer">
        <p className="range-text" aria-live="polite">
          {range ? rangeText(range) : 'まだ選んでいません'}
        </p>
        <button
          type="button"
          className="btn btn-primary btn-big"
          disabled={picked.length === 0}
          onClick={() => onDecide(picked)}
        >
          これで決める
        </button>
      </div>
    </div>
  );
}
