import type { Profile, Settings } from '../settings';
import { TOOLS } from '../logic/types';
import { RECIPE_TARGET_LABEL, type RecipeTarget } from '../logic/search';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  profile: Profile;
  onProfileChange: (p: Profile) => void;
  onBack: () => void;
}

export default function SettingsScreen({ settings, onChange, profile, onProfileChange, onBack }: Props) {
  const tools = profile.tools;
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
      <fieldset className="field">
        <legend>持っている調理器具</legend>
        <p className="hint">
          {tools === undefined
            ? 'まだ登録していません（器具では絞り込みません）。'
            : `${tools.length}つ登録済み。必須の器具がない料理は結果に出ません。`}
        </p>
        {TOOLS.map((t) => (
          <label key={t} className="radio">
            <input
              type="checkbox"
              id={`tool-${t}`}
              checked={tools?.includes(t) ?? false}
              onChange={(e) => {
                const cur = tools ?? [];
                onProfileChange({ ...profile, tools: e.target.checked ? [...cur, t] : cur.filter((x) => x !== t) });
              }}
            />
            {t}
          </label>
        ))}
        <label className="radio switch">
          <input
            type="checkbox"
            id="use-tool-filter"
            checked={settings.useToolFilter}
            onChange={(e) => onChange({ ...settings, useToolFilter: e.target.checked })}
          />
          器具で絞り込む
        </label>
        {tools !== undefined && (
          <button type="button" className="btn btn-ghost" onClick={() => onProfileChange({ ...profile, tools: undefined })}>
            器具の登録を消す（絞り込まない）
          </button>
        )}
      </fieldset>
      <fieldset className="field">
        <legend>脂質とカロリーが食い違うとき</legend>
        {(
          [
            ['fatFirst', '脂質を優先（おすすめ）'],
            ['calorieFirst', 'カロリーを優先'],
            ['equal', '同じ重み'],
          ] as const
        ).map(([v, label]) => (
          <label key={v} className="radio">
            <input
              type="radio"
              name="fatCalorieOrder"
              id={`order-${v}`}
              checked={settings.fatCalorieOrder === v}
              onChange={() => onChange({ ...settings, fatCalorieOrder: v })}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <fieldset className="field">
        <legend>甘いものに引き継ぐ方針</legend>
        <label className="radio">
          <input
            type="radio"
            name="sweetCarryOver"
            id="carry-both"
            checked={settings.sweetCarryOver === 'fatAndCalorie'}
            onChange={() => onChange({ ...settings, sweetCarryOver: 'fatAndCalorie' })}
          />
          ごはんで選んだとおり（脂質＋カロリー）
        </label>
        <label className="radio">
          <input
            type="radio"
            name="sweetCarryOver"
            id="carry-fat"
            checked={settings.sweetCarryOver === 'fatOnly'}
            onChange={() => onChange({ ...settings, sweetCarryOver: 'fatOnly' })}
          />
          脂質のみ
        </label>
      </fieldset>
      <p className="hint">
        画像は Google 画像検索、お店は Google マップで開きます。外部のサイトに渡るのは検索語だけです。設定はこの端末の中だけに保存します。
      </p>
    </main>
  );
}
