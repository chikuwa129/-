// dist-single/index.html の外部 JS/CSS を本文に埋め込み、単一ファイルにする
import fs from 'node:fs';
import path from 'node:path';
const dir = 'dist-single';
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
html = html.replace(/<script type="module" crossorigin src="\.\/(.+?)"><\/script>/g, (_, f) =>
  `<script type="module">${fs.readFileSync(path.join(dir, f), 'utf8').replace(/<\/script/g, '<\\/script')}</script>`);
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/(.+?)">/g, (_, f) =>
  `<style>${fs.readFileSync(path.join(dir, f), 'utf8')}</style>`);
html = html.replace(/<link rel="(?:icon|apple-touch-icon)"[^>]*>\n?/g, '');
fs.writeFileSync(path.join(dir, 'nani-taberu.html'), html);
console.log('wrote', path.join(dir, 'nani-taberu.html'), html.length, 'bytes');
