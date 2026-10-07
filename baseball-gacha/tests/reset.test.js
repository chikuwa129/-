// =============================================================
// tests/reset.test.js : リセットの動作の自動確認
//   使い方: node tests/reset.test.js
//   localStorage の代わりに、同じ形のメモリ上のストレージを使う。
// =============================================================
'use strict';

const assert = require('assert');
const { CONFIG, HighSchool, Persist, Tuning, Generation } = require('../logic.js');

// localStorage と同じ形(getItem / setItem / removeItem / key / length)
function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => Array.from(m.keys())[i] || null,
    get length() { return m.size; },
    keys: () => Array.from(m.keys()),
  };
}
// ゲームを少し進める(方針を選び、数か月進める)
function play(state, n) {
  for (let i = 0; i < n; i++) {
    if (state.awaiting) HighSchool.confirmPolicies(state, {});
    else HighSchool.advanceToNextEvent(state);
  }
}
const fresh = (seed, overrides) => {
  Tuning.applyOverrides(overrides || {});
  return JSON.stringify(HighSchool.newGame({ seed: seed, overrides: overrides || {} }));
};
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('✓ ' + name);
}

test('同じシードでやり直す:新規開始と同じ状態になり、4月の入学画面から始まる', () => {
  const st = memoryStorage();
  let s = Persist.startGame(st, 777);
  play(s, 8);
  Persist.saveGame(st, s);
  assert.notStrictEqual(JSON.stringify(s), fresh(777));
  s = Persist.resetSameSeed(st, s);
  assert.strictEqual(JSON.stringify(s), fresh(777));
  assert.strictEqual(s.awaiting, 'policy');
  assert.strictEqual(s.policyContext, 'enrollment');
  assert.strictEqual(HighSchool.monthLabel(s.month), '4月');
  // 保存されている内容も新しい状態
  assert.strictEqual(JSON.stringify(Persist.loadGame(st)), JSON.stringify(s));
});

test('新しいシードで始める:指定したシードの新規開始と同じ', () => {
  const st = memoryStorage();
  let s = Persist.startGame(st, 1);
  play(s, 5);
  s = Persist.resetNewSeed(st, 4242);
  assert.strictEqual(s.seed, 4242);
  assert.strictEqual(JSON.stringify(s), fresh(4242));
  assert.strictEqual(JSON.stringify(Persist.loadGame(st)), JSON.stringify(s));
});

test('セーブを完全に消す:このゲームのキー(bbgacha_)をすべて消し、上書き設定も初期値に戻る', () => {
  const st = memoryStorage();
  st.setItem('other_app', 'keep');                 // 他のアプリのキーは残す
  st.setItem('bbgacha_save', '{"version":4}');    // 古い形式のキーも消す
  Persist.saveOverrides(st, { 'growth.monthly.chance': 0.5 });
  Persist.writeJson(st, Persist.KEYS.lastTrial, { x: 1 });
  let s = Persist.startGame(st, 9);
  assert.strictEqual(CONFIG.growth.monthly.chance, 0.5);
  play(s, 6);
  s = Persist.wipeAll(st, 9);
  assert.strictEqual(CONFIG.growth.monthly.chance, Tuning.defaultValue('growth.monthly.chance'));
  assert.deepStrictEqual(st.keys().sort(), [Persist.KEYS.save, 'other_app'].sort());
  assert.strictEqual(JSON.stringify(s), fresh(9));
});

test('?reset=1 で起動すると、保存データをすべて消して初期状態から', () => {
  const st = memoryStorage();
  let s = Persist.startGame(st, 3);
  play(s, 10);
  Persist.saveGame(st, s);
  Persist.saveOverrides(st, { 'leadership.needPerLv': 9 });
  const r = Persist.startup(st, '?reset=1');
  assert.strictEqual(r.reset, true);
  assert.strictEqual(r.state.awaiting, 'policy');
  assert.strictEqual(r.state.year, 1);
  assert.strictEqual(st.getItem(Persist.KEYS.overrides), null);
  assert.strictEqual(CONFIG.leadership.needPerLv, Tuning.defaultValue('leadership.needPerLv'));
});

test('通常の起動:保存したゲームを、そのゲームの上書き設定で読み込む', () => {
  const st = memoryStorage();
  Persist.saveOverrides(st, { 'growth.monthly.chance': 0.4 });
  const s = Persist.startGame(st, 11);
  play(s, 4);
  Persist.saveGame(st, s);
  Persist.saveOverrides(st, { 'growth.monthly.chance': 0.2 }); // あとから変えた設定は、進行中のゲームには反映しない
  Tuning.applyOverrides({});
  const r = Persist.startup(st, '');
  assert.strictEqual(r.reset, false);
  assert.strictEqual(JSON.stringify(r.state), JSON.stringify(s));
  assert.strictEqual(CONFIG.growth.monthly.chance, 0.4);
});

test('表示だけに使う値(labelTop)は、進行中のゲームにもすぐ反映する', () => {
  const ov = Tuning.effectiveOverrides({ 'growth.monthly.chance': 0.4, 'labelTop.monster': 2 }, { 'labelTop.monster': 0.5 });
  assert.strictEqual(ov['growth.monthly.chance'], 0.4);
  assert.strictEqual(ov['labelTop.monster'], 0.5);
});

test('同じシードなら、毎回同じ結果(リセットを挟んでも同じ)', () => {
  const st = memoryStorage();
  const a = Persist.startGame(st, 55);
  play(a, 20);
  const b = Persist.resetSameSeed(st, a);
  play(b, 20);
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
});

test('見える化の保存データ(チーム戦力の記録・成長ログ・年度の記録・校正)も、どのリセットでも消える', () => {
  const st = memoryStorage();
  const hasVisual = (s) => s.powerLog.length > 0 && s.players.some((p) => p.mlog && p.mlog.a.length > 0)
    && Object.keys(s.yearRecords).length > 0 && s.stats.calib.length > 0 && s.stats.highlights.games > 0;
  // 新規開始の状態:前史から持ち越した最後の12か月分の成長スナップショット以外は、記録がない
  const isFresh = (s) => s.powerLog.length === 0 && s.players.every((p) => !p.mlog || p.mlog.a.length <= 12)
    && Object.keys(s.yearRecords).length === 0 && s.stats.calib.length === 0 && s.stats.highlights.games === 0
    && JSON.stringify(s) === JSON.stringify(HighSchool.newGame({ seed: s.seed, overrides: s.overrides }));
  let s = Persist.startGame(st, 21);
  play(s, 25);
  Persist.saveGame(st, s);
  assert.ok(hasVisual(s), '進めたあとは記録がある');
  s = Persist.resetSameSeed(st, s);
  assert.ok(isFresh(s) && isFresh(Persist.loadGame(st)), '同じシードでやり直す');
  play(s, 25);
  s = Persist.resetNewSeed(st, 22);
  assert.ok(isFresh(s) && isFresh(Persist.loadGame(st)), '新しいシードで始める');
  play(s, 25);
  Persist.saveGame(st, s);
  s = Persist.wipeAll(st, 23);
  assert.ok(isFresh(s) && isFresh(Persist.loadGame(st)), 'セーブを完全に消す');
  play(s, 25);
  Persist.saveGame(st, s);
  const r = Persist.startup(st, '?reset=1');
  assert.ok(isFresh(r.state) && isFresh(Persist.loadGame(st)), '?reset=1');
});

test('前史と評判:新規開始は前史を含めて毎回同じ。どのリセットでも作り直され、開閉の記憶も消える', () => {
  const st = memoryStorage();
  const a = HighSchool.newGame({ seed: 31 });
  const b = HighSchool.newGame({ seed: 31 });
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b), '同じシードなら前史も同じ');
  assert.ok(a.players.length > 0 && a.players.every((p) => p.grade >= 2), '開始時の在校生は2・3年生');
  assert.ok(a.players.some((p) => p.history.some((h) => h.ev.indexOf('(開始前)') >= 0)), '前史の履歴に(開始前)');
  assert.strictEqual(a.leadership.lv, 1, '指導力は持ち越さない');
  assert.strictEqual(a.alumni.length, 0, '前史の卒業生は名鑑に載せない');
  const ui = Persist.KEYS.ui;
  let s = Persist.startGame(st, 31);
  play(s, 30);
  s.schoolRep = 99;   // 進行中に評判が変わっていても
  Persist.saveGame(st, s);
  st.setItem(ui, '{"level":"full","open":{"power":true}}');
  s = Persist.resetSameSeed(st, s);
  assert.strictEqual(JSON.stringify(s), JSON.stringify(a), '同じシードでやり直す:前史・評判とも新規開始と同じ');
  assert.strictEqual(st.getItem(ui), null, '同じシードでやり直す:開閉の記憶が消える');
  st.setItem(ui, '{"level":"full"}');
  s = Persist.resetNewSeed(st, 32);
  assert.strictEqual(JSON.stringify(s), JSON.stringify(HighSchool.newGame({ seed: 32 })));
  assert.strictEqual(st.getItem(ui), null, '新しいシードで始める:開閉の記憶が消える');
  st.setItem(ui, '{"level":"full"}');
  Persist.wipeAll(st, 33);
  assert.strictEqual(st.getItem(ui), null, '完全に消す:開閉の記憶が消える');
  st.setItem(ui, '{"level":"full"}');
  const r = Persist.startup(st, '?reset=1');
  assert.strictEqual(st.getItem(ui), null, '?reset=1:開閉の記憶が消える');
  assert.strictEqual(r.state.schoolRep, HighSchool.newGame({ seed: r.state.seed }).schoolRep, '?reset=1:評判は前史の結果から');
});

test('ホームの月のまとめの未読(●新着)は、どのリセットでも消える', () => {
  const st = memoryStorage();
  const unreadGame = () => {
    const s = Persist.startGame(st, 41);
    play(s, 8);
    s.summaryUnread = 5;   // 画面で月を進めたときと同じ(未読のまとめがある)
    Persist.saveGame(st, s);
    assert.strictEqual(Persist.loadGame(st).summaryUnread, 5, '未読の状態は保存される');
    return s;
  };
  assert.strictEqual(HighSchool.newGame({ seed: 41 }).summaryUnread, null, '新規開始は未読なし');
  let s = Persist.resetSameSeed(st, unreadGame());
  assert.strictEqual(s.summaryUnread, null, '同じシードでやり直す');
  assert.strictEqual(Persist.loadGame(st).summaryUnread, null, '同じシードでやり直す(保存)');
  unreadGame();
  s = Persist.resetNewSeed(st, 42);
  assert.strictEqual(s.summaryUnread, null, '新しいシードで始める');
  unreadGame();
  s = Persist.wipeAll(st, 43);
  assert.strictEqual(s.summaryUnread, null, '完全に消す');
  unreadGame();
  const r = Persist.startup(st, '?reset=1');
  assert.strictEqual(r.state.summaryUnread, null, '?reset=1');
  assert.strictEqual(Persist.loadGame(st).summaryUnread, null, '?reset=1(保存)');
});

Tuning.applyOverrides({});
Generation.setBenchmark(null);
console.log('\nすべて成功(' + passed + '件)');
