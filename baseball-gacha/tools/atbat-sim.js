// =============================================================
// tools/atbat-sim.js : 打席の試作(T1)の検証
//   node tools/atbat-sim.js → 全出力を tools/atbat-sim-result.txt に保存し、要約を画面に出す
// =============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const A = require(path.join(__dirname, '..', 'atbat-engine.js'));

// 能力の型と勝率ベースの評価(T1g):node tools/atbat-sim.js --t1g N → tools/atbat-t1g-N.txt に保存(N はランダムな場面の数。試合の一覧は5試合)
const ti = process.argv.indexOf('--t1g');
if (ti >= 0) { runT1g(Number(process.argv[ti + 1]) || 200); process.exit(0); }
function runT1g(N) {
  const t0 = Date.now(), L = [], S = [], pc = (v) => (v * 100).toFixed(0) + '%', p1 = (v) => (v * 100).toFixed(1);
  const C = A.CONFIG, lv = C.types.levels.normal;
  const flat = (kind, t, base) => { const b = {}; for (const k of (kind === 'batter' ? ['contact', 'power', 'speed'] : ['velocity', 'control', 'breaking'])) b[k] = base; return A.typedAbility(kind, t, b, null, 0); };
  const P0 = Object.assign(flat('pitcher', 'balance', lv), { quick: 50 }), B0 = flat('batter', 'balance', lv);
  const R = 50, E = [null, null, null];
  const row = (e, r) => r.label + ' ' + pc(r.good) + '・' + r.rating + (r.order === e.best ? '★' : '');
  const evs = (e) => e.rows.filter((r) => r.good != null).map((r) => row(e, r)).join(' | ');
  // 1. 打者の型 × 場面
  const scenes = [
    ['無死一塁(3回・同点)', { inning: 3, outs: 0, bases: [R, null, null], diff: 0 }],
    ['一死二塁(5回・同点)', { inning: 5, outs: 1, bases: [null, R, null], diff: 0 }],
    ['二死満塁・1点差で負け(8回)', { inning: 8, outs: 2, bases: [R, R, R], diff: -1 }],
    ['9回・同点・無死二塁', { inning: 9, outs: 0, bases: [null, R, null], diff: 0 }],
    ['9回・3点差で負け・一死走者なし', { inning: 9, outs: 1, bases: E, diff: -3 }],
    ['9回・3点差でリード・一死走者なし', { inning: 9, outs: 1, bases: E, diff: 3 }],
    ['(追加)9回・3点差で負け・一死満塁', { inning: 9, outs: 1, bases: [R, R, R], diff: -3 }],
    ['(追加)9回・1点リード・一死満塁', { inning: 9, outs: 1, bases: [R, R, R], diff: 1 }],
  ];
  L.push('## 1. 打者の型 × 場面(打者は強さ「普通」+ 型の差、ばらつきなし。投手はバランス型・普通。各指示:成功確率・評価、★は勝率の期待値が最大)');
  const bestBy = {};
  for (const t of A.typeKeys('batter')) {
    const b = flat('batter', t, lv);
    L.push('### ' + A.typeLabel('batter', t) + ' ' + JSON.stringify(b));
    for (const [nm, o] of scenes) {
      const e = A.evaluate(A.makeScene(Object.assign({ batter: b, pitcher: P0 }, o)));
      L.push(nm + ':' + evs(e) + '(通常の勝率 ' + p1(e.win) + '%)');
      (bestBy[nm] = bestBy[nm] || []).push(A.typeLabel('batter', t) + '→' + A.ORDER_LABEL.bat[e.best]);
    }
  }
  S.push('1. 型 × 場面の最善:' + scenes.slice(0, 4).map(([nm]) => nm + '[' + bestBy[nm].join('、') + ']').join(' / '));
  // 2. 点差と回(同じ打者で、負けている終盤とリードしている終盤)。長打狙いの評価 − 短打狙いの評価
  L.push('## 2. 点差と回で最善が変わるか(8・9回、アウト0〜2 × 走者8通り = 48 状態。打者は各型。「長打狙い > 短打狙い」の状態の数と、評価の差の平均)');
  const st = [];
  for (const inn of [8, 9]) for (let o = 0; o < 3; o++) for (let m = 0; m < 8; m++) st.push({ inning: inn, outs: o, bases: [m & 1 ? R : null, m & 2 ? R : null, m & 4 ? R : null] });
  const s2 = [];
  for (const t of A.typeKeys('batter').concat(['b55'])) {
    const b = t === 'b55' ? { contact: 55, power: 60, speed: 50 } : flat('batter', t, lv);
    const cells = [-3, -2, 0, 1, 3].map((d) => {
      let n = 0, dr = 0;
      for (const x of st) { const e = A.evaluate(A.makeScene(Object.assign({ batter: b, pitcher: P0, diff: d }, x))); const pw = e.rows.find((r) => r.order === 'power'), ct = e.rows.find((r) => r.order === 'contact'); if (pw.win > ct.win) n++; dr += pw.rating - ct.rating; }
      return '差' + (d > 0 ? '+' : '') + d + ' ' + n + '/' + st.length + '(' + (dr / st.length >= 0 ? '+' : '') + (dr / st.length).toFixed(2) + ')';
    });
    const nm = t === 'b55' ? '少し強い打者(55・60・50)' : A.typeLabel('batter', t);
    L.push(nm + ':' + cells.join('、'));
    s2.push(nm + ' ' + cells[0] + ' / ' + cells[3]);
  }
  S.push('2. 長打狙い>短打狙いの状態(48中。−3点 / +1点):' + s2.join('、'));
  // 3. バント・スクイズ・盗塁の評価が 4 以上になる場面
  L.push('## 3. バント・スクイズ・盗塁の評価が 4 以上になる場面(回 3・7・8・9 × 点差 −2〜+2 × アウト × 走者 × 打者の型 × 強さ。盗塁は一塁走者の走力 50 / 80)');
  const tac = { bunt: { n: 0, ok: 0, cases: {} }, squeeze: { n: 0, ok: 0, cases: {} }, steal: { n: 0, ok: 0, cases: {} } };
  for (const inn of [3, 7, 8, 9]) for (let d = -2; d <= 2; d++) for (let o = 0; o < 2; o++) for (let m = 1; m < 8; m++) for (const t of A.typeKeys('batter')) for (const l of A.LEVELS) for (const rs of [50, 80]) {
    const bs = [m & 1 ? rs : null, m & 2 ? R : null, m & 4 ? R : null];
    const sc = A.makeScene({ inning: inn, diff: d, outs: o, bases: bs, batter: flat('batter', t, C.types.levels[l]), pitcher: P0 });
    const e = A.evaluate(sc);
    for (const r of e.rows) if (tac[r.order]) {
      if (r.order !== 'steal' && rs === 80) continue;
      const T = tac[r.order]; T.n++;
      if (r.rating >= 4) { T.ok++; const k = inn + '回・' + (d > 0 ? '+' : '') + d + '・' + o + '死' + A.basesText(bs) + (r.order === 'steal' ? '・走力' + rs : ''); T.cases[k] = T.cases[k] || []; T.cases[k].push(A.typeLabel('batter', t).replace('型', '') + '/' + { strong: '強', normal: '普', weak: '弱' }[l] + ':' + r.rating); }
    }
  }
  const s3 = [];
  for (const k of Object.keys(tac)) {
    const T = tac[k], ks = Object.keys(T.cases);
    L.push('### ' + A.ORDER_LABEL.bat[k] + ':評価 4 以上 ' + T.ok + '/' + T.n + '(' + pc(T.ok / Math.max(1, T.n)) + ')。場面 ' + ks.length + ' 通り');
    for (const c of ks) L.push('  ' + c + ' … ' + T.cases[c].join(' '));
    const late = ks.filter((c) => /^(7|8|9)回・(0|[+-]1)・/.test(c)).length;
    s3.push(A.ORDER_LABEL.bat[k] + ' ' + T.ok + '/' + T.n + '(場面 ' + ks.length + '、うち7回以降で同点か1点差 ' + late + ')' + (T.ok ? '' : ' ✕ すべて 1〜3'));
  }
  S.push('3. 評価 4 以上:' + s3.join('、'));
  // 4. 投手の型 × 配球の指示
  L.push('## 4. 投手の型 × 配球の指示(投手は強さ「普通」+ 型の差。打者はバランス型・普通。守備の場面 48 状態(7〜9回は同点、裏)で、最善になった回数と、評価の平均)');
  const s4 = [];
  for (const t of A.typeKeys('pitcher')) {
    const p = Object.assign(flat('pitcher', t, lv), { quick: 50 }), cnt = {}, rs = {};
    let n = 0;
    for (const x of st.concat(st.map((y) => Object.assign({}, y, { inning: 7 })))) {
      const e = A.evaluate(A.makeScene(Object.assign({ side: 'pitch', batter: B0, pitcher: p, diff: 0 }, x))); n++;
      cnt[e.best] = (cnt[e.best] || 0) + 1;
      for (const r of e.rows) rs[r.order] = (rs[r.order] || 0) + r.rating;
    }
    const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]);
    L.push(A.typeLabel('pitcher', t) + ' ' + JSON.stringify(p) + ':最善 ' + top.map((k) => A.ORDER_LABEL.pitch[k] + ' ' + cnt[k]).join('、') + ' / 評価の平均 ' + Object.keys(rs).map((k) => A.ORDER_LABEL.pitch[k] + ' ' + (rs[k] / n).toFixed(1)).join('、'));
    s4.push(A.typeLabel('pitcher', t) + '→' + A.ORDER_LABEL.pitch[top[0]] + '(' + cnt[top[0]] + '/' + n + ')');
  }
  S.push('4. 投手の型の最善:' + s4.join('、'));
  // 5. 最善の指示の割合(型をランダムに混ぜた N 場面)
  const res = { bat: {}, pitch: {} }, legal = { bat: {}, pitch: {} }, rd = {};
  let rn = 0;
  for (let i = 0; i < N; i++) {
    const sc = A.randomScene(5000 + i), e = A.evaluate(sc), sd = e.side;
    res[sd][e.best] = (res[sd][e.best] || 0) + 1;
    for (const r of e.rows) { legal[sd][r.order] = (legal[sd][r.order] || 0) + 1; rd[r.rating] = (rd[r.rating] || 0) + 1; rn++; }
  }
  L.push('## 5. 最善の指示の割合(ランダムな場面 ' + N + '、型と強さもランダム。その指示が使える場面のうち、最善になった割合。目標 10〜40%)');
  for (const sd of ['bat', 'pitch']) {
    const t = Object.keys(legal[sd]).map((k) => { const v = (res[sd][k] || 0) / legal[sd][k]; return A.ORDER_LABEL[sd][k] + ' ' + pc(v) + '(' + (res[sd][k] || 0) + '/' + legal[sd][k] + ')' + (v >= 0.1 && v <= 0.4 ? '✓' : '✕'); });
    L.push((sd === 'bat' ? '野手' : '投手') + ':' + t.join('、'));
    S.push('5. 最善の割合(' + (sd === 'bat' ? '野手' : '投手') + '):' + t.join('、'));
  }
  const dist = [1, 2, 3, 4, 5, 6, 7].map((k) => k + ':' + pc((rd[k] || 0) / rn)).join(' ');
  L.push('評価の分布(場面×指示 ' + rn + '):' + dist);
  S.push('5b. 評価の分布:' + dist);
  // 6. 試合(通し):介入場面のカード(5試合 × 野手・投手)
  L.push('## 6. 試合(通し)の介入場面のカード(5試合 × 野手・投手。強さはどちらも普通。自分の型はランダム。各カード:成功確率・評価)');
  const s6 = {};
  for (const mode of ['bat', 'pitch']) {
    const rng = [];
    for (let g = 0; g < 5; g++) {
      const G = A.newGame({ seed: 300 + g, mode: mode, my: 'normal', op: 'normal' });
      const me = mode === 'bat' ? G.my.lineup[C.game.myOrder - 1].type : G.my.pitcher.type;
      L.push('### ' + (mode === 'bat' ? '野手' : '投手') + ' シード ' + (300 + g) + '(自分:' + A.typeLabel(mode === 'bat' ? 'batter' : 'pitcher', me) + '、相手の先発:' + A.typeLabel('pitcher', G.op.pitcher.type) + '、事前勝率 ' + pc(G.winP) + ')');
      A.playGame(G, (sc, e) => {
        const rs = e.rows.filter((r) => r.good != null);
        rng.push(Math.max.apply(null, rs.map((r) => r.rating)) - Math.min.apply(null, rs.map((r) => r.rating)));
        L.push('  ' + sc.inning + '回' + (sc.half === 'bottom' ? '裏' : '表') + ' ' + ['無死', '一死', '二死'][sc.outs] + A.basesText(sc.bases) + ' 点差' + (sc.diff > 0 ? '+' : '') + sc.diff + ' 打者:' + A.typeLabel('batter', sc.batType) + '(' + sc.order + '番)/ ' + evs(e));
        return e.best;
      });
    }
    s6[mode] = rng.length ? '介入 ' + rng.length + ' 回、カードの評価の幅(最高−最低)の平均 ' + (rng.reduce((a, b) => a + b, 0) / rng.length).toFixed(1) : '介入なし';
  }
  S.push('6. 試合の介入場面:野手 ' + s6.bat + ' / 投手 ' + s6.pitch);
  const file = path.join(__dirname, 'atbat-t1g-' + N + '.txt');
  fs.writeFileSync(file, '# T1g の検証(能力の型、勝率ベースの評価):ランダムな場面 ' + N + '。所要 ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒\n# 評価:勝率の期待値の、通常との差 ÷ 段階の幅(重要度 × ' + C.rating.levRel + '、下限 ' + C.rating.minWin + ')\n\n## 要約\n' + S.join('\n') + '\n\n' + L.join('\n') + '\n');
  console.log(S.join('\n')); console.log('全出力:' + path.relative(process.cwd(), file));
}

// 試合の通し(T1e):node tools/atbat-sim.js --games N → tools/atbat-game-N.txt に保存(この部分だけを回す)
const gi = process.argv.indexOf('--games');
if (gi >= 0) { runGames(Number(process.argv[gi + 1]) || 200); process.exit(0); }
function runGames(N) {
  const t0 = Date.now(), L = [], S = [], pct = (v) => (v * 100).toFixed(1) + '%';
  const lv = ['strong', 'normal', 'weak'], r = new A.Rng(2024);
  const bins = {}, keyDist = { bat: [0, 0, 0], pitch: [0, 0, 0] }, keyIn = { bat: [0, 0], pitch: [0, 0] }, dWin = { bat: {}, pitch: {} };
  let done = 0, bad1 = 0, runsMy = 0, runsOp = 0, bad6 = 0, bad5 = 0, outRange = 0, walkoff = 0, draws = 0;
  const wv = (G) => (G.result === 'win' ? 1 : G.result === 'draw' ? 0.5 : 0);
  const best = (sc, ev) => ev.best;
  const lineSum = (x) => x.reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0);
  for (let i = 0; i < N; i++) {
    const my = lv[r.int(0, 2)], op = lv[r.int(0, 2)], seed = 10000 + i;
    const base = A.newGame({ seed: seed, mode: 'bat', my: my, op: op });
    const winP = base.winP, bin = Math.min(9, Math.floor(winP * 10));
    if (!A.inWinRange({ winP: winP }, A.CONFIG.game.key)) outRange++;
    for (const mode of ['bat', 'pitch']) {
      const mk = () => A.newGame({ seed: seed, mode: mode, my: my, op: op, winP: winP });
      const gN = A.playGame(mk(), null), gB = A.playGame(mk(), best);
      // 1:完走(9回、またはサヨナラ)
      const ok1 = gN.done && gN.line.my.length === 9 && gN.line.op.length === 9 && (gN.walkoff ? typeof gN.line.op[8] === 'number' : true);
      if (!ok1) bad1++;
      done++;
      // 6:スコアボードの合計と、ログの数字
      for (const g of [gN, gB]) {
        if (lineSum(g.line.my) !== g.score.my || lineSum(g.line.op) !== g.score.op) bad6++;
        for (const x of g.log) if (x.kind === 'half') { const m = x.text.match(/安打(\d+)本|被安打(\d+)/); if ((m && Number(m[1] || m[2]) !== x.hits) || g.line[x.team][x.inn - 1] !== x.runs) bad6++; }
      }
      keyDist[mode][gN.keyLog.length]++;
      if (A.inWinRange({ winP: winP }, A.CONFIG.game.key)) { keyIn[mode][0]++; if (gN.keyLog.length) keyIn[mode][1]++; }
      dWin[mode][bin] = dWin[mode][bin] || { n: 0, d: 0 };
      dWin[mode][bin].n++; dWin[mode][bin].d += wv(gB) - wv(gN);
      if (mode === 'bat') {
        bins[bin] = bins[bin] || { n: 0, w: 0, p: 0 };
        bins[bin].n++; bins[bin].w += wv(gN); bins[bin].p += winP;
        runsMy += gN.score.my; runsOp += gN.score.op; if (gN.walkoff) walkoff++; if (gN.result === 'draw') draws++;
      }
      // 5:同じシード・同じ選択で同じ試合(一部だけ)
      if (i < 30 && JSON.stringify(A.playGame(mk(), best).paLog) !== JSON.stringify(gB.paLog)) bad5++;
    }
  }
  S.push('1. 完走:' + (done - bad1) + '/' + done + ' 試合(野手・投手のモード。9回、またはサヨナラ)' + (bad1 ? ' ✕' : ' ✓') + '。サヨナラ ' + walkoff + '、引き分け ' + draws + '(' + N + '試合中)');
  const bl = Object.keys(bins).sort((a, b) => a - b).map((k) => { const B = bins[k], d = (B.w - B.p) / B.n * 100; return (k * 10) + '〜' + (k * 10 + 10) + '%:実測 ' + pct(B.w / B.n) + '(事前の平均 ' + pct(B.p / B.n) + '、差 ' + d.toFixed(1) + 'pt、' + B.n + '試合)' + (Math.abs(d) <= 5 ? '✓' : '△'); });
  S.push('2. 勝率と事前勝率(「通常」で自動。引き分けは0.5):' + bl.join(' / ') + '。1試合の平均得点:自校 ' + (runsMy / N).toFixed(2) + '、相手 ' + (runsOp / N).toFixed(2));
  for (const m of ['bat', 'pitch']) { const d = keyDist[m], n = d[0] + d[1] + d[2]; S.push('3. 介入場面の回数(' + (m === 'bat' ? '野手' : '投手') + '):0回 ' + pct(d[0] / n) + '、1回 ' + pct(d[1] / n) + '、2回 ' + pct(d[2] / n) + '。1回以上 ' + pct((d[1] + d[2]) / n) + ((d[1] + d[2]) / n >= 0.5 ? ' ✓' : ' ✕') + '(事前勝率が範囲の外の試合 ' + pct(outRange / N) + 'を含む。範囲内の試合のうち1回以上 ' + pct(keyIn[m][1] / Math.max(1, keyIn[m][0])) + ')'); }
  for (const m of ['bat', 'pitch']) S.push('4. 評価が最も高い指示を選び続けた場合の勝率の差(' + (m === 'bat' ? '野手' : '投手') + '。対「通常」):' + Object.keys(dWin[m]).sort((a, b) => a - b).map((k) => (k * 10) + '%台 ' + (dWin[m][k].d / dWin[m][k].n * 100 >= 0 ? '+' : '') + (dWin[m][k].d / dWin[m][k].n * 100).toFixed(1) + 'pt(' + dWin[m][k].n + ')').join('、'));
  S.push('5. 同じシード・同じ選択で同じ試合:' + (bad5 ? '✕ ' + bad5 : '✓') + '(介入より前の打席が変わらないことは、テストで確認)');
  S.push('6. スコアボードの合計とスコア、ログの数字(得点・安打)の食い違い:' + bad6 + ' 件' + (bad6 ? ' ✕' : ' ✓'));
  const file = path.join(__dirname, 'atbat-game-' + N + '.txt');
  fs.writeFileSync(file, '# 試合の通し(T1e)の検証:' + N + ' 試合(各試合を、野手と投手のモードで、「通常」と「評価が最も高い指示」の2通り)\n# 事前勝率の見積もり:' + A.CONFIG.game.priorN + ' 回。所要 ' + Math.round((Date.now() - t0) / 1000) + ' 秒\n\n' + S.join('\n') + '\n');
  console.log(S.join('\n')); console.log('全出力:' + path.relative(process.cwd(), file));
}

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
  const rDist = {}, rTop = { bat: {}, pitch: {} }, rTopF = { bat: {}, pitch: {} }; let rN = 0, tie = 0, dom = 0, gap3 = 0, tacN = 0, tacO = {}, sMin = 1, sMax = 0;
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
    const tc = A.twoChoice(e);
    if (tc.dominated) dom++;
    if (tc.gap != null && tc.gap >= 3) gap3++;
    if (tc.tactic) { tacN++; tacO[tc.tactic.order] = (tacO[tc.tactic.order] || 0) + 1; }
    const topGood = def.reduce((a, b) => (b.good > a.good ? b : a), def[0]);
    if (topGood && topGood.order === e.best) gbBest++;
    const pick = s === 'pitch' ? (a, b) => (b.ev < a.ev ? b : a) : (a, b) => (b.ev > a.ev ? b : a);
    const be = e.rows.reduce(pick).order;
    resEv[s][be] = (resEv[s][be] || 0) + 1;
    lines.push(sc.name + '\t' + s + '\t' + sc.inning + '回 ' + sc.outs + '死 ' + (sc.bases.map((x, i) => (x == null ? '' : i + 1)).join('') || '-') + ' 差' + sc.diff + '\t最善 ' + e.best + '(' + e.metric + ')\t' + e.rows.map((r) => r.order + ' ' + r.ev.toFixed(3) + '/' + (r.p1 * 100).toFixed(1)).join(' '));
  }
  const judge = (o, n) => { const m = Math.max.apply(null, Object.values(o)); return m / n > 0.95 ? '✕' : m / n > 0.6 ? '△' : '✓'; };
  const fmt = (o, n) => Object.keys(o).sort((a, b) => o[b] - o[a]).map((k) => k + ' ' + o[k] + '(' + pct(o[k] / n) + ')').join('、');
  log('## 2. 場面ごとの最善の指示(プリセット ' + A.SCENES.length + ' + ランダム 200)\nT1g:試合の勝率の期待値で比べる(T1f までは、終盤の接戦は「1点以上の確率」、それ以外は得点期待値)');
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
  log('13. 2択(T1f:同じ種類の指示から)で「堅実」が、成功確率でも評価でも「攻め」を上回らない場面:' + pct(dom / all) + '(' + dom + '/' + all + '。T1d は 23.7%。報告のみ)');
  log('13b. 攻めと堅実の評価の差が3段階以上の場面:' + pct(gap3 / all) + '(' + gap3 + '/' + all + ')。作戦のカード(評価' + A.CONFIG.ui.tacticMin + '以上)が出る場面:' + pct(tacN / all) + ' ' + JSON.stringify(tacO));
  log('14. カードの成功確率の範囲:' + pct(sMin) + '〜' + pct(sMax) + '(5〜90% に収める)');
  sum.push('12. 評価が最高の指示が複数ある場面:' + pct(tie / all) + ' / 13. 2択で堅実が攻めに劣る場面:' + pct(dom / all) + '(T1d 23.7%)・評価の差3以上 ' + pct(gap3 / all) + '・作戦のカード ' + pct(tacN / all) + ' / 14. 成功確率の範囲:' + pct(sMin) + '〜' + pct(sMax));
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
fs.writeFileSync(file, '# 打席の試作(T1〜T1g)の検証の出力\n\n## 要約\n' + sum.join('\n') + '\n\n' + out.join('\n\n') + '\n');
console.log(sum.join('\n'));
console.log('全出力:' + path.relative(process.cwd(), file));
