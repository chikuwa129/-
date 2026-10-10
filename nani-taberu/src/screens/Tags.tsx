import type { ParsedInput } from '../logic/freeText';
import { tagLabel } from '../logic/questions';

export default function Tags({ tags }: { tags: ParsedInput['tags'] }) {
  if (tags.length === 0) return null;
  return (
    <ul className="tags" aria-label="わかっている条件">
      {tags.map((t) => (
        <li key={`${t.attr}:${t.value}:${t.negate}`} className={t.negate ? 'tag tag-neg' : 'tag'}>
          {tagLabel(t.attr, t.value)}
          {t.negate ? ' 以外' : ''}
        </li>
      ))}
    </ul>
  );
}
