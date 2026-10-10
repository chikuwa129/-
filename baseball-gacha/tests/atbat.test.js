// =============================================================
// tests/atbat.test.js : 打席の試作(T1)の自動確認
//   使い方: node tests/atbat.test.js
// =============================================================
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const A = require('../atbat-engine.js');

let failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); } catch (e) { failed++; console.log('✕ ' + name + '\n   ' + (e && e.message)); }
}
const sum = (P) => A.OUTCOMES.reduce((a, k) => a + P[k], 0);

test('確率の合計が 1(指示・能力・場面を変えても)', () => {
  for (let i = 0; i < 300; i++) {
    const sc = A.randomScene(i);
    for (const o of A.legalOrders(sc)) {
      if (['bunt', 'squeeze', 'steal'].indexOf(o) < 0) assert.ok(Math.abs(sum(A.probs(sc, o)) - 1) < 1e-9, o);
      assert.ok(Math.abs(A.orderBranches(sc, o).reduce((a, x) => a + x.q, 0) - 1) < 1e-9, o + ' の分岐');
    }
  }
});

test('同じシードで、同じ場面と結果', () => {
  assert.deepStrictEqual(A.randomScene(42), A.randomScene(42));
  const run = () => { const r = new A.Rng(5); return Array.from({ length: 30 }, (_, i) => { const sc = A.randomScene(i); return A.resolve(sc, A.legalOrders(sc)[0], r); }); };
  assert.deepStrictEqual(run(), run());
});

test('指示の補正の方向(長打狙い:長打・本塁打・三振が増える。短打狙い:三振が減り単打が増える。外角:本塁打が減り四球が増える)', () => {
  const sc = A.makeScene({});
  const n = A.probs(sc, 'normal'), p = A.probs(sc, 'power'), c = A.probs(sc, 'contact');
  assert.ok(p.XB > n.XB && p.HR > n.HR && p.K > n.K, '長打狙い');
  assert.ok(c.K < n.K && c.S > n.S && c.HR < n.HR, '短打狙い');
  const d = A.makeScene({ side: 'pitch' });
  const dn = A.probs(d, 'normal'), out = A.probs(d, 'outside'), fast = A.probs(Object.assign({}, d, { pitcher: { velocity: 90, control: 50, breaking: 50, quick: 50 } }), 'fast');
  assert.ok(out.HR < dn.HR && out.BB > dn.BB, '外角中心');
  assert.ok(fast.K > A.probs(Object.assign({}, d, { pitcher: { velocity: 90, control: 50, breaking: 50, quick: 50 } }), 'normal').K, '直球中心(球速が高い)');
  assert.strictEqual(A.probs(d, 'walk').BB, 1, '敬遠');
});

test('能力の補正の方向(ミートが高いと三振が減る、パワーが高いと本塁打が増える、制球が高いと四球が減る、守備が高いと単打が減る)', () => {
  const base = A.makeScene({});
  const w = (o) => A.probs(A.makeScene(o), 'normal');
  assert.ok(w({ batter: { contact: 90, power: 50, speed: 50 } }).K < A.probs(base, 'normal').K);
  assert.ok(w({ batter: { contact: 50, power: 90, speed: 50 } }).HR > A.probs(base, 'normal').HR);
  assert.ok(w({ pitcher: { velocity: 50, control: 90, breaking: 50, quick: 50 } }).BB < A.probs(base, 'normal').BB);
  assert.ok(w({ defense: 90 }).S < A.probs(base, 'normal').S);
});

test('指示が使える条件(バント・スクイズ・盗塁・敬遠)', () => {
  const L = (o) => A.legalOrders(A.makeScene(o));
  assert.ok(L({ outs: 0, bases: [50, null, null] }).indexOf('bunt') >= 0 && L({ outs: 2, bases: [50, null, null] }).indexOf('bunt') < 0 && L({ outs: 0, bases: [50, null, 50] }).indexOf('bunt') < 0);
  assert.ok(L({ outs: 1, bases: [null, null, 50] }).indexOf('squeeze') >= 0 && L({ outs: 1, bases: [50, null, null] }).indexOf('squeeze') < 0);
  assert.ok(L({ bases: [50, null, null] }).indexOf('steal') >= 0 && L({ bases: [50, 50, null] }).indexOf('steal') < 0);
  // 敬遠は、既定では出さない(walkEnabled で戻せる)
  assert.ok(L({ side: 'pitch', bases: [null, 50, null] }).indexOf('walk') < 0, '敬遠は出さない');
  A.CONFIG.walkEnabled = true;
  try { assert.ok(L({ side: 'pitch', bases: [null, 50, null] }).indexOf('walk') >= 0 && L({ side: 'pitch', bases: [50, null, null] }).indexOf('walk') < 0); } finally { A.CONFIG.walkEnabled = false; }
});

test('isKeyScene:プリセットごとの判定', () => {
  const S = (o) => A.makeScene(o);
  // success:主人公の打席はすべて。投手はピンチだけ
  assert.strictEqual(A.isKeyScene(S({ inning: 1, hero: true }), 'success'), true);
  assert.strictEqual(A.isKeyScene(S({ inning: 1, hero: false }), 'success'), false);
  assert.strictEqual(A.isKeyScene(S({ side: 'pitch', bases: [null, 50, null], diff: 1 }), 'success'), true);
  assert.strictEqual(A.isKeyScene(S({ side: 'pitch', bases: [50, null, null], diff: 1 }), 'success'), false, '得点圏でない');
  assert.strictEqual(A.isKeyScene(S({ side: 'pitch', bases: [50, 50, 50], diff: 6 }), 'success'), false, '点差が大きい');
  // manager:注目選手・7回以降・チャンス。投手は7回以降のピンチ
  assert.strictEqual(A.isKeyScene(S({ inning: 7, focus: true, bases: [null, 50, null] }), 'manager'), true);
  assert.strictEqual(A.isKeyScene(S({ inning: 6, focus: true, bases: [null, 50, null] }), 'manager'), false, '6回');
  assert.strictEqual(A.isKeyScene(S({ inning: 8, focus: true, bases: [50, null, null] }), 'manager'), false, 'チャンスでない');
  assert.strictEqual(A.isKeyScene(S({ inning: 8, focus: false, hero: true, bases: [null, 50, null] }), 'manager'), false, '注目選手でない');
  assert.strictEqual(A.isKeyScene(S({ side: 'pitch', inning: 7, bases: [null, null, 50], diff: 0 }), 'manager'), true);
  assert.strictEqual(A.isKeyScene(S({ side: 'pitch', inning: 5, bases: [null, null, 50], diff: 0 }), 'manager'), false);
  // 自分で条件を足せる
  assert.strictEqual(A.isKeyScene(S({ inning: 3, hero: true }), { bat: { who: 'all', minInning: 5 } }), false);
});

test('得点期待値:走者が多いほど、アウトが少ないほど高い', () => {
  const re = A.reTable();
  for (let o = 0; o < 3; o++) { assert.ok(re[o * 8 + 7] > re[o * 8 + 1] && re[o * 8 + 1] > re[o * 8]); if (o < 2) assert.ok(re[o * 8] > re[(o + 1) * 8]); }
});

test('成功と失敗は補数(合計 1)。成功確率は 5〜90% に収まる(全場面×全指示。極端な能力を含む)', () => {
  const C = A.CONFIG.cap;
  const ext = [0, 150];
  const check = (sc, tag) => {
    for (const o of A.legalOrders(sc)) {
      const gb = A.goodBadOf(sc, o);
      if (!gb) continue;
      assert.ok(Math.abs(gb.good + gb.bad - 1) < 1e-12, tag + ' ' + o + ' 補数');
      assert.ok(gb.good <= C.max + 1e-9 && gb.good >= C.min - 1e-9, tag + ' ' + o + ' 成功 ' + gb.good);
    }
  };
  for (const side of ['bat', 'pitch']) for (const c of ext) for (const pw of ext) for (const v of ext) for (const ct of ext) for (const d of ext) {
    for (const bases of [[50, null, 50], [50, null, null], [null, 50, null]]) check(A.makeScene({ side: side, outs: 1, bases: bases, batter: { contact: c, power: pw, speed: c }, pitcher: { velocity: v, control: ct, breaking: v, quick: ct }, defense: d, arm: d }), side);
  }
  for (let i = 0; i < 300; i++) check(A.randomScene(i), 'seed' + i);
  // 定義:打者は出塁が成功、投手はアウトが成功(単打は、投手の失敗)
  assert.deepStrictEqual(A.CONFIG.goodBad.pitch.bad.slice().sort(), ['BB', 'HR', 'S', 'XB']);
  for (const side of ['bat', 'pitch']) { const G = A.CONFIG.goodBad[side]; assert.deepStrictEqual(G.good.concat(G.bad).sort(), A.OUTCOMES.slice().sort(), side + ' 7つの結果を必ずどちらかに'); }
});

test('評価の写像(1〜7):通常が 4。得なら大きく、損なら小さく。範囲外は 1・7。T1g:勝率の期待値で、攻守とも勝率が高いほど高い', () => {
  const R = A.CONFIG.rating, st = R.step.ev;
  assert.strictEqual(A.ratingOf(0, 'ev'), 4);
  assert.strictEqual(A.ratingOf(st, 'ev'), 5); assert.strictEqual(A.ratingOf(2 * st, 'ev'), 6); assert.strictEqual(A.ratingOf(-st, 'ev'), 3);
  assert.strictEqual(A.ratingOf(99, 'ev'), 7); assert.strictEqual(A.ratingOf(-99, 'ev'), 1);
  assert.strictEqual(A.ratingOf(R.step.p1, 'p1'), 5);
  assert.strictEqual(A.ratingOf(0.01, 'win', null, 0.005), 6, '段階の幅を渡せる');
  for (let i = 0; i < 200; i++) {
    const e = A.evaluate(A.randomScene(i)), n = e.rows.find((r) => r.order === 'normal');
    assert.strictEqual(e.metric, 'win');
    assert.strictEqual(n.rating, 4, '通常は 4');
    assert.ok(e.rows.every((r) => r.win >= n.win - 1e-12) ? e.best === n.order || e.rows.find((r) => r.order === e.best).win >= n.win : true);
    for (const r of e.rows) {
      const better = r.win > n.win;
      if (r.rating > 4) assert.ok(better, '得なのに 5 以上でない');
      if (r.rating < 4) assert.ok(!better, '損なのに 3 以下でない');
    }
  }
});

test('表示の切り替えで、カードの内容が変わる(2択は、同じ種類の指示から攻めと堅実。作戦は評価5以上のときだけ3枚目)', () => {
  const U = A.CONFIG.ui;
  let tacSeen = 0, noTac = 0;
  for (let i = 0; i < 300; i++) {
    const sc = A.randomScene(i), e = A.evaluate(sc), rows = e.rows.filter((r) => r.good != null);
    const ra = A.cardsOf(e, 'rating'), po = A.cardsOf(e, 'prob-only'), tw = A.cardsOf(e, 'two-choice');
    assert.strictEqual(ra.length, rows.length); assert.ok(ra.every((c) => c.rating >= 1 && c.rating <= 7 && c.good != null && c.feature));
    assert.strictEqual(po.length, rows.length); assert.ok(po.every((c) => c.rating == null), '成功確率だけ');
    assert.ok(tw.every((c) => c.sub && c.name !== c.sub), '実際の指示の名前');
    const grp = U.twoGroups[sc.side === 'pitch' ? 'pitch' : 'bat'], same = rows.filter((r) => grp.indexOf(r.order) >= 0);
    const maxR = Math.max.apply(null, same.map((r) => r.rating));
    const att = same.filter((r) => r.rating === maxR).reduce((a, b) => (b.good < a.good ? b : a));
    assert.strictEqual(tw[0].as, 'attack'); assert.strictEqual(tw[0].order, att.order, '攻め=同じ種類で評価が最も高い(同じなら成功確率が低いほう)');
    const safe = same.filter((r) => r.order !== att.order).reduce((a, b) => (b.good > a.good ? b : a));
    assert.strictEqual(tw[1].as, 'safe'); assert.strictEqual(tw[1].order, safe.order, '堅実=同じ種類で、攻めを除いて成功確率が最も高い');
    assert.ok(grp.indexOf(tw[0].order) >= 0 && grp.indexOf(tw[1].order) >= 0, '作戦系は2択に入らない');
    const tacs = rows.filter((r) => grp.indexOf(r.order) < 0 && r.rating >= U.tacticMin);
    const t3 = tw.find((c) => c.as === 'tactic');
    if (tacs.length) { tacSeen++; assert.ok(t3 && grp.indexOf(t3.order) < 0 && t3.rating === Math.max.apply(null, tacs.map((r) => r.rating)), '作戦のカード'); assert.strictEqual(tw.length, 3); }
    else { noTac++; assert.ok(!t3, '評価が低い作戦は出さない'); assert.strictEqual(tw.length, 2); }
  }
  assert.ok(tacSeen > 0 && noTac > 0, '作戦のカードが出る場面と出ない場面の両方 ' + tacSeen + '/' + noTac);
  // 同じ種類に、攻め以外の候補がないときは、攻めだけ
  const keep = U.twoGroups.bat;
  try { U.twoGroups.bat = ['normal']; const t = A.cardsOf(A.evaluate(A.makeScene({})), 'two-choice'); assert.deepStrictEqual(t.map((c) => c.as), ['attack']); } finally { U.twoGroups.bat = keep; }
});

test('表と裏は自校先攻(攻撃は表、守備は裏)', () => {
  assert.strictEqual(A.makeScene({}).half, 'top'); assert.strictEqual(A.makeScene({ side: 'pitch' }).half, 'bottom');
  for (let i = 0; i < 50; i++) { const sc = A.randomScene(i); assert.strictEqual(sc.half, sc.side === 'pitch' ? 'bottom' : 'top'); }
  const html = fs.readFileSync(path.join(__dirname, '..', 'atbat.html'), 'utf8');
  assert.ok(/戦力:/.test(html) && /いまの勝率:/.test(html), '戦力と勝率のラベルを分ける');
});

test('特徴の一言は、実際の確率の変化から作られる(確率を変えると、矢印が変わる)', () => {
  const sc = A.makeScene({});
  const f = (o) => A.evaluate(sc).rows.find((r) => r.order === o).feature;
  assert.strictEqual(f('normal').text, A.CONFIG.feature.normal);
  assert.ok(f('power').up.indexOf('K') >= 0 && f('contact').down.indexOf('K') >= 0, '長打狙いは三振↑、短打狙いは三振↓');
  const keep = A.CONFIG.orders.bat.power;
  try {
    A.CONFIG.orders.bat.power = { BB: { m: 1 }, K: { m: -1 } };
    const g = A.evaluate(A.makeScene({})).rows.find((r) => r.order === 'power').feature;
    assert.ok(g.up.indexOf('BB') >= 0 && g.down.indexOf('K') >= 0 && /四球↑/.test(g.text) && /三振↓/.test(g.text), g.text);
    A.CONFIG.orders.bat.power = {};
    assert.strictEqual(A.evaluate(A.makeScene({})).rows.find((r) => r.order === 'power').feature.text, A.CONFIG.feature.flat, '変化がなければ「ほぼ同じ」');
  } finally { A.CONFIG.orders.bat.power = keep; }
  assert.ok(f('power').up.length <= A.CONFIG.feature.maxEach && f('power').down.length <= A.CONFIG.feature.maxEach);
  const b = A.evaluate(A.makeScene({ outs: 0, bases: [50, null, null] })).rows.find((r) => r.order === 'bunt').feature;
  assert.strictEqual(b.text, A.CONFIG.feature.mech.bunt, 'バントは仕組みの文');
});
test('事前勝率が範囲の外なら isKeyScene は false(勝負にならない試合)。戦力差のラベル', () => {
  const R = A.CONFIG.keyScene.success.winRange;
  const base = { inning: 8, hero: true, focus: true, bases: [null, 50, null], diff: 0 };
  for (const rule of ['success', 'manager']) {
    assert.strictEqual(A.isKeyScene(A.makeScene(Object.assign({}, base, { winP: 0.5 })), rule), true, rule + ' 範囲内');
    assert.strictEqual(A.isKeyScene(A.makeScene(Object.assign({}, base, { winP: R[0] - 0.01 })), rule), false, rule + ' 下');
    assert.strictEqual(A.isKeyScene(A.makeScene(Object.assign({}, base, { winP: R[1] + 0.01 })), rule), false, rule + ' 上');
    assert.strictEqual(A.isKeyScene(A.makeScene(Object.assign({}, base, { side: 'pitch', winP: 0.95 })), rule), false, rule + ' 投手');
  }
  assert.strictEqual(A.strengthLabel(0.35), '格上'); assert.strictEqual(A.strengthLabel(0.5), '同格'); assert.strictEqual(A.strengthLabel(0.7), '格下');
});

test('試合の勝率:事前勝率で始まり、点を取ると上がり、失点を防ぐと上がる', () => {
  for (const w of [0.3, 0.5, 0.7]) assert.ok(Math.abs(A.gameWinProb(A.makeScene({ winP: w, inning: 1, half: 'top' })) - w) < 0.05, '開始 ' + w);
  const sc = A.makeScene({ inning: 6, outs: 1, bases: [null, 50, null] });
  assert.ok(A.gameWinProb(sc, { outs: 1, bases: [null, null, null], diff: 1 }) > A.gameWinProb(sc));
  const d = A.makeScene({ side: 'pitch', inning: 6, outs: 1, bases: [null, 50, null] });
  assert.ok(A.gameWinProb(d, { outs: 2, bases: [null, 50, null], diff: 0 }) > A.gameWinProb(d), '守備でアウトを取る');
});

// ---------- T1c ----------
const ART = require('../atbat-art.js');
test('線画の部品が単独で動き、左右の反転が正しい(右と左で、同じ形の鏡像)', () => {
  for (const mode of ['bat', 'pitch']) {
    const rr = ART.draw({ mode: mode, bats: 'R', throws: 'R' }), ll = ART.draw({ mode: mode, bats: 'L', throws: 'L' });
    assert.ok(/^<svg[^>]*viewBox="0 0 200 120"/.test(rr), 'SVG');
    const part = (svg, name) => { const m = svg.match(new RegExp('<g data-part="' + name + '" data-flip="(\\d)"(?: data-view="[^"]*")?( transform="([^"]*)")?>(.*?)</g>')); return m && { flip: m[1], tf: m[3] || '', body: m[4] }; };
    for (const name of ['batter', 'pitcher']) {
      const a = part(rr, name), b = part(ll, name);
      assert.ok(a && b, mode + ' ' + name);
      assert.notStrictEqual(a.flip, b.flip, mode + ' ' + name + ' 右と左で、反転が逆');
      const fl = a.flip === '1' ? a : b, nf = a.flip === '1' ? b : a;
      assert.strictEqual(nf.tf, ''); assert.ok(/scale\(-1,1\)/.test(fl.tf), '反転');
      assert.strictEqual(a.body, b.body, '同じ形(鏡像)');
    }
    // 投げの左右は、右投げが基準(反転しない)。打席と投げは、別々に反転する
    assert.strictEqual(part(rr, 'pitcher').flip, '0');
    const rl = ART.draw({ mode: mode, bats: 'R', throws: 'L' });
    assert.strictEqual(part(rl, 'batter').flip, part(rr, 'batter').flip); assert.strictEqual(part(rl, 'pitcher').flip, '1');
    assert.ok(/data-mode="/.test(rr), 'data-mode');
    for (const name of ['batter', 'pitcher']) { const n = (part(rr, name).body.match(/<path/g) || []).length; assert.ok(n <= 40, name + ' のパスの数 ' + n); }
  }
  const c = ART.draw({ mode: 'bat', color: '#123456', bg: '#abcdef' });
  assert.ok(c.indexOf('stroke="#123456"') >= 0 && c.indexOf('fill="#abcdef"') >= 0, '色の指定');
});

test('線画:人の形の要素(頭・首・胴・腕・脚・手・靴、帽子かヘルメット、道具)がそろう', () => {
  const els = (svg, name) => { const m = svg.match(new RegExp('<g data-part="' + name + '"[^>]*>(.*?)</g>')); return new Set((m[1].match(/data-el="(\w+)"/g) || []).map((x) => x.slice(9, -1))); };
  const need = (set, list, tag) => { for (const k of list) assert.ok(set.has(k), tag + ' に ' + k + ' がない'); };
  const human = ['head', 'neck', 'torso', 'uniform', 'arm', 'leg', 'hand', 'shoe'];
  const bat = ART.draw({ mode: 'bat' }), pit = ART.draw({ mode: 'pitch' });
  need(els(bat, 'batter'), human.concat(['helmet', 'bat']), '打者(手前)');
  need(els(bat, 'pitcher'), human.concat(['cap', 'glove', 'ball']), '投手(奥)');
  need(els(pit, 'batter'), human.concat(['helmet', 'bat']), '打者(奥)');
  need(els(pit, 'plate'), ['head', 'torso', 'leg', 'mask', 'mitt', 'plate'], '捕手');
  need(els(pit, 'pitcher'), human.concat(['cap', 'glove', 'ball']), '自分の投手(手前。引きの後ろ姿)');
  assert.ok(/data-part="batter"[^>]*data-view="side"/.test(bat) && /data-part="batter"[^>]*data-view="side"/.test(pit), '打者は横向き');
  assert.ok(/data-part="pitcher"[^>]*data-view="back"/.test(pit), '投手のモードの自分は後ろ姿');
  assert.ok(!/<circle|<line /.test(bat + pit), '輪郭は閉じた形(棒と丸だけで描かない)');
  assert.notStrictEqual(ART.draw({ mode: 'bat', heads: 5 }), bat, '頭身の設定');
});

test('打者は横向き:ホームベースの横に立ち、胸をホームベースへ。バットは後ろの肩の上で、先は後ろ上方。右と左で鏡像', () => {
  const P = ART.POSE;
  assert.ok(P.torso[1] - P.torso[0] < 14 * 0.75, '胴の厚み(横向き)は、正面の肩幅(14)より狭い');
  for (const mode of ['bat', 'pitch']) {
    const R = ART.batterModel({ mode: mode, bats: 'R' }), L = ART.batterModel({ mode: mode, bats: 'L' });
    for (const [M, tag] of [[R, '右'], [L, '左']]) {
      const t = mode + ' ' + tag;
      assert.ok((M.plateX - M.center[0]) * M.facing > 10, t + ' ホームベースの横に立ち、胸をホームベースへ');
      assert.ok((M.grip[0] - M.center[0]) * M.facing < 0, t + ' 握りは後ろの側');
      assert.ok((M.batTip[0] - M.grip[0]) * M.facing < 0 && M.batTip[1] < M.grip[1], t + ' バットの先は後ろ上方');
      assert.ok(M.grip[1] < M.center[1], t + ' 肩の高さで構える');
      assert.ok((M.frontFoot[0] - M.backFoot[0]) * M.facing > 0, t + ' 前の足がホームベースの側');
    }
    assert.ok(Math.abs(R.center[0] + L.center[0] - 200) < 1e-9 && R.facing === -L.facing, mode + ' 右と左で鏡像');
  }
  assert.ok(ART.batterModel({ mode: 'bat', bats: 'R' }).center[0] < 100, '打者のモードの右打者は、画面の左');
  assert.ok(ART.batterModel({ mode: 'pitch', bats: 'R' }).center[0] > 100, '投手のモードの右打者は、投手から見て画面の右');
  assert.ok(ART.batterModel({ mode: 'pitch', bats: 'R', pitchRightyOn: 'left' }).center[0] < 100, '設定で左にもできる');
});

test('左右:同じシードで同じ割り当て。右の割合は設定どおり。確率の計算には使われない', () => {
  assert.deepStrictEqual(A.handsOf(77), A.handsOf(77));
  assert.deepStrictEqual({ bats: A.randomScene(77).bats, throws: A.randomScene(77).throws }, A.handsOf(77));
  let r = 0; const N = 4000;
  for (let i = 0; i < N; i++) { const h = A.handsOf(i); r += (h.bats === 'R') + (h.throws === 'R'); }
  assert.ok(Math.abs(r / (2 * N) - A.CONFIG.hands.right) < 0.03, '右の割合 ' + (r / (2 * N)).toFixed(3));
  for (let i = 0; i < 50; i++) {
    const sc = A.randomScene(i);
    for (const o of A.legalOrders(sc)) {
      const x = A.orderBranches(Object.assign({}, sc, { bats: 'R', throws: 'R' }), o), y = A.orderBranches(Object.assign({}, sc, { bats: 'L', throws: 'L' }), o);
      assert.deepStrictEqual(x, y, '左右で確率が変わらない');
    }
  }
});

test('傾向タグは、実際の能力から作られる(能力を変えるとタグが変わる。最大3つ。該当がなければ「平均的」)', () => {
  assert.deepStrictEqual(A.tagsOf('batter', { contact: 50, power: 50, speed: 50 }), ['平均的']);
  assert.deepStrictEqual(A.tagsOf('batter', { contact: 90, power: 50, speed: 50 }), ['巧打']);
  assert.deepStrictEqual(A.tagsOf('batter', { contact: 50, power: 10, speed: 50 }), ['非力']);
  assert.ok(A.tagsOf('batter', { contact: 90, power: 10, speed: 95 }).length <= 3);
  assert.deepStrictEqual(A.tagsOf('pitcher', { velocity: 85, control: 20, breaking: 50 }), ['速球派', '制球が荒い']);
  // タグの能力は、確率に効いている(速球派 → 三振が増える、制球が荒い → 四球が増える)
  const base = A.probs(A.makeScene({}), 'normal');
  assert.ok(A.probs(A.makeScene({ pitcher: { velocity: 85, control: 50, breaking: 50, quick: 50 } }), 'normal').K > base.K);
  assert.ok(A.probs(A.makeScene({ pitcher: { velocity: 50, control: 20, breaking: 50, quick: 50 } }), 'normal').BB > base.BB);
});

test('1タップで確定:カードを押すと、すぐ結果(決定ボタンがない)。結果が出るまでは次へ進まない', () => {
  let s = A.uiStep(null, 'next');
  assert.deepStrictEqual(A.uiStep(s, 'next'), s, '選ぶ前は進まない');
  s = A.uiStep(s, 'pick', 'power'); assert.deepStrictEqual(s.result, { order: 'power' });
  s = A.uiStep(s, 'pick', 'contact'); assert.strictEqual(s.result.order, 'power', '結果のあとは選び直せない');
  assert.deepStrictEqual(A.uiStep(s, 'next'), { sel: null, result: null });
  assert.deepStrictEqual(A.uiStep(A.uiStep(null, 'next'), 'auto').result, { order: 'normal', auto: true }, '勝負にならない試合');
  const html = fs.readFileSync(path.join(__dirname, '..', 'atbat.html'), 'utf8');
  assert.ok(!/id="ok"|>決定</.test(html), '決定ボタンがない');
  assert.ok(/resultMs/.test(html) && /setTimeout/.test(html), '結果のあと、自動で次へ');
});

// ---------- T1e:試合の通し ----------
const best = (sc, ev) => ev.best;
const lineSum = (L) => L.reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0);
test('試合が完走し、スコアボードの合計がスコアと一致する。9回(またはサヨナラ)で終わり、x の規則を守る', () => {
  for (let i = 0; i < 40; i++) {
    for (const mode of ['bat', 'pitch']) {
      const G = A.playGame(A.newGame({ seed: 100 + i, mode: mode, my: ['strong', 'normal', 'weak'][i % 3], op: ['weak', 'normal', 'strong'][(i >> 1) % 3], winP: 0.5 }), best);
      assert.ok(G.done && ['win', 'lose', 'draw'].indexOf(G.result) >= 0);
      assert.strictEqual(lineSum(G.line.my), G.score.my, '自校の合計'); assert.strictEqual(lineSum(G.line.op), G.score.op, '相手の合計');
      assert.strictEqual(G.line.my.length, 9, '自校は9回');
      assert.strictEqual(G.line.op.length, 9);
      if (G.line.op[8] === 'x') assert.ok(G.score.op > G.score.my && lineSum(G.line.op.slice(0, 8)) === G.score.op, '9回裏なし=相手がリード');
      if (G.walkoff) assert.ok(G.result === 'lose' && typeof G.line.op[8] === 'number');
      if (G.result === 'draw') assert.strictEqual(G.score.my, G.score.op);
    }
  }
});

test('ログの文は実際の記録と一致する(得点・スコア・安打の数)', () => {
  for (let i = 0; i < 40; i++) {
    const G = A.playGame(A.newGame({ seed: 300 + i, mode: i % 2 ? 'bat' : 'pitch', winP: 0.5 }), best);
    let my = 0, op = 0;
    for (const x of G.log) {
      if (x.kind === 'half') {
        if (x.team === 'my') my += x.runs; else op += x.runs;
        assert.deepStrictEqual(x.score, [my, op], 'スコアの経過');
        assert.strictEqual(G.line[x.team][x.inn - 1], x.runs, 'スコアボードと一致');
        const m = x.text.match(/安打(\d+)本|被安打(\d+)/); if (m) assert.strictEqual(Number(m[1] || m[2]), x.hits, x.text);
        const sm = x.text.match(/\((\d+)-(\d+)\)/); if (sm) assert.deepStrictEqual([Number(sm[1]), Number(sm[2])], x.score, x.text);
        const rm = x.text.match(/(\d+)点/); if (rm) assert.strictEqual(Number(rm[1]), x.runs, x.text);
        assert.strictEqual(x.hl, x.runs > 0, 'ハイライト=得点の回');
        if (x.runs === 0) assert.ok(!/点を取|点が入|点を許|点を失/.test(x.text), x.text);
      }
      if (x.kind === 'end') assert.ok(x.text.indexOf(G.score.my + '-' + G.score.op) >= 0);
    }
    // 同じ文が、同じ種類で続けて出ない
    const byCat = {}; for (const x of G.log.filter((y) => y.kind === 'half')) { assert.notStrictEqual(byCat[x.cat], x.text.replace(/^\S+ /, '') + '|' + x.runs + x.hits + x.lob + x.score, '同じ文が続く'); byCat[x.cat] = x.text.replace(/^\S+ /, '') + '|' + x.runs + x.hits + x.lob + x.score; }
  }
});

test('介入の上限が守られ、介入場面はモードの条件どおり。事前勝率が範囲の外なら、介入場面を作らない', () => {
  const K = A.CONFIG.game.key;
  let anyBat = 0, anyPitch = 0;
  for (let i = 0; i < 40; i++) {
    for (const mode of ['bat', 'pitch']) {
      const seen = [];
      const G = A.playGame(A.newGame({ seed: 500 + i, mode: mode, winP: 0.5 }), (sc, ev) => { seen.push(sc); return ev.best; });
      assert.ok(G.keyLog.length <= A.CONFIG.game.maxKeys && seen.length === G.keyLog.length, '上限');
      for (const sc of seen) {
        if (mode === 'bat') { assert.ok(sc.side === 'bat' && sc.hero && sc.order === A.CONFIG.game.myOrder, '自分の打席'); anyBat++; }
        else { assert.ok(sc.side === 'pitch' && sc.inning >= K.pitch.minInning && (sc.bases[1] != null || sc.bases[2] != null) && Math.abs(sc.diff) <= K.pitch.maxDiff, 'ピンチ'); anyPitch++; }
      }
      for (const wp of [K.winRange[0] - 0.05, K.winRange[1] + 0.05]) assert.strictEqual(A.playGame(A.newGame({ seed: 500 + i, mode: mode, winP: wp }), best).keyLog.length, 0, '範囲の外');
    }
  }
  assert.ok(anyBat > 0 && anyPitch > 0);
  const keep = A.CONFIG.game.maxKeys;
  try { A.CONFIG.game.maxKeys = 1; assert.ok(A.playGame(A.newGame({ seed: 1, mode: 'bat', winP: 0.5 }), best).keyLog.length <= 1); } finally { A.CONFIG.game.maxKeys = keep; }
});

test('同じシード・同じ選択で同じ試合。選択を変えても、介入場面より前の打席は変わらない', () => {
  for (let i = 0; i < 20; i++) {
    const mk = () => A.newGame({ seed: 700 + i, mode: 'bat', winP: 0.5 });
    const a = A.playGame(mk(), best), b = A.playGame(mk(), best);
    assert.deepStrictEqual(a.paLog, b.paLog); assert.deepStrictEqual(a.log.map((x) => x.text), b.log.map((x) => x.text));
    let firstKey = -1;
    const c = mk(); while (!c.done) { const e = A.advance(c); if (e.type === 'key') { if (firstKey < 0) firstKey = c.pa; A.choose(c, 'power'); } }
    const n = A.playGame(mk(), null);
    if (firstKey >= 0) assert.deepStrictEqual(c.paLog.slice(0, firstKey), n.paLog.slice(0, firstKey), '介入より前は同じ');
  }
  // 事前勝率の見積もりも、シードで決まる
  const keep = A.CONFIG.game.priorN;
  try { A.CONFIG.game.priorN = 30; assert.strictEqual(A.newGame({ seed: 9 }).winP, A.newGame({ seed: 9 }).winP); } finally { A.CONFIG.game.priorN = keep; }
});

test('試合のモードの画面:スキップのボタンがなく、スコアボードとログがある', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'atbat.html'), 'utf8');
  assert.ok(!/スキップ/.test(html), 'スキップのボタンを作らない');
  assert.ok(/scoreboardHtml/.test(html) && /logHtml/.test(html) && /holdSpeed/.test(html) && /同じシードで、もう一度/.test(html));
});

// 本編のファイルが、試作の前後で変わっていない(タグ v-before-T1 と比べる)
test('本編の出力(play.html・play-hero.html)が、試作の前と一致する', () => {
  const cp = require('child_process');
  const root = path.join(__dirname, '..');
  for (const tag of ['v-before-T1', 'v-before-T1d', 'v-before-T1g']) {
    try { cp.execFileSync('git', ['rev-parse', '-q', '--verify', 'refs/tags/' + tag], { cwd: root, stdio: 'ignore' }); } catch (e) { console.log('   (タグ ' + tag + ' がないので、比較を省略)'); continue; }
    for (const f of ['play.html', 'play-hero.html']) {
      const before = cp.execFileSync('git', ['show', tag + ':baseball-gacha/' + f], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
      assert.ok(before === fs.readFileSync(path.join(root, f), 'utf8'), f + ' が ' + tag + ' から変わっている');
    }
  }
});

// ---------- T1g ----------
test('能力の型:型の表が能力に反映される(型の差 ± ばらつき。0〜150)。傾向タグが型に合う', () => {
  const C = A.CONFIG, T = C.types, j = T.jitter;
  const tagOf = { contact: '巧打', slugger: '長打力', speed: '俊足' }, ptag = { fastball: '速球派', breaker: '変化球が多彩', control: '制球が良い' };
  let tagHit = 0, tagN = 0;
  for (let i = 0; i < 300; i++) {
    const p = A.playersOf(i, {});
    for (const [kind, ab, t, l] of [['batter', p.batter, p.batType, p.batLevel], ['pitcher', p.pitcher, p.pitType, p.pitLevel]]) {
      const keys = kind === 'batter' ? ['contact', 'power', 'speed'] : ['velocity', 'control', 'breaking'];
      for (const k of keys) { const want = T.levels[l] + (T[kind][t][k] || 0); assert.ok(ab[k] >= Math.max(0, want - j) && ab[k] <= Math.min(T.max, want + j), kind + ' ' + t + ' ' + k + ' ' + ab[k] + ' / ' + want); }
      const w = kind === 'batter' ? tagOf[t] : ptag[t];
      if (w && l !== 'weak') { tagN++; if (A.tagsOf(kind, ab).indexOf(w) >= 0) tagHit++; }
    }
  }
  assert.ok(tagHit / tagN >= 0.9, '型に合う傾向タグ ' + tagHit + '/' + tagN);
  // 指定した型と強さが使われる。指定を変えても、相手の側の値はずれない
  const a = A.playersOf(7, { batType: 'slugger', batLevel: 'strong' }), b = A.playersOf(7, { batType: 'speed', batLevel: 'weak' });
  assert.ok(a.batType === 'slugger' && a.batLevel === 'strong' && b.batType === 'speed' && b.batLevel === 'weak');
  assert.deepStrictEqual(a.pitcher, b.pitcher);
  assert.ok(a.batter.power > b.batter.power && b.batter.speed > a.batter.speed);
  // 場面は型から(歯車のプリセットで C C C に固定されない)
  const ranks = new Set(Array.from({ length: 30 }, (_, i) => { const s = A.randomScene(i); return ['contact', 'power', 'speed'].map((k) => A.rankOf(s.batter[k])).join(''); }));
  assert.ok(ranks.size >= 10, '能力のランクの組み合わせ ' + ranks.size);
});

test('場面のモード:結果のあとは別の場面になる(同じ打者が3アウトまで続かない)。型と強さの選択。新入部員と監督の切り替えを出さない', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'atbat.html'), 'utf8');
  const ns = html.slice(html.indexOf('function nextScene()'), html.indexOf('// ---------- 舞台'));
  assert.ok(/S\.seed = \(S\.seed \+ 1\)/.test(ns) && /newScene\(true\)/.test(ns) && !/result\.outs < 3/.test(ns), '結果のあとは次のシードの場面');
  assert.ok(!/applyPresets/.test(html) && !/PRESETS\.batter\[S\./.test(html), '歯車のプリセットで能力を上書きしない');
  assert.ok(/typeChips\('batType'/.test(html) && /typeChips\('pitType'/.test(html) && /chip\('lv', 'random'/.test(html) && /typeChips\('myType'/.test(html), '型と強さの選択');
  assert.ok(!/chip\('key', 'success'/.test(html), '新入部員と監督の切り替えを出さない');
  // 次の場面(シード+1)は、型・走者・アウト・点差・回のどれかが違う
  let diff = 0;
  for (let i = 1; i < 40; i++) { const x = A.randomScene(i), y = A.randomScene(i + 1); if (JSON.stringify([x.batter, x.pitcher, x.bases, x.outs, x.diff, x.inning]) !== JSON.stringify([y.batter, y.pitcher, y.bases, y.outs, y.diff, y.inning])) diff++; }
  assert.strictEqual(diff, 39);
});

test('試合の編成:打順ごとの型が割り当てどおり。自分の型を選べる。投手のモードでは相手の打者の型が打順で変わる', () => {
  const G0 = A.CONFIG.game;
  const seen = new Set();
  for (let s = 0; s < 30; s++) {
    const G = A.newGame({ seed: s, mode: 'bat', winP: 0.5 });
    for (const t of [G.my, G.op]) {
      t.lineup.forEach((b, i) => assert.ok(G0.lineupTypes[i].indexOf(b.type) >= 0, (i + 1) + '番 ' + b.type));
      assert.ok(G0.pitTypes.indexOf(t.pitcher.type) >= 0);
      seen.add(t.lineup.map((b) => b.type).join(','));
    }
    assert.strictEqual(G.my.lineup[0].type, 'speed'); assert.strictEqual(G.my.lineup[1].type, 'contact');
  }
  assert.ok(seen.size >= 20, '試合ごとに型の組み合わせが変わる ' + seen.size);
  const g1 = A.newGame({ seed: 4, mode: 'bat', myType: 'slugger', winP: 0.5 }), g2 = A.newGame({ seed: 4, mode: 'bat', myType: 'speed', winP: 0.5 });
  assert.ok(g1.my.lineup[2].type === 'slugger' && g2.my.lineup[2].type === 'speed', '自分(3番)の型');
  assert.deepStrictEqual(g1.op, g2.op, '自分の型を変えても、相手の編成は同じ');
  assert.strictEqual(A.newGame({ seed: 4, mode: 'pitch', myType: 'breaker', winP: 0.5 }).my.pitcher.type, 'breaker', '投手のモードは投手の型');
  assert.deepStrictEqual(A.newGame({ seed: 4, mode: 'bat', winP: 0.5 }).my, A.newGame({ seed: 4, mode: 'bat', winP: 0.5 }).my, '同じシードで同じ編成');
  // 投手のモード:介入場面の相手の打者の型(curScene が打順の型を持つ)
  const G = A.newGame({ seed: 11, mode: 'pitch', winP: 0.5 }), types = new Set();
  for (let i = 0; i < 9; i++) { G.idx.op = i; G.top = false; const sc = A.curScene(G); assert.strictEqual(sc.batType, G.op.lineup[i].type); types.add(sc.batType); }
  assert.ok(types.size >= 2, '打順で型が変わる');
});

test('評価は勝率ベース:型で最善が変わり、点差で長打狙いと短打狙いの順が入れかわる。終盤の同点でバントの評価が上がる', () => {
  const R = 50, P = { velocity: 50, control: 50, breaking: 50, quick: 50 };
  const ev = (o) => A.evaluate(A.makeScene(Object.assign({ pitcher: P }, o)));
  const w = (e, k) => e.rows.find((r) => r.order === k).win;
  // 型:巧打型は短打狙い、長距離型は長打狙い(一死二塁・5回・同点)
  const st = { inning: 5, outs: 1, bases: [null, R, null] };
  assert.strictEqual(ev(Object.assign({ batter: { contact: 80, power: 40, speed: 50 } }, st)).best, 'contact');
  assert.strictEqual(ev(Object.assign({ batter: { contact: 40, power: 80, speed: 45 } }, st)).best, 'power');
  // 点差:同じ打者・同じ状態(9回・一死満塁)で、大差で負けていれば長打狙い > 短打狙い、リードしていれば逆
  const b = { contact: 55, power: 60, speed: 50 }, full = { inning: 9, outs: 1, bases: [R, R, R], batter: b };
  const lose = ev(Object.assign({ diff: -3 }, full)), lead = ev(Object.assign({ diff: 1 }, full));
  assert.ok(w(lose, 'power') > w(lose, 'contact'), '負けている終盤は長打狙い');
  assert.ok(w(lead, 'contact') > w(lead, 'power'), 'リードしている終盤は短打狙い');
  // 送りバント:9回・同点・無死二塁は評価 5 以上、3回・無死一塁は 3 以下
  const bal = { contact: 50, power: 50, speed: 50 };
  assert.ok(ev({ inning: 9, outs: 0, bases: [null, R, null], batter: bal }).rows.find((r) => r.order === 'bunt').rating >= 5, '終盤の同点のバント');
  assert.ok(ev({ inning: 3, outs: 0, bases: [R, null, null], batter: bal }).rows.find((r) => r.order === 'bunt').rating <= 3, '序盤のバント');
  // 投手の型:速球型は直球中心、変化球型は変化球中心
  const dp = { side: 'pitch', inning: 7, outs: 1, bases: [null, R, null], batter: bal };
  assert.strictEqual(ev(Object.assign({}, dp, { pitcher: { velocity: 80, control: 45, breaking: 40, quick: 50 } })).best, 'fast');
  assert.strictEqual(ev(Object.assign({}, dp, { pitcher: { velocity: 40, control: 50, breaking: 80, quick: 50 } })).best, 'breaking');
  // 勝率の推定:9回裏の守備で、先がないときは、勝ち・引き分け・負けで決まる
  const last = A.makeScene({ side: 'pitch', inning: 9, half: 'bottom', outs: 2, bases: [null, null, null], diff: 1 });
  assert.ok(A.gameWinProb(last, { outs: 3, bases: [null, null, null], diff: 1 }) > 0.99 && A.gameWinProb(last, { outs: 3, bases: [null, null, null], diff: 0 }) === 0.5);
});

console.log(failed ? '\n失敗 ' + failed + '件' : '\nすべて成功(' + passed + '件)');
process.exit(failed ? 1 : 0);
