// =============================================================
// sim.js : 画面なしで何十年分も自動実行する検証用スクリプト
//   使い方: node sim.js [年数] [シード] [方針]
//     年数 : 既定 50
//     シード: 既定 12345(同じシードなら同じ結果になる)
//     方針 : auto(一番高い能力に特化。既定)/ balance / random
//   例: node sim.js 200 42 random
// =============================================================
'use strict';

const Logic = require('./logic.js');
const { CONFIG, Core, HighSchool } = Logic;

const years = parseInt(process.argv[2] || '50', 10);
const seed = parseInt(process.argv[3] || '12345', 10);
const policyMode = process.argv[4] || 'auto';

// sim 内で方針を選ぶための乱数(ゲーム本体の乱数とは別)
const pickRng = new Core.Rng(seed ^ 0x9e3779b9);

function choosePolicy(p) {
  const list = Core.POLICIES[p.position];
  if (policyMode === 'balance') return 'balance';
  if (policyMode === 'random') return pickRng.pick(list).key;
  // auto: 一番高い能力に特化(該当する方針が無いスタミナなどはバランス)
  let bestKey = null;
  let best = -1;
  for (const k of Object.keys(p.abilities)) {
    if (p.abilities[k] > best) { best = p.abilities[k]; bestKey = k; }
  }
  const pol = list.find((x) => x.focus === bestKey);
  return pol ? pol.key : 'balance';
}

// ---------- 実行 ----------
const state = HighSchool.newGame({ seed: seed });
while (state.stats.years < years) {
  const policies = {};
  for (const p of state.pendingRecruits) policies[p.id] = choosePolicy(p);
  HighSchool.confirmEnrollment(state, policies);
  HighSchool.advanceToApril(state);
}

// ---------- 集計 ----------
const S = state.stats;
const pct = (n, d) => (d ? (n / d * 100).toFixed(2) + '%' : '-');
const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : NaN);
const f1 = (v) => (Number.isNaN(v) ? '-' : v.toFixed(1));
const out = [];
const warnings = [];
const warn = (msg) => warnings.push(msg);
const log = (s) => out.push(s === undefined ? '' : s);

log('==============================================');
log(' 野球ガチャ育成ゲーム 検証 (シード ' + seed + ' / ' + years + '年 / 方針 ' + policyMode + ')');
log('==============================================');

// 出現率
log('');
log('■ 新入生の才能(新入生 ' + S.recruits + '人)');
log('  天才 : ' + S.genius + '人 (' + pct(S.genius, S.recruits) + ')  設定 ' + (CONFIG.talent.geniusRate * 100) + '%');
log('  転生 : ' + S.reincarnation + '人 (' + pct(S.reincarnation, S.recruits) + ')  設定 ' + (CONFIG.talent.reincarnationRate * 100) + '%');
const typeCounts = Object.keys(CONFIG.reincarnationTypes)
  .map((k) => CONFIG.reincarnationTypes[k].name + ' ' + (S.reincarnationByType[k] || 0))
  .join(' / ');
log('    内訳: ' + typeCounts);

// 卒業時の能力(開始時からいた選手は除外)
const grads = state.alumni.filter((a) => a.origin === 'recruit');
const groupOf = (a) => {
  if (a.reincarnation) return '転生';
  if (a.talent === 'genius') return a.geniusBust ? '天才(不発)' : '天才(開花)';
  return '通常';
};
const groups = { 通常: [], '天才(開花)': [], '天才(不発)': [], 転生: [] };
for (const a of grads) groups[groupOf(a)].push(a);

log('');
log('■ 卒業時の最終能力(卒業生 ' + grads.length + '人)');
log('  区分        人数   総合平均  入学時総合  最高能力平均');
for (const g of Object.keys(groups)) {
  const list = groups[g];
  const fin = avg(list.map((a) => a.overall));
  const ini = avg(list.map((a) => Core.overall(a.initialAbilities)));
  const mx = avg(list.map((a) => Core.maxAbility(a.finalAbilities)));
  log('  ' + (g + '        ').slice(0, 10) + String(list.length).padStart(5) + '   ' + f1(fin).padStart(6)
    + '    ' + f1(ini).padStart(6) + '      ' + f1(mx).padStart(6));
}
const allOverall = grads.map((a) => a.overall);
log('  全体の総合平均: ' + f1(avg(allOverall)));

// 能力ごとの平均
log('');
log('■ 能力ごとの卒業時平均(入学時 → 卒業時)');
for (const pos of ['pitcher', 'fielder']) {
  const list = grads.filter((a) => a.position === pos);
  const parts = Core.ABILITIES[pos].map((ab) => {
    const i = avg(list.map((a) => a.initialAbilities[ab.key]));
    const f = avg(list.map((a) => a.finalAbilities[ab.key]));
    return ab.label + ' ' + f1(i) + '→' + f1(f);
  });
  log('  ' + Core.POSITION_LABEL[pos] + '(' + list.length + '人): ' + parts.join(' / '));
}

// 方針ごとの平均
log('');
log('■ 育成方針ごとの卒業時(総合平均 / 最高能力平均)');
for (const pos of ['pitcher', 'fielder']) {
  for (const pol of Core.POLICIES[pos]) {
    const list = grads.filter((a) => a.position === pos && a.policy === pol.key && !a.reincarnation);
    if (!list.length) continue;
    log('  ' + Core.POSITION_LABEL[pos] + ' ' + (pol.label + '      ').slice(0, 6) + ' ' + String(list.length).padStart(4) + '人  総合 '
      + f1(avg(list.map((a) => a.overall))) + '  最高 ' + f1(avg(list.map((a) => Core.maxAbility(a.finalAbilities)))));
  }
}

// 分布
function histogram(values, label) {
  const buckets = new Array(11).fill(0);
  for (const v of values) buckets[Math.min(10, Math.floor(v / 10))]++;
  log('');
  log('■ ' + label + 'の分布');
  const max = Math.max.apply(null, buckets);
  for (let i = 0; i <= 10; i++) {
    if (!buckets[i]) continue;
    const range = i === 10 ? '   100' : String(i * 10).padStart(3) + '-' + String(i * 10 + 9).padStart(2);
    const bar = '#'.repeat(Math.max(1, Math.round(buckets[i] / max * 40)));
    log('  ' + range + ' : ' + String(buckets[i]).padStart(4) + ' ' + bar);
  }
}
histogram(allOverall, '卒業時の総合');
const maxVals = grads.map((a) => Core.maxAbility(a.finalAbilities));
histogram(maxVals, '卒業時の最高能力');
const maxed = maxVals.filter((v) => v >= 100).length;
log('  最高能力が100に達した卒業生: ' + maxed + '人 (' + pct(maxed, grads.length) + ')');

// 進路
log('');
log('■ 進路');
const careers = {};
for (const a of grads) careers[a.career] = (careers[a.career] || 0) + 1;
for (const path of CONFIG.career.paths) {
  const n = careers[path.label] || 0;
  log('  ' + path.label + ': ' + n + '人 (' + pct(n, grads.length) + ')');
}

// 大会
log('');
log('■ 大会(フェーズ1の簡易版)');
log('  平均チーム強さ: ' + f1(S.teamStrengthSum / S.teamStrengthCount));
for (const key of ['summer', 'autumn']) {
  const t = S.tournaments[key];
  log('  ' + CONFIG.tournaments[key].name + ': 優勝 ' + t.champion + '/' + t.played + ' (' + pct(t.champion, t.played) + ')'
    + '  平均勝利数 ' + f1(t.roundsWon / t.played));
}
log('  甲子園・スカウト・逃した魚・チャンス能力: フェーズ2以降で集計');

// ---------- 調整コメント ----------
const gRate = S.genius / S.recruits;
if (S.recruits >= 200 && Math.abs(gRate - CONFIG.talent.geniusRate) > CONFIG.talent.geniusRate * 0.5) {
  warn('天才の出現率が設定から大きくずれています(サンプル不足の可能性あり)。年数を増やして確認 → talent.geniusRate');
}
const normalAvg = avg(groups['通常'].map((a) => a.overall));
const geniusAvg = avg(groups['天才(開花)'].map((a) => a.overall));
if (normalAvg < 36) warn('通常選手の卒業時総合が低すぎます(' + f1(normalAvg) + ')。→ camp.points を上げる / camp.outcomeRates.normal の big を上げる');
if (normalAvg > 65) warn('通常選手の卒業時総合が高すぎます(' + f1(normalAvg) + ')。→ camp.points を下げる / initialAbility.mean を下げる');
if (!Number.isNaN(geniusAvg) && geniusAvg - normalAvg < 8) warn('開花した天才と通常の差が小さい(' + f1(geniusAvg - normalAvg) + ')。→ camp.geniusPointMult / outcomeRates.genius を上げる');
if (!Number.isNaN(geniusAvg) && geniusAvg - normalAvg > 30) warn('開花した天才が強すぎる(差 ' + f1(geniusAvg - normalAvg) + ')。→ camp.geniusPointMult を下げる');
if (maxed / grads.length > 0.15) warn('最高能力100の卒業生が多すぎます。→ camp.softCap を強める / camp.points を下げる');
const proN = careers[CONFIG.career.paths[0].label] || 0;
if (proN / grads.length > 0.15) warn('プロ入りが多すぎます(' + pct(proN, grads.length) + ')。→ career.paths のプロの min を上げる');
if (proN === 0 && grads.length >= 100) warn('プロ入りが0人です。→ career.paths のプロの min を下げる');
for (const key of ['summer', 'autumn']) {
  const t = S.tournaments[key];
  const r = t.champion / t.played;
  if (r < 0.03) warn(CONFIG.tournaments[key].name + 'の優勝率が低すぎます(' + pct(t.champion, t.played) + ')。→ tournaments.' + key + '.oppBase を下げる / match.scale を上げる');
  if (r > 0.6) warn(CONFIG.tournaments[key].name + 'の優勝率が高すぎます(' + pct(t.champion, t.played) + ')。→ tournaments.' + key + '.oppBase を上げる');
}

log('');
log('# ---- 調整のヒント ----');
if (!warnings.length) log('# 極端な数値は見つかりませんでした。');
for (const w of warnings) log('# ' + w);

console.log(out.join('\n'));
