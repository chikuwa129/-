// =============================================================
// sim.js : 画面なしで何十年分も自動実行する検証用スクリプト
//   使い方: node sim.js [年数] [シード] [方針]
//     年数 : 既定 50
//     シード: 既定 12345(同じシードなら同じ結果になる)
//     方針 : auto(能力から自動。画面の「おまかせ」と同じ。既定)/ balance / random
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
  const list = Core.POLICIES[Core.policySetOf(p)];
  if (policyMode === 'balance') return list[list.length - 1].key;
  if (policyMode === 'random') return pickRng.pick(list).key;
  return Core.autoPolicy(p);
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
const mainOverall = (a) => Core.avgOf(a.finalAbilities, a.mainKeys);
const mainMax = (a) => Core.maxAbility(a.finalAbilities, a.mainKeys);

log('==============================================');
log(' 野球ガチャ育成ゲーム 検証 (シード ' + seed + ' / ' + years + '年 / 方針 ' + policyMode + ')');
log('==============================================');

// 出現率
log('');
log('■ 新入生の才能(新入生 ' + S.recruits + '人)');
log('  天才   : ' + S.genius + '人 (' + pct(S.genius, S.recruits) + ')  設定 ' + (CONFIG.talent.geniusRate * 100) + '%');
log('  転生   : ' + S.reincarnation + '人 (' + pct(S.reincarnation, S.recruits) + ')  設定 ' + (CONFIG.talent.reincarnationRate * 100) + '%');
log('    内訳: ' + Object.keys(CONFIG.reincarnationTypes)
  .map((k) => CONFIG.reincarnationTypes[k].name + ' ' + (S.reincarnationByType[k] || 0)).join(' / '));
log('  二刀流 : ' + S.twoWay + '人 (' + pct(S.twoWay, S.recruits) + ')  設定 ' + (CONFIG.talent.twoWayRate * 100) + '%');

// 部員数の推移
log('');
log('■ 部員数の推移(4月の入部・コンバート後。年:部員数(新入生))');
const R = S.rosterByYear;
for (let i = 0; i < R.length; i += 10) {
  log('  ' + R.slice(i, i + 10).map((r) => String(r.y).padStart(3) + ':' + String(r.members).padStart(2) + '(' + String(r.newcomers).padStart(2) + ')').join(' '));
}
const mem = R.map((r) => r.members);
log('  部員数 平均 ' + f1(avg(mem)) + ' / 最小 ' + Math.min.apply(null, mem) + ' / 最大 ' + Math.max.apply(null, mem)
  + '   新入生 平均 ' + f1(avg(R.map((r) => r.newcomers))));
log('  前年夏の強さ別の新入生の平均人数:');
const buckets = {};
for (const r of R) {
  if (r.strength == null) continue;
  const b = Math.floor(r.strength / 5) * 5;
  (buckets[b] = buckets[b] || []).push(r.newcomers);
}
for (const b of Object.keys(buckets).map(Number).sort((x, y) => x - y)) {
  log('    強さ ' + b + '〜' + (b + 4) + ' : ' + f1(avg(buckets[b])) + '人 (' + buckets[b].length + '年)');
}

// 守備区分の偏り
log('');
log('■ 守備区分の偏り(年度始め)');
log('  投手0〜1人の年: コンバート前 ' + S.shortageBefore.P01 + '年 (' + pct(S.shortageBefore.P01, S.years) + ') → 後 '
  + S.shortageAfter.P01 + '年 (' + pct(S.shortageAfter.P01, S.years) + ')');
log('  捕手0人の年   : コンバート前 ' + S.shortageBefore.C0 + '年 (' + pct(S.shortageBefore.C0, S.years) + ') → 後 '
  + S.shortageAfter.C0 + '年 (' + pct(S.shortageAfter.C0, S.years) + ')');

// コンバート
const CV = S.conversion;
log('');
log('■ コンバート');
log('  提案 ' + CV.attempts + '回 / 成功 ' + CV.success + '回 (成功率 ' + pct(CV.success, CV.attempts) + ') / 野手→投手 ' + CV.fielderToPitcher + '回');

// 副能力の判明
const SR = S.subReveal;
log('');
log('■ 副能力の判明');
log('  判明した選手 ' + SR.count + '人(野手が登板 ' + SR.fielderPitched + ' / 投手が野手で出場 ' + SR.pitcherFielded + ')'
  + '  判明した側の能力の平均 ' + f1(avg(SR.values)));

// 助っ人
log('');
log('■ 人数割れ(助っ人加入)');
log('  発生 ' + S.helper.years + '年 / ' + S.years + '年 (' + pct(S.helper.years, S.years) + ')  助っ人のべ ' + S.helper.total + '人');

// 卒業時の能力(開始時からいた選手と助っ人は除外)
const grads = state.alumni.filter((a) => a.origin === 'recruit');
const groupOf = (a) => {
  if (a.twoWay) return '二刀流';
  if (a.reincarnation) return '転生';
  if (a.talent === 'genius') return a.geniusBust ? '天才(不発)' : '天才(開花)';
  return '通常';
};
const groups = { 通常: [], '天才(開花)': [], '天才(不発)': [], 転生: [], 二刀流: [] };
for (const a of grads) groups[groupOf(a)].push(a);

log('');
log('■ 卒業時の最終能力(卒業生 ' + grads.length + '人。総合は本職側の平均、二刀流は両側の平均)');
log('  区分        人数   総合平均  入学時総合  最高能力平均');
for (const g of Object.keys(groups)) {
  const list = groups[g];
  const fin = avg(list.map(mainOverall));
  const ini = avg(list.map((a) => Core.avgOf(a.initialAbilities, a.mainKeys)));
  const mx = avg(list.map(mainMax));
  log('  ' + (g + '        ').slice(0, 10) + String(list.length).padStart(5) + '   ' + f1(fin).padStart(6)
    + '    ' + f1(ini).padStart(6) + '      ' + f1(mx).padStart(6));
}
const allOverall = grads.map(mainOverall);
log('  全体の総合平均: ' + f1(avg(allOverall)));

// 二刀流
log('');
log('■ 二刀流');
if (groups['二刀流'].length) {
  for (const a of groups['二刀流']) {
    log('  ' + a.name + ' 投手系 ' + Core.avgOf(a.finalAbilities, Core.PITCH_KEYS) + ' / 野手系 '
      + Core.avgOf(a.finalAbilities, Core.BAT_KEYS) + ' / 方針 ' + a.policyLabel + ' → ' + a.career);
  }
} else {
  log('  この期間の卒業生に二刀流はいませんでした。');
}
const PS = S.pitcherSlot;
log('  夏の大会のエース枠の強さへの寄与: 二刀流 ' + f1(avg(PS.twoWay)) + '(' + PS.twoWay.length + '回) / 通常の投手 '
  + f1(avg(PS.normal)) + '(' + PS.normal.length + '回)');
// 出現が稀なので、同じ条件で生成した選手どうしでも比べる
{
  const rng = new Core.Rng(seed);
  const N = 2000;
  const cmp = { twoWay: [], normal: [] };
  for (const tw of [true, false]) {
    for (let i = 0; i < N; i++) {
      const p = Core.createPlayer(rng, { id: i, year: 1, forceTwoWay: tw, position: 'P' });
      p.twoWayRevealed = true;
      const slots = [{ pos: 'P', player: p, apt: Core.effectiveAptitude(p, 'P') }];
      cmp[tw ? 'twoWay' : 'normal'].push(Core.evaluateLineup(slots).pitcherSlotValue);
    }
  }
  log('  入学時の比較(各' + N + '人を生成): エース枠の寄与 二刀流 ' + f1(avg(cmp.twoWay)) + ' / 通常の投手 ' + f1(avg(cmp.normal)));
}

// 能力ごとの平均(本職側)
log('');
log('■ 本職側の能力の卒業時平均(入学時 → 卒業時)');
for (const pos of Core.POSITIONS) {
  const list = grads.filter((a) => a.position === pos && !a.twoWay);
  const keys = Core.sideKeys(Core.sideOf(pos));
  const parts = keys.map((k) => Core.ABILITY_LABEL[k] + ' ' + f1(avg(list.map((a) => a.initialAbilities[k])))
    + '→' + f1(avg(list.map((a) => a.finalAbilities[k]))));
  log('  ' + Core.POSITION_LABEL[pos] + '(' + list.length + '人): ' + parts.join(' / '));
}

// 分布
function histogram(values, label) {
  const b = new Array(11).fill(0);
  for (const v of values) b[Math.min(10, Math.floor(v / 10))]++;
  log('');
  log('■ ' + label + 'の分布');
  const max = Math.max.apply(null, b);
  for (let i = 0; i <= 10; i++) {
    if (!b[i]) continue;
    const range = i === 10 ? '   100' : String(i * 10).padStart(3) + '-' + String(i * 10 + 9).padStart(2);
    log('  ' + range + ' : ' + String(b[i]).padStart(4) + ' ' + '#'.repeat(Math.max(1, Math.round(b[i] / max * 40))));
  }
}
histogram(allOverall, '卒業時の総合');
const maxVals = grads.map(mainMax);
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
log('■ 大会(簡易版。スタメン編成による強さ)');
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
const normalAvg = avg(groups['通常'].map(mainOverall));
const geniusAvg = avg(groups['天才(開花)'].map(mainOverall));
if (normalAvg < 36) warn('通常選手の卒業時総合が低すぎます(' + f1(normalAvg) + ')。→ camp.points を上げる / camp.outcomeRates.normal の big を上げる');
if (normalAvg > 65) warn('通常選手の卒業時総合が高すぎます(' + f1(normalAvg) + ')。→ camp.points を下げる / initialAbility.mean を下げる');
if (!Number.isNaN(geniusAvg) && geniusAvg - normalAvg < 6) warn('開花した天才と通常の差が小さい(' + f1(geniusAvg - normalAvg) + ')。→ camp.geniusPointMult / outcomeRates.genius を上げる');
if (!Number.isNaN(geniusAvg) && geniusAvg - normalAvg > 30) warn('開花した天才が強すぎる(差 ' + f1(geniusAvg - normalAvg) + ')。→ camp.geniusPointMult を下げる');
if (maxed / grads.length > 0.15) warn('最高能力100の卒業生が多すぎます。→ camp.softCap を強める / camp.points を下げる');
const proN = careers[CONFIG.career.paths[0].label] || 0;
if (proN / grads.length > 0.15) warn('プロ入りが多すぎます(' + pct(proN, grads.length) + ')。→ career.paths のプロの min を上げる');
if (proN === 0 && grads.length >= 100) warn('プロ入りが0人です。→ career.paths のプロの min を下げる');
for (const key of ['summer', 'autumn']) {
  const t = S.tournaments[key];
  const r = t.champion / t.played;
  if (r < 0.05) warn(CONFIG.tournaments[key].name + 'の優勝率が低すぎます(' + pct(t.champion, t.played) + ')。→ tournaments.' + key + '.oppBase を下げる / teamStrength の重みを見直す');
  if (r > 0.5) warn(CONFIG.tournaments[key].name + 'の優勝率が高すぎます(' + pct(t.champion, t.played) + ')。→ tournaments.' + key + '.oppBase を上げる');
}
if (S.helper.years / S.years > 0.3) warn('助っ人の加入が多すぎます(' + pct(S.helper.years, S.years) + ')。→ newcomers.base / newcomers.min を上げる');
if (avg(mem) > CONFIG.newcomers.rosterCap * 0.95) warn('部員数がほぼ常に上限です。→ newcomers.base / perStrength を下げる');
if (S.shortageAfter.P01 / S.years > 0.2) warn('投手不足の年が多い。→ positionRates.P / positionDeficit.P を上げる');
if (S.shortageAfter.C0 / S.years > 0.1) warn('捕手不在の年が多い。→ positionRates.C / positionDeficit.C を上げる');
if (CV.attempts && CV.success / CV.attempts < 0.3) warn('コンバートの成功率が低い。→ conversion.successBase を上げる');
if (S.twoWay > 0 && S.recruits >= 1000 && Math.abs(S.twoWay / S.recruits - CONFIG.talent.twoWayRate) > CONFIG.talent.twoWayRate) {
  warn('二刀流の出現率が設定から大きくずれています。→ talent.twoWayRate');
}

log('');
log('# ---- 調整のヒント ----');
if (!warnings.length) log('# 極端な数値は見つかりませんでした。');
for (const w of warnings) log('# ' + w);

console.log(out.join('\n'));
