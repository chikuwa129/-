// 料理データの付与結果（食材・やる気度）を docs/dishes.md に一覧で書き出す
import fs from 'node:fs';
const dishes = JSON.parse(fs.readFileSync('src/data/dishes.json', 'utf8'));
const ingredients = JSON.parse(fs.readFileSync('src/data/ingredients.json', 'utf8'));
const names = (d, role) => d.ingredients.filter((i) => i.role === role).map((i) => i.name).join('、') || '—';
const used = new Set(dishes.flatMap((d) => d.ingredients.map((i) => i.name)));
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
  '## やる気度（effort・knife・method）',
  '',
  '手間 1=温める・茹でるだけ（包丁なし） / 2=炒める・焼くだけ（包丁ほぼなし） / 3=ふつうに作れる / 4=凝りたい。',
  'お惣菜＝deliAlt（お惣菜・外食で代替しやすい）。',
  '',
  '| 料理名 | 手間 | 包丁 | 調理法 | お惣菜 | 別名 |',
  '|---|:-:|---|---|:-:|---|',
  ...dishes.map(
    (d) => `| ${d.name} | ${d.effort} | ${d.knife} | ${d.method.join('・')} | ${d.deliAlt ? '○' : ''} | ${d.aliases.join('、')} |`,
  ),
  '',
  '## 料理データに出てこない食材',
  '',
  '辞書（ingredients.json）にはあるが、どの料理にも使われていない食材。入力されると「データにありませんでした」と表示し、同じカテゴリの料理を代わりに出します。',
  '',
  ...unused.map((k) => `- ${k}（${ingredients[k].category}）`),
  '',
];
fs.writeFileSync('docs/dishes.md', lines.join('\n'));
console.log('wrote docs/dishes.md');
