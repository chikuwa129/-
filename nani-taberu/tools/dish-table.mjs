// 料理データの付与結果（食材・やる気度）を docs/dishes.md に一覧で書き出す
import fs from 'node:fs';
const dishes = JSON.parse(fs.readFileSync('src/data/dishes.json', 'utf8'));
const sweets = JSON.parse(fs.readFileSync('src/data/sweets.json', 'utf8'));
const ingredients = JSON.parse(fs.readFileSync('src/data/ingredients.json', 'utf8'));
const names = (d, role) => d.ingredients.filter((i) => i.role === role).map((i) => i.name).join('、') || '—';
const used = new Set([...dishes, ...sweets].flatMap((d) => d.ingredients.map((i) => i.name)));
const unused = Object.keys(ingredients).filter((k) => !used.has(k));
const lines = [
  '# 料理データ一覧',
  '',
  `全${dishes.length}品。\`npm run data:table\` で \`src/data/dishes.json\` から自動生成しています（直接編集しないでください）。`,
  '',
  '## 食材（ingredients）',
  '',
  '| 料理名 | 主役（main） | 脇役（sub） |',
  '|---|---|---|',
  ...dishes.map((d) => `| ${d.name} | ${names(d, 'main')} | ${names(d, 'sub')} |`),
  '',
  '## やる気度・器具（effort・knife・method・toolsRequired・toolsOptional）',
  '',
  '手間 1=温める・茹でるだけ（包丁なし） / 2=炒める・焼くだけ（包丁ほぼなし） / 3=ふつうに作れる / 4=凝りたい。',
  'お惣菜＝deliAlt（お惣菜・外食で代替しやすい）。',
  '',
  '器具の必須＝なければ作れない、あれば便利＝なくても代わりがある。包丁・まな板は含めない（包丁は「包丁」列）。',
  '',
  '| 料理名 | 手間 | 包丁 | 調理法 | 器具（必須） | あれば便利 | 時間 | 洗い物 | お惣菜 | 別名 |',
  '|---|:-:|---|---|---|---|--:|:-:|:-:|---|',
  ...dishes.map(
    (d) =>
      `| ${d.name} | ${d.effort} | ${d.knife} | ${d.method.join('・')} | ${d.toolsRequired.join('、') || '—'} | ${d.toolsOptional.join('、') || '—'} | ${d.cookMinutes}分 | ${d.washing} | ${d.deliAlt ? '○' : ''} | ${d.aliases.join('、')} |`,
  ),
  '',
  '## 量・脂質・カロリー（amount・fat・calorie）',
  '',
  '料理名からの大まかな目安（数値は持たない）。量 少／普／多、脂質 低／中／高、カロリー 低め／ふつう／高め。',
  '',
  '| 料理名 | 量 | 脂質 | カロリー |',
  '|---|:-:|:-:|:-:|',
  ...dishes.map((d) => `| ${d.name} | ${d.amount} | ${d.fat} | ${d.calorie} |`),
  '',
  '## スイーツ（sweets.json）',
  '',
  `全${sweets.length}品。買う前提なので手間・包丁・調理法は持たない。脂質・カロリーは品名からの目安。`,
  '',
  '| 品名 | 系統 | 甘さ | 味わい | 脂質 | カロリー | 量 | 温度 | 買える場所 | 食材 | 別名 |',
  '|---|---|---|---|:-:|:-:|---|---|---|---|---|',
  ...sweets.map(
    (x) =>
      `| ${x.name} | ${x.family} | ${x.sweetness} | ${x.refresh} | ${x.fat} | ${x.calorie} | ${x.amount} | ${x.temp} | ${x.buy.join('、')} | ${x.ingredients.map((i) => i.name).join('、')} | ${x.aliases.join('、')} |`,
  ),
  '',
  '## 料理データに出てこない食材',
  '',
  '辞書（ingredients.json）にはあるが、食事にもスイーツにも使われていない食材。入力されると「データにありませんでした」と表示し、同じカテゴリの料理を代わりに出します。',
  '',
  ...unused.map((k) => `- ${k}（${ingredients[k].category}）`),
  '',
];
fs.writeFileSync('docs/dishes.md', lines.join('\n'));
console.log('wrote docs/dishes.md');
