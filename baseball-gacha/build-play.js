// =============================================================
// build-play.js : 単一ファイル版を作る
//   play.html      … index.html に config.js・benchmark.js・logic.js を埋め込む(育成監督モード)
//   play-hero.html … hero.html に config.js・benchmark.js・logic.js・story.js・hero.js を埋め込む(新入部員モード)
//   使い方: node build-play.js
//   config.js / logic.js / index.html / hero.html / story.js / hero.js を直したら、実行し直すこと。
// =============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const dir = __dirname;
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

function build(src, out, files) {
  let html = read(src);
  for (const file of files) {
    const tag = '<script src="' + file + '"></script>';
    if (!html.includes(tag)) throw new Error(src + ' に ' + tag + ' が見つかりません');
    // </script> が中身に含まれていると途中で閉じてしまうので念のため確認
    const code = read(file);
    if (/<\/script/i.test(code)) throw new Error(file + ' に </script が含まれています');
    html = html.replace(tag, () => '<script>\n// ---- ' + file + '(build-play.js で埋め込み)----\n' + code + '</script>');
  }
  html = html.replace('<html lang="ja">', '<html lang="ja">\n<!-- このファイルは build-play.js が生成します。直接編集しないこと -->');
  fs.writeFileSync(path.join(dir, out), html);
  console.log(out + ' を作成しました (' + html.length + ' 文字)');
}

build('index.html', 'play.html', ['config.js', 'benchmark.js', 'logic.js']);
build('hero.html', 'play-hero.html', ['config.js', 'benchmark.js', 'logic.js', 'story.js', 'hero.js']);
