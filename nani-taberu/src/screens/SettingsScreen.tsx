import type { Settings } from '../settings';
import { RECIPE_TARGET_LABEL, type RecipeTarget } from '../logic/search';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onBack: () => void;
}

export default function SettingsScreen({ settings, onChange, onBack }: Props) {
  return (
    <main className="screen">
      <header className="topbar">
        <button className="link" onClick={onBack}>
          ← もどる
        </button>
      </header>
      <h2 className="question">設定</h2>
      <fieldset className="field">
        <legend>［レシピを探す］の開く先</legend>
        {(Object.keys(RECIPE_TARGET_LABEL) as RecipeTarget[]).map((t) => (
          <label key={t} className="radio">
            <input
              type="radio"
              name="recipeSearch"
              id={`recipe-${t}`}
              checked={settings.recipeSearch === t}
              onChange={() => onChange({ ...settings, recipeSearch: t })}
            />
            {RECIPE_TARGET_LABEL[t]}
          </label>
        ))}
      </fieldset>
      <p className="hint">
        画像は Google 画像検索、お店は Google マップで開きます。外部のサイトに渡るのは検索語だけです。設定はこの端末の中だけに保存します。
      </p>
    </main>
  );
}
