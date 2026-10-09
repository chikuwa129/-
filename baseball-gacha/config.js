// =============================================================
// config.js : 確率・補正値などの設定をここに集約する
// 数値はすべて仮の値。sim.js の出力を見ながら調整すること。
// =============================================================
(function (root) {
  'use strict';

  const CONFIG = {
    // ---- 基本 ----
    schoolName: '白樺高校',        // 自校の名前(架空)
    // 保存キーは「ゲーム名_」で始める(リセットでまとめて消せるように)。
    //   ゲームのセーブ:bbgacha_v{saveVersion}_save / 調整画面:bbgacha_tune_*
    storagePrefix: 'bbgacha_',
    saveVersion: 10,                // セーブデータの形式。違うバージョンのセーブは初期化する
    logLimit: 300,                 // 出来事ログの保存件数

    // ---- カレンダー(4月始まり) ----
    // events には eventTypes のキーを並べる。行を足せば、新しいイベントを追加できる
    //   例:春の甲子園 → eventTypes に { kind: 'tournament', key: 'spring' } を足し、3月や4月の行に加える
    calendar: [
      { month: 4,  label: '4月',  events: ['enrollment'], note: '入学' },
      { month: 5,  label: '5月',  events: ['practiceGames'], note: '練習・練習試合' },
      { month: 6,  label: '6月',  events: ['summerCamp'], note: '夏合宿' },
      { month: 7,  label: '7月',  events: ['summerTournament'], note: '夏の地区大会' },
      { month: 8,  label: '8月',  events: ['practiceGames'], note: '練習・練習試合' },
      { month: 9,  label: '9月',  events: [], note: '練習' },
      { month: 10, label: '10月', events: ['autumnTournament'], note: '秋の地区大会' },
      { month: 11, label: '11月', events: ['practiceGames'], note: '練習・練習試合' },
      { month: 12, label: '12月', events: ['winterCamp'], note: '冬合宿' },
      { month: 1,  label: '1月',  events: [], note: '練習' },
      { month: 2,  label: '2月',  events: ['practiceGames'], note: '練習・練習試合' },
      { month: 3,  label: '3月',  events: ['yearEnd'], note: '年度末' },
    ],
    // イベントの種類。kind は logic.js の処理の種類(enrollment / practiceGames / camp / tournament / yearEnd)
    eventTypes: {
      enrollment:       { kind: 'enrollment', label: '入学' },
      practiceGames:    { kind: 'practiceGames', label: '練習試合' },
      summerCamp:       { kind: 'camp', label: '夏合宿', term: '夏' },
      winterCamp:       { kind: 'camp', label: '冬合宿', term: '冬' },
      summerTournament: { kind: 'tournament', key: 'summer', retireAfter: true },
      autumnTournament: { kind: 'tournament', key: 'autumn' },
      yearEnd:          { kind: 'yearEnd', label: '年度末' },
    },
    policyReviewMonths: [4, 12],   // 在校生の方針を見直せる月(4月は入学と同じ画面)
    // 「次のイベントまで」で止まるイベントの種類
    stopKinds: ['enrollment', 'camp', 'tournament', 'yearEnd'],
    // 重要度の高い通知が出た月でも止まる
    autoStop: { enabled: true, minImportance: 3 },

    // ---- 新入生の人数 ----
    // 人数 = base + (前年夏のチームの強さ - strengthPivot) * perStrength + 乱数(±noise)
    newcomers: {
      base: 6,
      strengthPivot: 50,
      perStrength: 0.3,
      noise: 1,
      min: 3,
      max: 12,
      rosterCap: 30,               // 部員の総数の上限(超える分は新入生を減らす)
    },

    // ---- 部員の構成の版(H1.5a) ----
    //   version:'v2'(評判に連動した新入生の人数・守備区分の構成・天才の初期値)/ 'legacy'(H1.4 までと完全に同じ)
    //   'v2' のとき、overlay の値で、この設定の同じ場所を上書きする(logic.js の読み込み時に1回だけ)
    //   node では、環境変数 BBGACHA_ROSTER=legacy で、一時的に 'legacy' にできる(テスト用)
    roster: {
      version: 'v2',
      v2: {
        // 新入生の人数の平均:評判 − baseline(reputation.baseline)ごとの点を、直線でつなぐ。基準以下は最小
        countBands: [[0, 8.5], [15, 13], [30, 18.5], [45, 23]],
        countNoise: 1,               // ±の一様な整数
        countMin: 8,
        countMax: 24,
        // 新入生の守備区分の構成(目標の割合。区分ごとの人数を先に決める。±classNoise 人のばらつき)
        classShare: { P: 0.28, C: 0.08, IF: 0.32, OF: 0.32 },
        classNoise: 1,
        minPerClass: { P: 2, C: 1, IF: 0, OF: 0 },
        overlay: {
          saveVersion: 11,             // 育成監督モードの保存(部員の構成が変わるため。legacy は 10 のまま)
          heroMode: { stamina: { base: 4.0 }, pitching: { reliefMax: 3 }, substitute: { enabled: true }, awakening: { enabled: true }, rival: { display: false } },   // H1.5b:先発の投球回の基準と、救援の複数化(新入部員モードだけで使う値。legacy は 3.7 と 1)
          newcomers: { rosterCap: 45 },
          rating: { genius: { min: 200, max: 300 }, reincarnation: { min: 250, max: 350 }, geniusReincarnationMax: 350 },
          tournaments: { summer: { oppBase: 46 }, autumn: { oppBase: 37 } },
          targets: {
            geniusGrad: { min: 500, max: 540 },
            reincGrad: { min: 540, max: 580 },
            bothGrad: { min: 580, max: 670 },
            over600: { max: 0.02 },
          },
        },
      },
    },

    // ---- 守備区分 ----
    positionRates: { P: 0.22, C: 0.12, IF: 0.36, OF: 0.30 },
    positionDeficit: {
      P:  { min: 2, mult: 2.5 },
      C:  { min: 1, mult: 3.0 },
      IF: { min: 6, mult: 1.5 },   // 1.6z:4 → 6(3年生の引退後に内野の本職が足りず、本職外起用が増えるため)
      OF: { min: 4, mult: 1.5 },   // 1.6z:3 → 4(同上)
    },
    initialComposition: { P: [2, 3], C: [1, 2], IF: [4, 5], OF: [3, 4] },

    // ---- 隠れた才能 / 転生 / 二刀流 ----
    talent: {
      geniusRate: 0.05,
      reincarnationRate: 0.015,
      twoWayRate: 0.003,
      geniusBustRate: 0.2,         // 開花しない天才は、通常と同じ扱い(項目上限100・成長限界あり)
    },
    reincarnationReveal: 'enrollment',
    twoWayReveal: 'enrollment',

    // ---- 総合値と、初期能力のスケール ----
    // 総合値 = 本職側の見える能力の平均 × ratingMultiplier(整数に丸める。上限なし)
    ratingMultiplier: 5,
    // 総合値の横に出すラベル(上から順に判定)
    // ラベルは「世代の基準」(benchmark.js)と比べた「同世代の上位○%」で決める(表示だけに使う)
    labelTop: { beyond: 0.1, monster: 1, excellent: 3, promising: 10 },
    // 世代の基準の作り方(node tools/build-benchmark.js)
    baselineCoachLv: 3,            // 標準的な学校の指導力(変化させない)
    benchmarkRuns: { seeds: 20, years: 50, burnIn: 3 },
    // 能力の項目上限
    statCap: { normal: 100, special: 150 },     // special = 開花した天才 または 転生
    // 100を超えた分の寄与の割引(試合の勝率・チームの強さ・成績の確率)
    overCapWeight: 0.5,
    // 新入生の初期の総合値
    rating: {
      normal: { mean: 100, sd: 9, min: 80, max: 120, highRate: 0.15, highMin: 120, highMax: 160 },
      genius: { min: 150, max: 250 },
      reincarnation: { min: 200, max: 300 },
      geniusReincarnationMax: 300,
      keySd: 4,                    // 項目ごとのばらつき(能力値)
      itemMax: 95,                 // 初期の1項目の上限
      min: 1,
    },
    // 本職でない側(副能力):本職側の平均 × [coefMin, coefMax] + 乱数(sd)
    subAbility: { coefMin: 0.25, coefMax: 0.4, sd: 2, min: 1 },
    // 守備区分ごとの得意項目(初期能力の偏り。総合値は変えずに配分だけ寄せる)
    positionBonus: {
      P: {},
      C: { arm: 4, defense: 4 },
      IF: { defense: 4, arm: 2 },
      OF: { speed: 4, arm: 2 },
    },
    twoWay: {
      subRatio: 0.8,
      bothShare: 0.7,
      alwaysStartAsPitcher: true,
    },
    // 転生の型:position の本職として生まれる。bonus の項目に初期能力を寄せる(総合値は変えない)
    reincarnationTypes: {
      gouwan:   { name: '剛腕型', position: 'P',  bonus: { velocity: 22, stamina: 10 } },
      gikou:    { name: '技巧型', position: 'P',  bonus: { control: 18, breaking: 16 } },
      kyouken:  { name: '強肩型', position: 'C',  bonus: { arm: 22, defense: 10 } },
      kouda:    { name: '巧打型', position: 'IF', bonus: { contact: 22, defense: 8 } },
      kyouda:   { name: '強打型', position: 'OF', bonus: { power: 22, contact: 8 } },
      shunsoku: { name: '俊足型', position: 'OF', bonus: { speed: 22, arm: 8 } },
    },

    // ---- 成長 ----
    growth: {
      // 育成方針の重み(成長を振り分ける)
      focusWeight: 1.0,
      otherWeight: 0.12,
      balanceWeight: 1.0,
      // 「元々高い能力ほど伸びやすい」補正:効率 = 1 + (現在値 - pivot) / 100 * slope を [min, max] に
      efficiency: { pivot: 40, slope: 0.6, min: 0.7, max: 1.3 },
      chunk: 1.5,                  // 成長を振り分ける単位(能力値)
      // 才能による成長の倍率(全ての成長に掛かる)
      talentMult: { genius: 1.42, reincarnation: 1.6, both: 1.75 },

      // (1) 練習による成長(毎月)
      monthly: {
        chance: 0.35,
        amount: [3.6, 8.0],        // 1回の成長量(能力値の合計)
        retiredMult: 0.5,          // 引退後の3年生の成長確率の倍率
        // 季節の補正(月ごと、項目ごとの伸びやすさ)
        season: {
          4:  { contact: 1.3, control: 1.3 },
          5:  { contact: 1.3, control: 1.3 },
          12: { power: 1.3, stamina: 1.3 },
          1:  { power: 1.3, stamina: 1.3 },
          2:  { power: 1.3, stamina: 1.3 },
        },
      },

      // (2) 合宿による成長
      camp: {
        outcomeRates: {
          normal: { big: 0.15, small: 0.50, none: 0.35 },
          genius: { big: 0.45, small: 0.40, none: 0.15 },
        },
        points: { big: [13, 22], small: [5, 9], none: [0, 0.5] },
      },

      // (3) 試合経験値による成長
      exp: {
        starter: 2,                // スタメンで出場
        bench: 0.25,               // ベンチ入りのみ(仕様の仮値 0.5 から調整)
        benchSize: 11,             // ベンチ入りの人数(スタメン以外)
        practiceStarter: 2,        // 練習試合でスタメン
        practiceSub: 0.5,          // 練習試合で出場した控え(仕様の仮値 1 から調整)
        winMult: 1.5,
        tournamentMult: [1.5, 2.0],   // 大会の1回戦 → 決勝(上の段階ほど高い)
        strongerMult: 1.3,         // 相手が格上(強さの差 > margin)
        weakerMult: 0.7,           // 相手が格下
        margin: 3,
        maxMult: 3,                // 倍率を掛け合わせた上限
        consumeRate: 0.5,          // 毎月、貯まった経験値のこの割合を成長に変換
        carryMax: 30,              // 持ち越せる経験値の上限
        growthPerExp: 1.9,        // 消費した経験値1あたりの成長量(能力値)
        capVsPractice: 3,          // 試合経験値による成長は、練習による成長(期待値)の最大この倍
      },

      // (4) 成長限界(通常の選手・開花しない天才)
      limit: {
        mean: 350, sd: 30, min: 290, max: 430,   // 総合値換算
        rareRate: 0.03, rareMin: 440, rareMax: 480,
        focusBonus: 15,            // 特化した項目の実効上限 = 平均 + focusBonus(最大100)
        jitter: 4,                 // 項目ごとの実効上限のばらつき
        zone: 14,                  // 実効上限のこの手前から成長が鈍る(能力値)
        cappedRatio: 0.94,         // 総合値が限界のこの割合以上で「頭打ち」
      },
      // 天才・転生(成長限界なし):100までは緩やかに、100を超えると強く鈍る
      special: {
        solo: { soft: 0.35, hardExp: 1.6 },
        both: { soft: 0.2, hardExp: 1.2 },   // 天才かつ転生
      },
    },
    // 副能力の側で出場した年は、年度末に副能力が少し伸びる(転向ボーナス。能力ごとの範囲)
    subRoleGrowth: [1, 4],

    // ---- (5) 指導力 ----
    leadership: {
      maxLv: 10,
      needPerLv: 1.5,                // Lv n → n+1 に必要な経験値 = needPerLv × n(小数は切り上げ)
      gains: { champion: 3, runnerUp: 2, best4: 1, pro: 2 },
      monthlyMultMax: 1.4,         // Lv10 での月ごとの成長確率の倍率(Lv1 で 1.0)
      campBigBonusMax: 0.10,       // Lv10 での合宿「大きく伸びる」確率の加算
    },

    // ---- (6) 限界突破 ----
    limitBreak: {
      threshold: 0.95,             // 総合値が成長限界のこの割合以上の選手が対象
      chance: 0.015,               // 毎月の確率
      bigWinBonus: 0.03,           // 決勝以上の試合に出て勝った月の加算
      leadershipLv: 7,
      leadershipBonus: 0.01,       // 指導力がこのLv以上のときの加算
      maxTimes: 2,
      gain: [20, 40],              // 成長限界の上昇(総合値換算)
      texts: [
        '{n}が壁を破った!',
        '{n}、限界の先へ。何かをつかんだようだ。',
        '{n}の目の色が変わった。止まっていた成長が再び動き出す。',
        '{n}が殻を破った。周りが驚くほどの変化だ。',
      ],
    },

    // ---- 練習試合 ----
    practiceGames: {
      perMonth: 3,
      subShare: 0.5,               // 控えのうち出場する割合
      includeInStats: false,       // 打率などの成績に含めるか
      oppMean: 46, oppSd: 7,       // 相手校の強さ(大会の相手と同じ尺度)
    },

    // ---- 在校生の方針見直し ----
    // (変更に代償はない。変更は選手詳細の履歴に残る)

    // ---- 適性(能力から計算。全選手同じ式) ----
    aptitudeWeights: {
      P:  { velocity: 0.3, control: 0.3, stamina: 0.2, breaking: 0.2 },
      C:  { arm: 0.5, defense: 0.5 },
      IF: { defense: 0.6, arm: 0.4 },
      OF: { speed: 0.5, arm: 0.5 },
    },
    lowAptitude: { threshold: 12, rate: 0.5 },

    // ---- コンバート(年度の始め) ----
    conversion: {
      minimum: { P: 2, C: 1, IF: 4, OF: 3 },
      maxPerYear: 3,
      successBase: 0.55,           // 成功率 = successBase + (適性 - pivot) × perAptitude
      pivot: 20,
      perAptitude: 0.01,
      successMin: 0.2,
      successMax: 0.95,
      penaltyStart: 12,
      recoverPerYear: 6,
    },

    subReveal: { goodThreshold: 12 },

    // ---- 助っ人(総合値) ----
    helper: { mean: 70, sd: 8, min: 50, max: 90 },

    // ---- スタメン・チームの強さ ----
    lineup: { P: 1, C: 1, IF: 4, OF: 3 },
    lineupOrder: ['C', 'P', 'IF', 'OF'],
    offPositionStarGap: 0,         // 控えの選手の総合値が、枠の本職の選手よりこれ以上高ければ本職外で起用してよい(0 = 無効)
    homeSummaryPosition: 'bottom', // ホームの月のまとめの位置('bottom' 下 / 'top' 上。表示だけ)
    teamStrength: {
      pitchWeight: 0.35,
      fieldWeight: 0.53,
      pitcherBatWeight: 0.12,
      fielderBat: 0.6,
      fielderDef: 0.4,
      batWeights: { contact: 0.4, power: 0.4, speed: 0.2 },
      missingValue: 8,
    },
    stamina: { threshold: 35, perGame: 0.05, close: 0.1, closeRange: 3 },

    // ---- 打順 ----
    battingOrder: {
      pickSequence: [9, 3, 4, 1, 2],
      weights: {
        1: { speed: 0.5, contact: 0.5 },
        2: { contact: 1 },
        3: { contact: 0.4, power: 0.4, speed: 0.2 },
        4: { power: 1 },
      },
    },

    // ---- 簡易成績(成績専用の乱数を使う) ----
    stats: {
      paFirst: 4.5,
      paLast: 3.5,
      walkRate: 0.08,
      hit: { base: 0.27, pivot: 45, perContact: 0.0032, perPower: 0.0009, perSpeed: 0.0009, min: 0.08, max: 0.45 },
      homeRun: { base: 0.06, pivot: 45, perPower: 0.0028, min: 0.0, max: 0.35 },
      strikeout: { base: 0.25, pivot: 45, perContact: 0.0035, min: 0.05, max: 0.6 },
      rbiOnHit: 0.3,
      rbiOnOut: 0.03,
      homeRunRunners: [55, 30, 12, 3],
      cleanupRbiBonus: 0.08,
      innings: 9,
      earnedRate: 0.85,
      // 名鑑の「3割打者」の判定に必要な通算打数。
      // 今は大会が年6試合ほどで通算100打数に届かないため30にしている。
      // フェーズ2以降で甲子園などの試合が増えたら、100に戻すこと。
      minAtBatsForAverage: 30,
    },

    // ---- 注目選手と通知 ----
    watch: { max: 5 },
    // 通知の重要度:1=小さな出来事 / 2=通常 / 3=大きな出来事 / 4=年表に載る出来事
    //   minImportance 以上なら通知する。注目選手は重要度に関わらず通知する(addEvent)
    notify: {
      minImportance: 3,
      monthMax: 5,                 // 1か月に表示する通知の上限(超えた分は「ほか○件」)
      hitMilestones: [1, 10, 20, 30, 50],
      homeRunMilestones: [1, 3, 5, 10],
      winMilestones: [1, 5, 10],
    },
    growthTopN: 3,

    // ---- 前史(新規ゲームの開始時に、過去の数年を通常のルールで内部シミュレーションする) ----
    //   残った2・3年生と評判を1年目4月に持ち越す。前史専用の乱数を使い、本編の乱数には影響しない
    preHistory: { years: 4, seedSalt: 0x7a3c19e5 },   // 仕様の仮値は3年。3年だと開始時の上級生が少なく弱くなるため4年

    // ---- 学校の評判と新入生の質 ----
    //   評判(0〜100)= 評判 ×(1 − rate)+ 今年の得点 × rate(毎年3月)
    //   今年の得点 = 大会点(夏・秋の勝ち上がりの平均 × tourneyMax)+ プロ入り点(1人 proPer、上限 proMax)+ 指導力点(Lv × leadPerLv、上限 leadMax)
    //   影響度 x = (評判 − baseline) ÷ (100 − baseline) を 0〜1 に収める。新入生の抽選にだけ効く
    reputation: {
      baseline: 40,
      rate: 0.25,
      tourneyMax: 60,
      proPer: 7,
      proMax: 20,
      leadPerLv: 2,
      leadMax: 20,
      topShareBase: 0.15,          // x = 0 のとき、通常の新入生が上位層(総合値120〜160)になる割合
      topShareMax: 0.36,           // x = 1 のときの上位層の割合
      talentRateMaxMult: 1.9,      // x = 1 のときの、天才・転生の出現率の倍率
      trend: [0.15, 0.5, 0.8],     // 入学画面の「新入生の傾向」:並 / やや良 / 良 / 非常に良 の境目(x)
    },

    // ---- 表示(テンポ優先。詳しい内容は折りたたみ) ----
    display: {
      defaultLevel: 'min',         // 表示の詳しさの初期値:'min' 最小 / 'std' 標準 / 'full' 詳細
      // 「標準」で開くパネル(折りたたみのキーの先頭部分)
      panelDefaults: { std: ['power', 'month', 'yearSum', 'tune-params'] },
      wallRatio: 0.95,             // 能力の詳細で、実効上限のこの割合以上の項目に「壁」を付ける
      growthTopN: 10,              // 成長タブの初期表示の人数(変化が大きい順)
    },
    // ---- 方針の見直し画面 ----
    policyScreen: {
      strongWeight: 0.8,           // 方針の重みがこれ以上の項目に ◎(伸びやすい)
      midWeight: 0.3,              // これ以上の項目に ○
    },
    reviewShowStats: true,         // 見直し画面に「項目別の現在値の1行」を出す(表示だけ)
    policyOptionHints: false,      // 方針の選択肢に、伸びやすい項目(◎○)を併記する(表示だけ)
    policyControlEnabled: false,   // 方針の選択(入学時のプルダウン・12月の見直し画面)を遊ぶ画面に出すか。false は常におまかせ(画面の切り替えだけ)

    // ---- 新入部員モード(hero.html / play-hero.html)。数値はすべて仮の値。育成監督モードでは使わない ----
    heroMode: {
      saveVersion: 12,              // H1.7 で 12:覚醒の前後の値(演出用)。H1.6b で 11:覚醒。保存キー bbgacha_hero_v{saveVersion}_*(H1.1 で 2、H1.2 で 3、H1.4 で 4、H1.3b で 5、H1.4b で 6:卒業待ち、H1.5a で 7:ピックアップ、H1.4c で 8:月ごとのスタメン、H1.5b で 9:救援、H1.6a で 10:途中出場)
      seedSalt: 0x4e52b1d3,         // このモード専用の乱数(引き直し・主人公の作成・物語の文面・転向と再起の抽選)
      rerollMax: 2,                 // 新入部員の一覧の引き直しの回数
      stopOnStory: true,            // 主人公の山場の物語で、自動進行を止める
      stopsPerYearMax: 12,          // 1年あたりの止まる回数の目安(超えたら、物語では止めない)
      setbackMax: 2,                // 挫折の物語(奪われた・控えが続く・転向の失敗)の3年間の上限
      create: {
        typeBias: [15, 25],         // 得意項目は、平均より +15〜+25
        levels: { low: [80, 95], mid: [95, 110], high: [110, 125] },     // レベル感ごとの初期の総合値
        twoWayLevels: { low: [75, 88], mid: [88, 100] },                 // 二刀流の投手側・野手側それぞれ(75〜100 の中で分けた)
        geniusGrowthRatio: 0.8,     // 作った天才の成長の倍率(既存の天才の倍率に掛ける)
        itemMin: 5,                 // 作るときの1項目の下限
      },
      twoWay: {
        batWeightInPitcherSlot: 0.20,   // 投手枠の評価値 = 投手側の総合値 + 野手側の総合値 × これ
      },
      rival: {
        candidateCount: 5,          // ライバルを選び直す一覧の人数
        // 自動のライバルの選び方:'chaseable'(主人公より少し上の、追える相手)/ 'strongest'(H1.3 までの方式。同じ守備区分で最も強い選手)
        selectMode: 'chaseable',
        minGap: 5,                  // 'chaseable':主人公との総合値の差がこれ未満の相手は外す(ほぼ同じ強さでは追う実感が出にくい)
        maxGap: 120,                // 'chaseable':差がこれを超えても選ぶが、選ばれた理由に「差は大きい」と添える
        revealAtGraduation: true,   // 卒業のときに、ライバルの素質を明かす
        swapMonths: 2,              // 総合値の順位の入れ替わりを、物語にするまでの連続の月数
        display: true,              // ライバルを画面と文面に出す(H1.6b。内部のライバルは残す)。roster.version 'v2' では overlay で false
      },
      contest: {
        swapStoryGap: 3,            // 「奪った・奪われた」の物語の最短間隔(月)
        benchStory: [3, 6],         // 「控えが続く」の物語を出す連続の月数
        switchPerYear: 2,           // 役割の切り替えの物語の、1年あたりの上限
      },
      convert: {
        benchMonths: 4,             // 連続して控えの月数がこれ以上
        aptitudeRatio: 0.85,        // 他の区分の適性が、今の区分の適性のこの倍率以上
        probability: 0.35,          // 条件を満たした月ごとの発生確率
        maxPerRun: 1,               // 3年間の上限
        settleMonths: 12,           // 「慣れてきた」を出せる期間(転向後の月数)
        settleStories: 2,           // 「慣れてきた」の上限
        settleAptGain: 4,           // 転向時より適性がこれだけ上がったら「慣れてきた」
      },
      rebound: {
        windowMonths: 6,            // 挫折から再起を待つ期間(月)
        campBonus: 0.10,            // 再起のあと最初の合宿で「大きく伸びる」に加える確率
        maxBoosts: 2,               // 後押しの3年間の上限
      },
      // 数値の見せ方(パワプロ式。表示だけ。能力の内部の値と計算は変えない)
      display: {
        style: 'pawapuro',          // 'pawapuro'(ランク文字・km/h・球種)/ 'plain'(大きな数字のボックス)
        rank: { S: 100, A: 80, B: 65, C: 50, D: 35, E: 20, F: 10 },   // これ以上でそのランク(F未満は G)
        kmh: { base: 112, per: 0.45, overBase: 157, overPer: 0.1, max: 170 },   // 球速の換算(100以下:base + 値×per / 100超:overBase + (値−100)×overPer)。仕様の仮値 110 / 0.5 / 160 から調整(天才・転生の上位を150km/h台に)
        breakRatio: 0.12,           // 総変化量 = round(変化球の値 × これ)
        newPitchRate: 0.35,         // 総変化量が増えたとき、新しい球種を覚える確率
        maxPitches: 4,              // 球種の数の上限
        pitchMax: 7,                // 1球種の変化量の上限
      },
      // 練習試合で途中出場したときの、主人公の成績の抽選(成績用の乱数。大会の通算には含めない)
      practiceSub: { paMin: 1, paExtraRate: 0.5, reliefInnings: 1, reliefRunRate: 0.3 },
      watchMax: 2,                  // 気になる選手の上限(主人公とライバルは別枠)
      entranceMax: 8,               // 入口で大きなカードで出す新入生(ピックアップ)の最大人数(roster.version 'v2' のとき)
      entrancePickTop: 5,           // ピックアップのうち、総合値の上位から選ぶ人数(残りは無作為)
      ui: { progressBar: 'bottom' },
      // 演出(H1.7。見た目だけ。勝敗・能力・進路・成績・乱数は変えない)。すべて仮の値
      fx: {
        enabled: true,              // false で、H1.6b と同じ見た目(演出なし)
        entry: {
          stepSec: 0.3,             // 入口:新入生のカードが1人ずつ出る間隔(秒)
          totalMaxSec: 3,           // 入口:演出の総時間の上限(秒。人数が多いときは間隔を縮める)
          cardSec: 0.45,            // 入口:1枚のカードが現れる時間(秒)
          rerollScale: 0.5,         // 引き直しの演出の速さの倍率(間隔・総時間に掛ける。1.0 で最初と同じ)
          flashSec: 0.5,            // 怪物級以上が出たときの、画面全体の白い光の時間(秒)
          glow: { promising: 8, excellent: 14, monster: 22, hint: 12 },   // 光の強さ(ぼかしの px)
        },
        awaken: {
          stepSec: 0.35,            // 覚醒:上がった項目の数字が、順に上がり始める間隔(秒)
          countSec: 0.8,            // 覚醒:1項目の数字が旧い値から新しい値へ上がる時間(秒)
          introSec: 1.2,            // 覚醒:暗転から「覚醒」の文字までの時間(秒)
          heads: ['眠っていた力が、目を覚ました。', '何かが弾けた。もう、昨日までの{n}ではない。', '{n}の中で、殻が割れる音がした。', '別人のような動き。{n}が覚醒した。', '誰も止められない。{n}が、一段上へ跳んだ。', 'この瞬間を、{n}は一生忘れないだろう。'],
          hintYes: ['あの一言は、本物だった。', '入学の日の予感は、当たっていた。', '最初に感じた気配は、これだったのだ。', 'ヒントは、ずっとそこにあった。', '見抜いていた目は、正しかった。', '「底が見えない」――その答えが、今出た。'],
          hintNo: ['誰も、気づかなかった。', '入学のとき、この覚醒を予想した者はいない。', '何の気配もなかった。だからこそ、驚きは大きい。', '予兆なしの覚醒。本人がいちばん驚いている。', '見落とされていた才能が、自分で扉を開けた。', 'ヒントは、どこにもなかった。それでも、彼は跳んだ。'],
        },
      },   // 進行ボタンのバー:'bottom' 下に固定 / 'top' 上に固定 / 'inline' 固定しない(H1.4b の表示)
      newYearOthersOpen: 5,         // 新年度の画面:上位3人以外の新入生がこの人数を超えたら、折りたたみにする
      // 途中出場(代打・代走・守備固め)と盗塁(H1.6a)。試合結果のあとに、個人の起用と成績を割り当てる層。すべて仮の値
      substitute: {
        enabled: false,             // false で、H1.5b と完全に同じ。roster.version 'v2' では overlay で true(既定は有効。legacy は H1.4b のまま)
        expMult: 0.25,              // 途中出場の試合経験値(スタメンの何倍か)
        phChance: 0.35, phProb: 0.7, phMargin: 5, phMax: 2,     // 代打:得点のない終盤の回で走者がいる確率 / 起用の確率 / 打者よりミート・パワーが何以上高いか / 1試合の上限
        prDiff: 1, prProb: 0.6, prMargin: 10, prMax: 1,           // 代走:点差がこれ以内 / 起用の確率 / 走者より走力が何以上高いか / 1試合の上限(仕様の仮値2。1人に絞る)
        defLead: 3, defProb: 0.7, defMargin: 8, defMax: 2,        // 守備固め:リードがこれ以内 / 起用の確率 / 適性が何以上高いか / 1試合の上限
        sbPivot: 50, sbTryBase: 0.08, sbTryPer: 0.004, sbTryMax: 0.45,   // 盗塁の試行(塁に出たとき)= base + (走力 − pivot) × per
        sbOkBase: 0.65, sbOkPer: 0.006, sbOkMin: 0.3, sbOkMax: 0.95,     // 盗塁の成功率
        clutchHits: 3,              // 「代打の切り札」のひとこと:代打の安打数がこの回数に達したとき(1回だけ)
      },
      // 覚醒とヒント(H1.6b)。自校の部員が、ある月に急に伸びる。入学時に「覚醒の素質」(隠れた値)を抽選し、ヒントの一言を出す。すべて仮の値
      awakening: {
        enabled: false,             // false で、H1.6a-fix1 と同じ。roster.version 'v2' では overlay で true
        countWeights: [30, 50, 20], // 年度ごとの覚醒の人数(学校全体)0人 / 1人 / 2人 の重み
        talentRate: 0.10,           // 覚醒の素質がある選手の割合
        talentWeight: 15,           // 素質がある選手の、覚醒の抽選の重み(素質なしは1)
        hintRateTalent: 0.8,        // 素質がある選手に、ヒントが出る割合
        hintRateNone: 0.03,         // 素質がない選手に、ヒントが出る割合(外れ)
        gainMin: 6, gainMax: 14,    // 覚醒で伸びる量(各能力)
        kmhMin: 3, kmhMax: 7,       // 球速は km/h で(内部の値に換算して足す)
        brkGain: 1,                 // 変化球は、総変化量で
        detailMax: 3,               // ひとことに書く項目の数(伸びの大きい順。残りは「ほか○項目」)
        hints: ['どこか底が見えない。', 'ふとした瞬間に、目を引く。', 'まだ何かを隠している気がする。', '時々、別人のような動きをする。', '伸びしろの見当がつかない。', '本人も、自分の力に気づいていない様子だ。'],
      },
      totals: { minAb: 20, minOuts: 27 },   // 卒業の通算成績:打数・アウト数がこれ未満なら「参考」と添える
      // スタメン表・部員名簿の指標と、主人公の打順の変化のひとこと
      lineup: {
        minAb: 20,                  // スタメン表の打率:打数がこれ未満なら薄い文字(参考値)
        orderChangeMin: 2,          // 打順がこれ以上動いた月だけ、ひとことにする
        orderChangeMax: 3,          // 打順の変化のひとことの、1年あたりの上限
        reasonMonths: 3,            // 打順が上がった理由(打撃の能力のランクの上昇)を、記録で確かめる期間(か月)
      },
      // 先発の投球回(このモードの成績だけ。得点・勝敗は変えない)
      stamina: {
        enabled: true,              // false で、従来どおり先発はすべて完投として記録(テスト用)
        base: 3.7,                  // 投球回の基準 = base + スタミナ ÷ perPoint(minInnings〜9)。仕様の仮値 3.5 から調整。roster.version 'v2' では overlay で 4.0(H1.5b。スタミナ20〜50の平均を5回以上に)
        perPoint: 15,
        minInnings: 3,
        finalBonus: true,           // 決勝では、スタミナが B 以上の投手を +1回
      },
      // 先発の能力を失点に効かせる(このモードだけ。勝敗と自校の得点は変えない。成績用の乱数を使う)
      //   ずらす量 d = coef × (P − refStrength) ÷ 100 ± noise(一様)。P は先発の投手側の総合値(100超は overCapWeight で割引)
      //   d × 先発の投球回 ÷ 9 を、±maxShift で抑えて四捨五入。勝った試合は 0〜得点−1、負けた試合は 得点+1 以上に収める
      pitching: {
        enabled: true,              // false で、H1.2 までと同じ失点(テスト用)
        coef: 1.3,                  // 仮の値(hero-sim の防御率の目安に合わせて 1.0 から調整)
        refStrength: 410,           // この総合値の先発では、平均して失点は変わらない。仕様の仮値 300 から調整(係数1つで、弱い先発の失点を増やし、強い先発を下げすぎないため)
        noise: 1.5,                 // ばらつき(±の一様乱数)。0.5 から調整(強い先発でも打ち込まれる日を残す)
        maxShift: 3.0,              // ずらす点数の絶対値の上限
        reliefMax: 1,               // 救援の最大人数(H1.5b)。roster.version 'v2' では overlay で 3。1 で、救援は1人(H1.5a と同じ)
        reliefBase: 150,            // 大会の救援の抽選の重み = 総合値 + reliefBase(低い投手も選ばれる)
      },
      story: {
        bigMonthGain: 6,            // 「成長が大きい月」の総合値の増分
        bigMonthGap: 2,             // 「成長が大きい月」の物語の最短間隔(月。毎月続かないように)。H1.1 で 3 → 2(卒業が夏になり止まる回数が減ったため)
        recentNoRepeat: 3,          // 同じ文を繰り返さない直近の回数
      },
      // tools/hero-sim.js の目安(遊ぶ画面には出さない)
      targets: {
        created_vs_normal: { max: 0.15, label: '作った凡人(高め)の卒業時の平均 / 引きの通常の平均 − 1', pct: true, tune: 'heroMode.create.levels.high / heroMode.create.typeBias' },
        created_vs_genius: { max: 0.85, label: '作った天才の卒業時の平均 / 引きの天才(開花)の平均', tune: 'heroMode.create.geniusGrowthRatio' },
        created_vs_twoway: { max: 0.90, label: '作った二刀流の卒業時の平均 / 引きの二刀流の平均', tune: 'heroMode.create.twoWayLevels' },
        stopsPerYear: { min: 6, max: 12, label: '山場の物語で止まる回数(1年あたり)', tune: 'heroMode.stopOnStory / heroMode.stopsPerYearMax' },
        contestP: { min: 0.50, label: 'ポジション争いが成立した割合(投手)', pct: true, tune: 'heroMode.twoWay.batWeightInPitcherSlot' },
        contestIF: { min: 0.10, max: 0.55, label: 'ポジション争いが成立した割合(内野)', pct: true, tune: 'lineup.IF / positionDeficit' },
        ipLow: { max: 5.0, label: '先発の平均投球回(スタミナ20未満)', tune: 'heroMode.stamina.base / perPoint' },
        cgLow: { max: 0.05, label: '完投率(スタミナ20未満)', pct: true, tune: 'heroMode.stamina.base / perPoint' },
        ipMid: { min: 5.0, max: 7.5, label: '先発の平均投球回(スタミナ20〜50)', tune: 'heroMode.stamina.base / perPoint' },
        ipHigh: { min: 8.0, label: '先発の平均投球回(スタミナ70以上)', tune: 'heroMode.stamina.base / perPoint' },
        cgHigh: { min: 0.40, label: '完投率(スタミナ70以上)', pct: true, tune: 'heroMode.stamina.base / perPoint / finalBonus' },
        rankUps: { min: 6, max: 20, label: '主人公のランクアップの回数(3年間)', tune: 'heroMode.display.rank' },
        newPitches: { min: 0, max: 3, label: '投手の主人公が覚えた新球種(3年間)', tune: 'heroMode.display.newPitchRate / breakRatio' },
        contestOF: { min: 0.20, max: 0.60, label: 'ポジション争いが成立した割合(外野)', pct: true, tune: 'lineup.OF / positionDeficit' },
        contestC: { min: 0.20, max: 0.60, label: 'ポジション争いが成立した割合(捕手)', pct: true, tune: 'positionDeficit.C' },
        lostBench: { min: 0.20, max: 0.50, label: '争いに敗れて控えが続いた割合(争い成立のうち)', pct: true, tune: 'heroMode.contest.benchStory' },
        converted: { min: 0.05, max: 0.20, label: '転向が発生した割合', pct: true, tune: 'heroMode.convert.probability / benchMonths' },
        reboundShare: { min: 0.60, label: '挫折のうち、再起の物語が出た割合', pct: true, tune: 'heroMode.rebound.windowMonths' },
        setbackOver: { max: 0, label: '挫折の物語が3年間で2回を超えた主人公の数', tune: 'heroMode.setbackMax' },
        badShare: { max: 0.20, label: '悪い物語(挫折・転向の失敗)が物語全体に占める割合', pct: true, tune: 'heroMode.setbackMax' },
        era1: { min: 5.0, max: 5.8, label: '大会の先発の防御率(総合値〜150)', tune: 'heroMode.pitching.coef / refStrength' },
        era2: { min: 4.0, max: 4.8, label: '大会の先発の防御率(総合値150〜250)', tune: 'heroMode.pitching.coef / refStrength' },
        era3: { min: 3.0, max: 3.8, label: '大会の先発の防御率(総合値250〜350)', tune: 'heroMode.pitching.coef / refStrength' },
        era4: { min: 2.2, max: 3.0, label: '大会の先発の防御率(総合値350〜450)', tune: 'heroMode.pitching.coef / refStrength' },
        era5: { min: 1.5, max: 2.2, label: '大会の先発の防御率(総合値450以上)', tune: 'heroMode.pitching.coef / maxShift' },
        aceBadYear: { max: 0.005, label: '総合値450以上の先発:年度の大会防御率が5.63以上の割合', pct: true, tune: 'heroMode.pitching.coef / noise' },
        aceTwo12: { max: 0.008, label: '総合値450以上の先発:大会の2試合で合計12失点以上の確率', pct: true, tune: 'heroMode.pitching.coef / maxShift' },
        aceMedian: { max: 1.7, label: '総合値450以上の先発:1試合ごとの防御率(9回あたりの自責点)の中央値', tune: 'heroMode.pitching.coef' },
        aceP75: { min: 3, label: '総合値450以上の先発:1試合ごとの防御率の75%点(打ち込まれる日も残す)', tune: 'heroMode.pitching.noise / maxShift' },
      },
    },

    // ---- 見える化(表示と、成績用の乱数で決めるハイライトだけに使う。勝敗や成長には影響しない) ----
    visual: {
      opponentTournament: 'summer',  // 他校の比較に使う「相手の強さの分布」(この大会の1回戦〜決勝の相手)
      opponentTopQuantile: 0.9,      // 「他校上位」= その分布の上位10%の値
      upsetBelow: 0.30,              // 勝率予想がこれ未満の試合に勝つと「番狂わせ」
      shockAbove: 0.80,              // 勝率予想がこれ以上の試合に負けると「波乱」
      growthWinMin: 0.001,           // 月末の「今月の成長で勝率予想 +○%」を出す最小の変化(0.1%)
      unearnedRunRate: 0.10,         // 得点のうち、打点がつかない得点(失策など)の割合
      inningWeights: [1, 1, 1, 1, 1, 1, 1, 1, 1],  // 得点をイニングに配分する重み(1回〜9回)
      highlightMax: 2,               // 1試合の活躍選手の上限(注目選手は別枠で必ず載せる)
      highlightMinScore: 4,          // 活躍選手になる最低点(安打2・打点2・本塁打3・勝利投手3 など)
      growthNoteRating: 100,         // 「成長の成果 +○」を付ける総合値の伸び(前年同月比。1年目は入学時比)
      topGrowersN: 3,                // 月のまとめに出す、成長した上位の人数
      lowGrowthRating: 20,           // 年間の伸びがこれ未満の選手を「伸びが小さかった」と数える(総合値)
      keepMonthlyYears: 2,           // 卒業生の月ごとの能力の記録を残す年数(それより前は学期ごとに圧縮)
      storageQuotaChars: 5000000,    // localStorage の上限の目安(文字数)
      storageWarnRatio: 0.8,         // 上限のこの割合を超えたら警告し、卒業生の月ごとの記録を圧縮する
      calibrationMinGames: 100,      // 勝率予想の校正で、判定に使う区間の最少試合数
    },

    // ---- 目安(sim.js と調整画面の試し計算で、結果と比べる) ----
    //   min / max:範囲。max だけなら上限。判定は ✓ 範囲内 / △ 目安の±20%以内 / ✕ それ以外
    targets: {
      normalGrad:   { min: 250, max: 300, label: '通常の卒業時の総合値(平均)', tune: 'growth.monthly.amount / growth.camp.points / growth.exp.growthPerExp' },
      starterGrad:  { min: 330, max: 400, label: 'スタメン中心の卒業時', tune: 'growth.exp.growthPerExp / growth.exp.capVsPractice' },
      benchGrad:    { min: 220, max: 260, label: '控え中心の卒業時', tune: 'growth.monthly.amount / growth.exp.bench / growth.exp.practiceSub' },
      geniusGrad:   { min: 480, max: 520, label: '天才(開花)の卒業時', tune: 'growth.talentMult.genius / rating.genius' },
      reincGrad:    { min: 520, max: 560, label: '転生の卒業時', tune: 'growth.talentMult.reincarnation / rating.reincarnation' },
      bothGrad:     { min: 560, max: 650, label: '天才かつ転生の卒業時', tune: 'growth.talentMult.both / growth.special.both' },
      over600:      { max: 0.01, label: '総合値600超の割合', pct: true, tune: 'growth.talentMult / growth.special.*.hardExp' },
      cappedShare:  { min: 0.10, max: 0.20, label: '通常の3年生の頭打ちの割合', pct: true, tune: 'growth.limit.mean / growth.limit.cappedRatio' },
      limitBreaks:  { min: 1, max: 3, label: '限界突破(10年あたり)', tune: 'limitBreak.chance / limitBreak.threshold' },
      sharePractice: { min: 0.32, max: 0.48, label: '成長の内訳:練習', pct: true, tune: 'growth.monthly.amount' },
      shareCamp:    { min: 0.12, max: 0.28, label: '成長の内訳:合宿', pct: true, tune: 'growth.camp.points' },
      shareExp:     { min: 0.32, max: 0.48, label: '成長の内訳:試合経験値', pct: true, tune: 'growth.exp.growthPerExp' },
      lv5Years:     { min: 5, max: 10, label: '指導力Lv5までの年数(Lv10が最も早いシード)', tune: 'leadership.needPerLv' },
      lv10Years:    { min: 15, max: 30, label: '指導力Lv10までの年数(最も早いシード)', tune: 'leadership.needPerLv' },
      summerTitle:  { min: 0.10, max: 0.22, label: '夏の地区優勝率', pct: true, tune: 'tournaments.summer.oppBase' },
      autumnTitle:  { min: 0.10, max: 0.22, label: '秋の地区優勝率', pct: true, tune: 'tournaments.autumn.oppBase' },
      promisingUp:  { min: 0.10, max: 0.25, label: 'ラベル:有望以上の割合(在校生)', pct: true, tune: 'labelTop / 世代の基準の再計算' },
      monsterUp:    { min: 0.01, max: 0.04, label: 'ラベル:怪物級以上の割合(在校生)', pct: true, tune: 'labelTop / 世代の基準の再計算' },
      calibration:  { max: 0.05, label: '勝率予想の校正(区間ごとの最大のずれ)', pct: true, tune: '勝率の計算(Core.winProbability)を見直す' },
      powerGrowth:  { min: 0.05, max: 0.40, label: 'チーム戦力の伸び(最後の5年の平均 / 1年目)', pct: true, tune: 'reputation.topShareMax / reputation.talentRateMaxMult / leadership.monthlyMultMax' },
      growthReflect: { min: 0.0, max: 0.3, label: '成長の反映(対 他校平均の勝率予想:各学年の3年目4月 − 1年目4月の平均)', pct: true, tune: 'growth.* / visual.opponentTournament' },
      highlightsPerGame: { min: 1, max: 2.5, label: '1試合あたりの活躍選手の人数', tune: 'visual.highlightMinScore / visual.highlightMax' },
      growthNoteShare: { min: 0.05, max: 0.25, label: '活躍選手に「成長の成果」が付く割合', pct: true, tune: 'visual.growthNoteRating' },
      startVsBench: { max: 0.15, label: '開始時の2・3年生の総合値の平均と、世代の基準(4月のp50)のずれ', pct: true, tune: 'preHistory.years' },
      startPowerGap: { max: 0.10, label: '1年目4月のチーム戦力と、2〜3年目4月の平均のずれ', pct: true, tune: 'preHistory.years' },
      preHistoryMs: { max: 1000, label: '前史の所要時間(新規開始、ミリ秒)', tune: 'preHistory.years' },
      repTopGain:   { min: 10, max: 25, label: 'x=1 の新入生の平均総合値(天才・転生を除く)の、基準校との差', tune: 'reputation.topShareMax' },
      repNormalShare: { min: 0.55, label: 'x=1 でも通常層(80〜120)が新入生に占める割合', pct: true, tune: 'reputation.topShareMax / reputation.talentRateMaxMult' },
      repTalentMult: { min: 1.7, max: 2.0, label: 'x=1 の天才・転生の出現率(基準の何倍)', tune: 'reputation.talentRateMaxMult' },
      repCapYears:  { max: 0.20, label: '評判が x=1 に張り付いた年の割合', pct: true, tune: 'reputation.rate / reputation.baseline' },
      lineupViolations: { max: 0, label: 'スタメン編成の不変条件の違反(件数)', tune: 'offPositionStarGap(0 で違反は起きない)/ lineupOrder' },
      offPositionShare: { max: 0.08, label: '本職外起用の割合(スタメンの延べ人数に占める割合)', pct: true, tune: 'conversion.minimum / newcomers.*(部員数)' },
      top3Benched: { max: 0.10, label: '総合値の上位3人のうち、その月にスタメンに入っていない割合', pct: true, tune: 'offPositionStarGap / conversion.minimum' },
      storageShare: { max: 0.5, label: '50年プレイした場合の保存容量(上限に対する割合)', pct: true, tune: 'visual.keepMonthlyYears / logLimit' },
    },

    // ---- 試合 ----
    match: {
      scale: 6,
      minWinRate: 0.03,
      maxWinRate: 0.97,
      loserRunsWeights: [18, 22, 18, 14, 10, 7, 5, 3, 2, 1],
      marginWeights: [30, 22, 16, 11, 8, 5, 4, 2, 1, 1],
    },

    // ---- 大会(簡易版。フェーズ2で本格的なトーナメントに置き換える) ----
    // 相手校の強さはチームの強さと同じ尺度
    tournaments: {
      summer: { name: '夏の地区大会', rounds: 5, oppBase: 42, oppStep: 2.5, oppSd: 6 },
      autumn: { name: '秋の地区大会', rounds: 4, oppBase: 33, oppStep: 2.5, oppSd: 6 },
    },
    opponentNames: [
      '青葉台', '桜ヶ丘', '北斗学園', '南陵', '東雲', '西園寺学院', '若葉', '朝霧',
      '大河原', '星見台', '緑川', '白鷺', '黒潮', '紅陵', '翠嵐', '藤ノ森',
      '霞ヶ浦学園', '天満', '月島工業', '風見',
    ],

    // ---- 卒業後の進路 ----
    // score = 総合値 × overallWeight + 最高能力 × 5 × maxWeight + 乱数(sd)
    career: {
      overallWeight: 0.6,
      maxWeight: 0.4,
      noiseSd: 20,
      twoWayBonus: 30,
      paths: [
        { min: 500, label: 'プロ入り(ドラフト指名)' },
        { min: 420, label: '強豪大学へ進学' },
        { min: 375, label: '社会人野球へ' },
        { min: 325, label: '大学で野球を続ける' },
        { min: -999, label: '野球は高校で区切り' },
      ],
      helperLabel: '元の部活に戻った',
    },
  };

  // ---- 調整画面に出すパラメータ(group と1行の説明) ----
  //   path は CONFIG の中の場所(配列は .0 / .1)。displayOnly は表示だけに使う値(進行中のゲームにも即時に反映)
  CONFIG.paramGroups = [
    { id: 'rating', label: '初期能力の分布' },
    { id: 'cap', label: '能力の項目上限と100超の割引' },
    { id: 'growth', label: '成長(練習・合宿・試合経験値)' },
    { id: 'limit', label: '成長限界と限界突破' },
    { id: 'lead', label: '指導力' },
    { id: 'label', label: 'ラベルと世代の基準' },
    { id: 'strength', label: 'チームの強さ・他校の強さ' },
    { id: 'lineup', label: 'スタメン編成' },
    { id: 'tourney', label: '大会' },
    { id: 'visual', label: '見える化' },
    { id: 'disp', label: '表示' },
    { id: 'policy', label: '見直し画面' },
    { id: 'pre', label: '前史' },
    { id: 'rep', label: '評判' },
    { id: 'roster', label: '部員の構成(v2)' },
    { id: 'hero', label: '新入部員モード' },
  ];
  CONFIG.paramMeta = [
    ['rating.normal.mean', 'rating', '通常の新入生の総合値の平均'],
    ['rating.normal.sd', 'rating', '通常の新入生の総合値のばらつき'],
    ['rating.normal.min', 'rating', '通常の新入生の総合値の下限'],
    ['rating.normal.max', 'rating', '通常の新入生の総合値の上限(上位枠を除く)'],
    ['rating.normal.highRate', 'rating', '通常の新入生が上位枠(120〜160)になる確率'],
    ['rating.normal.highMin', 'rating', '上位枠の総合値の下限'],
    ['rating.normal.highMax', 'rating', '上位枠の総合値の上限'],
    ['rating.genius.min', 'rating', '天才の新入生の総合値の下限'],
    ['rating.genius.max', 'rating', '天才の新入生の総合値の上限'],
    ['rating.reincarnation.min', 'rating', '転生の新入生の総合値の下限'],
    ['rating.reincarnation.max', 'rating', '転生の新入生の総合値の上限'],
    ['rating.geniusReincarnationMax', 'rating', '天才かつ転生の新入生の総合値の上限'],
    ['rating.keySd', 'rating', '項目ごとの能力のばらつき'],
    ['statCap.normal', 'cap', '通常の選手の能力の項目上限'],
    ['statCap.special', 'cap', '天才(開花)・転生の能力の項目上限'],
    ['overCapWeight', 'cap', '100を超えた分の、試合・成績への寄与の割合'],
    ['growth.monthly.chance', 'growth', '練習:1人1か月の成長確率'],
    ['growth.monthly.amount.0', 'growth', '練習:1回の成長量の下限(能力値の合計)'],
    ['growth.monthly.amount.1', 'growth', '練習:1回の成長量の上限(能力値の合計)'],
    ['growth.monthly.retiredMult', 'growth', '練習:引退後の3年生の成長確率の倍率'],
    ['growth.camp.outcomeRates.normal.big', 'growth', '合宿:通常の選手が「大きく伸びる」確率'],
    ['growth.camp.outcomeRates.normal.small', 'growth', '合宿:通常の選手が「少し伸びる」確率'],
    ['growth.camp.outcomeRates.genius.big', 'growth', '合宿:天才(開花)が「大きく伸びる」確率'],
    ['growth.camp.points.big.0', 'growth', '合宿:「大きく伸びる」の成長量の下限'],
    ['growth.camp.points.big.1', 'growth', '合宿:「大きく伸びる」の成長量の上限'],
    ['growth.camp.points.small.0', 'growth', '合宿:「少し伸びる」の成長量の下限'],
    ['growth.camp.points.small.1', 'growth', '合宿:「少し伸びる」の成長量の上限'],
    ['growth.exp.starter', 'growth', '経験値:スタメンで出場した試合'],
    ['growth.exp.bench', 'growth', '経験値:ベンチ入りのみの試合'],
    ['growth.exp.practiceStarter', 'growth', '経験値:練習試合でスタメン'],
    ['growth.exp.practiceSub', 'growth', '経験値:練習試合で出場した控え'],
    ['growth.exp.winMult', 'growth', '経験値:勝った試合の倍率'],
    ['growth.exp.maxMult', 'growth', '経験値:倍率を掛け合わせた上限'],
    ['growth.exp.consumeRate', 'growth', '経験値:毎月、成長に変える割合'],
    ['growth.exp.carryMax', 'growth', '経験値:持ち越せる上限'],
    ['growth.exp.growthPerExp', 'growth', '経験値1あたりの成長量(能力値)'],
    ['growth.exp.capVsPractice', 'growth', '経験値による成長は、練習の期待値の何倍まで'],
    ['growth.talentMult.genius', 'growth', '天才(開花)の成長の倍率'],
    ['growth.talentMult.reincarnation', 'growth', '転生の成長の倍率'],
    ['growth.talentMult.both', 'growth', '天才かつ転生の成長の倍率'],
    ['growth.otherWeight', 'growth', '特化方針で、選んでいない能力の伸びやすさ'],
    ['growth.efficiency.slope', 'growth', '元々高い能力ほど伸びやすい度合い'],
    ['growth.limit.mean', 'limit', '成長限界(総合値)の平均'],
    ['growth.limit.sd', 'limit', '成長限界のばらつき'],
    ['growth.limit.min', 'limit', '成長限界の下限'],
    ['growth.limit.max', 'limit', '成長限界の上限(まれな枠を除く)'],
    ['growth.limit.rareRate', 'limit', '成長限界がまれな高い枠になる確率'],
    ['growth.limit.rareMin', 'limit', 'まれな枠の成長限界の下限'],
    ['growth.limit.rareMax', 'limit', 'まれな枠の成長限界の上限'],
    ['growth.limit.focusBonus', 'limit', '特化した項目の実効上限の上乗せ'],
    ['growth.limit.zone', 'limit', '実効上限のこの手前から成長が鈍る(能力値)'],
    ['growth.limit.cappedRatio', 'limit', '限界のこの割合以上で「頭打ち」'],
    ['growth.special.solo.soft', 'limit', '天才・転生:100までの鈍り方'],
    ['growth.special.solo.hardExp', 'limit', '天才・転生:100を超えてからの鈍り方'],
    ['growth.special.both.soft', 'limit', '天才かつ転生:100までの鈍り方'],
    ['growth.special.both.hardExp', 'limit', '天才かつ転生:100を超えてからの鈍り方'],
    ['limitBreak.threshold', 'limit', '限界突破の対象(限界のこの割合以上)'],
    ['limitBreak.chance', 'limit', '限界突破:毎月の確率'],
    ['limitBreak.bigWinBonus', 'limit', '限界突破:決勝で勝った月の加算'],
    ['limitBreak.leadershipBonus', 'limit', '限界突破:指導力が高いときの加算'],
    ['limitBreak.gain.0', 'limit', '限界突破:限界の上昇の下限'],
    ['limitBreak.gain.1', 'limit', '限界突破:限界の上昇の上限'],
    ['leadership.needPerLv', 'lead', 'Lv n → n+1 の必要経験値 = この値 × n'],
    ['leadership.monthlyMultMax', 'lead', 'Lv10での練習の成長確率の倍率'],
    ['leadership.campBigBonusMax', 'lead', 'Lv10での合宿「大きく伸びる」の加算'],
    ['leadership.gains.champion', 'lead', '地区大会優勝で得る経験値'],
    ['leadership.gains.runnerUp', 'lead', '地区大会準優勝で得る経験値'],
    ['leadership.gains.best4', 'lead', '地区大会ベスト4で得る経験値'],
    ['leadership.gains.pro', 'lead', 'プロ入り1人で得る経験値'],
    ['labelTop.promising', 'label', '「有望」:同世代の上位○%以内', true],
    ['labelTop.excellent', 'label', '「逸材」:同世代の上位○%以内', true],
    ['labelTop.monster', 'label', '「怪物級」:同世代の上位○%以内', true],
    ['labelTop.beyond', 'label', '「規格外」:同世代の上位○%以内', true],
    ['baselineCoachLv', 'label', '世代の基準を作るときの指導力Lv', true],
    ['benchmarkRuns.seeds', 'label', '世代の基準:シードの数', true],
    ['benchmarkRuns.years', 'label', '世代の基準:1シードの年数', true],
    ['teamStrength.pitchWeight', 'strength', 'チームの強さ:投手の比重'],
    ['teamStrength.fieldWeight', 'strength', 'チームの強さ:野手の比重'],
    ['teamStrength.pitcherBatWeight', 'strength', 'チームの強さ:投手の打撃の比重'],
    ['match.scale', 'strength', '強さの差がこの値で勝率約73%'],
    ['practiceGames.oppMean', 'strength', '練習試合の相手の強さの平均'],
    ['newcomers.strengthPivot', 'strength', '新入生の人数:基準になるチームの強さ'],
    ['tournaments.summer.oppBase', 'tourney', '夏の地区大会:1回戦の相手の強さ'],
    ['tournaments.summer.oppStep', 'tourney', '夏の地区大会:1回戦ごとの相手の強さの上昇'],
    ['tournaments.summer.oppSd', 'tourney', '夏の地区大会:相手の強さのばらつき'],
    ['tournaments.autumn.oppBase', 'tourney', '秋の地区大会:1回戦の相手の強さ'],
    ['tournaments.autumn.oppStep', 'tourney', '秋の地区大会:1回戦ごとの相手の強さの上昇'],
    ['tournaments.autumn.oppSd', 'tourney', '秋の地区大会:相手の強さのばらつき'],
    ['visual.opponentTopQuantile', 'visual', '「他校上位」とする、相手の強さの分布の分位(0.9 = 上位10%)', true],
    ['visual.upsetBelow', 'visual', '勝率予想がこれ未満で勝つと「番狂わせ」', true],
    ['visual.shockAbove', 'visual', '勝率予想がこれ以上で負けると「波乱」', true],
    ['visual.growthWinMin', 'visual', '月末の「成長で勝率予想 +○%」を出す最小の変化', true],
    ['visual.unearnedRunRate', 'visual', '得点のうち、打点がつかない得点の割合'],
    ['visual.highlightMax', 'visual', '1試合の活躍選手の上限(注目選手は別枠)'],
    ['visual.highlightMinScore', 'visual', '活躍選手になる最低点(安打2・打点2・本塁打3・勝利投手3)'],
    ['visual.growthNoteRating', 'visual', '「成長の成果」を付ける総合値の伸び(前年同月比)'],
    ['visual.topGrowersN', 'visual', '月のまとめに出す、成長した上位の人数', true],
    ['visual.lowGrowthRating', 'visual', '年間の伸びがこれ未満を「伸びが小さかった」と数える', true],
    ['visual.keepMonthlyYears', 'visual', '卒業生の月ごとの能力の記録を残す年数'],
    ['visual.storageQuotaChars', 'visual', 'localStorage の上限の目安(文字数)', true],
    ['visual.storageWarnRatio', 'visual', '保存容量の警告を出す割合', true],
    ['visual.calibrationMinGames', 'visual', '勝率予想の校正で、判定に使う区間の最少試合数', true],
    ['display.wallRatio', 'disp', '能力の詳細で「壁」を付ける、実効上限に対する割合', true],
    ['display.growthTopN', 'disp', '成長タブの初期表示の人数(変化が大きい順)', true],
    ['policyScreen.strongWeight', 'policy', '方針の選択肢で ◎ を付ける重み', true],
    ['policyScreen.midWeight', 'policy', '方針の選択肢で ○ を付ける重み', true],
    ['reviewShowStats', 'policy', '見直し画面に、項目別の現在値の1行を出す(オン/オフ)', true],
    ['policyControlEnabled', 'policy', '方針の選択を遊ぶ画面に出すか', true],
    ['policyOptionHints', 'policy', '方針の選択肢に、伸びやすい項目(◎○)を併記する(オン/オフ)', true],
    ['offPositionStarGap', 'lineup', '控えの選手を本職外で起用してよい総合値の差(0 = 無効。適性が本職の選手以上のときだけ)'],
    ['homeSummaryPosition', 'disp', 'ホームの月のまとめの位置(bottom = 下 / top = 上)', true, ['bottom', 'top']],
    ['preHistory.years', 'pre', '新規開始時に内部で再現する過去の年数'],
    ['reputation.baseline', 'rep', '評判の初期値・基準(これ以下は新入生の質に影響しない)'],
    ['reputation.rate', 'rep', '評判の更新の速さ(今年の得点の割合)'],
    ['reputation.tourneyMax', 'rep', '今年の得点:大会点の上限'],
    ['reputation.proPer', 'rep', '今年の得点:プロ入り1人あたり'],
    ['reputation.proMax', 'rep', '今年の得点:プロ入り点の上限'],
    ['reputation.leadPerLv', 'rep', '今年の得点:指導力Lvあたり'],
    ['reputation.leadMax', 'rep', '今年の得点:指導力点の上限'],
    ['reputation.topShareBase', 'rep', '通常の新入生が上位層(120〜160)になる割合(x=0)'],
    ['reputation.topShareMax', 'rep', '上位層の割合(x=1)'],
    ['reputation.talentRateMaxMult', 'rep', '天才・転生の出現率の倍率(x=1)'],
    ['reputation.trend.0', 'rep', '「新入生の傾向」がやや良になる x', true],
    ['reputation.trend.1', 'rep', '「新入生の傾向」が良になる x', true],
    ['reputation.trend.2', 'rep', '「新入生の傾向」が非常に良になる x', true],
    ['heroMode.rerollMax', 'hero', '新入部員の一覧の引き直しの回数'],
    ['heroMode.stopOnStory', 'hero', '主人公の山場の物語で、自動進行を止める(オン/オフ)'],
    ['heroMode.stopsPerYearMax', 'hero', '1年あたりの止まる回数の目安(超えたら物語では止めない)'],
    ['heroMode.setbackMax', 'hero', '挫折の物語の3年間の上限'],
    ['heroMode.create.typeBias.0', 'hero', '作成:得意項目の上乗せの下限'],
    ['heroMode.create.typeBias.1', 'hero', '作成:得意項目の上乗せの上限'],
    ['heroMode.create.levels.low.0', 'hero', '作成:控えめの総合値の下限'],
    ['heroMode.create.levels.low.1', 'hero', '作成:控えめの総合値の上限'],
    ['heroMode.create.levels.mid.0', 'hero', '作成:普通の総合値の下限'],
    ['heroMode.create.levels.mid.1', 'hero', '作成:普通の総合値の上限'],
    ['heroMode.create.levels.high.0', 'hero', '作成:高めの総合値の下限'],
    ['heroMode.create.levels.high.1', 'hero', '作成:高めの総合値の上限'],
    ['heroMode.create.twoWayLevels.low.0', 'hero', '作成:二刀流・控えめの各側の下限'],
    ['heroMode.create.twoWayLevels.low.1', 'hero', '作成:二刀流・控えめの各側の上限'],
    ['heroMode.create.twoWayLevels.mid.0', 'hero', '作成:二刀流・普通の各側の下限'],
    ['heroMode.create.twoWayLevels.mid.1', 'hero', '作成:二刀流・普通の各側の上限'],
    ['heroMode.create.geniusGrowthRatio', 'hero', '作成:天才の成長の倍率(既存の天才の倍率に掛ける)'],
    ['heroMode.twoWay.batWeightInPitcherSlot', 'hero', '投手枠の評価値で、野手側の総合値に掛ける重み'],
    ['heroMode.rival.candidateCount', 'hero', 'ライバルを選び直す一覧の人数'],
    ['heroMode.rival.selectMode', 'hero', '自動のライバルの選び方(chaseable:少し上の追える相手 / strongest:H1.3 までの最も強い相手)'],
    ['heroMode.rival.minGap', 'hero', '追える相手:総合値の差がこれ未満の相手は外す'],
    ['heroMode.rival.maxGap', 'hero', '追える相手:差がこれを超えたら、選ばれた理由に「差は大きい」と添える'],
    ['heroMode.rival.swapMonths', 'hero', '総合値の順位の入れ替わりを物語にする連続の月数'],
    ['heroMode.contest.swapStoryGap', 'hero', '「奪った・奪われた」の物語の最短間隔(月)'],
    ['heroMode.contest.benchStory.0', 'hero', '「控えが続く」の物語(1回目)の連続の月数'],
    ['heroMode.contest.benchStory.1', 'hero', '「控えが続く」の物語(2回目)の連続の月数'],
    ['heroMode.contest.switchPerYear', 'hero', '役割の切り替えの物語の1年あたりの上限'],
    ['heroMode.convert.benchMonths', 'hero', '転向:連続して控えの月数'],
    ['heroMode.convert.aptitudeRatio', 'hero', '転向:他の区分の適性が今の区分の何倍以上か'],
    ['heroMode.convert.probability', 'hero', '転向:条件を満たした月の発生確率'],
    ['heroMode.convert.maxPerRun', 'hero', '転向:3年間の上限'],
    ['heroMode.convert.settleMonths', 'hero', '転向:「慣れてきた」を出せる期間(月)'],
    ['heroMode.convert.settleStories', 'hero', '転向:「慣れてきた」の上限'],
    ['heroMode.convert.settleAptGain', 'hero', '転向:「慣れてきた」を出す適性の上がり幅'],
    ['heroMode.rebound.windowMonths', 'hero', '再起を待つ期間(月)'],
    ['heroMode.rebound.campBonus', 'hero', '再起のあと最初の合宿で「大きく伸びる」に加える確率'],
    ['heroMode.rebound.maxBoosts', 'hero', '再起の後押しの3年間の上限'],
    ['heroMode.story.bigMonthGain', 'hero', '「成長が大きい月」の総合値の増分'],
    ['heroMode.display.style', 'hero', '数値の見せ方(pawapuro = ランク文字・km/h・球種 / plain = 大きな数字のボックス)', true, ['pawapuro', 'plain']],
    ['heroMode.display.rank.S', 'hero', 'ランク S の下限', true],
    ['heroMode.display.rank.A', 'hero', 'ランク A の下限', true],
    ['heroMode.display.rank.B', 'hero', 'ランク B の下限', true],
    ['heroMode.display.rank.C', 'hero', 'ランク C の下限', true],
    ['heroMode.display.rank.D', 'hero', 'ランク D の下限', true],
    ['heroMode.display.rank.E', 'hero', 'ランク E の下限', true],
    ['heroMode.display.rank.F', 'hero', 'ランク F の下限(未満は G)', true],
    ['heroMode.display.kmh.base', 'hero', '球速の換算:値0のときの km/h', true],
    ['heroMode.display.kmh.per', 'hero', '球速の換算:値1あたりの km/h(100以下)', true],
    ['heroMode.display.kmh.overBase', 'hero', '球速の換算:値100を超えたときの起点の km/h', true],
    ['heroMode.display.kmh.overPer', 'hero', '球速の換算:100を超えた値1あたりの km/h', true],
    ['heroMode.display.kmh.max', 'hero', '球速の換算:上限の km/h', true],
    ['heroMode.display.breakRatio', 'hero', '総変化量 = 変化球の値 × これ', true],
    ['heroMode.display.newPitchRate', 'hero', '総変化量が増えたとき、新しい球種を覚える確率'],
    ['heroMode.display.maxPitches', 'hero', '球種の数の上限'],
    ['heroMode.display.pitchMax', 'hero', '1球種の変化量の上限'],
    ['heroMode.practiceSub.paMin', 'hero', '練習試合の途中出場:打席の最小数'],
    ['heroMode.practiceSub.paExtraRate', 'hero', '練習試合の途中出場:もう1打席立つ確率'],
    ['heroMode.practiceSub.reliefInnings', 'hero', '練習試合の途中出場:投手の登板の回数'],
    ['heroMode.practiceSub.reliefRunRate', 'hero', '練習試合の途中出場:投手が1点取られる確率'],
    ['heroMode.watchMax', 'hero', '気になる選手の上限(主人公とライバルは別枠)'],
    ['roster.v2.countMin', 'roster', '新入生の人数の下限(v2)'],
    ['roster.v2.countMax', 'roster', '新入生の人数の上限(v2)'],
    ['roster.v2.countNoise', 'roster', '新入生の人数のばらつき(±人。v2)'],
    ['roster.v2.classShare.P', 'roster', '新入生の守備区分の目標の割合:投手(v2)'],
    ['roster.v2.classShare.C', 'roster', '新入生の守備区分の目標の割合:捕手(v2)'],
    ['roster.v2.classShare.IF', 'roster', '新入生の守備区分の目標の割合:内野(v2)'],
    ['roster.v2.classShare.OF', 'roster', '新入生の守備区分の目標の割合:外野(v2)'],
    ['roster.v2.classNoise', 'roster', '新入生の区分ごとの人数のばらつき(±人。v2)'],
    ['roster.v2.minPerClass.P', 'roster', '各学年の新入生の本職の投手の最低人数(v2)'],
    ['roster.v2.minPerClass.C', 'roster', '各学年の新入生の本職の捕手の最低人数(v2)'],
    ['heroMode.entranceMax', 'hero', '入口のピックアップの最大人数(主人公に選べるのはピックアップだけ)'],
    ['heroMode.entrancePickTop', 'hero', '入口のピックアップのうち、総合値の上位から選ぶ人数'],
    ['heroMode.ui.progressBar', 'hero', '進行ボタンのバー(bottom:下に固定 / top:上に固定 / inline:固定しない)', true, ['bottom', 'top', 'inline']],
    ['heroMode.newYearOthersOpen', 'hero', '新年度の画面:上位3人以外の新入生がこの人数を超えたら折りたたむ'],
    ['heroMode.lineup.minAb', 'hero', 'スタメン表の打率:打数がこれ未満なら薄い文字(参考値)'],
    ['heroMode.lineup.orderChangeMin', 'hero', '主人公の打順の変化:これ以上動いた月だけ、ひとことにする'],
    ['heroMode.lineup.orderChangeMax', 'hero', '主人公の打順の変化のひとこと:1年あたりの上限'],
    ['heroMode.lineup.reasonMonths', 'hero', '打順が上がった理由(ランクの上昇)を、記録で確かめる期間(か月)'],
    ['heroMode.substitute.enabled', 'hero', '途中出場(代打・代走・守備固め)と盗塁(オン/オフ。オフで H1.5b と同じ)'],
    ['heroMode.substitute.expMult', 'hero', '途中出場の試合経験値(スタメンの何倍か)'],
    ['heroMode.substitute.phChance', 'hero', '代打:得点のない終盤の回で、走者がいる場面になる確率'],
    ['heroMode.substitute.phProb', 'hero', '代打:条件を満たしたときに起用する確率'],
    ['heroMode.substitute.phMargin', 'hero', '代打:控えのミート・パワーが打者より何以上高いか'],
    ['heroMode.substitute.phMax', 'hero', '代打:1試合の上限'],
    ['heroMode.substitute.prDiff', 'hero', '代走:点差がこれ以内のとき'],
    ['heroMode.substitute.prProb', 'hero', '代走:起用する確率'],
    ['heroMode.substitute.prMargin', 'hero', '代走:控えの走力が走者より何以上高いか'],
    ['heroMode.substitute.defLead', 'hero', '守備固め:リードがこれ以内のとき'],
    ['heroMode.substitute.defProb', 'hero', '守備固め:起用する確率'],
    ['heroMode.substitute.defMargin', 'hero', '守備固め:控えの適性が守っている選手より何以上高いか'],
    ['heroMode.substitute.defMax', 'hero', '守備固め:1試合の上限'],
    ['heroMode.substitute.sbTryBase', 'hero', '盗塁:塁に出たときの試行の確率(走力50)'],
    ['heroMode.substitute.sbTryPer', 'hero', '盗塁:走力1あたりの試行の確率の増え方'],
    ['heroMode.substitute.sbOkBase', 'hero', '盗塁:成功率(走力50)'],
    ['heroMode.substitute.sbOkPer', 'hero', '盗塁:走力1あたりの成功率の増え方'],
    ['heroMode.substitute.clutchHits', 'hero', '「代打の切り札」のひとこと:代打の安打数がこの回数に達したとき'],
    ['heroMode.awakening.enabled', 'hero', '覚醒とヒント(オン/オフ。オフで H1.6a-fix1 と同じ)'],
    ['heroMode.awakening.talentRate', 'hero', '覚醒の素質がある選手の割合'],
    ['heroMode.awakening.talentWeight', 'hero', '素質がある選手の、覚醒の抽選の重み'],
    ['heroMode.awakening.hintRateTalent', 'hero', '素質がある選手に、ヒントが出る割合'],
    ['heroMode.awakening.hintRateNone', 'hero', '素質がない選手に、ヒントが出る割合(外れ)'],
    ['heroMode.awakening.gainMin', 'hero', '覚醒で伸びる量の下限(各能力)'],
    ['heroMode.awakening.gainMax', 'hero', '覚醒で伸びる量の上限(各能力)'],
    ['heroMode.awakening.kmhMin', 'hero', '覚醒で伸びる球速の下限(km/h)'],
    ['heroMode.awakening.kmhMax', 'hero', '覚醒で伸びる球速の上限(km/h)'],
    ['heroMode.awakening.brkGain', 'hero', '覚醒で伸びる変化球(総変化量)'],
    ['heroMode.fx.enabled', 'hero', '演出(入口の登場・覚醒の瞬間)のオン/オフ。オフで H1.6b と同じ見た目', true],
    ['heroMode.fx.entry.stepSec', 'hero', '入口の演出:1人ずつ出る間隔(秒)', true],
    ['heroMode.fx.entry.totalMaxSec', 'hero', '入口の演出:総時間の上限(秒)', true],
    ['heroMode.fx.entry.cardSec', 'hero', '入口の演出:1枚が現れる時間(秒)', true],
    ['heroMode.fx.entry.rerollScale', 'hero', '引き直しの演出の速さの倍率(1.0 で最初と同じ)', true],
    ['heroMode.fx.entry.flashSec', 'hero', '怪物級以上のときの白い光の時間(秒)', true],
    ['heroMode.fx.entry.glow.promising', 'hero', '光の強さ:有望(px)', true],
    ['heroMode.fx.entry.glow.excellent', 'hero', '光の強さ:逸材(px)', true],
    ['heroMode.fx.entry.glow.monster', 'hero', '光の強さ:怪物級・規格外(px)', true],
    ['heroMode.fx.entry.glow.hint', 'hero', '光の強さ:覚醒のヒント(✦。紫。px)', true],
    ['heroMode.fx.awaken.stepSec', 'hero', '覚醒の演出:項目ごとの数字が上がり始める間隔(秒)', true],
    ['heroMode.fx.awaken.countSec', 'hero', '覚醒の演出:1項目の数字が上がる時間(秒)', true],
    ['heroMode.fx.awaken.introSec', 'hero', '覚醒の演出:暗転から「覚醒」の文字までの時間(秒)', true],
    ['heroMode.rival.display', 'hero', 'ライバルを画面と文面に出す(オン/オフ。内部のライバルは残す)'],
    ['heroMode.totals.minAb', 'hero', '卒業の通算成績:打数がこれ未満なら打率に「参考」と添える'],
    ['heroMode.totals.minOuts', 'hero', '卒業の通算成績:アウト数がこれ未満なら防御率に「参考」と添える'],
    ['heroMode.rival.revealAtGraduation', 'hero', '卒業のときに、ライバルの素質を明かす(オン/オフ)'],
    ['heroMode.pitching.enabled', 'hero', '先発の能力を失点に効かせる(オン/オフ。勝敗と自校の得点は変えない)'],
    ['heroMode.pitching.coef', 'hero', '失点のずらし:係数(総合値100あたりの点数。9回換算)'],
    ['heroMode.pitching.refStrength', 'hero', '失点のずらし:基準の総合値(これより強い先発は失点が減る)'],
    ['heroMode.pitching.noise', 'hero', '失点のずらし:ばらつき(±の一様乱数)'],
    ['heroMode.pitching.maxShift', 'hero', '失点のずらし:1試合でずらす点数の上限'],
    ['heroMode.pitching.reliefMax', 'hero', '救援の最大人数(1 で救援は1人。H1.5a と同じ)'],
    ['heroMode.pitching.reliefBase', 'hero', '大会の救援の抽選の重み = 総合値 + この値'],
    ['heroMode.stamina.enabled', 'hero', '先発の投球回をスタミナで決める(オン/オフ)'],
    ['heroMode.stamina.base', 'hero', '先発の投球回の基準(base + スタミナ ÷ perPoint)'],
    ['heroMode.stamina.perPoint', 'hero', '先発の投球回:スタミナ何ごとに1回か'],
    ['heroMode.stamina.minInnings', 'hero', '先発の投球回の下限(失点による減少の前)'],
    ['heroMode.stamina.finalBonus', 'hero', '決勝でスタミナ B 以上の投手を +1回(オン/オフ)'],
    ['heroMode.story.bigMonthGap', 'hero', '「成長が大きい月」の物語の最短間隔(月)'],
    ['heroMode.story.recentNoRepeat', 'hero', '同じ文を繰り返さない直近の回数'],
  ].map((x) => ({ path: x[0], group: x[1], desc: x[2], displayOnly: !!x[3], options: x[4] || null }));

  if (typeof module === 'object' && module.exports) module.exports = CONFIG;
  else root.CONFIG = CONFIG;
})(typeof self !== 'undefined' ? self : this);
