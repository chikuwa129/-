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
  assert.ok(L({ outs: 0, bases: [50, null, null] }).indexOf('bunt') >= 0 && L({ outs: 2, bases: [50, null, null] }).indexOf('bunt') < 0);
  assert.ok(L({ outs: 1, bases: [null, null, 50] }).indexOf('squeeze') >= 0 && L({ outs: 1, bases: [50, null, null] }).indexOf('squeeze') < 0);
  assert.ok(L({ bases: [50, null, null] }).indexOf('steal') >= 0 && L({ bases: [50, 50, null] }).indexOf('steal') < 0);
  assert.ok(L({ side: 'pitch', bases: [null, 50, null] }).indexOf('walk') >= 0 && L({ side: 'pitch', bases: [50, null, null] }).indexOf('walk') < 0);
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

// 本編のファイルが、試作の前後で変わっていない(タグ v-before-T1 と比べる)
test('本編の出力(play.html・play-hero.html)が、試作の前と一致する', () => {
  const cp = require('child_process');
  const root = path.join(__dirname, '..');
  let tagOk = true;
  try { cp.execFileSync('git', ['rev-parse', '-q', '--verify', 'refs/tags/v-before-T1'], { cwd: root, stdio: 'ignore' }); } catch (e) { tagOk = false; }
  if (!tagOk) { console.log('   (タグ v-before-T1 がないので、比較を省略)'); return; }
  for (const f of ['play.html', 'play-hero.html']) {
    const before = cp.execFileSync('git', ['show', 'v-before-T1:baseball-gacha/' + f], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
    assert.ok(before === fs.readFileSync(path.join(root, f), 'utf8'), f + ' が変わっている');
  }
});

console.log(failed ? '\n失敗 ' + failed + '件' : '\nすべて成功(' + passed + '件)');
process.exit(failed ? 1 : 0);
