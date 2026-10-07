// =============================================================
// config.js : 確率・補正値などの設定をここに集約する
// 数値はすべて仮の値。sim.js の出力を見ながら調整すること。
// =============================================================
(function (root) {
  'use strict';

  const CONFIG = {
    // ---- 基本 ----
    schoolName: '白樺高校',        // 自校の名前(架空)
    saveKey: 'bbgacha_save',       // localStorage のキー
    saveVersion: 2,                // セーブデータの形式。違うバージョンのセーブは初期化する
    logLimit: 200,                 // 出来事ログの保存件数

    // ---- 新入生の人数 ----
    // 人数 = base + (前年夏のチームの強さ - strengthPivot) * perStrength + 乱数(±noise)
    newcomers: {
      base: 5,
      strengthPivot: 34,
      perStrength: 0.4,
      noise: 1,
      min: 3,
      max: 12,
      rosterCap: 30,               // 部員の総数の上限(超える分は新入生を減らす)
    },

    // ---- 守備区分 ----
    // 新入生の守備区分の出現率(転生・二刀流で決まる場合を除く)
    positionRates: { P: 0.22, C: 0.12, IF: 0.36, OF: 0.30 },
    // 本職が不足しているとき(人数 < min)だけ、その区分の出現率に mult を掛ける
    positionDeficit: {
      P:  { min: 2, mult: 2.5 },
      C:  { min: 1, mult: 3.0 },
      IF: { min: 4, mult: 1.5 },
      OF: { min: 3, mult: 1.5 },
    },
    // 開始時の部員(2年・3年合計)の守備区分の人数 [最小, 最大]
    initialComposition: { P: [2, 3], C: [1, 2], IF: [4, 5], OF: [3, 4] },

    // ---- 隠れた才能 / 転生 / 二刀流 ----
    talent: {
      geniusRate: 0.05,            // 天才の出現率
      reincarnationRate: 0.015,    // 転生の出現率(天才とは独立に抽選)
      twoWayRate: 0.003,           // 二刀流の出現率(天才・転生とは独立に抽選)
      geniusBustRate: 0.2,         // 天才なのに才能が開花しない確率(伸び方は通常と同じになる)
    },
    // 判明するタイミング:'enrollment'(入学時の演出) / 'firstCamp'(入学後、最初の合宿)
    reincarnationReveal: 'enrollment',
    twoWayReveal: 'enrollment',

    // ---- 初期能力 ----
    initialAbility: { mean: 30, sd: 8, min: 5, max: 65 },   // 本職側
    // 本職でない側(副能力):本職側の平均 × [coefMin, coefMax] + 乱数(sd)
    subAbility: { coefMin: 0.25, coefMax: 0.4, sd: 4, min: 1 },
    // 守備区分ごとの初期ボーナス(本職らしさ)
    positionBonus: {
      P: {},
      C: { arm: 6, defense: 6 },
      IF: { defense: 6, arm: 3 },
      OF: { speed: 6, arm: 3 },
    },
    // 二刀流:もう一方の側を、本職側と同じ生成 × subRatio で持つ
    twoWay: {
      subRatio: 0.8,
      bothShare: 0.7,              // 方針「両方」のとき、各側に回る成長ポイントの割合
      careerBonus: 6,              // 進路判定でのボーナス
      alwaysStartAsPitcher: true,  // 判明した二刀流は、適性に関係なくスタメンの投手の枠に優先して入る
    },

    // 転生の型:position の本職として生まれる。bonus を加算、allBonus は本職側の全能力に加算
    reincarnationTypes: {
      gouwan:   { name: '剛腕型', position: 'P',  allBonus: 6, bonus: { velocity: 28, stamina: 14 } },
      gikou:    { name: '技巧型', position: 'P',  allBonus: 6, bonus: { control: 25, breaking: 22 } },
      kyouken:  { name: '強肩型', position: 'C',  allBonus: 6, bonus: { arm: 28, defense: 14 } },
      kouda:    { name: '巧打型', position: 'IF', allBonus: 6, bonus: { contact: 28, defense: 10 } },
      kyouda:   { name: '強打型', position: 'OF', allBonus: 6, bonus: { power: 28, contact: 10 } },
      shunsoku: { name: '俊足型', position: 'OF', allBonus: 6, bonus: { speed: 28, arm: 10 } },
    },

    // ---- 合宿での成長(本職側のみ伸びる) ----
    camp: {
      outcomeRates: {
        normal: { big: 0.15, small: 0.50, none: 0.35 },
        genius: { big: 0.45, small: 0.40, none: 0.15 }, // 開花した天才のみ
      },
      points: {
        big:   [14, 22],
        small: [6, 11],
        none:  [0, 1],
      },
      geniusPointMult: 1.6,
      balancePointMult: 1.0,
      focusWeight: 1.0,            // 特化:選んだ能力
      otherWeight: 0.06,           // 特化:それ以外
      balanceWeight: 1.0,          // バランス:全能力
      efficiency: { pivot: 45, slope: 0.8, min: 0.6, max: 1.4 },
      softCap: { start: 88, mult: 0.5 },
    },
    // 副能力の側で出場した年は、年度末に副能力が少し伸びる(転向ボーナス。能力ごとの範囲)
    subRoleGrowth: [1, 4],

    // ---- 適性(能力から計算。全選手同じ式) ----
    aptitudeWeights: {
      P:  { velocity: 0.3, control: 0.3, stamina: 0.2, breaking: 0.2 },
      C:  { arm: 0.5, defense: 0.5 },
      IF: { defense: 0.6, arm: 0.4 },
      OF: { speed: 0.5, arm: 0.5 },
    },
    // 適性が threshold 未満の区分で出場すると、(threshold - 適性) × rate を減点
    lowAptitude: { threshold: 30, rate: 0.5 },

    // ---- コンバート(年度の始め) ----
    conversion: {
      minimum: { P: 2, C: 1, IF: 4, OF: 3 },   // これ未満なら不足
      maxPerYear: 3,               // 1年の提案回数の上限
      successBase: 0.55,           // 成功率 = successBase + (適性 - 30) × perAptitude
      perAptitude: 0.01,
      successMin: 0.2,
      successMax: 0.95,
      penaltyStart: 12,            // 転向直後の、その区分の適性への減点
      recoverPerYear: 6,           // 毎年度末に減点が戻る量
    },

    // ---- 副能力の判明 ----
    subReveal: { goodThreshold: 22 },          // 判明した側の平均がこれ以上なら「意外にも」の文面

    // ---- 助っ人 ----
    helper: { mean: 18, sd: 5, min: 5, max: 35 },

    // ---- スタメン・チームの強さ ----
    lineup: { P: 1, C: 1, IF: 4, OF: 3 },
    lineupOrder: ['C', 'P', 'IF', 'OF'],
    primaryBonus: 8,               // 編成時、本職の選手を優先するための加点(強さには影響しない)
    teamStrength: {
      pitchWeight: 0.35,           // 投手(投手系の適性)
      fieldWeight: 0.53,           // 野手8人の平均
      pitcherBatWeight: 0.12,      // 投手の打撃(軽く反映。二刀流ならここが大きくなる)
      fielderBat: 0.6,             // 野手の値 = 打撃 × fielderBat + 守備適性 × fielderDef
      fielderDef: 0.4,
      batWeights: { contact: 0.4, power: 0.4, speed: 0.2 },
      missingValue: 10,
    },
    // 投手のスタミナ不足の補正:(threshold - スタミナ) × (perGame × (試合目-1) + 接戦なら close)
    stamina: { threshold: 50, perGame: 0.05, close: 0.1, closeRange: 3 },

    // ---- 試合 ----
    match: {
      scale: 6,
      minWinRate: 0.03,
      maxWinRate: 0.97,
      loserRunsWeights: [18, 22, 18, 14, 10, 7, 5, 3, 2, 1],
      marginWeights: [30, 22, 16, 11, 8, 5, 4, 2, 1, 1],
    },

    // ---- 大会(簡易版。フェーズ2で本格的なトーナメントに置き換える) ----
    tournaments: {
      summer: { name: '夏の地区大会', rounds: 5, oppBase: 25, oppStep: 2.5, oppSd: 6 },
      autumn: { name: '秋の地区大会', rounds: 4, oppBase: 24, oppStep: 2.5, oppSd: 6 },
    },
    opponentNames: [
      '青葉台', '桜ヶ丘', '北斗学園', '南陵', '東雲', '西園寺学院', '若葉', '朝霧',
      '大河原', '星見台', '緑川', '白鷺', '黒潮', '紅陵', '翠嵐', '藤ノ森',
      '霞ヶ浦学園', '天満', '月島工業', '風見',
    ],

    // ---- 卒業後の進路 ----
    career: {
      overallWeight: 0.6,
      maxWeight: 0.4,
      noiseSd: 4,
      paths: [
        { min: 72, label: 'プロ入り(ドラフト指名)' },
        { min: 62, label: '強豪大学へ進学' },
        { min: 52, label: '社会人野球へ' },
        { min: 42, label: '大学で野球を続ける' },
        { min: -999, label: '野球は高校で区切り' },
      ],
      helperLabel: '元の部活に戻った',
    },
  };

  if (typeof module === 'object' && module.exports) module.exports = CONFIG;
  else root.CONFIG = CONFIG;
})(typeof self !== 'undefined' ? self : this);
