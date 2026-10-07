// =============================================================
// config.js : 確率・補正値などの設定をここに集約する
// 数値はすべて仮の値。sim.js の出力を見ながら調整すること。
// =============================================================
(function (root) {
  'use strict';

  const CONFIG = {
    // ---- 基本 ----
    schoolName: '白樺高校',        // 自校の名前(架空)
    newcomersPerYear: 5,           // 毎年の新入生の人数
    initialPlayersPerGrade: 5,     // ゲーム開始時にいる2年生・3年生の人数(学年ごと)
    pitcherRate: 0.35,             // 新入生が投手になる確率(転生の型で決まる場合を除く)
    saveKey: 'bbgacha_save_v1',    // localStorage のキー
    logLimit: 200,                 // 出来事ログの保存件数

    // ---- 隠れた才能 / 転生 ----
    talent: {
      geniusRate: 0.05,            // 天才の出現率
      reincarnationRate: 0.015,    // 転生の出現率(天才とは独立に抽選)
      geniusBustRate: 0.2,         // 天才なのに才能が開花しない確率(伸び方は通常と同じになる)
    },
    // 転生の型が判明するタイミング
    //   'enrollment' : 入学時の演出で判明する
    //   'firstCamp'  : 入学後、最初の合宿で判明する
    reincarnationReveal: 'enrollment',

    // ---- 初期能力 ----
    initialAbility: { mean: 30, sd: 8, min: 5, max: 65 },

    // 転生の型:position の能力に bonus を加算。allBonus は全能力に加算
    reincarnationTypes: {
      gouwan:   { name: '剛腕型', position: 'pitcher', allBonus: 6, bonus: { velocity: 28, stamina: 14 } },
      gikou:    { name: '技巧型', position: 'pitcher', allBonus: 6, bonus: { control: 25, breaking: 22 } },
      kouda:    { name: '巧打型', position: 'fielder', allBonus: 6, bonus: { contact: 28, defense: 10 } },
      kyouda:   { name: '強打型', position: 'fielder', allBonus: 6, bonus: { power: 28, contact: 10 } },
      shunsoku: { name: '俊足型', position: 'fielder', allBonus: 6, bonus: { speed: 28, defense: 14 } },
    },

    // ---- 合宿での成長 ----
    camp: {
      // 「大きく伸びる / 少し伸びる / 変わらない」の抽選確率
      outcomeRates: {
        normal: { big: 0.15, small: 0.50, none: 0.35 },
        genius: { big: 0.45, small: 0.40, none: 0.15 }, // 開花した天才のみ。不発の天才は normal を使う
      },
      // 結果ごとの成長ポイント(範囲内で一様乱数)
      points: {
        big:   [14, 22],
        small: [6, 11],
        none:  [0, 1],
      },
      geniusPointMult: 1.6,        // 開花した天才の成長ポイント倍率
      balancePointMult: 1.0,       // バランス方針の成長ポイント倍率
      // 育成方針の重み(成長ポイント1点ずつ、この重みで振り分ける)
      focusWeight: 1.0,            // 特化:選んだ能力
      otherWeight: 0.06,           // 特化:それ以外の能力(ほとんど伸びない)
      balanceWeight: 1.0,          // バランス:全能力
      // 「元々高い能力ほど伸ばす効率が良い」補正
      //   効率 = 1 + (現在値 - pivot) / 100 * slope  を [min, max] に収める
      efficiency: { pivot: 45, slope: 0.8, min: 0.6, max: 1.4 },
      // 上限付近の伸び鈍化:現在値が start 以上なら効率に mult を掛ける
      softCap: { start: 88, mult: 0.5 },
    },

    // ---- チームの強さ ----
    teamStrength: {
      lineupSize: 8,               // 主力野手の人数(投手を除く)
      fielderWeight: 0.6,          // 野手の比重
      pitcherWeight: 0.4,          // 投手の比重
      aceShare: 0.7,               // 投手のうちエースの比重(残りは2番手)
      missingValue: 15,            // 人数が足りないときの穴埋め値
    },

    // ---- 試合 ----
    match: {
      scale: 6,                    // 強さの差がこの値で勝率がおよそ 73% になる(ロジスティック)
      minWinRate: 0.03,
      maxWinRate: 0.97,
      // 敗者の得点の重み(添字 = 得点)
      loserRunsWeights: [18, 22, 18, 14, 10, 7, 5, 3, 2, 1],
      // 点差の重み(添字 + 1 = 点差)
      marginWeights: [30, 22, 16, 11, 8, 5, 4, 2, 1, 1],
    },

    // ---- 大会(フェーズ1の簡易版。フェーズ2で本格的なトーナメントに置き換える) ----
    tournaments: {
      summer: { name: '夏の地区大会', rounds: 5, oppBase: 28, oppStep: 2.5, oppSd: 6 },
      autumn: { name: '秋の地区大会', rounds: 4, oppBase: 25, oppStep: 2.5, oppSd: 6 },
    },
    // フェーズ1で対戦相手の名前に使う架空の学校名
    opponentNames: [
      '青葉台', '桜ヶ丘', '北斗学園', '南陵', '東雲', '西園寺学院', '若葉', '朝霧',
      '大河原', '星見台', '緑川', '白鷺', '黒潮', '紅陵', '翠嵐', '藤ノ森',
      '霞ヶ浦学園', '天満', '月島工業', '風見',
    ],

    // ---- 卒業後の進路 ----
    // score = 総合 * overallWeight + 最高能力 * maxWeight + 乱数(sd)
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
    },
  };

  if (typeof module === 'object' && module.exports) module.exports = CONFIG;
  else root.CONFIG = CONFIG;
})(typeof self !== 'undefined' ? self : this);
