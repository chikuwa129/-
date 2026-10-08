// =============================================================
// tools/hero-sim.js : 新入部員モードの検証(画面なし)
//   使い方: node tools/hero-sim.js [回数=200] [最初のシード=1]
//   引きの主人公と、作った主人公(レベル感 × 素質、二刀流)を、それぞれ指定の回数だけ3年間進めて、
//   config.js の heroMode.targets と比べて ✓ / △ / ✕ を出す。同じ引数なら同じ結果になる。
//   測定の時点は「3年の夏の大会の直後」(主人公の卒業の時点)。比較先の引きの選手も同じ時点で測る。
// =============================================================
'use strict';

const path = require('path');
const Logic = require(path.join(__dirname, '..', 'logic.js'));
const Hero = require(path.join(__dirname, '..', 'hero.js'));
const { CONFIG, Core, Sim } = Logic;

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
  const st = Hero.newHeroGame(seed);
  if (kind.pick) {
    const r = new Core.Rng((seed * 40503) >>> 0);
    Hero.pickHero(st, r.pick(st.pendingRecruits).id);
  } else {
    const err = Hero.createHero(st, choiceFor(kind, seed));
    if (err) throw new Error(err);
    Hero.confirmRival(st, 'auto');
  }
  const h0 = Hero.heroOf(st);
  const startPos = Core.isTwoWayKnown(h0) ? 'TW' : h0.position;
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
  const all = H.stories;
  return {
    st: st, H: H, a: a, startPos: startPos, rivalTwoWay: !!(rv && rv.twoWay),
    finRating: a ? a.rating : null,
    finSides: a ? { pitch: Core.ratingOfKeys(a.finalAbilities, Core.PITCH_KEYS), bat: Core.ratingOfKeys(a.finalAbilities, Core.BAT_KEYS) } : null,
    cohort: cohort,
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
// 目安
log('');
log('■ 目安との比較(✓ 範囲内 / △ 目安の±20%以内 / ✕ それ以外)');
for (const k of Object.keys(T)) {
  const t = T[k];
  const v = M[k];
  const vd = judge(v, t);
  log('  ' + vd + ' ' + t.label + ' ' + fmt(v, t) + '  目安 ' + tgt(t) + (vd !== '✓' && vd !== '−' ? '  → ' + t.tune : ''));
}
console.log(out.join('\n'));
