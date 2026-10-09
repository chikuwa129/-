// =============================================================
// tools/atbat-sim.js : 打席の試作(T1)の検証
//   node tools/atbat-sim.js → 全出力を tools/atbat-sim-result.txt に保存し、要約を画面に出す
// =============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const A = require(path.join(__dirname, '..', 'atbat-engine.js'));

const out = [];
const sum = [];
const log = (t) => out.push(t);
const pct = (v) => (v * 100).toFixed(1) + '%';

// 1. 確率の健全性(極端な能力を含む)
{
  const r = new A.Rng(7);
  let bad = 0, n = 0;
  const vals = [0, 1, 50, 100, 150];
  for (let i = 0; i < 3000; i++) {
    const pick = () => (r.chance(0.3) ? vals[r.int(0, vals.length - 1)] : r.int(0, 150));
    const sc = A.makeScene({ side: r.chance(0.5) ? 'bat' : 'pitch', outs: r.int(0, 2), bases: [0, 1, 2].map(() => (r.chance(0.5) ? pick() : null)),
      batter: { contact: pick(), power: pick(), speed: pick() }, pitcher: { velocity: pick(), control: pick(), breaking: pick(), quick: pick() }, defense: pick(), arm: pick() });
    for (const o of A.legalOrders(sc)) {
      n++;
      const br = A.orderBranches(sc, o);
      const q = br.reduce((a, x) => a + x.q, 0);
      const okQ = Math.abs(q - 1) < 1e-9 && br.every((x) => x.q >= 0 && x.q <= 1 && Number.isFinite(x.runs) && x.outs <= 3);
      let okP = true;
      if (['bunt', 'squeeze', 'steal'].indexOf(o) < 0) { const P = A.probs(sc, o); const s = A.OUTCOMES.reduce((a, k) => a + P[k], 0); okP = Math.abs(s - 1) < 1e-9 && A.OUTCOMES.every((k) => P[k] >= 0 && P[k] <= 1 && Number.isFinite(P[k])); }
      if (!okQ || !okP) bad++;
    }
  }
  log('## 1. 確率の健全性\n' + n + ' 通り(能力 0〜150 の極端な値を含む)。0〜1 の外、または合計が 1 でないもの:' + bad + ' 件');
  sum.push('1. 確率の健全性:' + (bad ? '✕ ' + bad + '件' : '✓') + '(' + n + '通り)');
}

// 2. 指示の効き:場面ごとの最善の指示
{
  const scenes = A.SCENES.concat(Array.from({ length: 200 }, (_, i) => A.randomScene(1000 + i)));
  const res = { bat: {}, pitch: {} }, resEv = { bat: {}, pitch: {} }, tot = { bat: 0, pitch: 0 };
  const lines = [];
  for (const sc of scenes) {
    const e = A.evaluate(sc);
    const s = sc.side === 'pitch' ? 'pitch' : 'bat';
    tot[s]++;
    res[s][e.best] = (res[s][e.best] || 0) + 1;
    const pick = s === 'pitch' ? (a, b) => (b.ev < a.ev ? b : a) : (a, b) => (b.ev > a.ev ? b : a);
    const be = e.rows.reduce(pick).order;
    resEv[s][be] = (resEv[s][be] || 0) + 1;
    lines.push(sc.name + '\t' + s + '\t' + sc.inning + '回 ' + sc.outs + '死 ' + (sc.bases.map((x, i) => (x == null ? '' : i + 1)).join('') || '-') + ' 差' + sc.diff + '\t最善 ' + e.best + '(' + e.metric + ')\t' + e.rows.map((r) => r.order + ' ' + r.ev.toFixed(3) + '/' + (r.p1 * 100).toFixed(1)).join(' '));
  }
  const judge = (o, n) => { const m = Math.max.apply(null, Object.values(o)); return m / n > 0.95 ? '✕' : m / n > 0.6 ? '△' : '✓'; };
  const fmt = (o, n) => Object.keys(o).sort((a, b) => o[b] - o[a]).map((k) => k + ' ' + o[k] + '(' + pct(o[k] / n) + ')').join('、');
  log('## 2. 場面ごとの最善の指示(プリセット ' + A.SCENES.length + ' + ランダム 200)\n終盤の接戦(' + A.CONFIG.lateClose.inning + '回以降・' + A.CONFIG.lateClose.diff + '点差以内)は「1点以上の確率」、それ以外は得点期待値で比べる');
  for (const s of ['bat', 'pitch']) {
    log(s + '(' + tot[s] + '場面):' + fmt(res[s], tot[s]) + ' → ' + judge(res[s], tot[s]));
    log('  参考:すべて得点期待値で比べた場合:' + fmt(resEv[s], tot[s]) + ' → ' + judge(resEv[s], tot[s]));
    sum.push('2. 最善の指示(' + (s === 'bat' ? '野手' : '投手') + '):' + judge(res[s], tot[s]) + ' ' + fmt(res[s], tot[s]));
  }
  log('### 場面の一覧(最善の指示と、指示ごとの得点期待値 / 1点以上の確率%)\n' + lines.join('\n'));
}

// 3. 盗塁の損益分岐(基準の打者で。盗塁しない = その状態の得点期待値)
{
  log('## 3. 盗塁の損益分岐');
  const L = [];
  for (const b3 of [null, 50]) for (let o = 0; o < 3; o++) {
    const r0 = A.reOf(o, [50, null, b3]), rs = A.reOf(o, [null, 50, b3]), rf = A.reOf(o + 1, [null, null, b3]);
    const p = (r0 - rf) / (rs - rf);
    L.push(p);
    log(o + 'アウト・一塁' + (b3 ? '三塁' : '') + ':' + pct(p) + '(しない ' + r0.toFixed(3) + ' / 成功 ' + rs.toFixed(3) + ' / 失敗 ' + rf.toFixed(3) + ')' + (p >= 0.6 && p <= 0.8 ? ' ✓' : ' ✕'));
  }
  const ok = L.filter((p) => p >= 0.6 && p <= 0.8).length;
  sum.push('3. 盗塁の損益分岐:' + L.map(pct).join(' / ') + '(60〜80% に ' + ok + '/' + L.length + ')');
}

// 4. 送りバント(無死一塁)
{
  log('## 4. 送りバント(無死一塁。基準の投手)');
  const L = [];
  for (const k of ['strong', 'normal', 'weak']) {
    const sc = A.makeScene({ outs: 0, bases: [50, null, null], batter: Object.assign({}, A.PRESETS.batter[k]) });
    const ev = (o) => A.expectOrder(sc, o), p1 = (o) => A.expectOrderP1(sc, o);
    const t = k + ':得点期待値 しない ' + ev('normal').toFixed(3) + ' / バント ' + ev('bunt').toFixed(3) + '(差 ' + (ev('bunt') - ev('normal')).toFixed(3) + ')、1点以上の確率 しない ' + pct(p1('normal')) + ' / バント ' + pct(p1('bunt')) + '(成功率 ' + pct(A.buntP(sc)) + ')';
    log(t); L.push(k + ' 期待値の差 ' + (ev('bunt') - ev('normal')).toFixed(2) + '・1点以上 ' + ((p1('bunt') - p1('normal')) * 100).toFixed(1) + 'pt');
  }
  sum.push('4. 送りバント(無死一塁):' + L.join(' / '));
}

// 5. 平均的な対戦の分布(中位どうし、1000打席)
{
  const r = new A.Rng(12345);
  const sc = A.makeScene({});
  const c = { K: 0, BB: 0, GO: 0, FO: 0, S: 0, D: 0, T: 0, HR: 0 };
  const N = 1000;
  for (let i = 0; i < N; i++) {
    const res = A.resolve(sc, 'normal', r);
    if (res.kind === 'XB') { if (res.bases[2] != null && res.bases[1] == null && res.bases[0] == null) c.T++; else c.D++; } else c[res.kind]++;
  }
  const ab = N - c.BB, h = c.S + c.D + c.T + c.HR;
  const avg = h / ab, obp = (h + c.BB) / N, slg = (c.S + 2 * c.D + 3 * c.T + 4 * c.HR) / ab;
  const t = '打率 ' + avg.toFixed(3) + ' 出塁率 ' + obp.toFixed(3) + ' 長打率 ' + slg.toFixed(3) + ' 三振率 ' + pct(c.K / N) + ' 四球率 ' + pct(c.BB / N) + '(本塁打 ' + c.HR + '、三塁打 ' + c.T + '、二塁打 ' + c.D + ')';
  log('## 5. 中位の投手と中位の打者、1000打席\n' + t + '\n内訳:' + JSON.stringify(c));
  const re = A.reTable();
  log('得点期待値(無死走者なし)' + re[0].toFixed(3) + ' → 9回あたり約 ' + (re[0] * 9).toFixed(2) + '点');
  sum.push('5. 中位どうし1000打席:' + t + '。9回あたり約 ' + (re[0] * 9).toFixed(2) + '点');
}

// 6. 同じシードで同じ結果
{
  const run = () => { const r = new A.Rng(99); const out2 = []; for (let i = 0; i < 50; i++) { const sc = A.randomScene(300 + i); const o = A.legalOrders(sc); out2.push(JSON.stringify(A.resolve(sc, o[i % o.length], r))); } return out2.join('|'); };
  const same = run() === run();
  log('## 6. 同じシードで同じ結果:' + (same ? '一致' : '不一致'));
  sum.push('6. 同じシードで同じ結果:' + (same ? '✓' : '✕'));
}

// 得点期待値の表
{
  const re = A.reTable(), p1 = A.p1Table();
  const lab = ['走者なし', '一塁', '二塁', '一二塁', '三塁', '一三塁', '二三塁', '満塁'];
  log('## 参考:得点期待値 / 1点以上の確率(基準の打者)\n' + [0, 1, 2].map((o) => o + 'アウト:' + lab.map((l, i) => l + ' ' + re[o * 8 + i].toFixed(2) + '/' + pct(p1[o * 8 + i])).join('、')).join('\n'));
}

const file = path.join(__dirname, 'atbat-sim-result.txt');
fs.writeFileSync(file, '# 打席の試作(T1)の検証の出力\n\n## 要約\n' + sum.join('\n') + '\n\n' + out.join('\n\n') + '\n');
console.log(sum.join('\n'));
console.log('全出力:' + path.relative(process.cwd(), file));
