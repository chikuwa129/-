import { useState } from 'react';
import { searchUrl, type RecipeTarget, type SearchKind, RECIPE_TARGET_LABEL } from '../logic/search';
import { useOnline } from './useOnline';

interface Props {
  /** ボタンの文言（［レシピを探す］など） */
  label: string;
  kind: SearchKind;
  /** 組み立てた検索語（開く前に表示し、編集できる） */
  query: string;
  target?: RecipeTarget;
  variant?: 'primary' | 'secondary' | 'small';
}

const OPEN_LABEL: Record<SearchKind, string> = { recipe: '', image: 'Google画像検索', maps: 'Googleマップ' };

/**
 * 外部検索ボタン。押すと検索語を表示し（編集可）、［〜で開く］で新しいタブに開く。
 * 検索語はアプリ側では保存・送信しない。
 */
export default function SearchAction({ label, kind, query, target = 'google', variant = 'small' }: Props) {
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(query);
  const where = kind === 'recipe' ? RECIPE_TARGET_LABEL[target] : OPEN_LABEL[kind];

  if (!online) {
    return (
      <div className={`search-action search-${variant}`}>
        <button type="button" className="btn btn-search" disabled>
          {label}
        </button>
        <p className="hint offline-hint">オフラインのため検索できません</p>
      </div>
    );
  }

  return (
    <div className={`search-action search-${variant}`}>
      <button
        type="button"
        className={variant === 'primary' ? 'btn btn-primary btn-search' : 'btn btn-search'}
        aria-expanded={open}
        onClick={() => {
          setText(query);
          setOpen(!open);
        }}
      >
        {label}
      </button>
      {open && (
        <div className="search-panel">
          <label className="hint" htmlFor={`q-${label}-${query}`}>
            この検索語で開きます（タップして直せます）
          </label>
          <input
            id={`q-${label}-${query}`}
            className="search-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            enterKeyHint="go"
          />
          <a
            className={text.trim() ? 'btn btn-primary btn-open' : 'btn btn-primary btn-open is-disabled'}
            href={text.trim() ? searchUrl(kind, text, target) : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!text.trim()}
          >
            {where}で開く ↗
          </a>
        </div>
      )}
    </div>
  );
}
