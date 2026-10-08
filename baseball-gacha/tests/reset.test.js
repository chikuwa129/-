// =============================================================
// tests/reset.test.js : リセットの動作の自動確認
//   使い方: node tests/reset.test.js
//   localStorage の代わりに、同じ形のメモリ上のストレージを使う。
// =============================================================
'use strict';

const assert = require('assert');
const { CONFIG, Core, HighSchool, Persist, Tuning, Generation } = require('../logic.js');

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
  // チーム戦力の月ごとの記録(powerLog)は保存しない。それ以外は保存したとおり
  assert.strictEqual(r.state.powerLog.length, 0, 'チーム戦力の記録は保存されない');
  assert.ok(st.getItem(Persist.KEYS.save).indexOf('"powerLog":[]') >= 0, 'セーブの中の powerLog は空');
  assert.strictEqual(JSON.stringify(Object.assign({}, r.state, { powerLog: null })), JSON.stringify(Object.assign({}, s, { powerLog: null })));
  assert.strictEqual(CONFIG.growth.monthly.chance, 0.4);
  // 読み込んで続けても、続けずに進めた場合と同じ結果になる(チーム戦力の記録はゲームの結果に影響しない)
  play(r.state, 20);
  play(s, 20);
  assert.strictEqual(JSON.stringify(Object.assign({}, r.state, { powerLog: null })), JSON.stringify(Object.assign({}, s, { powerLog: null })), '読み込み後も同じ展開');
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

test('見える化の保存データ(成長ログ・年度の記録・校正。チーム戦力の記録はメモリ上だけ)も、どのリセットでも消える', () => {
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

test('方針の選択を出さないとき(policyControlEnabled = false):12月で止まらず、止まるたびに「おまかせ」を選んだ場合と同じ結果', () => {
  const omakase = (st) => {
    const pol = {};
    for (const p of st.pendingRecruits) pol[p.id] = Core.autoPolicy(p);
    for (const p of HighSchool.reviewablePlayers(st)) if (p.needsPolicy) pol[p.id] = Core.autoPolicy(p);
    return pol;
  };
  const key = (st) => JSON.stringify([st.rngState, st.statRngState, st.players, st.alumni, st.yearRecords, st.leadership, st.schoolRep]);
  assert.strictEqual(CONFIG.policyControlEnabled, false, '初期値は false');
  for (const seed of [5, 6, 7]) {
    const a = HighSchool.newGame({ seed: seed });
    const b = HighSchool.newGame({ seed: seed });
    let reviewStops = 0;
    while (a.year <= 4) {
      if (a.awaiting) { if (a.policyContext === 'review') reviewStops++; HighSchool.confirmPolicies(a, omakase(a)); continue; }
      HighSchool.advanceToNextEvent(a);
    }
    while (b.year <= 4) {
      if (b.awaiting) {
        assert.strictEqual(b.policyContext, 'enrollment', '止まるのは入学だけ(12月の見直しでは止まらない)');
        HighSchool.confirmPolicies(b, HighSchool.autoPolicies(b));
        continue;
      }
      HighSchool.advanceToNextEvent(b, null, { autoReview: true });
    }
    assert.ok(reviewStops > 0, '比べる側は12月に止まっている');
    assert.strictEqual(key(b), key(a), 'シード' + seed + ':同じ結果');
  }
});

test('新入部員モード:保存データ(bbgacha_hero_v*)は3種類のリセットと ?reset=1 で消え、リセット後は新規開始と同じ', () => {
  const Hero = require('../hero.js');
  const st = memoryStorage();
  const K = Hero.keys();
  assert.ok(K.save.indexOf(CONFIG.storagePrefix + 'hero_v' + CONFIG.heroMode.saveVersion + '_') === 0, '保存キーの接頭辞');
  const progress = (seed) => {
    const s = Hero.startNew(st, seed);
    Hero.reroll(s);
    Hero.pickHero(s, s.pendingRecruits[0].id);
    Hero.startPlay(s);
    for (let i = 0; i < 3; i++) Hero.advance(s, 'event');
    Hero.save(st, s);
    st.setItem(K.ui, '{"open":{"team":true}}');
    assert.strictEqual(Hero.load(st).hero.phase, 'play', '途中の状態が保存される');
    return s;
  };
  const fresh = (s) => JSON.stringify(s) === JSON.stringify(Hero.newHeroGame(s.seed));
  // 同じシードでやり直す
  let s = Hero.resetSameSeed(st, progress(61));
  assert.ok(fresh(s) && s.seed === 61, '同じシードでやり直す:新規開始と同じ');
  assert.strictEqual(st.getItem(K.ui), null, '開閉の記憶も消える');
  assert.ok(fresh(Hero.load(st)), '保存も新規開始と同じ');
  // 新しいシードで始める
  progress(62);
  s = Hero.resetNewSeed(st, 63);
  assert.ok(fresh(s) && s.seed === 63 && st.getItem(K.ui) === null, '新しいシードで始める');
  // 完全に消す
  progress(64);
  s = Hero.wipeAll(st, 65);
  assert.strictEqual(st.keys().filter((k) => k.indexOf(CONFIG.storagePrefix + 'hero_') === 0).length, 0, '完全に消す:このモードのキーがなくなる');
  assert.ok(fresh(s));
  // ?reset=1
  progress(66);
  st.setItem(CONFIG.storagePrefix + 'hero_v0_save', 'old');   // 古い形式のキーも消える
  const r = Hero.startup(st, '?reset=1');
  assert.ok(r.reset && r.state.hero.phase === 'select' && r.state.hero.rerollsLeft === CONFIG.heroMode.rerollMax, '?reset=1:最初から');
  assert.strictEqual(st.getItem(CONFIG.storagePrefix + 'hero_v0_save'), null);
  assert.strictEqual(st.getItem(K.ui), null);
  // 育成監督モードの「セーブを完全に消す」でも、このモードの保存は消える(同じ接頭辞 bbgacha_)
  progress(67);
  Persist.wipeAll(st, 1);
  assert.strictEqual(st.getItem(K.save), null, '育成監督モードの完全に消すでも消える');
  // 育成監督モードの保存とは別のキー
  assert.notStrictEqual(K.save, Persist.KEYS.save);
});

Tuning.applyOverrides({});
Generation.setBenchmark(null);
console.log('\nすべて成功(' + passed + '件)');
