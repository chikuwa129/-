// =============================================================
// tools/build-benchmark.js : 世代の基準(benchmark.js)を作る
//   使い方: node tools/build-benchmark.js
//   標準的な学校(指導力 baselineCoachLv で固定、方針はおまかせ)を
//   benchmarkRuns のシード数 × 年数だけ自動実行し、学年×月ごとの総合値の分布を集計する。
//   config.js の初期能力・成長・成長限界・項目上限を変えたら、作り直すこと。
// =============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const { CONFIG, Sim } = require('../logic.js');

const t0 = Date.now();
const runner = Sim.createBenchmarkRunner();
let last = -1;
while (!runner.step()) {
  const pct = Math.floor(runner.progress() * 10);
  if (pct !== last) { process.stdout.write(pct * 10 + '% '); last = pct; }
}
const bench = runner.result();
const out = '// このファイルは tools/build-benchmark.js が生成します。直接編集しないこと\n'
  + '// 世代の基準:学年-月 ごとの総合値の分布(p50 / p90 / p97 / p99 / p99.9)\n'
  + '(function (root) {\n'
  + '  const BENCHMARK = ' + JSON.stringify(bench) + ';\n'
  + "  if (typeof module === 'object' && module.exports) module.exports = BENCHMARK;\n"
  + '  else root.BENCHMARK = BENCHMARK;\n'
  + "})(typeof self !== 'undefined' ? self : this);\n";
fs.writeFileSync(path.join(__dirname, '..', 'benchmark.js'), out);
const r = bench.rows;
console.log('\nbenchmark.js を作成しました(' + ((Date.now() - t0) / 1000).toFixed(1) + '秒、ハッシュ ' + bench.hash + '、'
  + CONFIG.benchmarkRuns.seeds + 'シード × ' + CONFIG.benchmarkRuns.years + '年)');
for (const g of [1, 2, 3]) {
  for (const m of [4, 7, 12, 3]) {
    const x = r[g + '-' + m];
    if (x) console.log('  ' + g + '年 ' + String(m).padStart(2) + '月  n=' + String(x.n).padStart(5) + '  p50 ' + x.p50 + '  p90 ' + x.p90 + '  p97 ' + x.p97 + '  p99 ' + x.p99 + '  p99.9 ' + x.p999);
  }
}
