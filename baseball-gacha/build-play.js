// =============================================================
// build-play.js : index.html に config.js・benchmark.js・logic.js を埋め込んだ
//                 単一ファイル版 play.html を作る
//   使い方: node build-play.js
//   config.js / logic.js / index.html を直したら、実行し直すこと。
// =============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const dir = __dirname;
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

let html = read('index.html');
for (const file of ['config.js', 'benchmark.js', 'logic.js']) {
  const tag = '<script src="' + file + '"></script>';
  if (!html.includes(tag)) throw new Error('index.html に ' + tag + ' が見つかりません');
  // </script> が中身に含まれていると途中で閉じてしまうので念のため確認
  const code = read(file);
  if (/<\/script/i.test(code)) throw new Error(file + ' に </script が含まれています');
  html = html.replace(tag, () => '<script>\n// ---- ' + file + '(build-play.js で埋め込み)----\n' + code + '</script>');
}
html = html.replace('<html lang="ja">', '<html lang="ja">\n<!-- このファイルは build-play.js が生成します。直接編集しないこと -->');
fs.writeFileSync(path.join(dir, 'play.html'), html);
console.log('play.html を作成しました (' + html.length + ' 文字)');
