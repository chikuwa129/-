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
  ].map((x) => ({ path: x[0], group: x[1], desc: x[2], displayOnly: !!x[3], options: x[4] || null }));

  if (typeof module === 'object' && module.exports) module.exports = CONFIG;
  else root.CONFIG = CONFIG;
})(typeof self !== 'undefined' ? self : this);
