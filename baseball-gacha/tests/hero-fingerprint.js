// 新入部員モードの「ゲーム本体の結果」の指紋(勝敗・自校の得点・能力・進路・本体の乱数の状態)
// フェーズH1.3(失点の組み直し)の前後で一致することを確かめるために使う。
//   node tests/hero-fingerprint.js > tests/fixtures/h12-fingerprint.json で、基準を作り直せる(H1.2 の時点で作成済み)
//   node tests/hero-fingerprint.js stories > tests/fixtures/h13-fingerprint.json は、物語の文面も含める(H1.3 の時点で作成済み。
//   H1.4 のライバルの旧方式 'strongest' が、H1.3 と完全に一致することの確認用)
//   node tests/hero-fingerprint.js stories+stats+games 10 > tests/fixtures/h15b-fingerprint.json は、H1.6a の途中出場を無効にしたときの一致の確認用(H1.5b の時点で作成済み)
//   node tests/hero-fingerprint.js stories 20 > tests/fixtures/h14b-fingerprint.json は、H1.5a の roster.version 'legacy' の確認用(H1.4b の時点で作成済み)
const path = require('path');
const Logic = require(path.join(__dirname, '..', 'logic.js'));
const Hero = require(path.join(__dirname, '..', 'hero.js'));
const { Core } = Logic;

function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return ('00000000' + h.toString(16)).slice(-8);
}
// i:0〜99。半分は引き、半分は作成(投手・野手・天才を混ぜる)
function fingerprint(i, opts) {
  opts = opts || {};
  const seed = 5000 + i;
  const st = Hero.newHeroGame(seed);
  if (i % 2 === 0) {
    const r = new Core.Rng((seed * 40503) >>> 0);
    Hero.pickHero(st, r.pick(Hero.pickable(st)).id);
  } else {
    const k = (i >> 1) % 4;
    const c = k === 0 ? { pos: 'pitcher', type: 'gouwan', level: 'high', talent: 'normal' } : k === 1 ? { pos: 'pitcher', type: 'gikou', level: 'mid', talent: 'genius' }
      : k === 2 ? { pos: 'fielder', type: 'kouda', level: 'mid', talent: 'normal' } : { pos: 'twoWay', pitchType: 'gouwan', batType: 'kyouda', level: 'mid', talent: 'normal' };
    const err = Hero.createHero(st, c);
    if (err) throw new Error(err);
    Hero.confirmRival(st, 'auto');
  }
  Hero.startPlay(st);
  const games = [];
  const glog = [];   // opts.games:試合ごとの「年:勝敗:得点:失点」(H1.6a の確認用)
  for (let guard = 0; st.hero.phase === 'play' && guard < 200; guard++) {
    Hero.advance(st, 'event');
    for (const m of st.lastEvents || []) {
      for (const c of m.cards || []) if (c.type === 'tournament' && c.games) for (const g of c.games) { games.push((g.win ? 'W' : 'L') + (g.box ? g.box.my : '')); if (g.box) glog.push(m.year + ':' + (g.win ? 'W' : 'L') + ':' + g.box.my + ':' + g.box.opp); }
      for (const g of m.practice || []) games.push((g.win ? 'w' : 'l') + (g.box ? g.box.my : ''));
    }
  }
  const people = st.players.concat(st.alumni || []).map((p) => p.id + ':' + Core.ALL_KEYS.map((k) => Math.round(((p.finalAbilities || p.abilities)[k]) * 100)).join(',') + ':' + (p.career || ''));
  const out = {
    games: hash(games.join(' ')), nGames: games.length,
    people: hash(people.sort().join('|')),
    rng: st.rngState, heroRng: st.hero.rng, phase: st.hero.phase,
  };
  if (opts.stats) out.stats = hash(st.players.concat(st.alumni || []).map((p) => p.id + ':' + JSON.stringify((p.stats && p.stats.career) || {})).sort().join('|'));
  if (opts.games) out.glog = glog;
  if (opts.stories) {
    const H = st.hero;
    out.rivalId = H.rivalId;
    out.stories = hash(H.stories.map((x) => x.s + ':' + x.text).join('|') + '#' + ((H.graduation && H.graduation.lines) || []).join('|'));
    out.trng = H.trng;
  }
  return out;
}
if (require.main === module) {
  const out = [];
  const n = Number(process.argv[3] || 100);
  const mode = process.argv[2] || '';
  for (let i = 0; i < n; i++) out.push(fingerprint(i, { stories: /stories/.test(mode), stats: /stats/.test(mode), games: /games/.test(mode) }));
  console.log(JSON.stringify(out));
}
module.exports = { fingerprint: fingerprint, N: 100 };
