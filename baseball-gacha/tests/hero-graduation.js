// 卒業画面の中身(H.graduation)の指紋。H1.4b(7月の画面を挟む)の前後で一致することの確認用
//   node tests/hero-graduation.js > tests/fixtures/h13b-graduation.json(H1.3b の時点で作成済み)
const path = require('path');
const Hero = require(path.join(__dirname, '..', 'hero.js'));
const { Core } = require(path.join(__dirname, '..', 'logic.js'));
function run(i) {
  const st = Hero.newHeroGame(6000 + i);
  if (i % 2) { const r = new Core.Rng(((6000 + i) * 40503) >>> 0); Hero.pickHero(st, r.pick(st.pendingRecruits).id); }
  else { Hero.createHero(st, [{ pos: 'pitcher', type: 'gouwan', level: 'mid', talent: 'normal' }, { pos: 'fielder', type: 'kouda', level: 'mid', talent: 'normal' }][(i >> 1) % 2]); Hero.confirmRival(st, 'auto'); }
  Hero.startPlay(st);
  for (let g = 0; st.hero.phase === 'play' && g < 200; g++) Hero.advance(st, 'event');
  return { st: st, grad: JSON.stringify(st.hero.graduation) };
}
if (require.main === module) {
  const out = [];
  for (let i = 0; i < 20; i++) out.push(run(i).grad);
  console.log(JSON.stringify(out));
}
module.exports = { run: run, N: 20 };
