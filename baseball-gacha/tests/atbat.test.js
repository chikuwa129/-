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

test('評価の写像(1〜7):通常が 4。得なら大きく、損なら小さく。範囲外は 1・7。投手は失点が小さいほど高い', () => {
  const R = A.CONFIG.rating, st = R.step.ev;
  assert.strictEqual(A.ratingOf(0, 'ev'), 4);
  assert.strictEqual(A.ratingOf(st, 'ev'), 5); assert.strictEqual(A.ratingOf(2 * st, 'ev'), 6); assert.strictEqual(A.ratingOf(-st, 'ev'), 3);
  assert.strictEqual(A.ratingOf(99, 'ev'), 7); assert.strictEqual(A.ratingOf(-99, 'ev'), 1);
  assert.strictEqual(A.ratingOf(R.step.p1, 'p1'), 5);
  for (let i = 0; i < 200; i++) {
    const e = A.evaluate(A.randomScene(i)), n = e.rows.find((r) => r.order === 'normal');
    assert.strictEqual(n.rating, 4, '通常は 4');
    for (const r of e.rows) {
      const better = e.rows[0] && (A.randomScene(i).side === 'pitch' ? r[e.metric] < n[e.metric] : r[e.metric] > n[e.metric]);
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

// 本編のファイルが、試作の前後で変わっていない(タグ v-before-T1 と比べる)
test('本編の出力(play.html・play-hero.html)が、試作の前と一致する', () => {
  const cp = require('child_process');
  const root = path.join(__dirname, '..');
  let tagOk = true;
  try { cp.execFileSync('git', ['rev-parse', '-q', '--verify', 'refs/tags/v-before-T1'], { cwd: root, stdio: 'ignore' }); } catch (e) { tagOk = false; }
  if (!tagOk) { console.log('   (タグ v-before-T1 がないので、比較を省略)'); return; }
  for (const tag of ['v-before-T1', 'v-before-T1d']) {
    try { cp.execFileSync('git', ['rev-parse', '-q', '--verify', 'refs/tags/' + tag], { cwd: root, stdio: 'ignore' }); } catch (e) { console.log('   (タグ ' + tag + ' がないので、比較を省略)'); continue; }
    for (const f of ['play.html', 'play-hero.html']) {
      const before = cp.execFileSync('git', ['show', tag + ':baseball-gacha/' + f], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
      assert.ok(before === fs.readFileSync(path.join(root, f), 'utf8'), f + ' が ' + tag + ' から変わっている');
    }
  }
});

console.log(failed ? '\n失敗 ' + failed + '件' : '\nすべて成功(' + passed + '件)');
process.exit(failed ? 1 : 0);
