// =============================================================
// tests/hero.test.js : 新入部員モードの自動確認
//   使い方: node tests/hero.test.js
// =============================================================
'use strict';

const assert = require('assert');
const { CONFIG, Core, HighSchool } = require('../logic.js');
const Hero = require('../hero.js');
const STORY = require('../story.js');

let failed = 0;
let passed = 0;
// H1.5a:roster.version 'legacy' での一致の確認(旧版の指紋と比べる)は、legacy の別プロセスで行う
//   node tests/hero.test.js は、v2 なら最後に BBGACHA_ROSTER=legacy で '--legacy-only' を起動する
const LEGACY_ONLY = process.argv.indexOf('--legacy-only') >= 0;
function test(name, fn, opts) {
  const legacy = !!(opts && opts.legacy);
  if (LEGACY_ONLY ? !legacy : legacy && Core.isV2()) return;
  try { fn(); passed++; console.log('✓ ' + name); } catch (e) { failed++; console.log('✕ ' + name + '\n   ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n   ') : e)); }
}
// 主人公の3年間を自動で進める(kind:{ pick:true } か 作成の内容)
function play(seed, kind, opts) {
  opts = opts || {};
  const st = Hero.newHeroGame(seed);
  for (let i = 0; i < (opts.rerolls || 0); i++) Hero.reroll(st);
  if (kind.pick) Hero.pickHero(st, Hero.pickable(st)[kind.index || 0].id);
  else {
    Hero.drawName(st);
    const err = Hero.createHero(st, kind);
    if (err) throw new Error(err);
    Hero.confirmRival(st, opts.rival || 'auto');
  }
  Hero.startPlay(st);
  let guard = 0;
  while (st.hero.phase === 'play' && guard++ < 200) Hero.advance(st, 'event');
  return st;
}
const FIELD = { pos: 'fielder', type: 'kouda', level: 'mid', talent: 'normal' };
const PITCH = { pos: 'pitcher', type: 'gouwan', level: 'mid', talent: 'normal' };
const TW = { pos: 'twoWay', pitchType: 'gikou', batType: 'kyouda', level: 'mid', talent: 'normal' };

// 3年間を通した実行(いくつかのテストで共有)
const RUNS = [];
// 3年間を通した実行(200回)
for (let s = 1; s <= (LEGACY_ONLY ? 0 : 100); s++) {
  RUNS.push(play(s, { pick: true }));
  RUNS.push(play(1000 + s, s % 3 === 0 ? TW : s % 3 === 1 ? FIELD : PITCH));
}

test('同じシード・同じ選択なら、結果が一致する(100回)', () => {
  const kinds = [{ pick: true }, FIELD, PITCH, TW];
  for (let i = 0; i < 100; i++) {
    const seed = 500 + (i % 25);
    const k = kinds[i % 4];
    const a = play(seed, k, { rerolls: i % 3 });
    const b = play(seed, k, { rerolls: i % 3 });
    assert.strictEqual(JSON.stringify(a), JSON.stringify(b), 'シード' + seed);
  }
});

test('引き直し・作成・名前の引き直しは、ゲーム本体の乱数(と成績用の乱数)を消費しない', () => {
  for (const seed of [3, 4, 5, 6]) {
    const base = Hero.newHeroGame(seed);
    const r0 = base.rngState;
    const s0 = base.statRngState;
    // 一覧から選ぶ(引き直しなし)
    const a = Hero.newHeroGame(seed);
    Hero.pickHero(a, Hero.pickable(a)[0].id);
    // 引き直してから選ぶ
    const b = Hero.newHeroGame(seed);
    Hero.reroll(b); Hero.reroll(b);
    assert.strictEqual(b.rngState, r0, '引き直しのあとも同じ');
    Hero.pickHero(b, Hero.pickable(b)[0].id);
    // 作る(名前を何度も引き直す)
    const c = Hero.newHeroGame(seed);
    for (let i = 0; i < 5; i++) Hero.drawName(c);
    Hero.createHero(c, FIELD);
    for (const st of [a, b, c]) {
      assert.strictEqual(st.hero.preEnrollRng, r0, '入部の直前のゲーム本体の乱数が同じ');
    }
    assert.strictEqual(b.statRngState, s0);
    assert.strictEqual(c.statRngState, s0);
  }
});

test('作成で選べない組み合わせは、拒否される(転生・二刀流×天才・二刀流×高め・天才×高め)', () => {
  const bad = [
    Object.assign({}, FIELD, { talent: 'reincarnation' }),
    Object.assign({}, TW, { talent: 'genius' }),
    Object.assign({}, TW, { level: 'high' }),
    Object.assign({}, FIELD, { talent: 'genius', level: 'high' }),
    Object.assign({}, PITCH, { talent: 'genius', level: 'high' }),
    Object.assign({}, FIELD, { type: 'gouwan' }),
  ];
  for (const c of bad) {
    assert.ok(Hero.invalidChoice(c), '画面(ボタンを無効にする判定)で拒否:' + JSON.stringify(c));
    const st = Hero.newHeroGame(7);
    const err = Hero.createHero(st, c);
    assert.ok(typeof err === 'string' && err.length, '内部でも拒否:' + JSON.stringify(c));
    assert.strictEqual(st.hero.id, null);
    assert.strictEqual(st.hero.phase, 'select');
  }
  assert.strictEqual(Hero.invalidChoice(FIELD), null);
  assert.strictEqual(Hero.invalidChoice(TW), null);
});

test('作った主人公の初期の総合値は、選んだ範囲に収まる(各組み合わせ200回)', () => {
  const stub = () => ({ players: [], pendingRecruits: [], nextId: 1, year: 1, hero: { rng: 12345, draftName: null } });
  const combos = [];
  for (const level of ['low', 'mid', 'high']) {
    for (const talent of ['normal', 'genius']) {
      if (talent === 'genius' && level === 'high') continue;
      for (const t of Object.keys(Hero.PITCH_TYPES)) combos.push({ pos: 'pitcher', type: t, level: level, talent: talent });
      for (const t of Object.keys(Hero.BAT_TYPES)) combos.push({ pos: 'fielder', type: t, level: level, talent: talent });
    }
  }
  for (const level of ['low', 'mid']) for (const pt of Object.keys(Hero.PITCH_TYPES)) for (const bt of Object.keys(Hero.BAT_TYPES)) combos.push({ pos: 'twoWay', pitchType: pt, batType: bt, level: level, talent: 'normal' });
  for (const c of combos) {
    const range = Hero.ratingRange(c);
    const st = stub();
    for (let i = 0; i < 200; i++) {
      st.hero.rng = (i * 2654435761 + 17) >>> 0;
      const p = Hero.makeHeroPlayer(st, c);
      if (c.pos === 'twoWay') {
        const s = Core.ratingSides(p);
        assert.ok(s.pitch >= range[0] && s.pitch <= range[1] && s.bat >= range[0] && s.bat <= range[1], JSON.stringify(c) + ' 投' + s.pitch + ' 打' + s.bat);
        assert.ok(p.twoWay && Core.isTwoWayKnown(p) && ['C', 'IF', 'OF'].indexOf(p.batPos) >= 0);
      } else {
        const r = Core.rating(p);
        assert.ok(r >= range[0] && r <= range[1], JSON.stringify(c) + ' 総合値 ' + r);
        assert.ok(c.pos === 'pitcher' ? p.position === 'P' : ['C', 'IF', 'OF'].indexOf(p.position) >= 0);
      }
      assert.strictEqual(p.reincarnation, null, '転生にはならない');
      assert.strictEqual(p.talent, c.talent);
    }
  }
});

// ライバルの自動の選び方を切り替えて実行する
function withRivalMode(mode, fn) {
  const prev = CONFIG.heroMode.rival.selectMode;
  CONFIG.heroMode.rival.selectMode = mode;
  try { return fn(); } finally { CONFIG.heroMode.rival.selectMode = prev; }
}
test('ライバルは同学年の選手で、3年間変わらない。旧方式(strongest)は同じ守備区分の最上位', () => {
  for (const st of RUNS) {
    const H = st.hero;
    if (H.rivalId == null) continue;
    const hero = st.alumni.find((a) => a.id === H.id);
    const rv = st.alumni.find((a) => a.id === H.rivalId) || st.players.find((p) => p.id === H.rivalId);
    assert.ok(rv && rv.enrolledYear === hero.enrolledYear, '同学年');
  }
  withRivalMode('strongest', () => {
    for (let s = 1; s <= 40; s++) {
      const st = Hero.newHeroGame(s);
      Hero.pickHero(st, Hero.pickable(st)[s % Hero.pickable(st).length].id);
      const h = Hero.heroOf(st);
      const mates = st.players.filter((p) => p !== h && !p.helper && p.enrolledYear === h.enrolledYear);
      const role = Core.isTwoWayKnown(h) ? 'P' : h.position;
      const same = mates.filter((p) => Hero.rolesOf(p).indexOf(role) >= 0);
      if (same.length) {
        const top = same.slice().sort((a, b) => Hero.sideRating(b, role) - Hero.sideRating(a, role) || a.id - b.id)[0];
        assert.strictEqual(st.hero.rivalId, top.id, 'シード' + s);
      } else if (!Core.isTwoWayKnown(h)) {
        const top = mates.slice().sort((a, b) => Core.rating(b) - Core.rating(a) || a.id - b.id)[0];
        assert.strictEqual(st.hero.rivalId, top ? top.id : null);
        assert.strictEqual(st.hero.axisList.length, 0, '同じ役割がいなければ、争いは成立しない');
      }
    }
  });
});

test('ライバルの新方式(chaseable):主人公より強い候補のうち差が最小かつ minGap 以上。最上位なら次に強い選手。3年間変わらない', () => {
  const R = CONFIG.heroMode.rival;
  const kinds = { above: 0, far: 0, below: 0, none: 0, nearOnly: 0 };
  withRivalMode('chaseable', () => {
    for (let s = 1; s <= 120; s++) {
      const st = Hero.newHeroGame(s);
      if (s % 3) Hero.pickHero(st, Hero.pickable(st)[s % Hero.pickable(st).length].id);
      else { Hero.createHero(st, s % 2 ? PITCH : (s % 9 === 0 ? TW : FIELD)); Hero.confirmRival(st, 'auto'); }
      const h = Hero.heroOf(st);
      const mates = st.players.filter((p) => p !== h && !p.helper && p.enrolledYear === h.enrolledYear);
      let role = Core.isTwoWayKnown(h) ? 'P' : h.position;
      let same = mates.filter((p) => Hero.rolesOf(p).indexOf(role) >= 0);
      if (!same.length && Core.isTwoWayKnown(h)) { role = Core.twoWayBatPos(h); same = mates.filter((p) => Hero.rolesOf(p).indexOf(role) >= 0); }
      const pk = st.hero.rivalPick;
      if (!same.length) {
        const top = mates.slice().sort((a, b) => Core.rating(b) - Core.rating(a) || a.id - b.id)[0];
        assert.strictEqual(st.hero.rivalId, top ? top.id : null, 'シード' + s + ':候補なし → 同学年の最上位');
        kinds.none++;
      } else {
        const hr = Hero.sideRating(h, role);
        const above = same.filter((p) => Hero.sideRating(p, role) > hr).map((p) => ({ id: p.id, d: Hero.sideRating(p, role) - hr })).sort((a, b) => a.d - b.d || a.id - b.id);
        let want;
        if (above.length) {
          const ok = above.filter((x) => x.d >= R.minGap);
          want = ok.length ? ok[0] : above[0];
          if (!ok.length) kinds.nearOnly++;
          kinds[want.d > R.maxGap ? 'far' : 'above']++;
          assert.ok(want.d < R.minGap || above.every((x) => x.d < R.minGap || x.d >= want.d), '差が最小(minGap 以上)');
        } else {
          want = { id: same.slice().sort((a, b) => Hero.sideRating(b, role) - Hero.sideRating(a, role) || a.id - b.id)[0].id };
          kinds.below++;
        }
        assert.strictEqual(st.hero.rivalId, want.id, 'シード' + s);
        assert.strictEqual(st.hero.mainAxis, role);
        assert.ok(pk && pk.chosen === want.id);
        assert.ok(st.hero.rivalReason.length > 0 && (pk.kind !== 'far' || st.hero.rivalReason.indexOf('差は大きい') >= 0));
      }
      const id0 = st.hero.rivalId;
      if (s % 4 === 0) {   // 一部は3年間進めて、ライバルが変わらないことを確かめる
        Hero.startPlay(st);
        for (let i = 0; i < 200 && st.hero.phase === 'play'; i++) Hero.advance(st, 'event');
        assert.strictEqual(st.hero.phase, 'graduate');
        assert.strictEqual(st.hero.rivalId, id0, '途中で変わらない');
      }
    }
  });
  assert.ok(kinds.above > 20 && kinds.below > 3, JSON.stringify(kinds));
});

test('ライバルの旧方式(strongest)は、H1.3 と一致する(勝敗・能力・進路・本体の乱数・ライバル。100回)', () => {
  // H1.4 の時点では物語の文面(stories・trng)まで一致していた。H1.3b で打順の変化のひとことが増えたため、文面は比べない
  const FP = require('./hero-fingerprint.js');
  const ref = require('./fixtures/h13-fingerprint.json');
  const strip = (o) => { const x = Object.assign({}, o); delete x.stories; delete x.trng; return x; };
  withRivalMode('strongest', () => {
    for (let i = 0; i < FP.N; i++) assert.deepStrictEqual(strip(FP.fingerprint(i, { stories: true })), strip(ref[i]), i + '回目');
  });
}, { legacy: true });

test('H1.3b(スタメン表・打順の変化のひとこと)は、勝敗・能力・進路・本体の乱数が H1.4 と一致する(100回)', () => {
  const FP = require('./hero-fingerprint.js');
  const ref = require('./fixtures/h14-fingerprint.json');
  for (let i = 0; i < FP.N; i++) assert.deepStrictEqual(FP.fingerprint(i), ref[i], i + '回目');
}, { legacy: true });

test('争いの軸:投手×二刀流=投手枠 / 二刀流×外野手=外野枠 / 二刀流×二刀流=投手枠と野手側の区分', () => {
  const pit = { position: 'P', twoWay: false, twoWayRevealed: false, abilities: {} };
  const of = { position: 'OF', twoWay: false, abilities: {} };
  const tw = (bp) => ({ position: 'P', twoWay: true, twoWayRevealed: true, batPos: bp, abilities: {}, policy: 'both' });
  assert.deepStrictEqual(Hero.axesOf(pit, tw('OF')), ['P']);
  assert.deepStrictEqual(Hero.axesOf(tw('OF'), of), ['OF']);
  assert.deepStrictEqual(Hero.axesOf(tw('IF'), tw('IF')), ['P', 'IF']);
  assert.deepStrictEqual(Hero.axesOf(tw('IF'), tw('OF')), ['P']);
  // 判明前の二刀流は、投手だけ
  const hidden = { position: 'P', twoWay: true, twoWayRevealed: false, abilities: {} };
  assert.deepStrictEqual(Hero.rolesOf(hidden), ['P']);
});

test('争いの成立:候補の人数が必要人数を超え、主人公とライバルのちょうど1人がその枠にいるときだけ', () => {
  const mk = (pos) => ({ position: pos, twoWay: false, abilities: {} });
  const twoP = [mk('P'), mk('P')];
  assert.strictEqual(Hero.contestOf(twoP, 'P', 'P', null), true, '投手2人(必要1)、主人公だけが投手枠');
  assert.strictEqual(Hero.contestOf(twoP, 'P', null, 'P'), true, 'ライバルだけが投手枠');
  assert.strictEqual(Hero.contestOf([mk('P')], 'P', 'P', null), false, '候補が必要人数以下');
  assert.strictEqual(Hero.contestOf(twoP, 'P', null, null), false, 'どちらも枠にいない');
  const ifs = [mk('IF'), mk('IF'), mk('IF'), mk('IF'), mk('IF')];
  assert.strictEqual(Hero.contestOf(ifs, 'IF', 'IF', 'IF'), false, '2人とも内野枠');
  assert.strictEqual(Hero.contestOf(ifs, 'IF', 'IF', null), true, '内野5人(必要4)、主人公だけ');
  assert.strictEqual(Hero.contestOf(ifs.slice(0, 4), 'IF', 'IF', null), false, '内野4人(必要4)');
});

test('転向:条件をすべて満たしたときだけ。3年間で最大1回。二刀流には起きない', () => {
  // 条件を満たす状態を作り、1つずつ外す
  let found = null;
  for (let s = 1; s <= 60 && !found; s++) {
    const st = Hero.newHeroGame(s);
    const h0 = Hero.pickable(st).find((p) => !p.twoWay && p.position !== 'P');
    if (!h0) continue;
    Hero.pickHero(st, h0.id);
    const h = Hero.heroOf(st);
    const rv = Hero.rivalOf(st);
    if (!rv || rv === h) continue;
    // 他の区分の適性が十分ある状態にする
    for (const k of Core.BAT_KEYS) h.abilities[k] = 30;
    rv.abilities = Object.assign({}, rv.abilities);
    for (const k of Core.ALL_KEYS) rv.abilities[k] = Math.max(rv.abilities[k], 60);
    st.hero.benchStreak = CONFIG.heroMode.convert.benchMonths;
    if (Hero.convertEligible(st, null, rv)) found = { st: st, h: h, rv: rv };
  }
  assert.ok(found, '条件を満たすケースを作れる');
  const { st, h, rv } = found;
  const C = CONFIG.heroMode.convert;
  st.hero.benchStreak = C.benchMonths - 1;
  assert.strictEqual(Hero.convertEligible(st, null, rv), null, '控えの月数が足りない');
  st.hero.benchStreak = C.benchMonths;
  assert.strictEqual(Hero.convertEligible(st, 'IF', rv), null, '今月はスタメン');
  const save = Object.assign({}, h.abilities);
  for (const k of Core.ALL_KEYS) h.abilities[k] = 99;
  assert.strictEqual(Hero.convertEligible(st, null, rv), null, 'ライバルより総合値が高い');
  Object.assign(h.abilities, save);
  assert.strictEqual(Hero.convertEligible(st, null, null), null, 'ライバルがいない');
  st.hero.converts = C.maxPerRun;
  assert.strictEqual(Hero.convertEligible(st, null, rv), null, '上限の回数に達した');
  st.hero.converts = 0;
  const ratio = C.aptitudeRatio;
  C.aptitudeRatio = 99;
  assert.strictEqual(Hero.convertEligible(st, null, rv), null, '他の区分の適性が足りない');
  C.aptitudeRatio = ratio;
  h.twoWay = true;
  assert.strictEqual(Hero.convertEligible(st, null, rv), null, '二刀流は対象外');
  h.twoWay = false;
  assert.ok(Hero.convertEligible(st, null, rv), '元に戻せば条件を満たす');
  // 実際の3年間:最大1回、二刀流は0回
  for (const r of RUNS) {
    assert.ok(r.hero.converts <= C.maxPerRun);
    const a = r.alumni.find((x) => x.id === r.hero.id);
    if (a.twoWay) assert.strictEqual(r.hero.converts, 0);
  }
});

test('挫折の物語は3年間で最大2回、再起の物語は挫折1回につき1回まで、後押しは最大2回で1回の合宿だけ', () => {
  for (const st of RUNS) {
    const H = st.hero;
    assert.ok(H.setbackStories <= CONFIG.heroMode.setbackMax, '挫折の物語 ' + H.setbackStories);
    const bad = H.stories.filter((s) => s.bad).length;
    assert.strictEqual(bad, H.setbackStories, '挫折の物語の数と、記録の数が一致');
    assert.ok(H.reboundStories <= H.setbackStories, '再起は挫折の数まで');
    assert.ok(H.boostsUsed <= CONFIG.heroMode.rebound.maxBoosts && (H.boostApplied || 0) <= H.boostsUsed, '後押し');
    // 挫折の物語のあと、次の挫折の物語は再起の期間が終わるまで出ない
    const s = H.stories.filter((x) => x.bad || x.kind === 'rebound' || x.kind === 'noRebound');
    for (let i = 1; i < s.length; i++) if (s[i].bad && s[i - 1].bad) assert.fail('挫折が続けて出ている');
  }
});

test('二刀流の編成(新入部員モードのみ):投手枠の評価値と、1人1枠', () => {
  const rng = new Core.Rng(5);
  let id = 1;
  const mk = (pos, v, extra) => {
    const p = Core.createPlayer(rng, { id: id++, year: 1, position: pos, forceTwoWay: false, noReincarnation: true, forceTalent: 'normal' });
    p.position = pos;
    for (const k of Core.ALL_KEYS) p.abilities[k] = Core.sideKeys(Core.sideOf(pos)).indexOf(k) >= 0 ? v : 5;
    Object.assign(p, extra || {});
    return p;
  };
  const tw = (pv, bv, bp) => {
    const p = mk('P', pv, { twoWay: true, twoWayRevealed: true, batPos: bp, policy: 'both' });
    for (const k of Core.BAT_KEYS) p.abilities[k] = bv;
    return p;
  };
  const W = CONFIG.heroMode.twoWay.batWeightInPitcherSlot;
  const fielders = () => [mk('C', 50), mk('IF', 50), mk('IF', 50), mk('IF', 50), mk('IF', 50), mk('OF', 50), mk('OF', 50), mk('OF', 50)];
  // 二刀流が投手枠を取れる:投手 投20(=総合値100)・野手側5 / 二刀流 投18(90)・打20(100)
  const ace = mk('P', 20);
  const two = tw(18, 20, 'OF');
  assert.ok(Math.abs(Core.pitcherSlotValue(two) - (90 + 100 * W)) < 0.01, '評価値の式');
  let team = [ace, two].concat(fielders());
  let slots = Core.buildLineup(team, { heroTwoWay: true });
  assert.ok(Core.pitcherSlotValue(two) > Core.pitcherSlotValue(ace));
  assert.strictEqual(slots.find((s) => s.pos === 'P').player, two, '二刀流が投手枠');
  assert.strictEqual(slots.filter((s) => s.player === two).length, 1, '1人1枠');
  // 取れない:投手 投24(=120)
  const ace2 = mk('P', 24);
  const two2 = tw(18, 30, 'OF');
  team = [ace2, two2].concat([mk('C', 50), mk('IF', 50), mk('IF', 50), mk('IF', 50), mk('IF', 50), mk('OF', 50), mk('OF', 20)]);
  slots = Core.buildLineup(team, { heroTwoWay: true });
  assert.ok(Core.pitcherSlotValue(ace2) > Core.pitcherSlotValue(two2));
  assert.strictEqual(slots.find((s) => s.pos === 'P').player, ace2);
  const at = slots.find((s) => s.player === two2);
  assert.ok(at && at.pos === 'OF' && !at.outOfPosition, '投手枠を取れなかった二刀流は、野手側の区分(外野)の本職として入る');
  assert.strictEqual(Core.checkLineup(team, slots, { heroTwoWay: true }).violations, 0);
  // 既存のモードでは、判明した二刀流が投手枠に優先される(変更なし)
  const legacy = Core.buildLineup(team);
  assert.strictEqual(legacy.find((s) => s.pos === 'P').player, CONFIG.twoWay.alwaysStartAsPitcher ? two2 : ace2, '既存のモードは従来どおり');
});

test('二刀流の編成の不変条件:100シード × 10年分で違反0件(判明した二刀流を各シードに混ぜる)', () => {
  let months = 0;
  let violations = 0;
  let twoWayMonths = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const st = HighSchool.newGame({ seed: seed });
    // 二刀流を混ぜる(既存の選手を判明済みの二刀流にする)
    const conv = st.players.filter((p) => !p.helper).slice(0, 2);
    for (const p of conv) {
      p.twoWay = true; p.twoWayRevealed = true; p.position = 'P'; p.policy = 'both';
      for (const k of Core.BAT_KEYS) p.abilities[k] = Math.max(p.abilities[k], 40 + (seed % 30));
      for (const k of Core.PITCH_KEYS) p.abilities[k] = Math.max(p.abilities[k], 30 + (seed % 40));
    }
    while (st.year <= 10) {
      if (st.awaiting) {
        // 毎年、新入生の1人を判明済みの二刀流にする
        const nw = st.pendingRecruits.slice().sort((x, y) => Core.rating(y) - Core.rating(x))[0];
        if (nw && !nw.twoWay) {
          nw.twoWay = true; nw.twoWayRevealed = true; nw.position = 'P'; nw.policy = 'both';
          for (const k of Core.BAT_KEYS) nw.abilities[k] = Math.max(nw.abilities[k], 15 + (seed % 10));
          for (const k of Core.PITCH_KEYS) nw.abilities[k] = Math.max(nw.abilities[k], 12 + (seed % 12));
        }
        HighSchool.confirmPolicies(st, HighSchool.autoPolicies(st));
        continue;
      }
      HighSchool.advanceMonth(st, { autoReview: true });
      const slots = Core.buildLineup(st.players, { heroTwoWay: true });
      const ck = Core.checkLineup(st.players, slots, { heroTwoWay: true });
      months++;
      violations += ck.violations;
      if (st.players.some((p) => !p.retired && Core.isTwoWayKnown(p))) twoWayMonths++;
    }
  }
  console.log('   確認した編成 ' + months + 'か月(二刀流がいた月 ' + twoWayMonths + ')');
  assert.ok(twoWayMonths > 9000, '二刀流がいる月を十分に確認');
  assert.strictEqual(violations, 0);
});

test('役割の切り替えは挫折に数えない。両方の枠を失ったときだけ挫折', () => {
  let switches = 0;
  for (let s = 1; s <= 40; s++) {
    const st = play(2000 + s, TW);
    const H = st.hero;
    switches += H.switchCount;
    for (const x of H.stories) {
      if (x.kind === 'switchToBat' || x.kind === 'switchToPitch') assert.strictEqual(x.bad, false);
      if (x.kind === 'twoWayLost') {
        const m = (H.monthLog || []).find((e) => e[0] === x.s);
        assert.ok(m && m[1] == null, '両方の枠を失った月(控え)だけ');
      }
    }
  }
  assert.ok(switches > 0, '役割の切り替えが実際に起きている');
});

test('新入部員モード専用のルールは、育成監督モードでは無効(state.hero がない)', () => {
  const st = HighSchool.newGame({ seed: 9 });
  assert.strictEqual(Core.lineupOpts(st), undefined, '編成のオプションなし');
  // 合宿の後押しの印があっても、育成監督モードでは使わない
  const a = HighSchool.newGame({ seed: 9 });
  const b = HighSchool.newGame({ seed: 9 });
  for (const p of b.players) p.heroCampBonus = true;
  for (let i = 0; i < 30; i++) {
    for (const st2 of [a, b]) {
      if (st2.awaiting) HighSchool.confirmPolicies(st2, HighSchool.autoPolicies(st2));
      else HighSchool.advanceToNextEvent(st2, null, { autoReview: true });
    }
  }
  const strip = (s) => JSON.stringify(s.players.map((p) => [p.id, p.abilities, p.stats]));
  assert.strictEqual(strip(a), strip(b), '結果が同じ');
});

test('物語の文面:各文は80字以内。直近3回の間で同じ文を繰り返さない', () => {
  const long = { n: '長谷川 颯太', r: '長谷川 颯太', pos: '外野', k: '99', pt: '持久タイプ', bt: '守備タイプ', stage: '夏の地区大会の準決勝(勝利)' };
  const walk = (o, f) => { if (Array.isArray(o)) { if (Array.isArray(o[1])) o.forEach((x) => walk(x, f)); else o.forEach((x) => (typeof x === 'string' ? f(x) : walk(x, f))); } else if (o && typeof o === 'object') for (const k of Object.keys(o)) walk(o[k], f); };
  let n = 0;
  walk(STORY, (t) => {
    n++;
    const filled = Hero.fill(t, long);
    for (const sent of filled.split(/(?<=[。!?])/)) assert.ok(sent.length <= 80, '80字を超える:' + sent);
    const nums = t.match(/\{k\}|\d+/g) || [];
    for (const sent of t.split(/(?<=[。!?])/)) assert.ok(((sent.match(/\{k\}|\d+/g) || []).length) <= 1, '数字は1文に1つまで:' + sent);
  });
  assert.ok(n > 200);
  // トリガーごとに6つ以上(条件つきは条件ごとに3つ以上)
  for (const k of Object.keys(STORY)) {
    const v = STORY[k];
    if (k === 'impression' || k === 'grad') continue;
    if (Array.isArray(v)) assert.ok(v.length >= 6 || ['rankUp', 'rankDown', 'rivalMoved'].indexOf(k) >= 0 && v.length >= 3, k + ' の文面が少ない');
    else for (const c of Object.keys(v)) assert.ok(v[c].length >= 3, k + '.' + c + ' の文面が少ない');
  }
  // 実際の3年間で、直近3回の文と重複しない
  for (const st of RUNS) {
    const texts = st.hero.stories.map((s) => s.text);
    for (let i = 0; i < texts.length; i++) {
      for (let j = Math.max(0, i - 3); j < i; j++) assert.notStrictEqual(texts[i], texts[j], '直近3回で重複:' + texts[i]);
    }
  }
});

test('練習試合の出場保証:主人公はスタメンでない月も練習試合に出場し、試合経験値が入る', () => {
  let checked = 0;
  for (let seed = 1; seed <= 30 && checked < 5; seed++) {
    const st = Hero.newHeroGame(seed);
    const low = Hero.pickable(st).slice().sort((a, b) => Core.rating(a) - Core.rating(b))[0];   // 控えになりやすい選手
    Hero.pickHero(st, low.id);
    Hero.startPlay(st);
    const h = Hero.heroOf(st);
    for (let m = 0; m < 6 && st.hero.phase === 'play'; m++) {
      const apps = st.hero.practiceApps;
      const exp = h.expTotal;
      const slots = Core.buildLineup(st.players, { heroTwoWay: true });
      const starter = slots.some((x) => x.player === h);
      const c = HighSchool.CALENDAR[st.month];
      const hasPractice = c.events.some((e) => CONFIG.eventTypes[e] && CONFIG.eventTypes[e].kind === 'practiceGames');
      Hero.advance(st, 'month');
      if (hasPractice && !starter) {
        assert.ok(st.hero.practiceApps > apps, '控えでも練習試合に出場');
        assert.ok(h.expTotal > exp, '試合経験値が入る');
        checked++;
      }
    }
  }
  assert.ok(checked > 0, '控えの月の練習試合を確認できた');
});

test('卒業は3年の夏の大会の直後(8月以降には進まない)。新年度の画面は2年目と3年目の4月だけ', () => {
  for (const st of RUNS) {
    const H = st.hero;
    const y3 = H.enrolledYear + 2;
    const a = st.alumni.find((x) => x.id === H.id);
    assert.strictEqual(a.graduatedYear, y3, '3年目に卒業');
    assert.strictEqual(st.year, y3, '年度は3年目のまま');
    assert.strictEqual(HighSchool.CALENDAR[st.month].month, 8, '8月は処理していない(夏の大会の7月まで)');
    const ret = H.stories.filter((x) => x.kind === 'retire');
    assert.strictEqual(ret.length, 1, '引退の一言は1回');
    assert.strictEqual(ret[0].s, HighSchool.monthSerial(y3, 3), '引退は3年目の7月(夏の大会)');
    assert.strictEqual(H.stories[H.stories.length - 1].s <= HighSchool.monthSerial(y3, 3), true, '7月より後の物語はない');
    assert.deepStrictEqual(H.newYears, [H.enrolledYear + 1, H.enrolledYear + 2], '新年度の画面は2年目と3年目の4月');
  }
});

test('getRank の境界値と、球速の換算', () => {
  const R = CONFIG.heroMode.display.rank;
  const cases = [['S', R.S], ['A', R.A], ['B', R.B], ['C', R.C], ['D', R.D], ['E', R.E], ['F', R.F]];
  for (const [k, v] of cases) {
    assert.strictEqual(Hero.getRank(v), k, k + ' の下限ちょうど');
    assert.notStrictEqual(Hero.getRank(v - 0.01), k, k + ' の下限の直前');
  }
  assert.strictEqual(Hero.getRank(R.F - 0.01), 'G');
  assert.strictEqual(Hero.getRank(0), 'G');
  let prev = -1;
  for (let v = 0; v <= 200; v += 0.5) { const k = Hero.toKmh(v); assert.ok(k >= prev, '単調に増える'); prev = k; }
  const below = (Hero.toKmh(100) - Hero.toKmh(80)) / 20;
  const above = (Hero.toKmh(140) - Hero.toKmh(120)) / 20;
  assert.ok(above < below, '100を超える部分は緩やか');
  assert.ok(Hero.toKmh(1000) <= CONFIG.heroMode.display.kmh.max, '上限');
});

test('球種の内訳:合計 = 総変化量、各 1〜7、重複なし、保存して読み込んでも同じ', () => {
  let n = 0;
  for (const st of RUNS) {
    for (const p of st.players) {
      if (!p.pitches) continue;
      n++;
      const tot = Hero.breakTotal(p);
      const sum = p.pitches.reduce((a, x) => a + x.v, 0);
      assert.strictEqual(sum, Math.min(tot, CONFIG.heroMode.display.maxPitches * CONFIG.heroMode.display.pitchMax), '合計 = 総変化量');
      for (const x of p.pitches) assert.ok(x.v >= 1 && x.v <= CONFIG.heroMode.display.pitchMax, '変化量 1〜7');
      assert.strictEqual(new Set(p.pitches.map((x) => x.n)).size, p.pitches.length, '重複なし');
      assert.ok(p.pitches.length <= CONFIG.heroMode.display.maxPitches);
    }
    const back = JSON.parse(JSON.stringify(st));
    assert.deepStrictEqual(back.players.map((p) => p.pitches), st.players.map((p) => p.pitches), '保存して読み込んでも同じ');
  }
  assert.ok(n > 500);
});

test('先発の投球回:スタミナが高いほど長く、2〜9回、失点が多いほど短い', () => {
  let prev = 0;
  for (let s = 0; s <= 120; s += 5) {
    const ip = Core.heroInnings(s, 2, false);
    assert.ok(ip >= prev, 'スタミナが高いほど長い');
    assert.ok(ip >= 2 && ip <= 9);
    prev = ip;
  }
  for (const s of [10, 40, 70, 100]) {
    let p2 = 99;
    for (let runs = 0; runs <= 15; runs++) {
      const ip = Core.heroInnings(s, runs, false);
      assert.ok(ip <= p2, '失点が多いほど短い');
      assert.ok(ip >= 2 && ip <= 9);
      p2 = ip;
    }
  }
  // 実際の試合:先発は2〜9回、完投(9回)のときだけ救援なし
  let games = 0;
  for (const st of RUNS) {
    for (const ev of st.hero.gameLog || []) {
      games++;
      assert.ok(ev.outs >= 6 && ev.outs <= 27);
    }
  }
});

test('先発の投球回の変更は、ゲーム本体(得点・勝敗・ゲームの乱数・能力)を変えない', () => {
  const SUB = CONFIG.heroMode.substitute; const subPrev = SUB.enabled; SUB.enabled = false;   // H1.6a:途中出場の層は試合の記録(ラインスコア)を使うので、この確認では切る
  try {
  const S = CONFIG.heroMode.stamina;
  for (const seed of [11, 12, 13]) {
    S.enabled = true;
    const a = play(seed, { pick: true });
    S.enabled = false;
    const b = play(seed, { pick: true });
    S.enabled = true;
    const body = (st) => JSON.stringify([st.rngState, st.yearRecords, st.players.map((p) => [p.id, p.position, p.abilities]), st.alumni.map((x) => [x.id, x.finalAbilities, x.career])]);
    assert.strictEqual(body(a), body(b), 'シード' + seed);
  }
  } finally { SUB.enabled = subPrev; }
});

test('部員名簿は、助っ人を除く全員を載せる', () => {
  for (const st of RUNS.slice(0, 10)) {
    const L = Hero.rosterList(st);
    assert.strictEqual(L.length, st.players.filter((p) => !p.helper).length);
  }
});

test('物語の数字は、その時点の値(ランクアップは上がった月の値、一番伸びた半年は半年の始まりと終わりの値)', () => {
  let ups = 0;
  let peaks = 0;
  for (const st of RUNS) {
    const H = st.hero;
    const a = st.alumni.find((x) => x.id === H.id);
    for (const x of H.stories.filter((y) => y.kind === 'abilityUp' && y.meta)) {
      const v = Hero.getValueAt(a, x.s);
      // 月ごとの記録は 0.1 単位で丸めて持つので、境目では 1km/h ずれることがある
      if (x.meta.key === 'velocity') assert.ok(Hero.toKmh(v.velocity) >= x.meta.v.k - 1 && Hero.toKmh(v.velocity) < x.meta.v.k + 5, '球速は上がった月の値');
      else if (x.meta.key !== 'breaking') assert.strictEqual(Hero.getRank(v[x.meta.key]), x.meta.v.rank, 'ランクは上がった月の値:' + x.text);
      ups++;
    }
    if (H.peakInfo && H.peakInfo.range) {
      peaks++;
      const v0 = Hero.getValueAt(a, H.peakInfo.range[0] - 1);
      const v1 = Hero.getValueAt(a, H.peakInfo.range[1]);
      const t = H.peakInfo.text;
      const m = /特に(.+?)は([SABCDEFG])から([SABCDEFG])に上がった/.exec(t);
      if (m) {
        const k = Object.keys(Core.ABILITY_LABEL).find((x) => Core.ABILITY_LABEL[x] === m[1]);
        assert.strictEqual(m[2], Hero.getRank(v0[k]), '始まりのランク:' + t);
        assert.strictEqual(m[3], Hero.getRank(v1[k]), '終わりのランク(卒業時のランクではない):' + t);
      }
      const n = /特に(.+?)が(\d+)から(\d+)に伸びた/.exec(t);
      if (n) {
        const k = Object.keys(Core.ABILITY_LABEL).find((x) => Core.ABILITY_LABEL[x] === n[1]);
        assert.strictEqual(Number(n[2]), Math.round(v0[k]));
        assert.strictEqual(Number(n[3]), Math.round(v1[k]));
      }
    }
  }
  assert.ok(ups > 100 && peaks > 100);
});

test('試合の山:年・大会・ラウンド・結果が記録と一致し、最高成績を超えない(200回)', () => {
  const depth = (label, rounds) => (label === '優勝' || label === '準優勝' ? rounds : label === 'ベスト4' ? rounds - 1 : label === 'ベスト8' ? rounds - 2 : label === '初戦敗退' ? 1 : Number((/(\d+)回戦敗退/.exec(label) || [0, 1])[1]));
  let n = 0;
  for (const st of RUNS) {
    const G = st.hero.peakGame;
    if (!G) continue;
    n++;
    const e = st.hero.appear.find((x) => x.kind === 'tourney' && x.s === G.s && x.tkey === G.tkey && x.roundNo === G.roundNo);
    assert.ok(e && (e.role === 'start' || e.role === 'sub'), '主人公が出場した試合:' + JSON.stringify(e) + ' / ' + JSON.stringify(G));
    assert.strictEqual(e.win, G.win, '結果');
    const rec = st.yearRecords[G.y] && st.yearRecords[G.y][G.tkey];
    assert.ok(rec && depth(rec, G.rounds) >= G.roundNo, 'その大会の到達ラウンド以内:' + rec + ' / ' + G.roundNo);
    const line = st.hero.graduation.lines.find((l) => l.indexOf(G.when) >= 0);
    assert.ok(line && line.indexOf(G.roundLabel) >= 0 && !/[((](勝利|敗戦)[))]/.test(line), '年・大会・ラウンドが文に入り、括弧書きがない:' + line);
    assert.strictEqual(G.when, G.grade + '年' + CONFIG.tournaments[G.tkey].name);
  }
  assert.ok(n > 50, '試合の山がある試行 ' + n);   // H1.5a:部員が増え、主人公が出場しない試行が増えたため 100 → 50
});

test('主人公の出場と成績が記録と一致し、練習試合の成績は大会の通算に混ざらない(200回)', () => {
  for (const st of RUNS) {
    const H = st.hero;
    const a = st.alumni.find((x) => x.id === H.id);
    let ab = 0, h = 0;
    for (const e of H.appear) {
      if (e.kind === 'tourney') {
        if (e.role === 'start' || e.role === 'sub') assert.ok(e.bat || e.pit || e.sub, 'スタメン・途中出場なら試合の記録がある');
        else assert.ok(!e.bat && !e.pit, 'ベンチ入り(出番なし)・ベンチ外なら記録はない');
        if (e.bat) { ab += e.bat.ab; h += e.bat.h; }
      } else {
        assert.ok(e.role === 'start' || e.role === 'sub', '練習試合は途中出場以上');
      }
    }
    assert.strictEqual(a.stats.career.ab, ab, '大会の打数は、大会の試合の合計(練習試合を含まない)');
    assert.strictEqual(a.stats.career.h, h);
  }
});

test('気になる選手は2人まで。ひとことと止まる回数に影響しない', () => {
  for (const seed of [31, 32, 33]) {
    const a = Hero.newHeroGame(seed);
    const b = Hero.newHeroGame(seed);
    Hero.pickHero(a, Hero.pickable(a)[0].id);
    Hero.pickHero(b, Hero.pickable(b)[0].id);
    const others = b.players.filter((p) => p.id !== b.hero.id && p.id !== b.hero.rivalId && !p.helper);
    assert.ok(Hero.toggleWatch(b, others[0].id).ok);
    assert.ok(Hero.toggleWatch(b, others[1].id).ok);
    const r = Hero.toggleWatch(b, others[2].id);
    assert.ok(!r.ok && r.needRemove.length === 2, '3人目は外す選手を選ばせる');
    assert.ok(b.hero.watch.length <= CONFIG.heroMode.watchMax);
    assert.strictEqual(Hero.toggleWatch(b, b.hero.id).ok, false, '主人公は別枠');
    Hero.startPlay(a); Hero.startPlay(b);
    while (a.hero.phase === 'play') Hero.advance(a, 'event');
    while (b.hero.phase === 'play') { Hero.advance(b, 'event'); assert.ok(b.hero.watch.length <= CONFIG.heroMode.watchMax); }
    assert.deepStrictEqual(b.hero.stories.map((x) => x.text), a.hero.stories.map((x) => x.text), 'ひとことは同じ');
    assert.deepStrictEqual(b.hero.stopsByYear, a.hero.stopsByYear, '止まる回数は同じ');
  }
});

test('卒業:3年の夏の大会のあとに、読み物(4〜7文)と結果が出る', () => {
  for (const st of RUNS) {
    assert.strictEqual(st.hero.phase, 'graduate');
    const G = st.hero.graduation;
    assert.ok(G.lines.length >= 4 && G.lines.length <= 7, '文の数 ' + G.lines.length);
    assert.ok(G.career);
  }
});

// ---------- H1.3:先発の能力で失点を組み直す ----------
test('失点の組み直し:勝敗・自校の得点・能力・進路・本体の乱数の状態が H1.2 と一致する(100回)', () => {
  const FP = require('./hero-fingerprint.js');
  const ref = require('./fixtures/h12-fingerprint.json');
  assert.strictEqual(ref.length, FP.N);
  withRivalMode('strongest', () => { for (let i = 0; i < FP.N; i++) assert.deepStrictEqual(FP.fingerprint(i), ref[i], i + '回目'); });   // H1.4 の新しいライバルの選び方では展開が変わるため、旧方式で比べる
}, { legacy: true });

test('失点の組み直し:勝てば 0〜得点−1、負ければ得点+1 以上。先発+救援 = 失点、ラインスコアの合計 = 失点', () => {
  let n = 0, shifted = 0;
  for (let i = 0; i < 40; i++) {
    const st = Hero.newHeroGame(800 + i);
    const r = new Core.Rng(((800 + i) * 40503) >>> 0);
    if (i % 2) { Hero.createHero(st, { pos: 'pitcher', type: 'gouwan', level: 'mid', talent: i % 4 === 1 ? 'genius' : 'normal' }); Hero.confirmRival(st, 'auto'); }
    else Hero.pickHero(st, r.pick(Hero.pickable(st)).id);
    Hero.startPlay(st);
    for (let guard = 0; st.hero.phase === 'play' && guard < 200; guard++) {
      Hero.advance(st, 'event');
      for (const m of st.lastEvents || []) {
        const list = [].concat.apply([], (m.cards || []).filter((c) => c.type === 'tournament' && c.games).map((c) => c.games)).concat(m.practice || []);
        for (const g of list) {
          const b = g.box;
          if (!b.starter) { assert.ok(b.shift == null, '投手枠が空なら組み直さない'); continue; }   // 投手枠が空の試合(先発なし)
          n++;
          if (b.win) assert.ok(b.opp >= 0 && b.opp < b.my, '勝ち:' + b.my + '対' + b.opp);
          else assert.ok(b.opp >= b.my + 1, '負け:' + b.my + '対' + b.opp);
          assert.strictEqual(b.starter.runs + (b.reliefs || (b.relief ? [b.relief] : [])).reduce((a, x) => a + x.runs, 0), b.opp, '先発+救援 = 失点');
          assert.strictEqual(b.line.opp.reduce((a, x) => a + x, 0), b.opp, 'ラインスコアの合計 = 失点');
          assert.strictEqual(b.line.my.reduce((a, x) => a + x, 0), b.my);
          if (b.shift) shifted++;
          if (g.text) assert.ok(g.text.indexOf(b.my + '対' + b.opp + 'で') >= 0, '大会の結果の文も組み直した失点:' + g.text);
        }
      }
    }
  }
  assert.ok(n > 1000 && shifted > n * 0.2, '試合 ' + n + ' / ずらした ' + shifted);
});

test('失点の組み直し:先発の総合値が高いほど、平均失点が低い(150 < 300 < 470)', () => {
  const st = Hero.newHeroGame(77);
  const base = st.players.find((p) => p.position === 'P');
  const mean = (target) => {
    const p = JSON.parse(JSON.stringify(base));
    for (const k of Core.PITCH_KEYS) p.abilities[k] = target / CONFIG.ratingMultiplier;
    const r = new Core.Rng(31);
    let sum = 0;
    for (let i = 0; i < 4000; i++) {
      const m = Core.playMatch(r, 50, 50);
      const o = Core.heroRunsAllowed(r, p, m, { final: false });
      assert.strictEqual(o.win, m.win);
      assert.strictEqual(o.my, m.my);
      sum += o.opp;
    }
    return sum / 4000;
  };
  const a = mean(150), b = mean(300), c = mean(470);
  assert.ok(a > b && b > c, a.toFixed(2) + ' / ' + b.toFixed(2) + ' / ' + c.toFixed(2));
});

test('失点の組み直しは、育成監督モードでは起きない(heroMode.pitching はこのモードだけ)', () => {
  const st = HighSchool.newGame({ seed: 21 });
  let n = 0;
  for (let i = 0; i < 40; i++) {
    if (st.awaiting) HighSchool.confirmPolicies(st, HighSchool.autoPolicies(st));
    else HighSchool.advanceToNextEvent(st, null, { autoReview: true });
    for (const m of st.lastEvents || []) for (const c of m.cards || []) if (c.type === 'tournament' && c.games) for (const g of c.games) { n++; assert.ok(g.box.shift == null && g.box.oppBase == null && !g.box.starter); }
  }
  assert.ok(n > 0);
});

test('卒業の通算成績:主人公とライバルの大会・練習試合の通算が、試合の記録の合計と一致する(200回)', () => {
  const add = (t, b, p, line) => {
    const bt = (b.batters || []).find((x) => x.id === p.id);
    if (line && line.outs == null) { t.ab += line.ab; t.h += line.h; t.hr += line.hr; t.rbi += line.rbi; }
    else if (bt) { t.ab += bt.ab; t.h += bt.h; t.hr += bt.hr; t.rbi += bt.rbi; }
    if (line && line.outs != null) { t.outs += line.outs; t.runs += line.runs; }
    else if (b.starter && b.starter.id === p.id) { t.outs += b.starter.outs; t.runs += b.starter.runs; if (b.starter.outs >= 27) t.cg++; }
    else if ((b.reliefs || (b.relief ? [b.relief] : [])).some((x) => x.id === p.id)) { const x = (b.reliefs || [b.relief]).find((y) => y.id === p.id); t.outs += x.outs; t.runs += x.runs; }
    if (b.wpId === p.id) t.w++;
    if (b.lpId === p.id) t.l++;
  };
  const z = () => ({ ab: 0, h: 0, hr: 0, rbi: 0, outs: 0, runs: 0, w: 0, l: 0, cg: 0 });
  const pick = (t, keys) => keys.reduce((o, k) => { o[k] = t[k] || 0; return o; }, {});
  const K = ['ab', 'h', 'hr', 'rbi', 'outs', 'w', 'l'];
  let withRival = 0;
  for (let i = 0; i < 200; i++) {
    const seed = 3000 + i;
    const st = Hero.newHeroGame(seed);
    if (i % 2) Hero.pickHero(st, Hero.pickable(st)[i % Hero.pickable(st).length].id);
    else { Hero.createHero(st, [FIELD, PITCH, TW][i % 3]); Hero.confirmRival(st, 'auto'); }
    Hero.startPlay(st);
    const H = st.hero;
    const exp = { ht: z(), hp: z(), rt: z(), rp: z() };
    for (let guard = 0; H.phase === 'play' && guard < 200; guard++) {
      Hero.advance(st, 'event');
      const h = Hero.heroOf(st) || st.alumni.find((a) => a.id === H.id);
      const rv = H.rivalId != null ? (Hero.rivalOf(st) || st.alumni.find((a) => a.id === H.rivalId)) : null;
      for (const m of st.lastEvents || []) {
        for (const c of m.cards || []) if (c.type === 'tournament' && c.games) for (const g of c.games) { add(exp.ht, g.box, h, null); if (rv) add(exp.rt, g.box, rv, null); }
        for (const g of m.practice || []) { add(exp.hp, g.box, h, g.heroLine || null); if (rv) add(exp.rp, g.box, rv, null); }
      }
    }
    const T = H.graduation.totals;
    assert.deepStrictEqual(pick(T.hero.t, K), pick(exp.ht, K), seed + ':主人公の大会');
    assert.deepStrictEqual(pick(T.hero.p, K.concat(['runs', 'cg'])), pick(exp.hp, K.concat(['runs', 'cg'])), seed + ':主人公の練習試合');
    if (T.rival) {
      withRival++;
      assert.deepStrictEqual(pick(T.rival.t, K), pick(exp.rt, K), seed + ':ライバルの大会');
      assert.deepStrictEqual(pick(T.rival.p, K.concat(['runs', 'cg'])), pick(exp.rp, K.concat(['runs', 'cg'])), seed + ':ライバルの練習試合');
    }
  }
  assert.ok(withRival > 150);
});

// ---------- H1.3b:スタメン表の指標と、打順の変化のひとこと(確認は20回) ----------
test('スタメン表:各行の指標が、能力と簡易成績と一致する。打数0は「---」、20未満は薄い表示(20回)', () => {
  let rows = 0, faint = 0, dash = 0;
  for (let i = 0; i < 20; i++) {
    const st = Hero.newHeroGame(4000 + i);
    Hero.pickHero(st, Hero.pickable(st)[i % Hero.pickable(st).length].id);
    Hero.startPlay(st);
    for (let k = 0; k < 4 + (i % 8); k++) Hero.advance(st, 'event');
    if (st.hero.phase !== 'play') continue;
    for (const r of Hero.lineupRows(st)) {
      rows++;
      const p = st.players.find((q) => q.id === r.id);
      const a = p.abilities;
      const c = (p.stats && p.stats.career) || Core.emptyStatLine();
      if (r.pitcher) {
        assert.strictEqual(r.cells[0].v, Hero.toKmh(a.velocity));
        assert.deepStrictEqual([r.cells[1].rank, r.cells[1].v], [Hero.getRank(a.control), Math.round(a.control)]);
        assert.deepStrictEqual([r.cells[2].rank, r.cells[2].v], [Hero.getRank(a.stamina), Math.round(a.stamina)]);
        assert.strictEqual(r.stat.text, c.outs ? Core.formatEra(c) : '---');
      } else {
        ['contact', 'power', 'speed'].forEach((k, j) => assert.deepStrictEqual([r.cells[j].rank, r.cells[j].v], [Hero.getRank(a[k]), Math.round(a[k])]));
        assert.strictEqual(r.stat.text, c.ab ? Core.formatAverage(c) : '---');
        assert.strictEqual(r.stat.faint, c.ab > 0 && c.ab < CONFIG.heroMode.lineup.minAb);
        if (!c.ab) dash++;
        if (r.stat.faint) faint++;
        assert.strictEqual(r.ext.ab, c.ab);
        assert.strictEqual(r.ext.hr, c.hr);
      }
    }
  }
  assert.ok(rows > 100 && faint > 0 && dash > 0, rows + ' / ' + faint + ' / ' + dash);
});

test('打順の変化のひとこと:2つ以上動いた月だけ、年に3回まで、文面の打順は記録と一致(20回)', () => {
  const L = CONFIG.heroMode.lineup;
  let n = 0;
  for (let i = 0; i < 20; i++) {
    const st = Hero.newHeroGame(4100 + i);
    Hero.pickHero(st, Hero.pickable(st)[i % Hero.pickable(st).length].id);
    Hero.startPlay(st);
    for (let k = 0; k < 200 && st.hero.phase === 'play'; k++) Hero.advance(st, 'event');
    const H = st.hero;
    const log = {};
    for (const [sv, o] of H.orderLog) log[sv] = o;
    const perYear = {};
    for (const x of H.stories.filter((y) => y.kind === 'orderUp' || y.kind === 'orderDown')) {
      n++;
      const m = x.meta;
      assert.strictEqual(log[x.s], m.to, '今月の打順');
      assert.strictEqual(log[x.s - 1], m.from, '前の月の打順(先発から外れた・戻った月は null で出ない)');
      assert.ok(Math.abs(m.to - m.from) >= L.orderChangeMin);
      assert.strictEqual(x.kind === 'orderUp', m.to < m.from);
      assert.ok(x.text.indexOf(m.from + '番から' + m.to + '番') >= 0 || (x.text.indexOf(m.from + '番') >= 0 && x.text.indexOf(m.to + '番') >= 0), x.text);
      assert.ok(!H.stories.some((y) => y.s === x.s && y !== x && y.kind !== 'quiet'), '同じ月の他の物語が優先');
      perYear[x.y] = (perYear[x.y] || 0) + 1;
      if (m.why) assert.ok(x.text.indexOf(m.why) >= 0 && m.why1 && m.why0, '理由は記録で確かめられたときだけ');
    }
    for (const y of Object.keys(perYear)) assert.ok(perYear[y] <= L.orderChangeMax, '年に3回まで');
  }
  assert.ok(n > 0, '打順の変化のひとことが出ている');
});

// ---------- H1.4b:3年の夏の大会を見てから、卒業へ(確認は20回) ----------
test('3年の7月は卒業画面へ自動で進まず(卒業待ち)、「卒業へ進む」で進む。卒業の中身は H1.3b と一致。引退の一言は7月のひとこと(20回)', () => {
  const G = require('./hero-graduation.js');
  const ref = require('./fixtures/h13b-graduation.json');
  const kinds = {};
  for (let i = 0; i < G.N; i++) {
    const o = G.run(i);
    const st = o.st;
    const H = st.hero;
    assert.strictEqual(H.phase, 'graduate');
    assert.strictEqual(H.gradPending, true, '7月の画面で止まる(卒業待ち)');
    if (!Core.isV2()) assert.strictEqual(o.grad, ref[i], i + '回目:卒業画面の中身(legacy で比べる)');
    const ret = H.lastStories.find((x) => x.kind === 'retire');
    assert.ok(ret, '引退の一言は7月のひとこと');
    assert.ok(H.graduation.lines.indexOf(ret.text) < 0, '卒業画面の読み物には引退の一言はない');
    const line = Hero.summerResultLine(st);
    kinds[line.replace(/^夏の地区大会:/, '').replace(/\uFF08.+\uFF09$/, '')] = true;
    assert.ok(/^夏の地区大会:(優勝|.+で敗退|出場なし)/.test(line), line);
    assert.ok(Hero.advance(st, 'event') === null, '卒業待ちでは、それ以上進まない');
    assert.ok(Hero.goGraduate(st) && H.gradPending === false, '卒業へ進む');
  }
  assert.ok(Object.keys(kinds).length >= 2, JSON.stringify(kinds));
});

test('卒業画面の中身は H1.3b と一致する(20回。legacy)', () => {
  const G = require('./hero-graduation.js');
  const ref = require('./fixtures/h13b-graduation.json');
  for (let i = 0; i < G.N; i++) assert.strictEqual(G.run(i).grad, ref[i], i + '回目');
}, { legacy: true });

test("roster.version 'legacy' は H1.4b と完全に一致する(勝敗・能力・進路・本体の乱数・物語。20回)", () => {
  const FP = require('./hero-fingerprint.js');
  const ref = require('./fixtures/h14b-fingerprint.json');
  for (let i = 0; i < ref.length; i++) assert.deepStrictEqual(FP.fingerprint(i, { stories: true }), ref[i], i + '回目');
}, { legacy: true });

// ---------- H1.5a:部員の構成(v2) ----------
test('構成(v2):30シード × 5年で、各学年の新入生の本職の投手2人以上・捕手1人以上。開始時の部員全体で投手6人以上・捕手3人以上。部員は45人まで', () => {
  if (!Core.isV2()) return;
  const V = CONFIG.roster.v2;
  for (let seed = 1; seed <= 30; seed++) {
    const st = HighSchool.newGame({ seed: seed });
    const all = st.players.concat(st.pendingRecruits).filter((p) => !p.helper);
    assert.ok(all.filter((p) => p.position === 'P').length >= 6, seed + ':開始時の投手');
    assert.ok(all.filter((p) => p.position === 'C').length >= 3, seed + ':開始時の捕手');
    for (let y = 0; y < 5; y++) {
      const R = st.pendingRecruits;
      assert.ok(R.filter((p) => p.position === 'P').length >= V.minPerClass.P || R.length < V.countMin, seed + ':' + y + ' 投手');
      assert.ok(R.filter((p) => p.position === 'C').length >= V.minPerClass.C || R.length < V.countMin, seed + ':' + y + ' 捕手');
      HighSchool.confirmPolicies(st, HighSchool.autoPolicies(st));
      assert.ok(HighSchool.members(st).length <= CONFIG.newcomers.rosterCap, '部員は45人まで');
      for (let g = 0; g < 40 && !(st.awaiting && st.policyContext === 'enrollment'); g++) {
        if (st.awaiting) HighSchool.confirmPolicies(st, HighSchool.autoPolicies(st)); else HighSchool.advanceToNextEvent(st, null, { autoReview: true });
      }
    }
  }
});

test('新入生の人数(v2):評判の帯ごとの目安に収まり、評判が上がるほど人数と投手が増える', () => {
  if (!Core.isV2()) return;
  const want = [[0, 8, 9], [15, 12, 14], [30, 17, 20], [45, 22, 24]];
  let prevN = 0, prevP = 0;
  for (const [gap, lo, hi] of want) {
    let n = 0, pn = 0;
    const K = 200;
    for (let i = 0; i < K; i++) {
      const st = HighSchool.newGame({ seed: 9000 + i });
      st.schoolRep = CONFIG.reputation.baseline + gap;
      st.players = st.players.slice(0, 10);   // 部員の上限で人数が削られないように
      st.pendingRecruits = [];
      HighSchool.drawRecruits(st);
      n += st.pendingRecruits.length;
      pn += st.pendingRecruits.filter((p) => p.position === 'P').length;
    }
    const avg = n / K, avgP = pn / K;
    assert.ok(avg >= lo && avg <= hi, '評判+' + gap + ':平均 ' + avg.toFixed(2) + '(目安 ' + lo + '〜' + hi + ')');
    assert.ok(avg > prevN && avgP > prevP, '人数と投手が増える');
    prevN = avg; prevP = avgP;
  }
});

test('天才・転生・天才かつ転生の入学時の総合値(v2。各100人)', () => {
  if (!Core.isV2()) return;
  const r = new Core.Rng(5);
  const R = CONFIG.rating;
  for (let i = 0; i < 100; i++) {
    const g = Core.drawInitialRating(r, 'genius', null);
    const c = Core.drawInitialRating(r, 'normal', 'x');
    const b = Core.drawInitialRating(r, 'genius', 'x');
    assert.ok(g >= 200 && g <= 300 && c >= 250 && c <= 350 && b >= 250 && b <= 350, g + ' / ' + c + ' / ' + b);
  }
  assert.strictEqual(R.genius.min, 200);
});

test('入口(v2):ピックアップは8人以下(上位5人を含む)。主人公に選べるのはピックアップだけ。引き直しで作り直す', () => {
  if (!Core.isV2()) return;
  for (let seed = 1; seed <= 20; seed++) {
    const st = Hero.newHeroGame(seed);
    const P = Hero.pickable(st);
    assert.ok(P.length <= CONFIG.heroMode.entranceMax && P.length === Math.min(CONFIG.heroMode.entranceMax, st.pendingRecruits.length));
    const top = st.pendingRecruits.slice().sort((a, b) => Core.rating(b) - Core.rating(a) || a.id - b.id).slice(0, CONFIG.heroMode.entrancePickTop);
    for (const p of top) assert.ok(P.indexOf(p) >= 0, '上位5人');
    const other = st.pendingRecruits.find((p) => P.indexOf(p) < 0);
    if (other) assert.strictEqual(Hero.pickHero(st, other.id), false, 'ピックアップ以外は選べない');
    Hero.reroll(st);
    assert.ok(Hero.pickable(st).every((p) => st.pendingRecruits.indexOf(p) >= 0) && Hero.pickable(st).length > 0, '引き直しで作り直す');
    assert.ok(Hero.pickHero(st, Hero.pickable(st)[0].id));
  }
});

// H1.6a より前のフェーズとの一致の確認は、途中出場の層(経験値で能力が変わる)を切って行う
function withSubOff(fn) { const S = CONFIG.heroMode.substitute; const prev = S.enabled; S.enabled = false; try { return fn(); } finally { S.enabled = prev; } }
// ---------- H1.4c:3年の7月の画面のスタメンと名簿 ----------
test('H1.4c:勝敗・能力・進路・本体の乱数が H1.5a と一致する(20回)', () => {
  if (!Core.isV2()) return;
  const FP = require('./hero-fingerprint.js');
  const ref = require('./fixtures/h15a-fingerprint.json');
  withSubOff(() => { for (let i = 0; i < ref.length; i++) assert.deepStrictEqual(FP.fingerprint(i), ref[i], i + '回目'); });
});

test('3年の7月の画面:スタメン表は大会の最後の試合のスタメン(主人公と3年生を含む)。名簿には引退した3年生が残る(20回)', () => {
  let with3 = 0;
  for (let i = 0; i < 20; i++) {
    const st = Hero.newHeroGame(7100 + i);
    Hero.pickHero(st, Hero.pickable(st)[i % Hero.pickable(st).length].id);
    Hero.startPlay(st);
    let normalChecked = false;
    for (let k = 0; k < 200 && st.hero.phase === 'play'; k++) {
      Hero.advance(st, 'event');
      if (!normalChecked && st.hero.phase === 'play') {   // 通常の月:今のスタメン(引退した選手は入らない)
        assert.ok(Hero.lineupRows(st).every((r) => !st.players.find((p) => p.id === r.id).retired));
        normalChecked = true;
      }
    }
    assert.ok(st.hero.gradPending);
    const T = Hero.tourneyLineupRows(st);
    let box = null;
    for (const m of st.lastEvents) for (const c of m.cards || []) if (c.type === 'tournament' && c.games) box = c.games[c.games.length - 1].box;
    if (box) {
      assert.strictEqual(T.title, '大会のときのスタメン');
      const ids = box.batters.map((b) => b.id).concat(box.starter ? [box.starter.id] : []);
      assert.deepStrictEqual(T.rows.map((r) => r.id).sort((a, b) => a - b), ids.filter((v, j) => ids.indexOf(v) === j).sort((a, b) => a - b), 'スタメンは試合の記録どおり');
      for (const r of T.rows.filter((x) => !x.pitcher || x.order)) assert.strictEqual(r.order, (box.batters.find((b) => b.id === r.id) || {}).num, '打順');
      if (T.rows.some((r) => r.grade === 3 && r.retired)) with3++;
      const heroIn = st.hero.appear.some((e) => e.kind === 'tourney' && e.role === 'start' && e.s === st.lastEvents[0].serial);
      if (heroIn) assert.ok(T.rows.some((r) => r.id === st.hero.id), '主人公を含む');
    } else assert.strictEqual(T.title, '直前のスタメン');
    // 名簿:引退した3年生(retired)が残り、主人公は卒業時の能力で取れる
    assert.ok(st.players.some((p) => p.grade === 3 && p.retired), '引退した3年生が名簿のデータに残る');
    assert.ok(Hero.anyPlayer(st, st.hero.id), '卒業した主人公も名簿に出せる');
  }
  assert.ok(with3 >= 15, '3年生を含む ' + with3);
});

// ---------- H1.5b:救援の複数化 ----------
function withReliefMax(n, fn) { const P = CONFIG.heroMode.pitching; const prev = P.reliefMax; P.reliefMax = n; try { return fn(); } finally { P.reliefMax = prev; } }
function gameList(seed) {
  const st = Hero.newHeroGame(seed);
  Hero.pickHero(st, Hero.pickable(st)[seed % Hero.pickable(st).length].id);
  Hero.startPlay(st);
  const L = [];
  for (let k = 0; k < 200 && st.hero.phase === 'play'; k++) {
    Hero.advance(st, 'event');
    for (const m of st.lastEvents || []) {
      for (const c of m.cards || []) if (c.type === 'tournament' && c.games) for (const g of c.games) L.push(g.box);
      for (const g of m.practice || []) L.push(g.box);
    }
  }
  return L;
}
test('救援(H1.5b):reliefMax が1でも3でも、勝敗・能力・進路・本体の乱数は H1.5a と一致。勝敗・自校の得点・失点の合計も同じ(20回)', () => {
  if (!Core.isV2()) return;
  const FP = require('./hero-fingerprint.js');
  const ref = require('./fixtures/h15a-fingerprint.json');
  withSubOff(() => {
    for (const n of [1, 3]) withReliefMax(n, () => { for (let i = 0; i < ref.length; i++) assert.deepStrictEqual(FP.fingerprint(i), ref[i], 'reliefMax ' + n + ':' + i + '回目'); });
    for (let i = 0; i < 20; i++) {
      const a = withReliefMax(1, () => gameList(7300 + i)).map((b) => [b.win, b.my, b.opp].join(':'));
      const b = withReliefMax(3, () => gameList(7300 + i)).map((x) => [x.win, x.my, x.opp].join(':'));
      assert.deepStrictEqual(b, a, i + '回目');
    }
  });
});

test('救援(H1.5b):人数は reliefMax まで。救援の投球回の合計 = 9 − 先発、失点の合計 = 試合の失点。控えの投手にも出番が回る(200試合以上)', () => {
  let n = 0;
  const who = {};
  for (let i = 0; i < 6; i++) {
    for (const b of gameList(7400 + i)) {
      if (!b.starter) continue;
      n++;
      const R = b.reliefs || [];
      assert.ok(R.length <= CONFIG.heroMode.pitching.reliefMax);
      assert.strictEqual(R.reduce((a, x) => a + x.outs, 0), 27 - b.starter.outs, '投球回');
      assert.strictEqual(b.starter.runs + R.reduce((a, x) => a + x.runs, 0), b.opp, '失点');
      assert.ok(R.every((x) => x.runs >= 0));
      R.forEach((x) => { who[x.id] = (who[x.id] || 0) + 1; });
    }
  }
  assert.ok(n >= 200, '試合 ' + n);
  assert.ok(Object.keys(who).length >= 8, '救援に出た投手 ' + Object.keys(who).length + '人');
});

// ---------- H1.6a:途中出場 ----------
test('途中出場(H1.6a):無効なら H1.5b と完全に一致(勝敗・能力・進路・成績・物語。10回)。有効でも経験値0倍なら勝敗・得点・失点は一致', () => {
  if (!Core.isV2()) return;
  const FP = require('./hero-fingerprint.js');
  const ref = require('./fixtures/h15b-fingerprint.json');
  withSubOff(() => { for (let i = 0; i < ref.length; i++) assert.deepStrictEqual(FP.fingerprint(i, { stories: true, stats: true, games: true }), ref[i], '無効:' + i + '回目'); });
  const S = CONFIG.heroMode.substitute; const prev = S.expMult; S.expMult = 0;
  try { for (let i = 0; i < ref.length; i++) { const f = FP.fingerprint(i, { games: true }); assert.deepStrictEqual(f.glog, ref[i].glog, '経験値0倍:' + i + '回目'); } } finally { S.expMult = prev; }
});

test('途中出場(H1.6a):チーム合計は変わらない(打数・安打は配分だけ)。上限・条件を守る。簡易成績と途中出場の成績が記録と一致(20回)', () => {
  if (!Core.isV2()) return;
  const C = CONFIG.heroMode.substitute;
  let subs = 0;
  const S = CONFIG.heroMode.substitute; const prev = S.expMult;
  for (let i = 0; i < 20; i++) {
    // 同じシードで、途中出場あり(経験値0倍:試合結果が同じ)となしを比べ、試合ごとのチームの打数・安打が同じ
    const a = withSubOff(() => gameList(7600 + i));
    S.expMult = 0;
    let b;
    try { b = gameList(7600 + i); } finally { S.expMult = prev; }
    assert.strictEqual(a.length, b.length);
    a.forEach((x, k) => {
      const y = b[k];
      const sum = (bx, f) => bx.batters.reduce((t, q) => t + q[f], 0) + (bx.subs || []).reduce((t, q) => t + (q[f] || 0), 0);
      assert.strictEqual(sum(y, 'ab'), sum(x, 'ab'), '打数の合計');
      assert.strictEqual(sum(y, 'h'), sum(x, 'h'), '安打の合計');
      const R = y.subs || [];
      subs += R.length;
      assert.ok(R.filter((q) => q.role === 'ph').length <= C.phMax && R.filter((q) => q.role === 'pr').length <= C.prMax && R.filter((q) => q.role === 'def').length <= C.defMax, '上限');
      if (R.some((q) => q.role === 'pr')) assert.ok(Math.abs(y.my - y.opp) <= C.prDiff, '代走は点差1以内');
      if (R.some((q) => q.role === 'def')) assert.ok(y.win && y.my - y.opp >= 1 && y.my - y.opp <= C.defLead, '守備固めは1〜3点リード');
      const ids = R.map((q) => q.id);
      assert.strictEqual(new Set(ids).size, ids.length, '同じ選手は1試合1回');
      assert.ok(R.every((q) => !y.batters.some((t) => t.id === q.id)), '途中出場はスタメン以外');
    });
  }
  assert.ok(subs > 100, '途中出場 ' + subs);
});

// legacy の一致の確認(別プロセス)
if (!LEGACY_ONLY && Core.isV2()) {
  test("roster.version 'legacy' の一致の確認(BBGACHA_ROSTER=legacy の別プロセスで、legacy の指紋のテストを実行)", () => {
    const cp = require('child_process');
    const out = cp.execFileSync(process.execPath, [__filename, '--legacy-only'], { env: Object.assign({}, process.env, { BBGACHA_ROSTER: 'legacy' }), encoding: 'utf8' });
    console.log(out.trim().split('\n').map((l) => '   [legacy] ' + l).join('\n'));
    assert.ok(/すべて成功/.test(out), out);
  });
}

console.log(failed ? '\n失敗 ' + failed + '件' : '\nすべて成功(' + passed + '件)');
process.exit(failed ? 1 : 0);
