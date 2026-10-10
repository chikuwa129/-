import type { FreeItem } from '../logic/types';

interface Props {
  items: FreeItem[];
  /** 渡すとタグをタップで外せる */
  onRemove?: (id: string) => void;
}

export default function Tags({ items, onRemove }: Props) {
  if (items.length === 0) return null;
  return (
    <ul className="tags" aria-label="わかっている条件">
      {items.map((t) => (
        <li key={t.id}>
          {onRemove ? (
            <button
              type="button"
              className={t.negate ? 'tag tag-neg tag-btn' : 'tag tag-btn'}
              onClick={() => onRemove(t.id)}
              aria-label={`${t.label} を外す`}
            >
              {t.label}
              <span className="tag-x" aria-hidden="true">
                ×
              </span>
            </button>
          ) : (
            <span className={t.negate ? 'tag tag-neg' : 'tag'}>{t.label}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
