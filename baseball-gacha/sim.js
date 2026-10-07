// =============================================================
// sim.js : 画面なしで何十年分も自動実行する検証用スクリプト
//   使い方: node sim.js [年数] [シード] [方針]
//     年数 : 既定 50
//     シード: 既定 12345(同じシードなら同じ結果になる)
//     方針 : auto(能力から自動。画面の「おまかせ(全員)」と同じ。既定)/ balance / random
//   例: node sim.js 200 42 random
//   画面の「次のイベントまで」と同じ進め方で、方針の選択はすべて自動で行う。
// =============================================================
'use strict';

const Logic = require('./logic.js');
const { CONFIG, Core, Generation, Sim } = Logic;

const years = parseInt(process.argv[2] || '50', 10);
const seed = parseInt(process.argv[3] || '12345', 10);
const policyMode = process.argv[4] || 'auto';
const SEEDS = 10; // 目安との比較・指導力の到達年・優勝率は、シードを変えて10回ぶん集計する

// 自動実行(調整画面の試し計算と同じ処理)。方針は auto=新入生も在校生も全員おまかせ
const runner = Sim.createRunner({ seeds: Array.from({ length: SEEDS }, (_, i) => seed + i), years: years, policyMode: policyMode });
while (!runner.step()) { /* 1年ずつ進める */ }
const states = runner.states();
const state = states[0]; // くわしい内訳は、最初のシードで表示する
const metrics = Sim.analyze(states, runner.labels, { preMs: runner.startMs() });

// ---------- 集計 ----------
const S = state.stats;
const pct = (n, d) => (d ? (n / d * 100).toFixed(2) + '%' : '-');
const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : NaN);
const f0 = (v) => (Number.isNaN(v) ? '-' : v.toFixed(0));
const f1 = (v) => (Number.isNaN(v) ? '-' : v.toFixed(1));
const quant = (arr, q) => {
  if (!arr.length) return NaN;
  const b = arr.slice().sort((x, y) => x - y);
  return b[Math.min(b.length - 1, Math.floor(q * b.length))];
};
const out = [];
const warnings = [];
const warn = (msg) => warnings.push(msg);
const log = (s) => out.push(s === undefined ? '' : s);
const pad = (s, n) => (String(s) + ' '.repeat(n)).slice(0, n);
const padL = (s, n) => String(s).padStart(n);

log('==============================================');
log(' 野球ガチャ育成ゲーム 検証 (シード ' + seed + '〜' + (seed + SEEDS - 1) + ' / ' + years + '年 / 方針 ' + policyMode + ')');
log('==============================================');
if (!Generation.getBenchmark()) log('!! 世代の基準(benchmark.js)がありません。node tools/build-benchmark.js で作ってください');
else if (Generation.isStale()) log('!! 世代の基準が古い可能性があります(設定のハッシュ ' + Generation.configHash() + ' / 基準 ' + Generation.getBenchmark().hash + ')。node tools/build-benchmark.js で作り直してください');

// ---------- 目安との比較 ----------
const judged = Sim.judge(metrics);
log('');
log('■ 目安との比較(' + SEEDS + 'シードの合計。✓ 範囲内 / △ 目安の±20%以内 / ✕ それ以外 / − データなし)');
for (const j of judged) {
  log('  ' + j.verdict + ' ' + pad(j.label, 26) + padL(Sim.formatMetric(j.value, j.target), 8) + '   目安 ' + Sim.formatTarget(j.target));
}
log('  (参考)総合値500超 ' + Sim.formatMetric(metrics.over500, { pct: true }) + ' / 卒業生 ' + metrics.grads + '人'
  + ' / 人数 通常' + metrics.counts.normal + ' スタメン中心' + metrics.counts.starter + ' 控え中心' + metrics.counts.bench
  + ' 天才' + metrics.counts.genius + ' 転生' + metrics.counts.reinc + ' 天才かつ転生' + metrics.counts.both);
const fmtReach = (arr) => arr.map((v) => (v == null ? '未到達' : v + '年')).join(' / ');
log('  指導力 Lv5 到達(シードごと): ' + fmtReach(metrics.lvReach.lv5));
log('  指導力 Lv10到達(シードごと): ' + fmtReach(metrics.lvReach.lv10));

// ---------- 見える化 ----------
log('');
log('■ 勝率予想の校正(予想勝率の10%区間ごとの、実際の勝率。判定は ' + CONFIG.visual.calibrationMinGames + '試合以上の区間)');
log('  ' + metrics.calibRows.map((r) => (r.bin * 10) + '-' + (r.bin * 10 + 9) + '%: '
  + (r.n ? '予想' + Math.round(r.pred * 100) + '→実際' + Math.round(r.actual * 100) + '%(' + r.n + ')' : '-')).join(' / '));
log('');
log('■ チーム戦力(年ごとの平均。' + SEEDS + 'シードの平均。5年ごと)');
log('  ' + metrics.powerByYear.filter((x) => x.y === 1 || x.y % 5 === 0).map((x) => x.y + '年目 ' + Math.round(x.p)).join(' / ')
  + '  ※他校平均 ' + Core.opponentRef().avgPower + ' / 他校上位 ' + Core.opponentRef().topPower);
log('  1年目に対する伸び(最後の5年の平均) ' + Sim.formatMetric(metrics.powerGrowth, { pct: true })
  + ' / 成長の反映(対 他校平均の勝率予想、3年目4月 − 1年目4月)' + Sim.formatMetric(metrics.growthReflect, { pct: true }));
log('  活躍選手 1試合あたり ' + Sim.formatMetric(metrics.highlightsPerGame) + '人 / 「成長の成果」が付く割合 ' + Sim.formatMetric(metrics.growthNoteShare, { pct: true })
  + ' / 番狂わせ ' + states.reduce((a, st) => a + st.stats.upsets, 0) + '回・波乱 ' + states.reduce((a, st) => a + st.stats.shocks, 0) + '回');
log('  保存容量の見積もり(50年プレイ時、上限 ' + CONFIG.visual.storageQuotaChars + '文字に対して) ' + Sim.formatMetric(metrics.storageShare, { pct: true }));

// ---------- 新入生 ----------
log('');
log('■ 新入生の才能(新入生 ' + S.recruits + '人)');
log('  天才   : ' + S.genius + '人 (' + pct(S.genius, S.recruits) + ')  設定 ' + (CONFIG.talent.geniusRate * 100) + '%');
log('  転生   : ' + S.reincarnation + '人 (' + pct(S.reincarnation, S.recruits) + ')  設定 ' + (CONFIG.talent.reincarnationRate * 100) + '%');
log('    内訳: ' + Object.keys(CONFIG.reincarnationTypes)
  .map((k) => CONFIG.reincarnationTypes[k].name + ' ' + (S.reincarnationByType[k] || 0)).join(' / '));
log('  二刀流 : ' + S.twoWay + '人 (' + pct(S.twoWay, S.recruits) + ')  設定 ' + (CONFIG.talent.twoWayRate * 100) + '%');

log('');
log('■ 入学時の総合値');
log('  区分          人数    平均   最小   最大');
for (const g of ['通常', '天才', '転生', '天才かつ転生']) {
  const r = S.recruitRatings.filter((x) => x.g === g).map((x) => x.r);
  if (!r.length) { log('  ' + pad(g, 12) + padL(0, 5)); continue; }
  log('  ' + pad(g, 12) + padL(r.length, 5) + '   ' + padL(f0(avg(r)), 5) + '  ' + padL(Math.min.apply(null, r), 5) + '  ' + padL(Math.max.apply(null, r), 5));
}
{
  const tw = S.recruitRatings.filter((x) => x.tw).map((x) => x.r);
  log('  ' + pad('二刀流(再掲)', 12) + padL(tw.length, 5) + (tw.length ? '   ' + padL(f0(avg(tw)), 5) + '  ' + padL(Math.min.apply(null, tw), 5) + '  ' + padL(Math.max.apply(null, tw), 5) : ''));
  const normal = S.recruitRatings.filter((x) => x.g === '通常').map((x) => x.r);
  log('  通常のうち 120以上: ' + pct(normal.filter((r) => r >= 120).length, normal.length));
}

// ---------- 卒業生 ----------
const grads = state.alumni.filter((a) => a.origin === 'recruit');
const starterRatio = (a) => (a.teamGames ? a.starts / a.teamGames : 0);
const isNormal = (a) => !a.reincarnation && !(a.talent === 'genius' && !a.geniusBust);
const groups = {
  通常: grads.filter(isNormal),
  スタメン中心: grads.filter((a) => isNormal(a) && starterRatio(a) >= 0.6),
  控え中心: grads.filter((a) => isNormal(a) && starterRatio(a) <= 0.2),
  '天才(開花)': grads.filter((a) => a.talent === 'genius' && !a.geniusBust && !a.reincarnation),
  転生: grads.filter((a) => a.reincarnation && !(a.talent === 'genius' && !a.geniusBust)),
  天才かつ転生: grads.filter((a) => a.reincarnation && a.talent === 'genius' && !a.geniusBust),
  二刀流: grads.filter((a) => a.twoWay),
};
log('');
log('■ 卒業時の総合値(卒業生 ' + grads.length + '人。スタメン中心=出場機会の6割以上、控え中心=2割以下)');
log('  区分            人数    平均   50%点   90%点   99%点    最大   3年間の増加');
for (const g of Object.keys(groups)) {
  const list = groups[g];
  const r = list.map((a) => a.rating);
  log('  ' + pad(g, 14) + padL(list.length, 5) + '   ' + padL(f0(avg(r)), 5) + '   ' + padL(list.length ? quant(r, 0.5) : '-', 5)
    + '   ' + padL(list.length ? quant(r, 0.9) : '-', 5) + '   ' + padL(list.length ? quant(r, 0.99) : '-', 5)
    + '   ' + padL(list.length ? Math.max.apply(null, r) : '-', 5) + '   ' + padL(list.length ? '+' + f0(avg(list.map((a) => a.rating - a.initialRating))) : '-', 6));
}
const over500 = grads.filter((a) => a.rating > 500).length;
const over600 = grads.filter((a) => a.rating > 600).length;
const over100 = grads.filter((a) => a.mainKeys.some((k) => a.finalAbilities[k] > 100)).length;
log('  総合値500超: ' + pct(over500, grads.length) + '  /  600超: ' + pct(over600, grads.length) + '(目安 1%以下)');
log('  100を超えた項目を持つ卒業生: ' + pct(over100, grads.length));

// 頭打ち・限界突破
{
  const normal = groups['通常'];
  const capped = normal.filter((a) => a.cappedOut).length;
  const broke = grads.filter((a) => a.limitBreaks > 0);
  log('');
  log('■ 成長限界');
  log('  卒業時に頭打ちだった通常の選手: ' + pct(capped, normal.length));
  log('  限界突破の発生: ' + S.limitBreak.count + '回(' + f1(S.limitBreak.count / S.years * 10) + '回/10年)'
    + '  突破した卒業生の卒業時の総合値 平均 ' + f0(avg(broke.map((a) => a.rating))));
}

// 成長の内訳
{
  const sum = { practice: 0, camp: 0, exp: 0 };
  for (const a of grads) for (const k of Object.keys(sum)) sum[k] += a.growthBy[k] || 0;
  const tot = sum.practice + sum.camp + sum.exp;
  log('');
  log('■ 成長の内訳(目安 練習4割・合宿2割・試合経験値4割)');
  log('  練習 ' + pct(sum.practice, tot) + ' / 合宿 ' + pct(sum.camp, tot) + ' / 試合経験値 ' + pct(sum.exp, tot));
  for (const g of ['スタメン中心', '控え中心']) {
    const list = groups[g];
    const f = (key) => f0(avg(list.map((a) => a.growthBy[key] / a.mainKeys.length * CONFIG.ratingMultiplier)));
    log('  ' + pad(g, 12) + ' 総合値換算: 練習 +' + f('practice') + ' / 合宿 +' + f('camp') + ' / 試合経験値 +' + f('exp')
      + '   経験値の累計 平均 ' + f0(avg(list.map((a) => a.expTotal))));
  }
  const C = S.camp;
  log('  合宿1回あたり +' + (C.points / C.events).toFixed(2) + '(能力値の合計)  大きく伸びる ' + pct(C.big, C.events)
    + ' / 少し伸びる ' + pct(C.small, C.events) + ' / 変化なし ' + pct(C.none, C.events));
  log('  練習試合: ' + S.practiceGames.played + '試合 勝率 ' + pct(S.practiceGames.won, S.practiceGames.played));
  if (tot) {
    if (sum.exp / tot < 0.3) warn('試合経験値の割合が小さい(' + pct(sum.exp, tot) + ')。→ growth.exp.growthPerExp を上げる');
    if (sum.exp / tot > 0.5) warn('試合経験値の割合が大きい(' + pct(sum.exp, tot) + ')。→ growth.exp.growthPerExp / capVsPractice を下げる');
    if (sum.camp / tot < 0.12 || sum.camp / tot > 0.28) warn('合宿の割合が目安(2割)から外れています(' + pct(sum.camp, tot) + ')。→ growth.camp.points を調整');
  }
}

// 100超の能力の寄与
{
  const O = S.overCap;
  log('');
  log('■ 100を超えた能力の寄与(夏の大会で100超の選手がいた ' + O.n + '回)');
  if (O.n) {
    log('  割り引かない場合との差: チームの強さ ' + f1(O.strengthDiff / O.n) + ' / 平均的な相手への勝率 ' + (O.winDiff / O.n * 100).toFixed(2) + 'ポイント'
      + '(overCapWeight ' + CONFIG.overCapWeight + ')');
    if (O.winDiff / O.n > 0.05) warn('100超の能力を割り引かないと勝率が大きく変わります。今の割引で十分か確認 → overCapWeight');
  } else {
    log('  該当なし');
  }
}

// 指導力
{
  const L = S.leadershipByYear;
  log('');
  log('■ 指導力(年度末のLv)');
  for (let i = 0; i < L.length; i += 20) log('  ' + L.slice(i, i + 20).map((v, j) => (i + j + 1) + ':' + v).join(' '));
  const reach = (lv, arr) => { const i = arr.findIndex((v) => v >= lv); return i < 0 ? null : i + 1; };
  // Lv別の、3年間の増加(通常の選手。入学時の指導力Lvで分ける)
  const normal = groups['通常'];
  const bands = [[1, 3], [4, 6], [7, 10]];
  log('  入学時の指導力Lv別の、通常の選手の3年間の増加: ' + bands.map((b) => {
    const list = normal.filter((a) => a.lvAtEntry >= b[0] && a.lvAtEntry <= b[1]);
    return 'Lv' + b[0] + '-' + b[1] + ' +' + f0(avg(list.map((a) => a.rating - a.initialRating))) + '(' + list.length + '人)';
  }).join(' / '));
  const lvGain = bands.map((b) => avg(normal.filter((a) => a.lvAtEntry >= b[0] && a.lvAtEntry <= b[1]).map((a) => a.rating - a.initialRating)));
  if (!Number.isNaN(lvGain[0]) && !Number.isNaN(lvGain[2]) && lvGain[2] - lvGain[0] > 60) warn('指導力の効果が大きすぎます。→ leadership.monthlyMultMax / campBigBonusMax を下げる');
}

// 方針の見直し・操作回数
log('');
log('■ 操作');
log('  在校生の方針を変更した割合: ' + pct(S.policyReview.changed, S.policyReview.reviewed) + '(見直しの対象 のべ' + S.policyReview.reviewed + '人)');
log('  1年生の天才・転生が夏の大会でスタメン: ' + S.freshmanSpecial.starting + '人 / 在籍 ' + S.freshmanSpecial.onRoster + '人');
log('  「次のイベントまで」で止まる回数: 1年あたり ' + (S.stops / S.years).toFixed(1) + '回(目安 6〜8回)');
if (S.stops / S.years < 5 || S.stops / S.years > 9) warn('止まる回数が目安から外れています。→ stopKinds / autoStop.minImportance を見直す');

// ---------- 部員・守備区分 ----------
log('');
log('■ 部員数の推移(4月の入部・コンバート後。年:部員数(新入生))');
const R = S.rosterByYear;
for (let i = 0; i < R.length; i += 10) {
  log('  ' + R.slice(i, i + 10).map((r) => String(r.y).padStart(3) + ':' + String(r.members).padStart(2) + '(' + String(r.newcomers).padStart(2) + ')').join(' '));
}
const mem = R.map((r) => r.members);
log('  部員数 平均 ' + f1(avg(mem)) + ' / 最小 ' + Math.min.apply(null, mem) + ' / 最大 ' + Math.max.apply(null, mem)
  + '   新入生 平均 ' + f1(avg(R.map((r) => r.newcomers))));
log('  投手0〜1人の年: コンバート前 ' + S.shortageBefore.P01 + '年 → 後 ' + S.shortageAfter.P01 + '年 / 捕手0人の年: 前 ' + S.shortageBefore.C0 + '年 → 後 ' + S.shortageAfter.C0 + '年');
const CV = S.conversion;
log('  コンバート 提案 ' + CV.attempts + '回 / 成功 ' + CV.success + '回 (' + pct(CV.success, CV.attempts) + ') / 野手→投手 ' + CV.fielderToPitcher + '回');
const SR = S.subReveal;
log('  副能力が判明 ' + SR.count + '人(野手が登板 ' + SR.fielderPitched + ' / 投手が野手で出場 ' + SR.pitcherFielded + ')');
log('  助っ人の加入 ' + S.helper.years + '年 / ' + S.years + '年 (' + pct(S.helper.years, S.years) + ')');
if (S.helper.years / S.years > 0.3) warn('助っ人の加入が多すぎます。→ newcomers.base を上げる / strengthPivot を下げる');
if (avg(mem) > CONFIG.newcomers.rosterCap * 0.95) warn('部員数がほぼ常に上限です。→ newcomers.strengthPivot を上げる');

// 二刀流
log('');
log('■ 二刀流');
if (groups['二刀流'].length) {
  for (const a of groups['二刀流']) {
    const r = Core.ratingSides(a);
    log('  ' + a.name + ' 投手 ' + r.pitch + ' / 野手 ' + r.bat + '(入学時 ' + a.initialRating + ')方針 ' + a.policyLabel + ' → ' + a.career);
  }
} else {
  log('  この期間の卒業生に二刀流はいませんでした。');
}

// 簡易成績
{
  const B = S.batting;
  const teamAvg = B.ab ? B.h / B.ab : NaN;
  const minAB = CONFIG.stats.minAtBatsForAverage;
  const career = (a) => a.stats.career;
  const hitters = state.alumni.filter((a) => !a.helper && career(a).ab >= minAB);
  const avgs = hitters.map((a) => Core.battingAverage(career(a)));
  const fmt3 = (v) => (Number.isNaN(v) ? '-' : v.toFixed(3).replace(/^0/, ''));
  log('');
  log('■ 簡易成績(大会のみ)');
  log('  チーム打率 ' + fmt3(teamAvg) + '  通算' + minAB + '打数以上 ' + hitters.length + '人: 平均 ' + fmt3(avg(avgs))
    + ' / 最大 ' + fmt3(avgs.length ? Math.max.apply(null, avgs) : NaN) + ' / .300以上 ' + pct(avgs.filter((v) => v >= 0.3).length, avgs.length));
  if (teamAvg < 0.23) warn('チーム打率が低すぎます(' + fmt3(teamAvg) + ')。→ stats.hit.base を上げる / stats.hit.pivot を下げる');
  if (teamAvg > 0.28) warn('チーム打率が高すぎます(' + fmt3(teamAvg) + ')。→ stats.hit.base を下げる / stats.hit.pivot を上げる');
}

// 進路
log('');
log('■ 進路');
const careers = {};
for (const a of grads) careers[a.career] = (careers[a.career] || 0) + 1;
log('  ' + CONFIG.career.paths.map((p) => p.label + ' ' + pct(careers[p.label] || 0, grads.length)).join(' / '));

// 大会
log('');
log('■ 大会(このシード)');
log('  平均チーム強さ: ' + f1(S.teamStrengthSum / S.teamStrengthCount));
for (const key of ['summer', 'autumn']) {
  const t = S.tournaments[key];
  log('  ' + CONFIG.tournaments[key].name + ': 優勝 ' + t.champion + '/' + t.played + ' (' + pct(t.champion, t.played) + ')  平均勝利数 ' + f1(t.roundsWon / t.played));
}

// 卒業時の「同世代の上位○%」(3年3月の基準と比べる)
if (Generation.getBenchmark()) {
  const all = [];
  for (const st of states) for (const a of st.alumni) if (a.origin === 'recruit') all.push(a);
  const tops = all.map((a) => {
    const r = Generation.getGenerationRank(a, 3, 3);
    return r ? r.top : 100;
  });
  const L = CONFIG.labelTop;
  const bands = [['規格外(上位' + L.beyond + '%以内)', 0, L.beyond], ['怪物級(〜' + L.monster + '%)', L.beyond, L.monster],
    ['逸材(〜' + L.excellent + '%)', L.monster, L.excellent], ['有望(〜' + L.promising + '%)', L.excellent, L.promising],
    ['上位' + L.promising + '〜50%', L.promising, 50], ['上位50%より下', 50, 1000]];
  log('');
  log('■ 卒業時の「同世代の上位○%」(' + SEEDS + 'シードの卒業生 ' + all.length + '人)');
  log('  ' + bands.map((b) => b[0] + ' ' + pct(tops.filter((t) => t > b[1] && t <= b[2]).length + (b[1] === 0 ? tops.filter((t) => t === 0).length : 0), tops.length)).join(' / '));
}

// ---------- 目安から外れた項目(✕)----------
for (const j of judged) {
  if (j.verdict === '✕') warn('✕ ' + j.label + ' = ' + Sim.formatMetric(j.value, j.target) + '(目安 ' + Sim.formatTarget(j.target) + ')→ ' + j.tune);
}

log('');
log('# ---- 調整のヒント ----');
if (!warnings.length) log('# 極端な数値は見つかりませんでした。');
for (const w of warnings) log('# ' + w);

console.log(out.join('\n'));
