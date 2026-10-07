// =============================================================
// tests/lineup.test.js : スタメン編成(本職優先)の自動確認
//   使い方: node tests/lineup.test.js
//   1) 100シード × 10年分の毎月の編成で、不変条件の違反が0件
//   2) 再現ケース:総合値440・肩が高い外野手と、総合値120の捕手 → 捕手は本職、外野手は外野
// =============================================================
'use strict';

const assert = require('assert');
const { CONFIG, Core, HighSchool } = require('../logic.js');

let failed = 0;
function test(name, fn) {
  try { fn(); console.log('✓ ' + name); } catch (e) { failed++; console.log('✕ ' + name + '\n   ' + (e && e.message)); }
}

// 能力をそろえた選手を作る(keys の能力をすべて v にする。arm などは個別に上書き)
function makePlayer(rng, id, position, v, extra) {
  const p = Core.createPlayer(rng, { id: id, year: 1, position: position, forceTwoWay: false });
  p.position = position;
  p.originalPosition = position;
  p.reincarnation = null;
  p.talent = 'normal';
  for (const k of Core.ALL_KEYS) p.abilities[k] = Core.sideKeys(Core.sideOf(position)).indexOf(k) >= 0 ? v : 5;
  Object.assign(p.abilities, extra || {});
  return p;
}

test('不変条件:100シード × 10年分の毎月の編成で、違反が0件', () => {
  assert.strictEqual(CONFIG.offPositionStarGap, 0, 'この確認は offPositionStarGap = 0 で行う');
  let months = 0;
  let violations = 0;
  let oop = 0;
  const examples = [];
  for (let seed = 1; seed <= 100; seed++) {
    const st = HighSchool.newGame({ seed: seed });
    while (st.year <= 10) {
      if (st.awaiting === 'policy') {
        const pol = {};
        for (const p of st.pendingRecruits) pol[p.id] = Core.autoPolicy(p);
        for (const p of HighSchool.reviewablePlayers(st)) if (p.needsPolicy) pol[p.id] = Core.autoPolicy(p);
        HighSchool.confirmPolicies(st, pol);
        continue;
      }
      HighSchool.advanceMonth(st);
      const ck = Core.checkLineup(st.players, Core.buildLineup(st.players));
      months++;
      violations += ck.violations;
      oop += ck.oop;
      if (ck.violations && examples.length < 3) examples.push('シード' + seed + ' ' + st.year + '年目');
    }
  }
  console.log('   確認した編成 ' + months + 'か月 / 本職外起用 のべ' + oop + '人');
  assert.strictEqual(violations, 0, '違反 ' + violations + '件(' + examples.join('、') + ')');
});

test('再現ケース:総合値440の外野手(肩が高い)と総合値120の捕手 → 捕手は本職、外野手は外野', () => {
  const rng = new Core.Rng(7);
  let id = 1;
  const team = [
    makePlayer(rng, id++, 'OF', 88, { arm: 100 }),   // 総合値 440 前後・肩が高い外野手
    makePlayer(rng, id++, 'C', 24),                  // 総合値 120 の捕手
    makePlayer(rng, id++, 'P', 50),
    makePlayer(rng, id++, 'IF', 50), makePlayer(rng, id++, 'IF', 50), makePlayer(rng, id++, 'IF', 50), makePlayer(rng, id++, 'IF', 50),
    makePlayer(rng, id++, 'OF', 50), makePlayer(rng, id++, 'OF', 50),
  ];
  const star = team[0];
  const catcher = team[1];
  assert.ok(Core.rating(star) >= 430 && Core.rating(catcher) <= 125, '総合値 ' + Core.rating(star) + ' / ' + Core.rating(catcher));
  assert.ok(Core.aptitude(star, 'C') > Core.aptitude(catcher, 'C'), '外野手のほうが捕手への適性が高い前提');
  const slots = Core.buildLineup(team);
  const at = (p) => slots.find((s) => s.player === p);
  assert.strictEqual(at(catcher).pos, 'C', '捕手は本職の選手');
  assert.strictEqual(at(star).pos, 'OF', '外野手は外野');
  assert.strictEqual(slots.filter((s) => s.outOfPosition).length, 0, '本職外の起用はない');
  assert.strictEqual(Core.checkLineup(team, slots).violations, 0);
});

test('不足の補充:本職の捕手が0人なら、余った選手から捕手への適性が高い順に入る', () => {
  const rng = new Core.Rng(11);
  let id = 1;
  const team = [makePlayer(rng, id++, 'P', 50)];
  for (let i = 0; i < 5; i++) team.push(makePlayer(rng, id++, 'IF', 40 + i * 5));
  for (let i = 0; i < 3; i++) team.push(makePlayer(rng, id++, 'OF', 50));
  const slots = Core.buildLineup(team);
  const c = slots.find((s) => s.pos === 'C');
  assert.ok(c.player && c.outOfPosition, '捕手の枠は本職外の起用');
  assert.strictEqual(c.player.position, 'IF', '内野の余り(5人目)が入る');
  assert.strictEqual(slots.filter((s) => s.outOfPosition).length, 1, '本職外は捕手の1人だけ');
  assert.strictEqual(Core.checkLineup(team, slots).violations, 0);
});

test('本職の投手が0人なら、適性の最も高い野手が登板する', () => {
  const rng = new Core.Rng(13);
  let id = 1;
  const team = [makePlayer(rng, id++, 'C', 50)];
  for (let i = 0; i < 5; i++) team.push(makePlayer(rng, id++, 'IF', 50));
  for (let i = 0; i < 4; i++) team.push(makePlayer(rng, id++, 'OF', 50));
  team[3].abilities.velocity = 70; team[3].abilities.control = 60; team[3].abilities.breaking = 50; team[3].abilities.stamina = 60;
  const slots = Core.buildLineup(team);
  const p = slots.find((s) => s.pos === 'P');
  const rest = team.filter((q) => !slots.some((s) => s.pos !== 'P' && s.player === q && q.position === s.pos));
  const best = rest.slice().sort((a, b) => Core.effectiveAptitude(b, 'P') - Core.effectiveAptitude(a, 'P'))[0];
  assert.strictEqual(p.player, best, '残った選手のうち投手への適性が最も高い選手');
});

test('判明した二刀流は、投手の枠に最優先で入る', () => {
  const rng = new Core.Rng(17);
  let id = 1;
  const ace = makePlayer(rng, id++, 'P', 80);
  const tw = makePlayer(rng, id++, 'P', 40);
  tw.twoWay = true;
  tw.twoWayRevealed = true;
  const team = [ace, tw, makePlayer(rng, id++, 'C', 50)];
  for (let i = 0; i < 4; i++) team.push(makePlayer(rng, id++, 'IF', 50));
  for (let i = 0; i < 3; i++) team.push(makePlayer(rng, id++, 'OF', 50));
  if (!CONFIG.twoWay.alwaysStartAsPitcher) return;
  const slots = Core.buildLineup(team);
  assert.strictEqual(slots.find((s) => s.pos === 'P').player, tw);
});

test('スター起用(offPositionStarGap > 0):条件を満たすときだけ本職外で起用する', () => {
  const rng = new Core.Rng(19);
  let id = 1;
  const team = [makePlayer(rng, id++, 'P', 50), makePlayer(rng, id++, 'C', 30)];
  for (let i = 0; i < 5; i++) team.push(makePlayer(rng, id++, 'IF', i === 4 ? 85 : 50));
  for (let i = 0; i < 3; i++) team.push(makePlayer(rng, id++, 'OF', 30));
  const saved = CONFIG.offPositionStarGap;
  try {
    CONFIG.offPositionStarGap = 0;
    assert.strictEqual(Core.buildLineup(team).filter((s) => s.outOfPosition).length, 0, '無効のときは本職外の起用なし');
    const benchStar = team.find((p) => !Core.buildLineup(team).some((s) => s.player === p));   // 控えに残る内野手(総合値 250)
    CONFIG.offPositionStarGap = 50;
    const slots = Core.buildLineup(team);
    const used = slots.find((s) => s.player === benchStar);
    assert.ok(used && used.outOfPosition, '控えの内野手(外野の本職より総合値が50以上高い)が本職外で起用される');
    CONFIG.offPositionStarGap = 500;
    assert.strictEqual(Core.buildLineup(team).filter((s) => s.outOfPosition).length, 0, '差が足りなければ起用しない');
  } finally { CONFIG.offPositionStarGap = saved; }
});

console.log(failed ? '\n失敗 ' + failed + '件' : '\nすべて成功');
process.exit(failed ? 1 : 0);
