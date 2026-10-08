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
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); } catch (e) { failed++; console.log('✕ ' + name + '\n   ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n   ') : e)); }
}
// 主人公の3年間を自動で進める(kind:{ pick:true } か 作成の内容)
function play(seed, kind, opts) {
  opts = opts || {};
  const st = Hero.newHeroGame(seed);
  for (let i = 0; i < (opts.rerolls || 0); i++) Hero.reroll(st);
  if (kind.pick) Hero.pickHero(st, st.pendingRecruits[kind.index || 0].id);
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
for (let s = 1; s <= 30; s++) {
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
    Hero.pickHero(a, a.pendingRecruits[0].id);
    // 引き直してから選ぶ
    const b = Hero.newHeroGame(seed);
    Hero.reroll(b); Hero.reroll(b);
    assert.strictEqual(b.rngState, r0, '引き直しのあとも同じ');
    Hero.pickHero(b, b.pendingRecruits[0].id);
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

test('ライバルは同学年の選手で、3年間変わらない。自動は、同じ守備区分(二刀流は該当する役割)の最上位', () => {
  for (const st of RUNS) {
    const H = st.hero;
    if (H.rivalId == null) continue;
    const hero = st.alumni.find((a) => a.id === H.id);
    const rv = st.alumni.find((a) => a.id === H.rivalId) || st.players.find((p) => p.id === H.rivalId);
    assert.ok(rv && rv.enrolledYear === hero.enrolledYear, '同学年');
  }
  // 自動の決め方:開始時に、同じ役割の候補がいれば、その中の最上位
  for (let s = 1; s <= 40; s++) {
    const st = Hero.newHeroGame(s);
    Hero.pickHero(st, st.pendingRecruits[s % st.pendingRecruits.length].id);
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
    const id0 = st.hero.rivalId;
    Hero.startPlay(st);
    for (let i = 0; i < 10 && st.hero.phase === 'play'; i++) Hero.advance(st, 'event');
    assert.strictEqual(st.hero.rivalId, id0, '途中で変わらない');
  }
});

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
    const h0 = st.pendingRecruits.find((p) => !p.twoWay && p.position !== 'P');
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
    const low = st.pendingRecruits.slice().sort((a, b) => Core.rating(a) - Core.rating(b))[0];   // 控えになりやすい選手
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

test('卒業:3年生の3月のあとに、読み物(4〜7文)と結果が出る', () => {
  for (const st of RUNS) {
    assert.strictEqual(st.hero.phase, 'graduate');
    const G = st.hero.graduation;
    assert.ok(G.lines.length >= 4 && G.lines.length <= 7, '文の数 ' + G.lines.length);
    assert.ok(G.career);
  }
});

console.log(failed ? '\n失敗 ' + failed + '件' : '\nすべて成功(' + passed + '件)');
process.exit(failed ? 1 : 0);
