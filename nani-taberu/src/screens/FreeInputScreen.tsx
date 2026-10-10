import { useEffect, useRef, useState } from 'react';

interface Props {
  onSubmit: (text: string) => Promise<boolean>;
  onAkinator: () => void;
  onBack: () => void;
}

const EXAMPLES = ['こってりした肉系', 'あったかくてさっぱり', '麺で辛いの'];

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

export default function FreeInputScreen({ onSubmit, onAkinator, onBack }: Props) {
  const [text, setText] = useState('');
  const [failed, setFailed] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);

  useEffect(() => () => recRef.current?.stop(), []);

  const submit = async (value = text) => {
    if (!value.trim()) return;
    const ok = await onSubmit(value);
    if (!ok) setFailed(true);
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
    rec.onresult = (e) => {
      const said = e.results[0]?.[0]?.transcript ?? '';
      setText(said);
      setFailed(false);
    };
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
      <p className="hint">ざっくりでOK。思いついた言葉をそのまま入れてください。</p>
      <form
        className="free-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="input-row">
          <input
            className="free-input"
            type="text"
            inputMode="text"
            enterKeyHint="go"
            autoComplete="off"
            placeholder="例：こってりした肉系"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFailed(false);
            }}
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
        <div className="examples">
          {EXAMPLES.map((ex) => (
            <button
              type="button"
              key={ex}
              className="chip"
              onClick={() => {
                setText(ex);
                setFailed(false);
              }}
            >
              {ex}
            </button>
          ))}
        </div>
        <button type="submit" className="btn btn-primary btn-big" disabled={!text.trim()}>
          決定
        </button>
      </form>

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
