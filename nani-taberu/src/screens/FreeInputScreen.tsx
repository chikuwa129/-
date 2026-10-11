import { useEffect, useRef, useState } from 'react';
import type { FreeItem } from '../logic/types';
import Tags from './Tags';
import SearchAction from './SearchAction';
import type { RecipeTarget } from '../logic/search';

interface Props {
  interpret: (text: string) => Promise<FreeItem[]>;
  onConfirm: (items: FreeItem[]) => void;
  /** スイーツモード用の解釈と開始 */
  interpretSweet: (text: string) => FreeItem[];
  onConfirmSweet: (items: FreeItem[]) => void;
  onAkinator: () => void;
  onBack: () => void;
  searchTarget: RecipeTarget;
  /** 読み取った条件から作る検索語（該当なしのとき） */
  conditionQueryFor: (items: FreeItem[]) => string;
}

const EXAMPLES = [
  'こってりした肉系',
  'あったかくてさっぱり',
  '麺で辛いの',
  '炒めるだけで',
  'トマト系',
  '卵を使ったやつ',
  'カレー以外で',
  'ガッツリで脂質控えめ',
  '甘いもの',
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

export default function FreeInputScreen({
  interpret,
  onConfirm,
  interpretSweet,
  onConfirmSweet,
  onAkinator,
  onBack,
  searchTarget,
  conditionQueryFor,
}: Props) {
  const [text, setText] = useState('');
  const [failed, setFailed] = useState(false);
  /** 決定後に読み取った言葉。null は未決定 */
  const [items, setItems] = useState<FreeItem[] | null>(null);
  /** スイーツとして探す（「甘いもの」や、スイーツでしか使わない食材のとき） */
  const [sweetMode, setSweetMode] = useState(false);
  /** 「『チョコ』は甘いものでした。甘いものとして探しますか？」 */
  const [askSweet, setAskSweet] = useState<{ names: string[]; mealItems: FreeItem[] } | null>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);

  useEffect(() => () => recRef.current?.stop(), []);

  const edit = (value: string) => {
    setText(value);
    setFailed(false);
    setItems(null);
    setSweetMode(false);
    setAskSweet(null);
  };

  const toSweets = () => {
    // スイーツの辞書で読み直す（合図の「甘いもの」自体は条件にしない）
    const found = interpretSweet(text).filter((i) => !i.answers.every((a) => a.kind === 'mode'));
    setSweetMode(true);
    setAskSweet(null);
    setItems(found);
  };

  const submit = async () => {
    if (!text.trim()) return;
    const found = await interpret(text);
    if (found.length === 0) return setFailed(true);
    if (found.some((i) => i.answers.some((a) => a.kind === 'mode'))) return toSweets();
    const only = found.flatMap((i) => (i.sweetOnly && !i.negate ? [i.sweetOnly] : []));
    if (only.length) return setAskSweet({ names: only, mealItems: found });
    setSweetMode(false);
    setItems(found);
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
        {items === null && !askSweet && (
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

      {askSweet && (
        <section className="notice confirm" aria-live="polite">
          <p>{askSweet.names.map((n) => `『${n}』`).join('')}は甘いものでした。甘いものとして探しますか？</p>
          <button className="btn btn-primary btn-big" onClick={toSweets}>
            はい
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setItems(askSweet.mealItems);
              setAskSweet(null);
            }}
          >
            ごはんで探す
          </button>
        </section>
      )}

      {items !== null && (
        <section className="notice confirm" aria-live="polite">
          <p>{sweetMode ? '甘いものとして、こう読み取りました' : 'こう読み取りました'}</p>
          <ul className="readings">
            {items.map((i) => (
              <li key={i.id}>{i.note}</li>
            ))}
            {sweetMode && items.length === 0 && <li>条件なしで甘いものを探します</li>}
          </ul>
          {!sweetMode && items.some((i) => i.notFound) && (
            <SearchAction
              label="検索で探す"
              kind="recipe"
              target={searchTarget}
              query={conditionQueryFor(items)}
              variant="secondary"
            />
          )}
          {items.length > 0 ? (
            <>
              <p className="hint">違うものはタップで外せます</p>
              <Tags items={items} onRemove={(id) => setItems(items.filter((i) => i.id !== id))} />
              <button
                className="btn btn-primary btn-big"
                onClick={() => (sweetMode ? onConfirmSweet(items) : onConfirm(items))}
              >
                {sweetMode ? 'この条件で甘いものを探す' : 'この条件で探す'}
              </button>
            </>
          ) : sweetMode ? (
            <button className="btn btn-primary btn-big" onClick={() => onConfirmSweet([])}>
              甘いものを探す
            </button>
          ) : (
            <p className="hint">条件がなくなりました。書き直すか、質問に答えて決めてください。</p>
          )}
          <button className="btn btn-ghost" onClick={() => edit(text)}>
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
          <SearchAction label="この言葉で検索する" kind="recipe" target="google" query={text.trim()} variant="secondary" />
        </div>
      )}
    </main>
  );
}
