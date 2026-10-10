import { useEffect, useRef, useState } from 'react';
import type { FreeItem } from '../logic/types';
import Tags from './Tags';

interface Props {
  interpret: (text: string) => Promise<FreeItem[]>;
  onConfirm: (items: FreeItem[]) => void;
  onAkinator: () => void;
  onBack: () => void;
}

const EXAMPLES = [
  'こってりした肉系',
  'あったかくてさっぱり',
  '麺で辛いの',
  '炒めるだけで',
  'トマト系',
  '卵を使ったやつ',
  'カレー以外で',
];

// Web Speech API（対応ブラウザのみマイクボタンを出す）
type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
const SpeechRecognitionCtor: (new () => Recognition) | undefined =
  typeof window !== 'undefined' && import.meta.env.MODE !== 'artifact'
    ? ((window as unknown as Record<string, unknown>).SpeechRecognition ??
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as
        | (new () => Recognition)
        | undefined
    : undefined;

export default function FreeInputScreen({ interpret, onConfirm, onAkinator, onBack }: Props) {
  const [text, setText] = useState('');
  const [failed, setFailed] = useState(false);
  /** 決定後に読み取った言葉。null は未決定 */
  const [items, setItems] = useState<FreeItem[] | null>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);

  useEffect(() => () => recRef.current?.stop(), []);

  const edit = (value: string) => {
    setText(value);
    setFailed(false);
    setItems(null);
  };

  const submit = async () => {
    if (!text.trim()) return;
    const found = await interpret(text);
    if (found.length === 0) setFailed(true);
    else setItems(found);
  };

  const toggleMic = () => {
    if (!SpeechRecognitionCtor) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SpeechRecognitionCtor();
    rec.lang = 'ja-JP';
    rec.interimResults = false;
    rec.onresult = (e) => edit(e.results[0]?.[0]?.transcript ?? '');
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <main className="screen">
      <header className="topbar">
        <button className="link" onClick={onBack}>
          ← もどる
        </button>
      </header>
      <h2 className="question">今日はどんな気分？</h2>
      <p className="hint">ざっくりでOK。食材や料理名だけでも大丈夫です。</p>
      <form
        className="free-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="input-row">
          <input
            id="free-text"
            className="free-input"
            type="text"
            inputMode="text"
            enterKeyHint="go"
            autoComplete="off"
            placeholder="例：トマト系、炒めるだけで"
            value={text}
            onChange={(e) => edit(e.target.value)}
            aria-label="食べたいものをざっくり入力"
          />
          {SpeechRecognitionCtor && (
            <button
              type="button"
              className={listening ? 'mic mic-on' : 'mic'}
              onClick={toggleMic}
              aria-label={listening ? '音声入力を止める' : '音声で入力'}
            >
              🎤
            </button>
          )}
        </div>
        {items === null && (
          <>
            <div className="examples">
              {EXAMPLES.map((ex) => (
                <button type="button" key={ex} className="chip" onClick={() => edit(ex)}>
                  {ex}
                </button>
              ))}
            </div>
            <button type="submit" className="btn btn-primary btn-big" disabled={!text.trim()}>
              決定
            </button>
          </>
        )}
      </form>

      {items !== null && (
        <section className="notice confirm" aria-live="polite">
          <p>こう読み取りました</p>
          <ul className="readings">
            {items.map((i) => (
              <li key={i.id}>{i.note}</li>
            ))}
          </ul>
          {items.length > 0 ? (
            <>
              <p className="hint">違うものはタップで外せます</p>
              <Tags items={items} onRemove={(id) => setItems(items.filter((i) => i.id !== id))} />
              <button className="btn btn-primary btn-big" onClick={() => onConfirm(items)}>
                この条件で探す
              </button>
            </>
          ) : (
            <p className="hint">条件がなくなりました。書き直すか、質問に答えて決めてください。</p>
          )}
          <button className="btn btn-ghost" onClick={() => setItems(null)}>
            書き直す
          </button>
        </section>
      )}

      {failed && (
        <div className="notice" role="alert">
          <p>うまく読み取れませんでした。</p>
          <p className="hint">質問に答えて決めてみませんか？</p>
          <button className="btn btn-secondary" onClick={onAkinator}>
            質問に答えて決める
          </button>
        </div>
      )}
    </main>
  );
}
