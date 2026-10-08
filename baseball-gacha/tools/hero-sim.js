// =============================================================
// tools/hero-sim.js : 新入部員モードの検証(画面なし)
//   使い方: node tools/hero-sim.js [回数=200] [最初のシード=1] [防御率・打撃の測定の回数=520] [凡人の調査の人数=200]
//   引きの主人公と、作った主人公(レベル感 × 素質、二刀流)を、それぞれ指定の回数だけ3年間進めて、
//   config.js の heroMode.targets と比べて ✓ / △ / ✕ を出す。同じ引数なら同じ結果になる。
//   測定の時点は「3年の夏の大会の直後」(主人公の卒業の時点)。比較先の引きの選手も同じ時点で測る。
// =============================================================
'use strict';

const path = require('path');
const Logic = require(path.join(__dirname, '..', 'logic.js'));
const Hero = require(path.join(__dirname, '..', 'hero.js'));
const { CONFIG, Core, Sim, Generation } = Logic;

const N = Number(process.argv[2] || 200);
const SEED0 = Number(process.argv[3] || 1);
const T = CONFIG.heroMode.targets;

// 作る内容(位置とタイプは、シードから決める。ゲームの乱数とは別)
function choiceFor(kind, seed) {
  const r = new Core.Rng((seed * 2654435761) >>> 0);
  const pt = Object.keys(Hero.PITCH_TYPES);
  const bt = Object.keys(Hero.BAT_TYPES);
  if (kind.pos === 'twoWay') return { pos: 'twoWay', pitchType: r.pick(pt), batType: r.pick(bt), level: kind.level, talent: 'normal' };
  const pos = r.chance(0.35) ? 'pitcher' : 'fielder';
  return { pos: pos, type: pos === 'pitcher' ? r.pick(pt) : r.pick(bt), level: kind.level, talent: kind.talent };
}
function run(kind, seed) {
  const st = Hero.newHeroGame(seed, kind.coachLv ? { coachLv: kind.coachLv } : null);
  if (kind.pick) {
    const r = new Core.Rng((seed * 40503) >>> 0);
    Hero.pickHero(st, r.pick(Hero.pickable(st)).id);
  } else {
    const err = Hero.createHero(st, choiceFor(kind, seed));
    if (err) throw new Error(err);
    Hero.confirmRival(st, 'auto');
  }
  const h0 = Hero.heroOf(st);
  const startPos = Core.isTwoWayKnown(h0) ? 'TW' : h0.position;
  const heroTalent = h0.talent === 'genius' && !h0.geniusBust ? 'genius' : h0.reincarnation ? 'reinc' : 'normal';
  const lv0 = st.leadership.lv;
  const cohortYear = h0.enrolledYear;
  Hero.startPlay(st);
  let guard = 0;
  while (st.hero.phase === 'play' && guard++ < 200) Hero.advance(st, 'event');
  const H = st.hero;
  const a = st.alumni.find((x) => x.id === H.id);
  const rv = st.alumni.find((x) => x.id === H.rivalId);
  // 同学年の引きの選手(主人公の卒業の時点 = 3年の夏の大会の直後。まだ在籍している)
  const cohort = st.players.filter((x) => x.enrolledYear === cohortYear && x.id !== H.id && x.origin === 'recruit' && !x.helper).map((p) => ({
    rating: Core.rating(p), talent: p.talent, geniusBust: p.geniusBust, reincarnation: p.reincarnation, twoWay: p.twoWay, position: p.position,
    pitch: Core.ratingOfKeys(p.abilities, Core.PITCH_KEYS), velo: p.abilities.velocity, velo0: p.initialAbilities.velocity,
  }));
  // 同世代の順位(4):同学年の引きの選手の、入学時(1年4月)と3年夏(3年7月)の上位%
  const topAt = (p, ab, g, m) => { const r = Generation.getGenerationRank({ abilities: ab, initialAbilities: p.initialAbilities, position: p.originalPosition || p.position, twoWay: p.twoWay, twoWayRevealed: true }, g, m); return r ? r.top : null; };
  const cohortTop = st.players.filter((x) => x.enrolledYear === cohortYear && x.id !== H.id && x.origin === 'recruit' && !x.helper)
    .map((p) => ({ top0: topAt(p, p.initialAbilities, 1, 4), top1: topAt(p, p.abilities, 3, 7), r0: Core.initialRating(p), r1: Core.rating(p), g: (p.talent === 'genius' && !p.geniusBust) || !!p.reincarnation }));
  const all = H.stories;
  return {
    st: st, H: H, a: a, startPos: startPos, rivalTwoWay: !!(rv && rv.twoWay),
    finRating: a ? a.rating : null,
    finSides: a ? { pitch: Core.ratingOfKeys(a.finalAbilities, Core.PITCH_KEYS), bat: Core.ratingOfKeys(a.finalAbilities, Core.BAT_KEYS) } : null,
    cohort: cohort, cohortTop: cohortTop, heroTalent: heroTalent, lv0: lv0, lvEnd: st.leadership.lv,
    top0: H.graduation ? H.graduation.init.top : null, top1: H.graduation ? H.graduation.fin.top : null,
    r0: H.graduation ? H.graduation.init.rating : null, r1: H.graduation ? H.graduation.fin.rating : null,
    stopsPerYear: [1, 2, 3].map((k) => H.stopsByYear[String(cohortYear + k - 1)] || 0),
    stopsTotal: Object.keys(H.stopsByYear).reduce((x, k) => x + H.stopsByYear[k], 0),   // 卒業の画面で止まる1回を含む
    stories: all.filter((s) => s.kind !== 'quiet'),
  };
}
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const pct = (x) => (Number.isFinite(x) ? (x * 100).toFixed(1) + '%' : '-');
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-');
function judge(v, t) {
  if (v == null || Number.isNaN(v)) return '−';
  const ok = (t.min == null || v >= t.min) && (t.max == null || v <= t.max);
  if (ok) return '✓';
  const span = Math.max(Math.abs(t.max != null ? t.max : t.min), 1e-9) * 0.2;
  const near = (t.min == null || v >= t.min - span) && (t.max == null || v <= t.max + span);
  return near ? '△' : '✕';
}
const fmt = (v, t) => (t.pct ? pct(v) : Number.isFinite(v) && Math.abs(v) < 10 ? v.toFixed(2) : f1(v));
const tgt = (t) => (t.min != null && t.max != null ? fmt(t.min, t) + '〜' + fmt(t.max, t) : t.min != null ? fmt(t.min, t) + '以上' : fmt(t.max, t) + '以下');

const KINDS = [
  { key: 'pick', label: '引き(一覧から)', pick: true },
  { key: 'n-low', label: '作成 凡人・控えめ', level: 'low', talent: 'normal' },
  { key: 'n-mid', label: '作成 凡人・普通', level: 'mid', talent: 'normal' },
  { key: 'n-high', label: '作成 凡人・高め', level: 'high', talent: 'normal' },
  { key: 'g-low', label: '作成 天才・控えめ', level: 'low', talent: 'genius' },
  { key: 'g-mid', label: '作成 天才・普通', level: 'mid', talent: 'genius' },
  { key: 'tw-low', label: '作成 二刀流・控えめ', level: 'low', pos: 'twoWay' },
  { key: 'tw-mid', label: '作成 二刀流・普通', level: 'mid', pos: 'twoWay' },
];
const t0 = Date.now();
const res = {};
for (const k of KINDS) {
  res[k.key] = [];
  for (let i = 0; i < N; i++) res[k.key].push(run(k, SEED0 + i));
}
const allRuns = [].concat.apply([], KINDS.map((k) => res[k.key]));
const out = [];
const log = (s) => out.push(s);
log('==============================================');
log(' 新入部員モード 検証(各 ' + N + '回 / シード ' + SEED0 + '〜 / ' + ((Date.now() - t0) / 1000).toFixed(1) + '秒)');
log('==============================================');
// 卒業時の総合値
log('');
log('■ 主人公の卒業時の総合値(平均)');
for (const k of KINDS) {
  const L = res[k.key].filter((r) => r.a);
  const v = k.pos === 'twoWay' ? '投' + f1(mean(L.map((r) => r.finSides.pitch))) + ' / 打' + f1(mean(L.map((r) => r.finSides.bat))) : f1(mean(L.map((r) => r.finRating)));
  log('  ' + k.label.padEnd(16) + v + '(入学時 ' + f1(mean(L.map((r) => r.H.initRating))) + ')');
}
// 引きの基準(主人公と同学年の、引きの新入生)
const cohort = [].concat.apply([], allRuns.map((r) => r.cohort));
const normal = cohort.filter((a) => a.talent !== 'genius' && !a.reincarnation && !a.twoWay);
const bloom = cohort.filter((a) => a.talent === 'genius' && !a.geniusBust && !a.reincarnation);
const twoWayAll = cohort.filter((a) => a.twoWay);
const pitchOf = (a) => a.pitch;
log('  (引きの基準。3年夏の時点)通常 ' + f1(mean(normal.map((a) => a.rating))) + '(' + normal.length + '人)/ 天才(開花) ' + f1(mean(bloom.map((a) => a.rating))) + '(' + bloom.length + '人)'
  + ' / 二刀流(投手側) ' + f1(mean(twoWayAll.map(pitchOf))) + '(' + twoWayAll.length + '人)');
const createdTW = res['tw-low'].concat(res['tw-mid']).filter((r) => r.a);
const M = {};
M.created_vs_normal = mean(res['n-high'].filter((r) => r.a).map((r) => r.finRating)) / mean(normal.map((a) => a.rating)) - 1;
M.created_vs_genius = mean(res['g-low'].concat(res['g-mid']).filter((r) => r.a).map((r) => r.finRating)) / mean(bloom.map((a) => a.rating));
M.created_vs_twoway = twoWayAll.length ? mean(createdTW.map((r) => r.finSides.pitch)) / mean(twoWayAll.map(pitchOf)) : NaN;
// 出場
log('');
log('■ スタメンに入った月数(3年間。引退後を除く)');
for (const k of KINDS) {
  const L = res[k.key];
  const sm = L.map((r) => r.H.starterMonths);
  log('  ' + k.label.padEnd(16) + '平均 ' + f1(mean(sm)) + 'か月 / 0か月 ' + pct(sm.filter((x) => x === 0).length / L.length)
    + ' / 12か月以下 ' + pct(sm.filter((x) => x <= 12).length / L.length) + ' / 24か月超 ' + pct(sm.filter((x) => x > 24).length / L.length));
}
// 物語
M.stopsPerYear = mean(allRuns.map((r) => r.stopsTotal / 3));   // 3年間の合計(卒業を含む)÷ 3
const stopsBy = (y) => mean(allRuns.map((r) => r.stopsPerYear[y]));
log('');
log('■ 物語と止まる回数');
log('  止まる回数 1年あたり ' + f1(M.stopsPerYear) + '(3年間の合計 ÷ 3。卒業を含む。1年目 ' + f1(stopsBy(0)) + ' / 2年目 ' + f1(stopsBy(1)) + ' / 3年目 ' + f1(stopsBy(2)) + ')');
const totalStories = allRuns.reduce((x, r) => x + r.stories.length, 0);
const bad = allRuns.reduce((x, r) => x + r.stories.filter((s) => s.bad).length, 0);
M.badShare = bad / totalStories;
log('  物語 平均 ' + f1(totalStories / allRuns.length) + '件 / 悪い物語の割合 ' + pct(M.badShare));
const kinds = {};
for (const r of allRuns) for (const s of r.stories) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
log('  種類別(全体の件数):' + Object.keys(kinds).sort((a, b) => kinds[b] - kinds[a]).map((k) => k + ' ' + kinds[k]).join(' / '));
// ライバル
log('');
log('■ ライバルとポジション争い');
log('  ライバルとの順位の逆転が起きた割合 ' + pct(allRuns.filter((r) => r.H.rankSwaps > 0).length / allRuns.length)
  + ' / ライバルなし ' + pct(allRuns.filter((r) => r.H.rivalId == null).length / allRuns.length));
const byPos = {};
for (const r of allRuns) {
  const k = r.startPos;
  byPos[k] = byPos[k] || { n: 0, c: 0 };
  byPos[k].n++;
  if (Object.keys(r.H.contestEver).length) byPos[k].c++;
}
log('  ポジション争いが成立した割合:' + ['P', 'C', 'IF', 'OF', 'TW'].map((k) => (k === 'TW' ? '二刀流' : Core.POSITION_LABEL[k]) + ' ' + (byPos[k] ? pct(byPos[k].c / byPos[k].n) + '(' + byPos[k].n + '人)' : '-')).join(' / '));
M.contestP = byPos.P ? byPos.P.c / byPos.P.n : NaN;
M.contestIF = byPos.IF ? byPos.IF.c / byPos.IF.n : NaN;
M.contestOF = byPos.OF ? byPos.OF.c / byPos.OF.n : NaN;
M.contestC = byPos.C ? byPos.C.c / byPos.C.n : NaN;
const contested = allRuns.filter((r) => Object.keys(r.H.contestEver).length);
M.lostBench = contested.filter((r) => r.H.lostBench).length / contested.length;
log('  争いに敗れて控えが続いた割合(争い成立のうち) ' + pct(M.lostBench));
const twInvolved = allRuns.filter((r) => r.startPos === 'TW' || r.rivalTwoWay);
log('  二刀流が絡む争い(主人公かライバルが二刀流)の成立 ' + pct(twInvolved.filter((r) => Object.keys(r.H.contestEver).length).length / Math.max(1, twInvolved.length)) + '(' + twInvolved.length + '人)');
// 転向・挫折・再起
const conv = allRuns.filter((r) => r.H.converts > 0);
M.converted = conv.length / allRuns.filter((r) => r.startPos !== 'TW').length;
log('');
log('■ 転向・挫折・再起');
log('  転向が発生した割合 ' + pct(M.converted) + '(二刀流を除く)/ 成功率 ' + pct(conv.filter((r) => r.H.convertedOk).length / Math.max(1, conv.length)));
const withSetback = allRuns.filter((r) => r.H.setbackStories > 0);
M.reboundShare = withSetback.filter((r) => r.H.reboundStories > 0).length / Math.max(1, withSetback.length);
M.setbackOver = allRuns.filter((r) => r.H.setbackStories > CONFIG.heroMode.setbackMax).length;
log('  挫折の物語があった ' + pct(withSetback.length / allRuns.length) + ' / そのうち再起の物語 ' + pct(M.reboundShare) + ' / 挫折の物語が上限を超えた主人公 ' + M.setbackOver + '人');
log('  再起の後押しを使った合宿 平均 ' + f1(mean(allRuns.map((r) => r.H.boostApplied || 0))) + '回 / 最大 ' + Math.max.apply(null, allRuns.map((r) => r.H.boostApplied || 0)) + '回');
// 二刀流(参考)
log('');
log('■ 二刀流の主人公(作成。参考値)');
const sm = { P: 0, bat: 0, bench: 0 };
for (const r of createdTW) for (const k of Object.keys(sm)) sm[k] += r.H.slotMonths[k];
const tot = sm.P + sm.bat + sm.bench;
log('  投手兼打者 ' + pct(sm.P / tot) + ' / 野手として出場 ' + pct(sm.bat / tot) + ' / 控え ' + pct(sm.bench / tot)
  + ' / 役割の切り替えが起きた ' + pct(createdTW.filter((r) => r.H.switchCount > 0).length / createdTW.length)
  + ' / 両方を失う挫折 ' + pct(createdTW.filter((r) => r.stories.some((s) => s.kind === 'twoWayLost')).length / createdTW.length));
if (sm.P / tot > 0.7) log('# 二刀流が投手枠を取りすぎ → heroMode.twoWay.batWeightInPitcherSlot を下げる');
if (sm.P / tot < 0.1) log('# 二刀流が投手枠を取れなさすぎ → heroMode.twoWay.batWeightInPitcherSlot を上げる');
// 先発の投球回(スタミナ別。大会と練習試合の全先発)
const glog = [].concat.apply([], allRuns.map((r) => r.H.gameLog || []));
const band = (lo, hi) => glog.filter((g) => g.st >= lo && g.st < hi);
const ipAvg = (L) => mean(L.map((g) => g.outs / 3));
const cgRate = (L) => (L.length ? L.filter((g) => g.outs >= 27).length / L.length : NaN);
log('');
log('■ 先発の投球回(スタミナの値別。全先発 ' + glog.length + '試合)');
for (const [lo, hi, lb] of [[0, 20, '20未満'], [20, 50, '20〜50'], [50, 70, '50〜70'], [70, 999, '70以上']]) {
  const L = band(lo, hi);
  log('  スタミナ' + lb.padEnd(6) + ' 平均 ' + f1(ipAvg(L)) + '回 / 完投率 ' + pct(cgRate(L)) + '(' + L.length + '試合)');
}
M.ipLow = ipAvg(band(0, 20));
M.cgLow = cgRate(band(0, 20));
M.ipMid = ipAvg(band(20, 50));
M.ipHigh = ipAvg(band(70, 999));
M.cgHigh = cgRate(band(70, 999));
// ランクアップと新球種
M.rankUps = mean(allRuns.map((r) => r.H.rankUps || 0));
const pitchers = allRuns.filter((r) => r.startPos === 'P');
M.newPitches = mean(pitchers.map((r) => r.H.newPitches || 0));
log('');
log('■ ランクアップと新球種');
log('  ランクアップ 主人公1人あたり ' + f1(M.rankUps) + '回(3年間)/ 新球種 投手の主人公1人あたり ' + f1(M.newPitches) + '回(最大 '
  + Math.max.apply(null, pitchers.map((r) => r.H.newPitches || 0)) + '回)');
// 球速の分布
const kmh = (v) => Hero.toKmh(v);
const normalP = cohort.filter((a) => a.position === 'P' && a.talent !== 'genius' && !a.reincarnation && !a.twoWay);
const specialP = cohort.filter((a) => a.position === 'P' && ((a.talent === 'genius' && !a.geniusBust) || a.reincarnation));
log('  球速:通常の新入生(投手)平均 ' + f1(mean(normalP.map((a) => kmh(a.velo0)))) + 'km/h / 通常の3年夏 平均 ' + f1(mean(normalP.map((a) => kmh(a.velo))))
  + 'km/h / 天才・転生の3年夏 最高 ' + (specialP.length ? Math.max.apply(null, specialP.map((a) => kmh(a.velo))) : '-') + 'km/h(平均 ' + f1(mean(specialP.map((a) => kmh(a.velo)))) + ')');
// 先発の能力と失点(H1.3)、打者の能力と打撃成績(H1.3 の4。調査のみ)
//   先発の総合値は、その試合の月の成長の前の値(投手側の見える能力の平均 × ratingMultiplier。100超も割り引かない)
//   heroMode.pitching.enabled を切り替えて、同じシードで H1.2(組み直しなし)と並べる
const NE = Number(process.argv[4] || 520);
const PBANDS = [[0, 150], [150, 250], [250, 350], [350, 450], [450, 1e9]];
const bandOf = (r) => PBANDS.findIndex((b) => r >= b[0] && r < b[1]);
const bandLabel = (b) => (b[1] > 1e8 ? b[0] + '以上' : (b[0] ? b[0] + '〜' : '〜') + b[1]);
const EKINDS = [
  { pick: true },
  { pos: 'pitcher', type: 'gouwan', level: 'high', talent: 'normal' },
  { pos: 'pitcher', type: 'gikou', level: 'mid', talent: 'genius' },
  { pos: 'pitcher', type: 'gouwan', level: 'mid', talent: 'genius' },
];
const quant = (a, f) => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y); const i = (b.length - 1) * f, lo = Math.floor(i); return b[lo] + (b[Math.ceil(i)] - b[lo]) * (i - lo); };
function measureGames(enabled) {
  const prev = CONFIG.heroMode.pitching.enabled;
  CONFIG.heroMode.pitching.enabled = enabled;
  const G = { tourney: PBANDS.map(() => []), practice: PBANDS.map(() => []) };
  const B = PBANDS.map(() => []);
  const seasons = {};
  const bseasons = {};
  const lineups = [];
  try {
    for (let i = 1; i <= NE; i++) for (let ki = 0; ki < EKINDS.length; ki++) {
      const k = EKINDS[ki];
      const st = Hero.newHeroGame(i * 7 + 3);
      if (k.pick) { const r = new Core.Rng((i * 40503) >>> 0); Hero.pickHero(st, r.pick(Hero.pickable(st)).id); }
      else { const e = Hero.createHero(st, k); if (e) throw new Error(e); Hero.confirmRival(st, 'auto'); }
      Hero.startPlay(st);
      for (let guard = 0; st.hero.phase === 'play' && guard < 80; guard++) {
        const pr = new Map(st.players.map((p) => [p.id, Core.ratingOfKeys(p.abilities, Core.PITCH_KEYS)]));
        const br = new Map(st.players.map((p) => [p.id, Core.ratingOfKeys(p.abilities, Core.BAT_KEYS)]));
        if (guard % 3 === 0) { const sl = Core.buildLineup(st.players, { heroTwoWay: true }); if (sl.some((x) => x.pos === 'P' && x.player)) lineups.push(sl); }
        Hero.advance(st, 'month');
        for (const m of st.lastEvents || []) {
          const push = (kind, g) => {
            const b = g.box;
            if (!b || !b.starter) return;
            const r = pr.get(b.starter.id);
            if (r == null) return;
            const er = Math.round(b.starter.runs * CONFIG.stats.earnedRate);
            G[kind][bandOf(r)].push({ outs: b.starter.outs, er: er, sp: b.starter.runs, opp: b.opp, win: b.win });
            if (kind === 'tourney' && r >= 450) { const key = i + ':' + ki + ':' + b.starter.id + ':' + st.year; const S = seasons[key] = seasons[key] || { er: 0, outs: 0 }; S.er += er; S.outs += b.starter.outs; }
            if (kind === 'tourney') for (const x of b.batters || []) {
              if (x.pos === 'P') continue;   // 投手枠(投手と二刀流の投手)は除く
              const rb = br.get(x.id);
              if (rb == null) continue;
              B[bandOf(rb)].push({ ab: x.ab, h: x.h, hr: x.hr, rbi: x.rbi });
              const key = i + ':' + ki + ':' + x.id;
              const S = bseasons[key] = bseasons[key] || { band: bandOf(rb), ab: 0, h: 0 };
              S.band = Math.max(S.band, bandOf(rb)); S.ab += x.ab; S.h += x.h;
            }
          };
          for (const c of m.cards || []) if (c.type === 'tournament' && c.games) c.games.forEach((g) => push('tourney', g));
          for (const g of m.practice || []) push('practice', g);
        }
      }
    }
  } finally { CONFIG.heroMode.pitching.enabled = prev; }
  return { G: G, B: B, seasons: Object.values(seasons), bseasons: Object.values(bseasons), lineups: lineups };
}
const eraOf = (L) => L.reduce((a, g) => a + g.er, 0) * 27 / L.reduce((a, g) => a + g.outs, 0);
function bandRow(L) {
  if (!L.length) return '0試合';
  const e = L.map((g) => g.er * 27 / g.outs);
  return L.length + '試合 防御率 ' + eraOf(L).toFixed(2) + '(1試合ごと 中央値 ' + quant(e, 0.5).toFixed(2) + ' 25%点 ' + quant(e, 0.25).toFixed(2) + ' 75%点 ' + quant(e, 0.75).toFixed(2)
    + ')勝率 ' + pct(mean(L.map((g) => (g.win ? 1 : 0)))) + ' 失点 平均 ' + mean(L.map((g) => g.opp)).toFixed(2) + ' 中央値 ' + quant(L.map((g) => g.opp), 0.5).toFixed(1) + ' 75%点 ' + quant(L.map((g) => g.opp), 0.75).toFixed(1);
}
function aceStats(R) {
  const L = R.G.tourney[4];
  const se = R.seasons.map((x) => x.er * 27 / x.outs);
  const rr = new Core.Rng(7);
  let hit = 0;
  // 2試合の合計は、先発の失点で数える。1試合ごとの値は、その試合の先発の防御率(自責点 × 27 ÷ アウト数)
  for (let i = 0; i < 20000; i++) { const a = L[Math.floor(rr.next() * L.length)], b = L[Math.floor(rr.next() * L.length)]; if (a.sp + b.sp >= 12) hit++; }
  const e = L.map((g) => g.er * 27 / g.outs);
  return { badYear: se.filter((v) => v >= 5.63).length / (se.length || 1), seMed: quant(se, 0.5), se90: quant(se, 0.9), n: se.length, two12: hit / 20000,
    med: quant(e, 0.5), p75: quant(e, 0.75), runsMed: quant(L.map((g) => g.sp), 0.5), runsP75: quant(L.map((g) => g.sp), 0.75) };
}
// 感度:実際の編成のまま、投手枠の選手の投手能力だけを、総合値 150 / 300 / 470 に置き換える(夏の1〜5回戦を均等に)
function sensitivity(lineups, enabled) {
  const prev = CONFIG.heroMode.pitching.enabled;
  CONFIG.heroMode.pitching.enabled = enabled;
  const T = CONFIG.tournaments.summer;
  const out = {};
  try {
    for (const target of [150, 300, 470]) {
      const rr = new Core.Rng(12345);
      let runs = 0, n = 0;
      for (const slots of lineups) {
        const s2 = slots.map((x) => { if (x.pos !== 'P' || !x.player) return x; const p = JSON.parse(JSON.stringify(x.player)); for (const k of Core.PITCH_KEYS) p.abilities[k] = target / CONFIG.ratingMultiplier; return Object.assign({}, x, { player: p }); });
        const pit = s2.find((x) => x.pos === 'P').player;
        for (let rep = 0; rep < 10; rep++) {
          const round = 1 + Math.floor(rr.next() * T.rounds);
          const my = Core.evaluateLineup(s2, { gameNo: round }).strength;
          const m = Core.playMatch(rr, my, rr.normal(T.oppBase + T.oppStep * (round - 1), T.oppSd));
          runs += enabled ? Core.heroRunsAllowed(rr, pit, m, { final: false }).opp : m.opp;
          n++;
        }
      }
      out[target] = runs / n;
    }
  } finally { CONFIG.heroMode.pitching.enabled = prev; }
  return out;
}
const RE1 = measureGames(false);   // H1.2(組み直しなし)
const RE2 = measureGames(true);    // H1.3
PBANDS.forEach((b, i) => { M['era' + (i + 1)] = eraOf(RE2.G.tourney[i]); });
const ACE1 = aceStats(RE1), ACE2 = aceStats(RE2);
M.aceBadYear = ACE2.badYear;
M.aceTwo12 = ACE2.two12;
M.aceMedian = ACE2.med;
M.aceP75 = ACE2.p75;
// 目安
log('');
log('■ 目安との比較(✓ 範囲内 / △ 目安の±20%以内 / ✕ それ以外)');
for (const k of Object.keys(T)) {
  const t = T[k];
  const v = M[k];
  const vd = judge(v, t);
  log('  ' + vd + ' ' + t.label + ' ' + fmt(v, t) + '  目安 ' + tgt(t) + (vd !== '✓' && vd !== '−' ? '  → ' + t.tune : ''));
}
// 先発の能力と失点(H1.3)の出力
log('');
log('■ 先発の総合値の帯別の防御率(' + NE + '×' + EKINDS.length + '回。H1.2 = 組み直しなし → H1.3)');
for (const kind of ['tourney', 'practice']) {
  log('  ' + (kind === 'tourney' ? '【大会】' : '【練習試合】'));
  PBANDS.forEach((b, i) => {
    log('   ' + bandLabel(b) + ' H1.2:' + bandRow(RE1.G[kind][i]));
    log('   ' + ''.padEnd(bandLabel(b).length) + ' H1.3:' + bandRow(RE2.G[kind][i]));
  });
}
const mono = PBANDS.every((b, i) => i === 0 || eraOf(RE2.G.tourney[i]) < eraOf(RE2.G.tourney[i - 1]));
log('  大会の防御率は帯が上がるほど下がる(単調):' + (mono ? 'はい' : 'いいえ') + ' / 練習試合 − 大会:' + PBANDS.map((b, i) => (eraOf(RE2.G.practice[i]) - eraOf(RE2.G.tourney[i])).toFixed(2)).join('、'));
const aceTxt = (A) => '年度の大会防御率(' + A.n + '人・年度)中央値 ' + A.seMed.toFixed(2) + ' 90%点 ' + A.se90.toFixed(2) + ' 5.63以上 ' + pct(A.badYear)
  + ' / 2試合で12失点以上 ' + pct(A.two12) + ' / 1試合ごとの防御率 中央値 ' + A.med.toFixed(2) + ' 75%点 ' + A.p75.toFixed(2) + ' / 先発の1試合の失点 中央値 ' + A.runsMed.toFixed(1) + ' 75%点 ' + A.runsP75.toFixed(1);
log('  総合値450以上の先発 H1.2:' + aceTxt(ACE1));
log('  総合値450以上の先発 H1.3:' + aceTxt(ACE2));
const SEN1 = sensitivity(RE2.lineups, false), SEN2 = sensitivity(RE2.lineups, true);
log('  感度(実際の編成 ' + RE2.lineups.length + '件で先発の投手能力だけを置き換え。大会の1試合の平均失点)H1.2:150→' + SEN1[150].toFixed(2) + ' 300→' + SEN1[300].toFixed(2) + ' 470→' + SEN1[470].toFixed(2)
  + ' / H1.3:150→' + SEN2[150].toFixed(2) + ' 300→' + SEN2[300].toFixed(2) + ' 470→' + SEN2[470].toFixed(2));
// 打者の能力と大会の打撃成績(調査のみ。H1.3 の変更は打撃に影響しないので H1.3 の試行で測る)
log('');
log('■ 打者の総合値(野手側)の帯別の大会の打撃成績(投手枠を除く。1試合 = 打者として出場した試合)');
PBANDS.forEach((b, i) => {
  const L = RE2.B[i];
  if (!L.length) { log('  ' + bandLabel(b) + ' 0試合'); return; }
  const ab = L.reduce((a, x) => a + x.ab, 0), h = L.reduce((a, x) => a + x.h, 0);
  const g = L.filter((x) => x.ab > 0).map((x) => x.h / x.ab);
  const S = RE2.bseasons.filter((x) => x.band === i && x.ab >= 10).map((x) => x.h / x.ab);
  const q3 = (a) => '中央値 ' + quant(a, 0.5).toFixed(2) + ' 25%点 ' + quant(a, 0.25).toFixed(2) + ' 75%点 ' + quant(a, 0.75).toFixed(2);
  log('  ' + bandLabel(b).padEnd(8) + L.length + '試合 打率 ' + (h / ab).toFixed(3) + '(1試合ごと ' + q3(g) + ')/ 本塁打 1試合 ' + mean(L.map((x) => x.hr)).toFixed(3)
    + ' / 打点 1試合 ' + mean(L.map((x) => x.rbi)).toFixed(2) + '(' + q3(L.map((x) => x.rbi)) + ')/ 選手ごとの通算打率(10打数以上 ' + S.length + '人)' + q3(S)
    + ' / 6打数0安打の確率 ' + pct(Math.pow(1 - h / ab, 6)));
});
// 4. 同世代の順位の調査(測定のみ。値は変えない)
//   上位% は小さいほど上。変化 = 3年夏の上位% − 入学時の上位%(正 = 順位が下がった)
const q = (a, f) => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y); const i = (b.length - 1) * f; const lo = Math.floor(i); return b[lo] + (b[Math.ceil(i)] - b[lo]) * (i - lo); };
const BR = require(path.join(__dirname, '..', 'benchmark.js')).rows;
const med0 = BR['1-4'].p50, med1 = BR['3-7'].p50;
// 上位% は p50 未満で null(下位半分)。null は「50%超」として並べ、変化は両方とも上位50%以内の人だけで見る。
// あわせて、基準の中央値に対する総合値の比(入学時 ÷ 1年4月の中央値、3年夏 ÷ 3年7月の中央値)の変化も出す(下位半分も含めて比べられる)
const topTxt = (v) => (v >= 999 ? '50%超' : f1(v) + '%');
const dist = (L) => {
  const ok = L.filter((x) => x.r0 != null && x.r1 != null);
  const t0 = ok.map((x) => (x.top0 == null ? 999 : x.top0)), t1 = ok.map((x) => (x.top1 == null ? 999 : x.top1));
  const both = ok.filter((x) => x.top0 != null && x.top1 != null).map((x) => x.top1 - x.top0);
  const ratio = ok.map((x) => x.r1 / med1 - x.r0 / med0);
  const in50 = (a) => pct(a.filter((v) => v < 999).length / (a.length || 1));
  return '上位% 中央値 ' + topTxt(q(t0, 0.5)) + '→' + topTxt(q(t1, 0.5)) + '/上位50%以内 ' + in50(t0) + '→' + in50(t1)
    + '/上位%の変化(両時点とも50%以内 ' + both.length + '人)中央値 ' + (q(both, 0.5) >= 0 ? '+' : '') + f1(q(both, 0.5)) + '(p25 ' + f1(q(both, 0.25)) + ' / p75 ' + f1(q(both, 0.75)) + ')'
    + '/中央値比の変化 中央値 ' + (q(ratio, 0.5) >= 0 ? '+' : '') + q(ratio, 0.5).toFixed(2) + '(p25 ' + q(ratio, 0.25).toFixed(2) + ' / p75 ' + q(ratio, 0.75).toFixed(2) + ')(' + ok.length + '人)'; };
log('');
log('■ 4. 同世代の順位の調査(入学時=1年4月 と 3年夏=3年7月 の上位%。変化が+なら順位が下がった)');
const pickR = res['pick'];
const createdR = [].concat(res['n-low'], res['n-mid'], res['n-high'], res['g-low'], res['g-mid']);
const groups = [
  ['引き・凡人', pickR.filter((r) => r.heroTalent === 'normal')],
  ['引き・天才(覚醒)/転生', pickR.filter((r) => r.heroTalent !== 'normal')],
  ['作成・凡人(控えめ〜高め)', createdR.filter((r) => r.heroTalent === 'normal')],
  ['作成・天才(覚醒)', createdR.filter((r) => r.heroTalent === 'genius')],
];
for (const g of groups) log('  ' + g[0] + ':' + dist(g[1]));
// 同じ試行の中の、主人公以外の同学年の新入生(主人公の扱いに特有かどうか)
const coh = [].concat.apply([], res['pick'].concat(res['n-mid']).map((r) => r.cohortTop));
log('  同学年の他の新入生・凡人:' + dist(coh.filter((c) => !c.g)));
log('  同学年の他の新入生・天才/転生:' + dist(coh.filter((c) => c.g)));
// 実験:監督の指導力を Lv3(世代の基準を作るときと同じ)から始める
const lv3 = {};
for (const k of KINDS.filter((x) => x.key === 'pick' || x.key === 'n-mid')) { lv3[k.key] = []; for (let i = 0; i < N; i++) lv3[k.key].push(run(Object.assign({}, k, { coachLv: CONFIG.baselineCoachLv }), SEED0 + i)); }
log('  実験(指導力の初期値):世代の基準は 指導力 Lv' + CONFIG.baselineCoachLv + ' で固定して作る。新入部員モードは Lv' + mean(pickR.map((r) => r.lv0)) + ' から始まり、卒業時 平均 Lv' + f1(mean(allRuns.map((r) => r.lvEnd))));
for (const key of ['pick', 'n-mid']) {
  const lab = key === 'pick' ? '引き' : '作成 凡人・普通';
  log('    ' + lab + '(凡人)Lv1開始:' + dist(res[key].filter((r) => r.heroTalent === 'normal')));
  log('    ' + lab + '(凡人)Lv' + CONFIG.baselineCoachLv + '開始:' + dist(lv3[key].filter((r) => r.heroTalent === 'normal')));
}
const cohLv3 = [].concat.apply([], lv3['pick'].concat(lv3['n-mid']).map((r) => r.cohortTop));
log('    同学年の他の新入生・凡人 Lv' + CONFIG.baselineCoachLv + '開始:' + dist(cohLv3.filter((c) => !c.g)));
log('    卒業時の指導力 Lv1開始 平均 Lv' + f1(mean(res['pick'].concat(res['n-mid']).map((r) => r.lvEnd))) + ' / Lv' + CONFIG.baselineCoachLv + '開始 平均 Lv' + f1(mean(lv3['pick'].concat(lv3['n-mid']).map((r) => r.lvEnd))));
// H1.4 凡人の調査(測定のみ。値は変えない)
//   入学時の総合値 80〜120 の凡人(素質は通常)の主人公を、引き・作成 × 投手・野手 で各 NB 人、3年の夏の大会まで進める
//   同じシード・同じ選択で、ライバルの選び方を 'strongest'(H1.3)と 'chaseable'(H1.4)に切り替えて比べる
const NB = Number(process.argv[5] || 200);
const RANKS = ['初戦敗退', '2回戦敗退', '3回戦敗退', 'ベスト8', 'ベスト4', '準優勝', '優勝'];
function bonjinRun(group, seed, mode) {
  const prev = CONFIG.heroMode.rival.selectMode;
  CONFIG.heroMode.rival.selectMode = mode;
  try {
    const st = Hero.newHeroGame(seed);
    const wantP = group.pitch;
    if (group.pick) {
      const L = Hero.pickable(st).filter((p) => p.talent !== 'genius' && !p.reincarnation && !Core.isTwoWayKnown(p) && (p.position === 'P') === wantP && Core.rating(p) >= 80 && Core.rating(p) <= 120);
      if (!L.length) return null;
      const r = new Core.Rng((seed * 40503) >>> 0);
      Hero.pickHero(st, r.pick(L).id);
    } else {
      const r = new Core.Rng((seed * 2654435761) >>> 0);
      const types = Object.keys(wantP ? Hero.PITCH_TYPES : Hero.BAT_TYPES);
      const err = Hero.createHero(st, { pos: wantP ? 'pitcher' : 'fielder', type: r.pick(types), level: ['low', 'mid', 'high'][seed % 3], talent: 'normal' });
      if (err) throw new Error(err);
      Hero.confirmRival(st, 'auto');
    }
    const h = Hero.heroOf(st);
    const H = st.hero;
    if (H.initRating < 80 || H.initRating > 120) return null;
    // 入学時:同じ守備区分で、自分より総合値が高い選手(同学年 / 上級生)
    const role = h.position;
    const stronger = st.players.filter((p) => p !== h && !p.helper && Hero.rolesOf(p).indexOf(role) >= 0 && Hero.sideRating(p, role) > Hero.sideRating(h, role));
    const sameUp = stronger.filter((p) => p.enrolledYear === h.enrolledYear).length;
    const senUp = stronger.filter((p) => p.enrolledYear < h.enrolledYear).length;
    const startDiff = H.startDiff;
    Hero.startPlay(st);
    const monthsWithGames = new Set();
    for (let g = 0; H.phase === 'play' && g < 200; g++) {
      Hero.advance(st, 'event');
      for (const m of st.lastEvents || []) if ((m.practice && m.practice.length) || (m.cards || []).some((c) => c.type === 'tournament' && c.games)) monthsWithGames.add(m.serial);
    }
    const bySerial = {};
    for (const e of H.appear) { const o = bySerial[e.s] = bySerial[e.s] || { play: false, bench: false, tourney: false }; if (e.role === 'start' || e.role === 'sub') o.play = true; if (e.role === 'bench') o.bench = true; if (e.kind === 'tourney') o.tourney = true; }
    const ser = Array.from(monthsWithGames);
    const none = ser.filter((sv) => !bySerial[sv] || (!bySerial[sv].play && !bySerial[sv].bench)).length;
    const tMonths = ser.filter((sv) => bySerial[sv] && bySerial[sv].tourney);
    const tNone = tMonths.filter((sv) => !bySerial[sv].play && !bySerial[sv].bench).length;
    const tNoPlay = tMonths.filter((sv) => !bySerial[sv].play).length;   // 大会の月で、出場しなかった(ベンチ入りだけ、またはベンチ外)
    const tPlay = H.appear.filter((e) => e.kind === 'tourney' && (e.role === 'start' || e.role === 'sub')).length;
    const a = st.alumni.find((x) => x.id === H.id);
    const c = (a && a.stats && a.stats.career) || Core.emptyStatLine();
    let best = -1;
    for (let y = H.enrolledYear; y <= H.enrolledYear + 2; y++) for (const k of ['summer', 'autumn']) { const v = st.yearRecords[y] && st.yearRecords[y][k]; if (v) best = Math.max(best, Math.max(0, RANKS.findIndex((x) => v.indexOf(x) >= 0))); }
    const storyMonths = new Set(H.stories.filter((x) => x.kind !== 'quiet').map((x) => x.s)).size;
    const stops = Object.keys(H.stopsByYear).reduce((x, k) => x + H.stopsByYear[k], 0);
    const relT = H.appear.filter((e) => e.kind === 'tourney' && e.pit && !e.pit.start).length;   // 救援での登板(H1.5b)
    const relP = H.appear.filter((e) => e.kind === 'practice' && e.pit && !e.pit.start).length;
    return { relT: relT, relP: relP, starts: H.starterMonths, none: none, tNone: tNone, tNoPlay: tNoPlay, tMonths: tMonths.length, tPlay: tPlay, pa: c.pa || 0, ip: (c.outs || 0) / 3, storyMonths: storyMonths, stops: stops,
      sameUp: sameUp, senUp: senUp, best: best, diff: startDiff == null ? null : -startDiff, contest: Object.keys(H.contestEver).length > 0, swap: (H.rankSwaps || 0) > 0, hasRival: H.rivalId != null };
  } finally { CONFIG.heroMode.rival.selectMode = prev; }
}
const BGROUPS = [
  { key: 'pickP', label: '引き・投手', pick: true, pitch: true },
  { key: 'pickF', label: '引き・野手', pick: true, pitch: false },
  { key: 'makeP', label: '作成・投手', pick: false, pitch: true },
  { key: 'makeF', label: '作成・野手', pick: false, pitch: false },
];
const BJ = {};
for (const g of BGROUPS) {
  BJ[g.key] = { chase: [], strong: [] };
  for (let seed = 1; BJ[g.key].chase.length < NB && seed < NB * 40; seed++) {
    const a = bonjinRun(g, 10000 + seed, 'chaseable');
    if (!a) continue;
    BJ[g.key].chase.push(a);
    BJ[g.key].strong.push(bonjinRun(g, 10000 + seed, 'strongest'));
  }
}
const d4 = (L, f) => { const v = L.map(f).filter((x) => x != null && Number.isFinite(x)); return '平均 ' + f1(mean(v)) + ' / 中央値 ' + f1(quant(v, 0.5)) + ' / 25%点 ' + f1(quant(v, 0.25)) + ' / 75%点 ' + f1(quant(v, 0.75)); };
const share = (L, f) => pct(L.filter(f).length / (L.length || 1));
log('');
log('■ H1.4 凡人の調査(入学時の総合値 80〜120、素質は通常。各 ' + NB + '人。3年の夏の大会まで。1〜6 は新方式 chaseable の試行)');
for (const g of BGROUPS) {
  const L = BJ[g.key].chase;
  log('  【' + g.label + '】' + L.length + '人');
  log('   1. スタメンの月数(3年間):' + d4(L, (x) => x.starts) + ' / 0〜2か月 ' + share(L, (x) => x.starts <= 2));
  log('   2. 出番なしの月数(試合のある月のうち、ベンチ入りも出場もない月):' + d4(L, (x) => x.none) + ' / 大会のある月 ' + f1(mean(L.map((x) => x.tMonths))) + 'か月のうち、ベンチ入りもない月 ' + d4(L, (x) => x.tNone)
    + ' / 出場しなかった月(ベンチ入りだけを含む)' + d4(L, (x) => x.tNoPlay) + '(練習試合は、主人公は毎月必ず出場する)');
  log('   3. 大会の出場試合数:' + d4(L, (x) => x.tPlay) + (g.pitch ? ' / 大会の投球回:' + d4(L, (x) => x.ip) : ' / 大会の打席数:' + d4(L, (x) => x.pa)) + ' / 大会に1試合も出ていない ' + share(L, (x) => x.tPlay === 0));
  if (g.pitch) log('   3b. 救援での登板(3年間):大会 ' + d4(L, (x) => x.relT) + ' / 練習試合 ' + d4(L, (x) => x.relP));
  log('   4. 物語が出た月数:' + d4(L, (x) => x.storyMonths) + ' / 山場で止まった回数:' + d4(L, (x) => x.stops));
  log('   5. 入学時、同じ守備区分で自分より強い選手:同学年 ' + d4(L, (x) => x.sameUp) + ' / 上級生 ' + d4(L, (x) => x.senUp) + ' / 上級生に3人以上 ' + share(L, (x) => x.senUp >= 3));
  log('   6. 大会の最高成績:' + RANKS.map((r, i) => r + ' ' + share(L, (x) => x.best === i)).join(' / '));
  const S = BJ[g.key].strong;
  const line7 = (M, lab) => lab + ' ライバルとの差(ライバル − 主人公。入学時)' + d4(M.filter((x) => x.diff != null), (x) => x.diff) + ' / 争いが成立 ' + share(M, (x) => x.contest) + ' / 順位の逆転 ' + share(M, (x) => x.swap);
  log('   7. ' + line7(S, '旧方式 strongest:'));
  log('      ' + line7(L, '新方式 chaseable:'));
}
console.log(out.join('\n'));
