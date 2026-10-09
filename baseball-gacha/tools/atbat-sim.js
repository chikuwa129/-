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
  let bad = 0, n = 0, gMax = 0, gMin = 1, notComp = 0;
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
      const gb = A.goodBadOf(sc, o);
      if (gb) { gMax = Math.max(gMax, gb.good); gMin = Math.min(gMin, gb.good); if (Math.abs(gb.good + gb.bad - 1) > 1e-12) notComp++; }
    }
  }
  global.__cap = { gMax: gMax, gMin: gMin, n: n, notComp: notComp };
  log('## 1. 確率の健全性\n' + n + ' 通り(能力 0〜150 の極端な値を含む)。0〜1 の外、または合計が 1 でないもの:' + bad + ' 件');
  sum.push('1. 確率の健全性:' + (bad ? '✕ ' + bad + '件' : '✓') + '(' + n + '通り)');
}

// 2. 指示の効き:場面ごとの最善の指示
{
  const scenes = A.SCENES.concat(Array.from({ length: 200 }, (_, i) => A.randomScene(1000 + i)));
  const res = { bat: {}, pitch: {} }, resEv = { bat: {}, pitch: {} }, tot = { bat: 0, pitch: 0 }, legal = { bat: {}, pitch: {} };
  let inRange = 0, inN = 0, gbBest = 0;
  const rDist = {}, rTop = { bat: {}, pitch: {} }, rTopF = { bat: {}, pitch: {} }; let rN = 0, tie = 0, dom = 0, sMin = 1, sMax = 0;
  const lines = [];
  for (const sc of scenes) {
    const e = A.evaluate(sc);
    const s = sc.side === 'pitch' ? 'pitch' : 'bat';
    tot[s]++;
    res[s][e.best] = (res[s][e.best] || 0) + 1;
    for (const r of e.rows) legal[s][r.order] = (legal[s][r.order] || 0) + 1;
    // 7:良い結果の確率が 20〜80% に入るか(指示ごと)/ 9:良い結果の確率が最も高い指示が、最善でもあるか
    const def = e.rows.filter((r) => r.good != null);
    for (const r of def) { inN++; if (r.good >= 0.2 && r.good <= 0.8) inRange++; }
    for (const r of def) { rDist[r.rating] = (rDist[r.rating] || 0) + 1; rN++; sMin = Math.min(sMin, r.good); sMax = Math.max(sMax, r.good); }
    // 評価が最も高い指示(同じ評価が複数なら、それぞれ数える)。2択の「堅実」が、攻めに劣る場面
    const mx = Math.max.apply(null, def.map((r) => r.rating)), tops = def.filter((r) => r.rating === mx);
    if (tops.length > 1) tie++;
    for (const r of tops) { rTop[s][r.order] = (rTop[s][r.order] || 0) + 1; rTopF[s][r.order] = (rTopF[s][r.order] || 0) + 1 / tops.length; }
    if (A.twoChoice(e).dominated) dom++;
    const topGood = def.reduce((a, b) => (b.good > a.good ? b : a), def[0]);
    if (topGood && topGood.order === e.best) gbBest++;
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
  // 3 の目標:どの指示も、最善になる場面が 10〜40%(その指示が使える場面のうち)
  for (const s of ['bat', 'pitch']) {
    const t = Object.keys(legal[s]).map((k) => { const v = (res[s][k] || 0) / legal[s][k]; return k + ' ' + pct(v) + '(' + (res[s][k] || 0) + '/' + legal[s][k] + ')' + (v >= 0.1 && v <= 0.4 ? '✓' : '✕'); });
    log('目標(' + s + '・使える場面のうち、最善になる割合 10〜40%):' + t.join('、'));
    sum.push('3の目標(' + (s === 'bat' ? '野手' : '投手') + '):' + t.join('、'));
  }
  const all = tot.bat + tot.pitch;
  global.__g = { inRange: inRange / inN, gbBest: gbBest / all };
  // T1d:評価(1〜7)
  const dist = [1, 2, 3, 4, 5, 6, 7].map((k) => k + ':' + pct((rDist[k] || 0) / rN)).join(' ');
  const four = (rDist[4] || 0) / rN;
  log('## 10. 評価(1〜7)の分布(場面×指示 ' + rN + ' 通り。通常の指示を含む):' + dist + '。4 の割合 ' + pct(four) + (four <= 0.5 ? ' ✓' : ' ✕') + '(段階:得点期待値 ' + A.CONFIG.rating.step.ev + '点、1点以上の確率 ' + (A.CONFIG.rating.step.p1 * 100) + 'ポイント)');
  sum.push('10. 評価の分布:' + dist + '。4 が ' + pct(four) + (four <= 0.5 ? ' ✓' : ' ✕'));
  for (const s of ['bat', 'pitch']) {
    const t = Object.keys(legal[s]).map((k) => { const v = (rTopF[s][k] || 0) / legal[s][k]; return k + ' ' + pct(v) + (v >= 0.1 && v <= 0.4 ? '✓' : '✕'); });
    const t2 = Object.keys(legal[s]).map((k) => k + ' ' + pct((rTop[s][k] || 0) / legal[s][k]));
    log('11. 評価が最も高い指示の割合(' + s + '・使える場面のうち。同じ評価が n 個なら 1/n ずつ数える。目標 10〜40%):' + t.join('、') + '\n  参考:同じ評価を、それぞれ 1 と数えた場合:' + t2.join('、'));
    sum.push('11. 評価が最高の指示(' + (s === 'bat' ? '野手' : '投手') + '):' + t.join('、'));
  }
  log('12. 評価が最高の指示が、複数ある場面:' + pct(tie / all) + '(' + tie + '/' + all + '。報告のみ)');
  log('13. 2択で「堅実」が、成功確率でも評価でも「攻め」を上回らない場面:' + pct(dom / all) + '(' + dom + '/' + all + '。報告のみ)');
  log('14. カードの成功確率の範囲:' + pct(sMin) + '〜' + pct(sMax) + '(5〜90% に収める)');
  sum.push('12. 評価が最高の指示が複数ある場面:' + pct(tie / all) + ' / 13. 2択で堅実が攻めに劣る場面:' + pct(dom / all) + ' / 14. 成功確率の範囲:' + pct(sMin) + '〜' + pct(sMax));
  log('### 場面の一覧(最善の指示と、指示ごとの得点期待値 / 1点以上の確率%)\n' + lines.join('\n'));
}

// 3. 盗塁の損益分岐(基準の打者で。盗塁しない = その状態の得点期待値)
{
  log('## 3. 盗塁の損益分岐');
  const L = [];
  for (const b3 of [null, 50]) for (let o = 0; o < 3; o++) {
    const sc = A.makeScene({ outs: o, bases: [50, null, b3] });
    const br = A.orderBranches(sc, 'steal'), ps = A.stealP(sc);
    const val = (xs) => xs.reduce((a, x) => a + x.q * (x.runs + A.reOf(x.outs, x.b)), 0);
    const rs = val(br.filter((x) => x.kind === 'st_ok')) / ps, rf = val(br.filter((x) => x.kind !== 'st_ok')) / (1 - ps);
    const r0 = A.reOf(o, [50, null, b3]);
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

// 7〜9. 成功確率(T1d:成功と失敗は補数。投手の失敗に単打を入れた)。T1c の値(旧定義)と並べる
{
  const g = global.__g, c = global.__cap, old = { r7: '88.3%', r8: '良い結果の最大 90.0%、悪い結果の最小 5.0%', r9: '51.2%' };
  const ok8 = c.gMax <= A.CONFIG.cap.max + 1e-9 && c.gMin >= A.CONFIG.cap.min - 1e-9 && !c.notComp;
  log('## 7. 成功確率が 20〜80% に入る割合(場面×指示):' + pct(g.inRange) + (g.inRange >= 0.6 ? ' ✓' : ' ✕') + '(T1c:' + old.r7 + ')');
  log('## 8. 成功確率の最大 ' + pct(c.gMax) + '、最小 ' + pct(c.gMin) + '(範囲 ' + pct(A.CONFIG.cap.min) + '〜' + pct(A.CONFIG.cap.max) + ')。補数でないもの ' + c.notComp + ' 件。' + c.n + '通り(極端な能力を含む)(T1c:' + old.r8 + ')');
  log('## 9. 成功確率が最も高い指示が、最善でもある場面の割合:' + pct(g.gbBest) + (g.gbBest <= 0.6 ? ' ✓' : ' ✕') + '(T1c:' + old.r9 + ')');
  sum.push('7. 成功確率が20〜80%:' + pct(g.inRange) + (g.inRange >= 0.6 ? ' ✓' : ' ✕') + '(T1c ' + old.r7 + ')');
  sum.push('8. 成功確率の範囲:最大 ' + pct(c.gMax) + '、最小 ' + pct(c.gMin) + '、補数 ' + (c.notComp ? '✕' : '✓') + (ok8 ? ' ✓' : ' ✕') + '(T1c ' + old.r8 + ')');
  sum.push('9. 成功確率が最も高い指示=最善:' + pct(g.gbBest) + (g.gbBest <= 0.6 ? ' ✓' : ' ✕') + '(T1c ' + old.r9 + ')');
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
fs.writeFileSync(file, '# 打席の試作(T1〜T1d)の検証の出力\n\n## 要約\n' + sum.join('\n') + '\n\n' + out.join('\n\n') + '\n');
console.log(sum.join('\n'));
console.log('全出力:' + path.relative(process.cwd(), file));
