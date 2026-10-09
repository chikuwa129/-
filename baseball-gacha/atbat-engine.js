// =============================================================
// atbat-engine.js : 打席の試作(T1)の計算の部品
//   能力と場面と指示から、打席の結果の確率を出し、抽選し、走者と得点を更新する。
//   得点期待値(走者とアウトの24通り)、指示ごとの見込み、介入場面の判定(isKeyScene)も持つ。
//   画面・保存・本編の設定に依存しない(本編・監督モードへ、あとで使えるように)。数値はすべて仮。
// =============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AtBat = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 設定(すべて仮の値) ----------
  const CONFIG = {
    // 打席の結果の基準の確率(高校野球の水準の仮置き。合計 1)
    base: { K: 0.17, BB: 0.09, GO: 0.31, FO: 0.21, S: 0.16, XB: 0.05, HR: 0.01 },
    // 能力の差の補正:w = 基準 × exp(clamp(Σ 係数 × z, ±expCap))、z = (能力 − 50) ÷ 50。最後に合計 1 に割り直す
    expCap: 1.6,
    coef: {
      K:  { stuff: 0.6, con: -0.7 },
      BB: { ctl: -0.7, con: 0.25 },
      GO: { brk: 0.25, def: 0.2, pow: -0.1 },
      FO: { def: 0.2 },
      S:  { con: 0.5, stuff: -0.3, def: -0.35, spd: 0.15 },
      XB: { pow: 0.6, stuff: -0.25, ctl: -0.25, def: -0.2, spd: 0.1 },
      HR: { pow: 1.0, stuff: -0.3, ctl: -0.35 },
    },
    // 指示の効き:結果ごとの log 倍率(m)と、能力による追加(z の係数)。方向は設計メモの 6 に従う。大きさは仮
    orders: {
      bat: {
        normal: {},
        // 長打狙い:パワーが高いほど長打が増える。ミートが低いほど空振りが増える
        power:  { K: { m: 0.25, con: -0.35 }, S: { m: -0.15 }, GO: { m: -0.15 }, FO: { m: 0.15 }, XB: { m: 0.15, pow: 0.35 }, HR: { m: 0.25, pow: 0.5 } },
        // 短打狙い:三振が減り、単打が増える(ミートが高いほど)。長打は減る(パワーが高いほど損)
        contact: { K: { m: -0.35 }, BB: { m: -0.1 }, GO: { m: 0.1 }, S: { m: 0.12, con: 0.2 }, XB: { m: -0.25 }, HR: { m: -0.6, pow: -0.3 } },
      },
      pitch: {
        normal: {},
        // 直球中心:球速が高いほど三振が増え、長打が減る。球速・制球が低いと打ち込まれる
        fast:   { K: { m: 0.05, vel: 0.5 }, GO: { m: -0.1 }, XB: { m: 0.1, vel: -0.3, ctl: -0.25 }, HR: { m: 0.15, vel: -0.4, ctl: -0.3 } },
        // 変化球中心:変化量が大きいほど三振・ゴロが増える。制球が低いと四球が増える
        breaking: { K: { brk: 0.4 }, GO: { m: 0.1, brk: 0.2 }, BB: { m: 0.15, ctl: -0.4 }, XB: { m: 0.05, brk: -0.2 } },
        // 外角中心:長打が減る(強打者ほど効く)。四球が増える(制球が低いほど)
        outside: { XB: { m: -0.15, pow: -0.2 }, HR: { m: -0.25, pow: -0.3 }, BB: { m: 0.15, ctl: -0.4 }, S: { m: 0.1 } },
        // 内角中心:ミートの低い打者を詰まらせる。制球が低いと、死球(四球)と長打の危険が増える
        inside: { K: { m: 0.05, con: -0.3 }, FO: { m: 0.1 }, BB: { m: 0.15, ctl: -0.35 }, XB: { m: 0.1, ctl: -0.35 }, HR: { m: 0.15, ctl: -0.5 }, S: { m: -0.1, con: -0.15 } },
      },
    },
    // 送りバント:成功率 = clamp(base + con × z(ミート) + spd × z(走力) − def × z(守備))。成功で走者が1つ進み、打者はアウト
    bunt: { base: 0.85, con: 0.1, spd: 0.06, def: 0.08, min: 0.4, max: 0.9, hitBase: 0.04, hitSpd: 0.06, hitMax: 0.15 },
    // スクイズ:成功率 = clamp(base + con × z(ミート) − def × z(守備))。成功で三塁走者が生還し、打者はアウト(他の走者は1つ進む)
    //   失敗:三塁走者が本塁でアウト。打者は一塁へ(野選)、他の走者は進まない
    squeeze: { base: 0.58, con: 0.25, def: 0.08, min: 0.3, max: 0.9 },
    // 盗塁(一塁走者だけ):成功率 = clamp(base + spd × z(走者の走力) − arm × z(肩) − quick × z(クイック))
    steal: { base: 0.57, spd: 0.3, arm: 0.15, quick: 0.12, min: 0.15, max: 0.9, ds3: 0.4 },   // ds3:三塁に走者がいるとき、盗塁失敗の間に三塁走者が生還する確率,
    // 走者の進塁(z は走者の走力、肩は守備側)
    run: {
      goAdv: 0.35,                                 // (三塁に走者がいるときは go3)
      go3: 0.6,                                    // ゴロのアウト(2アウト未満):三塁走者がいるとき、走者がそろって1つ進む(三塁走者は生還)確率
                                      // ゴロのアウト(2アウト未満):走者が、そろって1つ進む確率(内野ゴロの進塁打)
      s2home: { base: 0.7, spd: 0.3, arm: 0.2 },   // 単打:二塁走者が生還する確率(残りは三塁へ)
      s1third: { base: 0.25, spd: 0.3, arm: 0.2 }, // 単打:一塁走者が三塁まで進む確率(三塁が空いたとき。残りは二塁へ)
      x1home: { base: 0.45, spd: 0.3, arm: 0.2 },  // 長打:一塁走者が生還する確率(残りは三塁へ)
      triple: { base: 0.1, spd: 0.1 },             // 長打のうち、三塁打の割合(打者の走力)
      pMin: 0.05, pMax: 0.95,
    },
    // 得点期待値の基準の打者・投手・守備(能力はすべて中位)
    reBase: 50,
    // 終盤の接戦(inning 回以降、点差が diff 以内)は、最善の指示を「1点以上取る(取られる)確率」で選ぶ。それ以外は得点期待値
    lateClose: { inning: 7, diff: 2 },
    // 介入場面の判定(isKeyScene)のプリセット。winRange:試合の事前勝率がこの範囲の外なら、介入しない(勝負にならない試合)
    keyScene: {
      success: { bat: { who: 'all', minInning: 1, chance: false }, pitch: { pinch: true, maxDiff: 3, minInning: 1 }, winRange: [0.3, 0.8] },
      manager: { bat: { who: 'focus', minInning: 7, chance: true }, pitch: { pinch: true, maxDiff: 3, minInning: 7 }, winRange: [0.3, 0.8] },
    },
    // 成功と失敗の定義(打席の7つの結果を、どちらかに必ず入れる。補数で合計 1。バント・スクイズ・盗塁は、成功と失敗)
    //   T1d:投手の失敗に単打を入れた(T1b は、単打をどちらにも入れていなかった)
    goodBad: {
      bat: { good: ['BB', 'S', 'XB', 'HR'], bad: ['K', 'GO', 'FO'] },     // 打者:成功=出塁(四球・単打・長打・本塁打)、失敗=アウト
      pitch: { good: ['K', 'GO', 'FO'], bad: ['BB', 'S', 'XB', 'HR'] },   // 投手:成功=アウト(三振を含む)、失敗=出塁を許す
    },
    // 成功確率の上限と下限(100% の選択肢を作らない)。表示も内部も、成功確率を min〜max に収める(バント・スクイズ・盗塁も)
    cap: { min: 0.05, max: 0.9 },
    // 期待値の評価(1〜7):通常を base にし、通常との差を step ごとに1段階(ev:得点期待値の点、p1:1点以上の確率)。投手は、失点が小さいほど高い
    //   round:'round'(四捨五入)か 'trunc'(切り捨て。差が step に届くまで同じ段階)
    //   仕様の仮の値(ev 0.05・p1 0.02)では、4 が 7 割を超えたため、細かくした(T1d)
    rating: { base: 4, min: 1, max: 7, step: { ev: 0.02, p1: 0.008 }, round: 'round' },
    // カードの特徴の一言:通常との差が min(ポイント)以上、または相対で rel 以上(ただし floor ポイント以上)の結果を、増える・減るから各 maxEach 個まで(変化の相対の大きい順)
    //   rel を 0 にすると、仕様の仮の値(2ポイント以上だけ)になる
    feature: { min: 0.02, rel: 0.1, floor: 0.002, maxEach: 2, label: { K: '三振', BB: '四球', GO: 'ゴロ', FO: 'フライ', S: '単打', XB: '長打', HR: '本塁打' },
      normal: '基準(いつもどおり)', flat: '通常とほぼ同じ',
      // バント・スクイズ・盗塁(・敬遠)は、仕組みを短く(自作の文)
      mech: { bunt: '走者を進める。打者はアウト', squeeze: '三塁走者を返す。失敗すると走者がアウト', steal: '走者を進める。失敗すると走者がアウト', walk: '打者を歩かせる' } },
    // 画面:カードの表示(rating:成功確率と評価 / prob-only:成功確率だけ / two-choice:攻めと堅実の2枚)、結果の表示時間、誤タップよけ
    ui: { cardMode: 'rating', resultMs: 1500, tapGuardMs: 300, ratingLabel: '期待', two: { attack: '攻め', safe: '堅実', tactic: '作戦' },
      // 2択の組み方(T1f):攻めと堅実は、同じ種類(打者は打撃系、投手は配球系)から選ぶ。作戦系は、評価が tacticMin 以上のときだけ3枚目に出す
      twoGroups: { bat: ['normal', 'power', 'contact'], pitch: ['normal', 'fast', 'breaking', 'outside', 'inside'] }, tacticMin: 5 },
    // 試合の事前勝率と戦力差:事前勝率が under 以下なら「格上」(相手が強い)、over 以上なら「格下」、その間は「同格」
    strength: { under: 0.4, over: 0.6 },
    // 試合の勝率の推定(簡易):半イニングの得点の分散 v(仮)。残りイニングの得点は、得点期待値 μ(無死走者なし)と、事前勝率から逆算した力の差で見込む
    winModel: { v: 0.9 },
    // 左右(表示だけ。確率には効かせない):右の割合。両打ちは作らない。場面のシードから決める(試作専用の乱数)
    hands: { right: 0.75 },
    // 指示の選択肢:敬遠は、次の打者の能力を持たないため、出さない(true で戻す)
    walkEnabled: false,
    // ランダムな場面のうち、終盤の接戦(7回以降・2点差以内)にする割合
    lateCloseShare: 0.3,
    // 試合の通し(T1e)。自校は先攻。9回まで(延長なし。同点なら引き分け。9回裏の途中で相手が勝ち越したら、サヨナラで終了)
    game: {
      myOrder: 3,          // 野手のモード:自分の打順
      maxKeys: 2,          // 1試合の介入の上限(先の2つで止まる。以降は「通常」で自動)
      priorN: 300,         // 事前勝率の見積もり:同じ編成で、自動の試合を priorN 回(別系統の乱数)。引き分けは 0.5 勝
      jitter: 10,          // 編成の能力のばらつき(±)
      // チームの強さのプリセット(打者9人の基準、先発投手、守備・肩)
      teams: {
        strong: { bat: { contact: 64, power: 60, speed: 58 }, pit: { velocity: 66, control: 64, breaking: 62, quick: 55 }, def: 60 },
        normal: { bat: { contact: 50, power: 50, speed: 50 }, pit: { velocity: 50, control: 50, breaking: 50, quick: 50 }, def: 50 },
        weak:   { bat: { contact: 37, power: 35, speed: 42 }, pit: { velocity: 36, control: 38, breaking: 36, quick: 45 }, def: 40 },
      },
      // 介入場面の条件(isKeyScene の形)。野手のモードは自分の打席すべて、投手のモードは7回以降のピンチ(得点圏・点差3以内)
      key: { bat: { who: 'all', minInning: 1, chance: false }, pitch: { pinch: true, maxDiff: 3, minInning: 7 }, winRange: [0.3, 0.8] },
      halfMs: 500,         // 自動の進み:半イニングごとの間(ミリ秒)
      holdSpeed: 2,        // 画面を押している間の速さ(倍)
      logMode: 'highlight',   // 'highlight'(得点の回・介入場面・試合の終わり)/ 'all'(すべての半イニング)
      // ログの文(実際の記録から作る。{h}=「5回表」、{runs}=得点、{hits}=安打、{on}=出塁、{lob}=残塁、{score}=自校-相手)。同じ文が続かないように選ぶ
      text: {
        my_three: ['{h} 味方の攻撃は、3人で終わった', '{h} 味方は、三者凡退', '{h} 味方は、あっさり3人で攻撃を終えた', '{h} 味方の打線は、3人で抑えられた', '{h} 味方は、塁に出られなかった'],
        my_walk: ['{h} 味方は、四球で{on}人が出たが、無得点', '{h} 味方は、走者を出したが、点にならなかった', '{h} 味方は、四球をもらったが、続かなかった', '{h} 味方は、{lob}人を残して、無得点', '{h} 味方は、安打なしで、無得点'],
        my_hit: ['{h} 味方は、安打{hits}本で、無得点', '{h} 味方は、安打{hits}本を打ったが、点にならなかった', '{h} 味方は、{lob}人を残して、無得点(安打{hits}本)', '{h} 味方は、チャンスを生かせなかった(安打{hits}本)', '{h} 味方は、安打{hits}本、あと一本が出なかった'],
        my_score: ['{h} 味方が、{runs}点を取った({score})', '{h} 味方の攻撃で、{runs}点が入った({score})', '{h} 味方は、安打{hits}本で{runs}点({score})', '{h} 味方が、{runs}点を返した({score})', '{h} 味方に、{runs}点が入った({score})'],
        op_three: ['{h} 相手の攻撃は、3人で終わった', '{h} 何事もなく終わった', '{h} 相手は、三者凡退', '{h} 相手を、3人で抑えた', '{h} 相手は、塁に出られなかった'],
        op_walk: ['{h} 打者を{on}人出したが、抑えた', '{h} 四球を出したが、無失点', '{h} 走者を出したが、点はやらなかった', '{h} {lob}人を残して、無失点', '{h} 安打は許さず、無失点'],
        op_hit: ['{h} 安打を打たれたが、無失点', '{h} 安打{hits}本を許したが、抑えた', '{h} {lob}人を残して、無失点(被安打{hits})', '{h} ピンチをしのいだ(被安打{hits})', '{h} 打たれながらも、0点に抑えた'],
        op_score: ['{h} {runs}点を取られた({score})', '{h} 相手に、{runs}点が入った({score})', '{h} 安打{hits}本で、{runs}点を失った({score})', '{h} 相手が、{runs}点を取った({score})', '{h} {runs}点を許した({score})'],
      },
    },
    // 傾向タグ(実際の能力から。最大 max 個、偏りの大きい順。該当がなければ「平均的」)。どの能力も、結果の確率に効いている
    tags: {
      max: 3,
      batter: [
        { key: 'contact', min: 70, word: '巧打' }, { key: 'power', min: 70, word: '長打力' }, { key: 'speed', min: 70, word: '俊足' },
        { key: 'power', max: 30, word: '非力' }, { key: 'contact', max: 30, word: '空振りが多い' }, { key: 'speed', max: 25, word: '足が遅い' },
      ],
      pitcher: [
        { key: 'velocity', min: 70, word: '速球派' }, { key: 'breaking', min: 70, word: '変化球が多彩' }, { key: 'control', min: 70, word: '制球が良い' },
        { key: 'control', max: 30, word: '制球が荒い' }, { key: 'velocity', max: 30, word: '球威がない' }, { key: 'breaking', max: 25, word: '変化球が少ない' },
      ],
    },
    // 指示の説明(結果のあとの、メッセージ行に出す自作の一文)
    orderText: {
      bat: { normal: 'いつもどおりに打つ。', power: '大きいのを狙う。長打は増えるが、空振りも増える。', contact: '確実に当てにいく。三振は減るが、長打は出にくい。',
        bunt: '走者を進める。打者はアウトになる。', squeeze: '三塁走者を、バントで迎え入れる。失敗すると、走者がアウト。', steal: '一塁走者が、二塁を狙う。失敗するとアウト。' },
      pitch: { normal: 'いつもどおりに投げる。', fast: '直球で押す。球が速いほど効くが、遅いと打たれる。', breaking: '変化球でかわす。三振とゴロが増えるが、制球が悪いと四球が増える。',
        outside: '外角に集める。長打は減るが、四球が増える。', inside: '内角を攻める。詰まらせるが、制球が悪いと危ない。', walk: '勝負を避けて、歩かせる。' },
    },
  };
  const OUTCOMES = ['K', 'BB', 'GO', 'FO', 'S', 'XB', 'HR'];
  const OUTCOME_LABEL = { K: '三振', BB: '四球', GO: 'ゴロのアウト', FO: 'フライのアウト', S: '単打', XB: '長打', HR: '本塁打' };
  const ORDER_LABEL = {
    bat: { normal: '通常', power: '長打狙い', contact: '短打狙い', bunt: '送りバント', squeeze: 'スクイズ', steal: '盗塁' },
    pitch: { normal: '通常', fast: '直球中心', breaking: '変化球中心', outside: '外角中心', inside: '内角中心', walk: '敬遠' },
  };

  // ---------- 乱数(試作専用。本編と共有しない。mulberry32) ----------
  function Rng(seed) { this.s = seed >>> 0; }
  Rng.prototype.next = function () {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Rng.prototype.int = function (a, b) { return a + Math.floor(this.next() * (b - a + 1)); };
  Rng.prototype.chance = function (p) { return this.next() < p; };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const z = (v) => ((v == null ? 50 : v) - 50) / 50;

  // ---------- 能力のプリセット(本編と同じ尺度:0〜100、特別な選手は150まで) ----------
  const PRESETS = {
    batter: {
      strong: { contact: 80, power: 75, speed: 70 },
      normal: { contact: 50, power: 50, speed: 50 },
      weak: { contact: 25, power: 20, speed: 30 },
    },
    pitcher: {
      strong: { velocity: 80, control: 75, breaking: 70, quick: 60 },
      normal: { velocity: 50, control: 50, breaking: 50, quick: 50 },
      weak: { velocity: 25, control: 25, breaking: 25, quick: 40 },
    },
  };
  // 本編と同じ見せ方(ランク文字、球速 km/h、変化量)
  const RANK = { S: 100, A: 80, B: 65, C: 50, D: 35, E: 20, F: 10 };
  function rankOf(v) { for (const k of Object.keys(RANK)) if (v >= RANK[k]) return k; return 'G'; }
  function kmh(v) { const x = v <= 100 ? 112 + v * 0.45 : 157 + (v - 100) * 0.1; return Math.min(170, Math.round(x)); }
  function breakTotal(v) { return Math.round(v * 0.12); }

  // ---------- 確率 ----------
  // 場面の打者・投手・守備から、z の値をまとめる
  function zs(sc) {
    const b = sc.batter, p = sc.pitcher;
    return { con: z(b.contact), pow: z(b.power), spd: z(b.speed), vel: z(p.velocity), ctl: z(p.control), brk: z(p.breaking),
      stuff: (z(p.velocity) + z(p.breaking)) / 2, def: z(sc.defense), arm: z(sc.arm), quick: z(p.quick) };
  }
  function termSum(t, Z) { let s = 0; for (const k of Object.keys(t || {})) s += k === 'm' ? t[k] : t[k] * (Z[k] || 0); return s; }
  // 打席の結果の確率 { K, BB, GO, FO, S, XB, HR }(合計 1)。order は打撃の指示(bat)か投球の指示(pitch)
  function probs(sc, order, cfg) {
    const C = cfg || CONFIG;
    const Z = zs(sc);
    const side = sc.side === 'pitch' ? 'pitch' : 'bat';
    if (side === 'pitch' && order === 'walk') return { K: 0, BB: 1, GO: 0, FO: 0, S: 0, XB: 0, HR: 0 };
    const O = (C.orders[side] && C.orders[side][order]) || {};
    const w = {};
    let sum = 0;
    for (const k of OUTCOMES) {
      const e = clamp(termSum(C.coef[k], Z), -C.expCap, C.expCap) + termSum(O[k], Z);
      w[k] = C.base[k] * Math.exp(e);
      sum += w[k];
    }
    for (const k of OUTCOMES) w[k] /= sum;
    return capProbs(w, side, C);
  }
  // 上限と下限:成功の合計を cap.min〜cap.max に収める(成功と失敗は補数なので、失敗の側を同じ割合で釣り合わせる)
  function capProbs(w, side, C) {
    const G = C.goodBad[side], cap = C.cap;
    const g = G.good.reduce((a, k) => a + w[k], 0);
    const t = clamp(g, cap.min, cap.max);
    if (t !== g && g > 0 && g < 1) { for (const k of G.good) w[k] *= t / g; for (const k of G.bad) w[k] *= (1 - t) / (1 - g); }
    return w;
  }
  // 指示ごとの、成功と失敗の確率(補数。good = 成功、bad = 失敗。バント・スクイズ・盗塁は kind 'success'。敬遠は null)
  function goodBadOf(sc, order, cfg) {
    const C = cfg || CONFIG;
    const side = sc.side === 'pitch' ? 'pitch' : 'bat';
    if (side === 'pitch' && order === 'walk') return null;
    if (side === 'bat' && (order === 'bunt' || order === 'squeeze' || order === 'steal')) {
      const p = order === 'bunt' ? buntP(sc, C) : order === 'squeeze' ? squeezeP(sc, C) : stealP(sc, C);
      return { good: p, bad: 1 - p, kind: 'success' };
    }
    const P = probs(sc, order, C), g = C.goodBad[side].good.reduce((a, k) => a + P[k], 0);
    return { good: g, bad: 1 - g, kind: 'outcome' };
  }
  const p01 = (C, x) => clamp(x, C.run.pMin, C.run.pMax);
  const capP = (C, p) => clamp(p, C.cap.min, C.cap.max);
  function buntP(sc, C) { C = C || CONFIG; const Z = zs(sc), B = C.bunt; return capP(C, clamp(B.base + B.con * Z.con + B.spd * Z.spd - B.def * Z.def, B.min, B.max)); }
  function buntHitP(sc, C) { C = C || CONFIG; const B = C.bunt; return clamp(B.hitBase + B.hitSpd * z(sc.batter.speed), 0, B.hitMax); }
  function squeezeP(sc, C) { C = C || CONFIG; const Z = zs(sc), Q = C.squeeze; return capP(C, clamp(Q.base + Q.con * Z.con - Q.def * Z.def, Q.min, Q.max)); }
  function stealP(sc, C) { C = C || CONFIG; const S = C.steal; return capP(C, clamp(S.base + S.spd * z(runnerSpd(sc, 1)) - S.arm * z(sc.arm) - S.quick * z(sc.pitcher.quick), S.min, S.max)); }
  const runnerSpd = (sc, base) => (sc.runnerSpeed && sc.runnerSpeed[base - 1] != null ? sc.runnerSpeed[base - 1] : 50);

  // ---------- 走者の更新(分岐つき) ----------
  // 状態:{ outs, b: [一塁, 二塁, 三塁](走者の走力 または null) }。戻り値:[{ q: 確率, outs, b, runs }]
  function branchesOf(sc, kind, C) {
    const b = sc.bases.slice(), outs = sc.outs, R = C.run;
    const arm = z(sc.arm);
    const out = [];
    const add = (q, o, nb, runs) => { if (q > 0) out.push({ q: q, outs: o, b: nb, runs: runs }); };
    const bs = b.map((x) => (x == null ? null : x));
    const bat = sc.batter.speed;
    const pr = (P, spd) => p01(C, P.base + P.spd * z(spd) - (P.arm || 0) * arm);
    if (kind === 'K' || kind === 'FO') { add(1, outs + 1, bs, 0); return out; }
    if (kind === 'GO') {
      if (outs < 2 && bs.some((x) => x != null)) {
        const adv = [null, bs[0], bs[1]];
        const pa = bs[2] != null ? R.go3 : R.goAdv;
        add(pa, outs + 1, adv, bs[2] != null ? 1 : 0);
        add(1 - pa, outs + 1, bs, 0);
      } else add(1, outs + 1, bs, 0);
      return out;
    }
    if (kind === 'BB') {
      let nb = bs.slice(), runs = 0;
      if (nb[0] != null) { if (nb[1] != null) { if (nb[2] != null) runs = 1; nb[2] = nb[1]; } nb[1] = nb[0]; }
      nb[0] = bat;
      add(1, outs, nb, runs);
      return out;
    }
    if (kind === 'HR') { add(1, outs, [null, null, null], 1 + bs.filter((x) => x != null).length); return out; }
    if (kind === 'S') {
      // 三塁走者は生還。二塁走者は生還か三塁。一塁走者は二塁か(三塁が空けば)三塁
      const base3 = bs[2] != null ? 1 : 0;
      const opts2 = bs[1] != null ? [[pr(R.s2home, bs[1]), true], [1 - pr(R.s2home, bs[1]), false]] : [[1, null]];
      for (const [q2, home2] of opts2) {
        const third = home2 === false ? bs[1] : null;
        const runs = base3 + (home2 ? 1 : 0);
        if (bs[0] != null) {
          const p13 = third == null ? pr(R.s1third, bs[0]) : 0;
          add(q2 * p13, outs, [bat, null, bs[0]], runs);
          add(q2 * (1 - p13), outs, [bat, bs[0], third], runs);
        } else add(q2, outs, [bat, null, third], runs);
      }
      return out;
    }
    if (kind === 'XB') {
      const pt = p01(C, R.triple.base + R.triple.spd * z(bat));
      const base23 = (bs[1] != null ? 1 : 0) + (bs[2] != null ? 1 : 0);
      const opts1 = bs[0] != null ? [[pr(R.x1home, bs[0]), true], [1 - pr(R.x1home, bs[0]), false]] : [[1, null]];
      for (const [q1, home1] of opts1) {
        const runs = base23 + (home1 ? 1 : 0);
        // 三塁打:一塁走者も生還
        add(q1 * pt, outs, [null, null, bat], base23 + (bs[0] != null ? 1 : 0));
        add(q1 * (1 - pt), outs, [null, bat, home1 === false ? bs[0] : null], runs);
      }
      return out;
    }
    throw new Error('unknown ' + kind);
  }
  // 指示ごとの分岐([{ q, outs, b, runs, kind }])。kind は結果の種類(打席の7つ、または bunt_ok など)
  function orderBranches(sc, order, cfg) {
    const C = cfg || CONFIG;
    const side = sc.side === 'pitch' ? 'pitch' : 'bat';
    const out = [];
    const push = (q, list, kind) => { for (const x of list) out.push(Object.assign({}, x, { q: q * x.q, kind: kind })); };
    if (side === 'bat' && order === 'bunt') {
      const ps = buntP(sc, C), ph = buntHitP(sc, C) * ps;
      const adv = [null, sc.bases[0], sc.bases[1]];
      push(ps - ph, [{ q: 1, outs: sc.outs + 1, b: adv, runs: 0 }], 'bunt_ok');
      push(ph, [{ q: 1, outs: sc.outs, b: [sc.batter.speed, sc.bases[0], sc.bases[1]], runs: 0 }], 'bunt_hit');
      push(1 - ps, [{ q: 1, outs: sc.outs + 1, b: sc.bases.slice(), runs: 0 }], 'bunt_ng');
      return out;
    }
    if (side === 'bat' && order === 'squeeze') {
      const ps = squeezeP(sc, C);
      push(ps, [{ q: 1, outs: sc.outs + 1, b: [null, sc.bases[0], sc.bases[1]], runs: 1 }], 'sq_ok');
      push(1 - ps, [{ q: 1, outs: sc.outs + 1, b: [sc.batter.speed, sc.bases[0], sc.bases[1]], runs: 0 }], 'sq_ng');
      return out;
    }
    if (side === 'bat' && order === 'steal') {
      const ps = stealP(sc, C);
      push(ps, [{ q: 1, outs: sc.outs, b: [null, sc.bases[0], sc.bases[2]], runs: 0 }], 'st_ok');
      if (sc.bases[2] != null) {   // 一三塁:失敗の送球の間に、三塁走者が本塁を突く
        const d3 = C.steal.ds3;
        push((1 - ps) * d3, [{ q: 1, outs: sc.outs + 1, b: [null, sc.bases[1], null], runs: sc.outs + 1 >= 3 ? 0 : 1 }], 'st_ng3');
        push((1 - ps) * (1 - d3), [{ q: 1, outs: sc.outs + 1, b: [null, sc.bases[1], sc.bases[2]], runs: 0 }], 'st_ng');
      } else push(1 - ps, [{ q: 1, outs: sc.outs + 1, b: [null, sc.bases[1], sc.bases[2]], runs: 0 }], 'st_ng');
      return out;
    }
    const P = probs(sc, order, C);
    for (const k of OUTCOMES) if (P[k] > 0) push(P[k], branchesOf(sc, k, C), k);
    return out;
  }
  // 指示が使えるか
  function legalOrders(sc) {
    const b = sc.bases, side = sc.side === 'pitch' ? 'pitch' : 'bat';
    if (side === 'pitch') return ['normal', 'fast', 'breaking', 'outside', 'inside'].concat(CONFIG.walkEnabled && b[0] == null ? ['walk'] : []);
    const L = ['normal', 'power', 'contact'];
    if (sc.outs < 2 && (b[0] != null || b[1] != null) && b[2] == null) L.push('bunt');   // 三塁に走者がいるときは、スクイズ
    if (sc.outs < 2 && b[2] != null) L.push('squeeze');
    if (b[0] != null && b[1] == null) L.push('steal');
    return L;
  }

  // ---------- 得点期待値(24通り。基準の打者・投手で、反復で解く) ----------
  const stateKey = (outs, b) => outs * 8 + (b[0] != null ? 1 : 0) + (b[1] != null ? 2 : 0) + (b[2] != null ? 4 : 0);
  const reCache = new Map(), p1Cache = new Map();
  // 基準の打者・投手での、状態ごとの分岐(24通り)
  function baseTrans(C) {
    const m = C.reBase;
    const base = { side: 'bat', batter: { contact: m, power: m, speed: m }, pitcher: { velocity: m, control: m, breaking: m, quick: m }, defense: m, arm: m };
    const trans = [];
    for (let s = 0; s < 24; s++) {
      const outs = Math.floor(s / 8), bits = s % 8;
      const b = [bits & 1 ? m : null, bits & 2 ? m : null, bits & 4 ? m : null];
      trans.push(orderBranches(Object.assign({}, base, { outs: outs, bases: b }), 'normal', C));
    }
    return trans;
  }
  // 1点以上取る確率(そのイニングの残りで)。P(s) = Σ q × (得点あり ? 1 : P(次))
  function p1Table(cfg) {
    const C = cfg || CONFIG;
    if (p1Cache.has(C)) return p1Cache.get(C);
    const trans = baseTrans(C);
    let v = new Array(24).fill(0);
    for (let it = 0; it < 400; it++) {
      const nx = trans.map((list) => list.reduce((a, x) => a + x.q * (x.runs > 0 ? 1 : x.outs >= 3 ? 0 : v[stateKey(x.outs, x.b)]), 0));
      const d = nx.reduce((a, w, i) => Math.max(a, Math.abs(w - v[i])), 0);
      v = nx;
      if (d < 1e-10) break;
    }
    p1Cache.set(C, v);
    return v;
  }
  function p1Of(outs, b, cfg) { return outs >= 3 ? 0 : p1Table(cfg)[stateKey(outs, b)]; }
  function reTable(cfg) {
    const C = cfg || CONFIG;
    if (reCache.has(C)) return reCache.get(C);
    const trans = baseTrans(C);
    let re = new Array(24).fill(0);
    for (let it = 0; it < 400; it++) {
      const nx = trans.map((list) => list.reduce((a, x) => a + x.q * (x.runs + (x.outs >= 3 ? 0 : re[stateKey(x.outs, x.b)])), 0));
      const d = nx.reduce((a, v, i) => Math.max(a, Math.abs(v - re[i])), 0);
      re = nx;
      if (d < 1e-10) break;
    }
    reCache.set(C, re);
    return re;
  }
  function reOf(outs, b, cfg) { return outs >= 3 ? 0 : reTable(cfg)[stateKey(outs, b)]; }
  // 指示の見込み:この打席(または盗塁)の得点 + 次の状態の得点期待値の期待値。攻撃側から見た値
  function expectOrder(sc, order, cfg) {
    const br = orderBranches(sc, order, cfg);
    return br.reduce((a, x) => a + x.q * (x.runs + reOf(x.outs, x.b, cfg)), 0);
  }
  // 1点以上取る確率の見込み
  function expectOrderP1(sc, order, cfg) {
    const br = orderBranches(sc, order, cfg);
    return br.reduce((a, x) => a + x.q * (x.runs > 0 ? 1 : p1Of(x.outs, x.b, cfg)), 0);
  }
  const isLateClose = (sc, C) => sc.inning >= C.lateClose.inning && Math.abs(sc.diff) <= C.lateClose.diff;
  // 全指示の見込み(確率の変化つき)。best:攻撃は最大、守備(投手)は最小。終盤の接戦は「1点以上の確率」、それ以外は得点期待値で比べる
  function evaluate(sc, cfg) {
    const C = cfg || CONFIG;
    const now = reOf(sc.outs, sc.bases, C);
    const p0 = probs(sc, 'normal', C);
    const rows = legalOrders(sc).map((o) => {
      const special = ['bunt', 'squeeze', 'steal', 'walk'].indexOf(o) >= 0;
      const P = special ? null : probs(sc, o, C);
      const delta = P ? OUTCOMES.reduce((d, k) => (d[k] = P[k] - p0[k], d), {}) : null;
      const succ = o === 'bunt' ? buntP(sc, C) : o === 'squeeze' ? squeezeP(sc, C) : o === 'steal' ? stealP(sc, C) : null;
      const gb = goodBadOf(sc, o, C), gb0 = goodBadOf(sc, 'normal', C);
      return { order: o, label: ORDER_LABEL[sc.side === 'pitch' ? 'pitch' : 'bat'][o], ev: expectOrder(sc, o, C), p1: expectOrderP1(sc, o, C), probs: P, delta: delta, success: succ,
        good: gb ? gb.good : null, bad: gb ? gb.bad : null, dGood: gb && gb.kind === 'outcome' ? gb.good - gb0.good : null, dBad: gb && gb.kind === 'outcome' ? gb.bad - gb0.bad : null };
    });
    const metric = isLateClose(sc, C) ? 'p1' : 'ev';
    const pick = sc.side === 'pitch' ? (a, b) => (b[metric] < a[metric] ? b : a) : (a, b) => (b[metric] > a[metric] ? b : a);
    const n = rows.find((r) => r.order === 'normal');
    for (const r of rows) {
      r.dm = (r[metric] - n[metric]) * (sc.side === 'pitch' ? -1 : 1);   // 通常との差(得をする向きが正)
      r.rating = ratingOf(r.dm, metric, C);
      r.feature = featureOf(r, C);
    }
    return { side: sc.side === 'pitch' ? 'pitch' : 'bat', re: now, p1: p1Of(sc.outs, sc.bases, C), metric: metric, rows: rows, best: rows.reduce(pick).order };
  }
  // 期待値の評価(1〜7)。dm:通常との差(得をする向きが正)
  function ratingOf(dm, metric, cfg) {
    const R = (cfg || CONFIG).rating, x = dm / R.step[metric] + 1e-9 * Math.sign(dm);
    return clamp(R.base + (R.round === 'trunc' ? Math.trunc(x) : Math.round(x)), R.min, R.max);
  }
  // 特徴の一言:{ up:[結果], down:[結果], text }。確率の変化(row.delta)から作る。バント・スクイズ・盗塁は、仕組みの文
  function featureOf(row, cfg) {
    const F = (cfg || CONFIG).feature;
    if (row.order === 'normal') return { up: [], down: [], text: F.normal };
    if (!row.delta) return { up: [], down: [], text: F.mech[row.order] || '' };
    const p0 = {}; for (const k of OUTCOMES) p0[k] = row.probs[k] - row.delta[k];
    const hit = OUTCOMES.map((k) => ({ k: k, d: row.delta[k], r: Math.abs(row.delta[k]) / Math.max(1e-9, p0[k]) }))
      .filter((x) => Math.abs(x.d) >= F.min - 1e-12 || (F.rel > 0 && x.r >= F.rel && Math.abs(x.d) >= F.floor));
    hit.sort((a, b) => b.r - a.r);
    const up = hit.filter((x) => x.d > 0).slice(0, F.maxEach).map((x) => x.k), down = hit.filter((x) => x.d < 0).slice(0, F.maxEach).map((x) => x.k);
    const text = up.map((k) => F.label[k] + '↑').concat(down.map((k) => F.label[k] + '↓')).join(' ');
    return { up: up, down: down, text: text || F.flat };
  }
  // 2択の表示(T1f):攻めと堅実は、同じ種類の指示(ui.twoGroups)から選ぶ
  //   攻め=その種類で評価が最も高い指示(同じなら成功確率が低いほう)、堅実=攻めを除いて成功確率が最も高い指示(候補がなければ null)
  //   作戦(バント・スクイズ・盗塁)は2択に入れず、評価が tacticMin 以上のものがあるときだけ、評価が最高の1つを tactic に
  //   dominated:堅実が、成功確率でも評価でも、攻めを上回らない。gap:攻めと堅実の評価の差
  function twoChoice(ev, cfg) {
    const U = (cfg || CONFIG).ui;
    const grp = U.twoGroups[ev.side];
    const rows = ev.rows.filter((r) => r.good != null && grp.indexOf(r.order) >= 0);
    const attack = rows.reduce((a, b) => (b.rating > a.rating || (b.rating === a.rating && b.good < a.good) ? b : a));
    const rest = rows.filter((r) => r !== attack);
    const safe = rest.length ? rest.reduce((a, b) => (b.good > a.good ? b : a)) : null;
    const tac = ev.rows.filter((r) => r.good != null && grp.indexOf(r.order) < 0 && r.rating >= U.tacticMin);
    const tactic = tac.length ? tac.reduce((a, b) => (b.rating > a.rating || (b.rating === a.rating && b.good > a.good) ? b : a)) : null;
    return { attack: attack, safe: safe, tactic: tactic, dominated: !!safe && safe.good <= attack.good && safe.rating <= attack.rating, gap: safe ? attack.rating - safe.rating : null };
  }

  // ---------- 抽選と結果 ----------
  function resolve(sc, order, rng, cfg) {
    const br = orderBranches(sc, order, cfg);
    let u = rng.next(), x = br[br.length - 1];
    for (const y of br) { if (u < y.q) { x = y; break; } u -= y.q; }
    const before = reOf(sc.outs, sc.bases, cfg);
    const after = reOf(x.outs, x.b, cfg);
    return { kind: x.kind, label: KIND_LABEL[x.kind] || OUTCOME_LABEL[x.kind], outs: x.outs, bases: x.b, runs: x.runs, reBefore: before, reAfter: after,
      // 攻撃側の得点期待値の変化(この打席の得点を含む)
      delta: x.runs + after - before };
  }
  const KIND_LABEL = { bunt_ok: '送りバント成功', bunt_hit: 'バントヒット', bunt_ng: '送りバント失敗', sq_ok: 'スクイズ成功', sq_ng: 'スクイズ失敗(三塁走者アウト)', st_ok: '盗塁成功', st_ng: '盗塁失敗', st_ng3: '盗塁失敗(その間に三塁走者が生還)' };

  // ---------- 場面 ----------
  // 場面:{ inning, side:'bat'|'pitch', outs, bases:[走力|null ×3], diff(自校−相手), batter, pitcher, defense, arm, hero, focus }
  function makeScene(o) {
    // 表と裏(T1f):自校は先攻。攻撃(bat)は表、守備(pitch)は裏(half を指定したときは、それに従う)
    const s = Object.assign({ inning: 1, winP: 0.5, bats: 'R', throws: 'R', side: 'bat', outs: 0, bases: [null, null, null], diff: 0, batter: Object.assign({}, PRESETS.batter.normal), pitcher: Object.assign({}, PRESETS.pitcher.normal),
      defense: 50, arm: 50, hero: true, focus: false }, o);
    if (s.half == null) s.half = s.side === 'pitch' ? 'bottom' : 'top';
    return s;
  }
  const R = 50;
  const SCENES = [
    { name: '無死一塁', inning: 3, outs: 0, bases: [R, null, null], diff: 0 },
    { name: '無死二塁', inning: 5, outs: 0, bases: [null, R, null], diff: 0 },
    { name: '一死三塁', inning: 6, outs: 1, bases: [null, null, R], diff: -1 },
    { name: '一死二三塁', inning: 7, outs: 1, bases: [null, R, R], diff: 0 },
    { name: '二死満塁・1点差', inning: 8, outs: 2, bases: [R, R, R], diff: -1 },
    { name: '9回・1点リード・二死二塁(守備)', inning: 9, side: 'pitch', outs: 2, bases: [null, R, null], diff: 1 },
    { name: '一死一三塁(守備)', inning: 7, side: 'pitch', outs: 1, bases: [R, null, R], diff: 0 },
    { name: '無死満塁(守備)', inning: 4, side: 'pitch', outs: 0, bases: [R, R, R], diff: 2 },
    { name: '二死一塁・俊足', inning: 8, outs: 2, bases: [80, null, null], diff: 0 },
    { name: '一死一塁(守備)・強打者', inning: 6, side: 'pitch', outs: 1, bases: [R, null, null], diff: -1, batter: Object.assign({}, PRESETS.batter.strong) },
    { name: '先頭打者', inning: 1, outs: 0, bases: [null, null, null], diff: 0 },
  ].map((s) => makeScene(s));
  // シードから場面を作る(試作専用の乱数)
  function randomScene(seed) {
    const r = new Rng(seed);
    const pick = (o) => { const ks = Object.keys(o); return o[ks[r.int(0, ks.length - 1)]]; };
    const jit = (o) => { const x = {}; for (const k of Object.keys(o)) x[k] = clamp(o[k] + r.int(-10, 10), 1, 100); return x; };
    const bases = [0, 1, 2].map(() => (r.chance(0.4) ? r.int(30, 80) : null));
    const winP = Math.round((0.15 + r.next() * 0.75) * 100) / 100;   // 事前勝率 15〜90%
    const late = r.chance(CONFIG.lateCloseShare);   // 終盤の接戦
    const sc = makeScene({ name: 'シード ' + seed, inning: late ? r.int(7, 9) : r.int(1, 9), half: (r.next(), null), winP: winP, side: r.chance(0.5) ? 'bat' : 'pitch', outs: r.int(0, 2), bases: bases, diff: late ? r.int(-2, 2) : r.int(-4, 4),
      batter: jit(pick(PRESETS.batter)), pitcher: jit(pick(PRESETS.pitcher)), defense: r.int(30, 70), arm: r.int(30, 70), hero: r.chance(0.6), focus: r.chance(0.3) });
    return Object.assign(sc, handsOf(seed));
  }
  // 左右(場面のシードから決める。別系統の乱数。表示だけ)
  function handsOf(seed) {
    const h = new Rng((seed ^ 0x5bd1e995) >>> 0);
    const R = CONFIG.hands.right;
    return { bats: h.next() < R ? 'R' : 'L', throws: h.next() < R ? 'R' : 'L' };
  }
  // 傾向タグ(kind:'batter' | 'pitcher')
  function tagsOf(kind, ab, cfg) {
    const T = (cfg || CONFIG).tags;
    const hit = T[kind].filter((t) => (t.min != null ? ab[t.key] >= t.min : ab[t.key] <= t.max)).map((t) => ({ word: t.word, dev: Math.abs(ab[t.key] - 50) }));
    hit.sort((a, b) => b.dev - a.dev);
    const out = hit.slice(0, T.max).map((t) => t.word);
    return out.length ? out : ['平均的'];
  }
  // カードの中身(表示の切り替え):mode は 'rating' | 'prob-only' | 'two-choice'。
  //   戻り値:[{ order, name, sub(2択のときの実際の指示の名前), feature, good(成功確率), rating(prob-only は null), as('attack'|'safe'|'tactic') }]
  function cardsOf(ev, mode, cfg) {
    const C = cfg || CONFIG;
    const card = (r, as) => ({ order: r.order, name: as ? C.ui.two[as] : r.label, sub: as ? r.label : null, feature: r.feature.text, good: r.good, rating: mode === 'prob-only' ? null : r.rating, as: as || null });
    if (mode === 'two-choice') { const t = twoChoice(ev, C); return [card(t.attack, 'attack')].concat(t.safe ? [card(t.safe, 'safe')] : [], t.tactic ? [card(t.tactic, 'tactic')] : []); }
    return ev.rows.filter((r) => r.good != null).map((r) => card(r));
  }
  // 画面の手順(1タップで確定):pick でカードを押すと、すぐ結果。auto は勝負にならない試合(通常)。next で次へ(結果が出るまでは進まない)
  function uiStep(st, action, arg) {
    const s = Object.assign({ sel: null, result: null }, st);
    if (action === 'pick') { if (!s.result && arg) { s.sel = arg; s.result = { order: arg }; } return s; }
    if (action === 'auto') { if (!s.result) { s.sel = 'normal'; s.result = { order: 'normal', auto: true }; } return s; }
    if (action === 'next') return s.result || !st ? { sel: null, result: null } : s;
    return s;
  }

  // ---------- 試合の事前勝率・戦力差・勝率の推定 ----------
  function inWinRange(sc, K) { const p = sc.winP == null ? 0.5 : sc.winP; return p >= K.winRange[0] && p <= K.winRange[1]; }
  function strengthLabel(winP, cfg) { const S = (cfg || CONFIG).strength; return winP <= S.under ? '格上' : winP >= S.over ? '格下' : '同格'; }
  // 標準正規分布の累積と、その逆(近似)
  function phi(x) { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989423 * Math.exp(-x * x / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; }
  function phiInv(p) { let lo = -8, hi = 8; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (phi(m) < p) lo = m; else hi = m; } return (lo + hi) / 2; }
  // 試合の勝率(自校から見て。簡易):
  //   D = 点差 + 今の半イニングの見込み(攻撃中は +RE、守備中は −RE) + 自校の残り半イニング数 ×(μ + δ/2) − 相手の残り ×(μ − δ/2)
  //   Var = (残り半イニング数の合計 + 今の半イニングの割合) × v。勝率 = Φ(D ÷ √Var)。δ は、事前勝率 = Φ(9δ ÷ √(18v)) から逆算
  //   表裏:自校が攻撃で表なら先攻。残りの数は、9回で終わる前提(延長とサヨナラは無視)
  function gameWinProb(sc, st, cfg) {
    const C = cfg || CONFIG, v = C.winModel.v;
    const mu = reOf(0, [null, null, null], C);
    const delta = phiInv(clamp(sc.winP == null ? 0.5 : sc.winP, 0.01, 0.99)) * Math.sqrt(18 * v) / 9;
    const s = st || { outs: sc.outs, bases: sc.bases, diff: sc.diff };
    const i = sc.inning, top = sc.half !== 'bottom', bat = sc.side !== 'pitch';
    // この半イニングのあとの残り:自校(my)、相手(op)
    const weAway = bat ? top : !top;   // 自校が先攻か
    // 表の途中なら、後攻のチームには、この回の裏が残る
    const my = 9 - i + (top && !weAway ? 1 : 0), op = 9 - i + (top && weAway ? 1 : 0);
    const cur = s.outs >= 3 ? 0 : reOf(s.outs, s.bases, C);
    const curShare = s.outs >= 3 ? 0 : Math.min(1, cur / Math.max(0.01, mu));
    const D = s.diff + (bat ? cur : -cur) + my * (mu + delta / 2) - op * (mu - delta / 2);
    const Var = (my + op + curShare) * v;
    if (Var < 1e-9) return D > 0 ? 1 : D < 0 ? 0 : 0.5;
    return clamp(phi(D / Math.sqrt(Var)), 0.001, 0.999);
  }

  // ---------- 介入場面の判定 ----------
  //   rule:プリセット名('success' / 'manager')か、{ bat:{ who:'all'|'focus', minInning, chance }, pitch:{ pinch, maxDiff, minInning } }
  //   野手:who が 'all' なら主人公の打席、'focus' なら注目選手の打席。chance が true なら、得点圏に走者がいるときだけ
  //   投手:得点圏に走者(満塁を含む)、かつ |点差| ≤ maxDiff、かつ minInning 回以降
  function isKeyScene(sc, rule, cfg) {
    const C = cfg || CONFIG;
    const K = typeof rule === 'string' ? C.keyScene[rule] : rule;
    if (!K) return false;
    if (K.winRange && !inWinRange(sc, K)) return false;   // 勝負にならない試合
    const risp = sc.bases[1] != null || sc.bases[2] != null;
    if (sc.side === 'pitch') {
      const P = K.pitch;
      if (!P || !P.pinch) return false;
      return risp && Math.abs(sc.diff) <= P.maxDiff && sc.inning >= (P.minInning || 1);
    }
    const B = K.bat;
    if (!B) return false;
    const who = B.who === 'focus' ? !!sc.focus : !!sc.hero;
    return who && sc.inning >= (B.minInning || 1) && (!B.chance || risp);
  }

  // ---------- 試合の通し(T1e) ----------
  //   状態 G を持ち、advance(G) で、次の介入場面か、半イニングの終わりか、試合の終わりまで進める。choose(G, 指示) で介入場面を確定する
  //   乱数:編成はシードから、打席は「シード × 打席の番号」から(打席ごとに独立。介入より前の打席は、選択に関係なく同じ)
  const mix = (a, b) => { let h = Math.imul((a >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b >>> 0) + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return h >>> 0; };
  const BASE_NAME = ['一塁', '二塁', '三塁'], OUT_NAME = ['無死', '一死', '二死'];
  function basesText(b) {
    const on = [0, 1, 2].filter((i) => b[i] != null);
    if (!on.length) return '走者なし';
    if (on.length === 3) return '満塁';
    return on.length === 1 ? BASE_NAME[on[0]] : on.map((i) => '一二三'[i]).join('') + '塁';
  }
  function makeTeam(lv, r, C) {
    const G = C.game, T = G.teams[lv] || G.teams.normal, j = (o) => { const x = {}; for (const k of Object.keys(o)) x[k] = clamp(o[k] + r.int(-G.jitter, G.jitter), 1, 100); return x; };
    const hand = () => (r.next() < C.hands.right ? 'R' : 'L');
    const lineup = Array.from({ length: 9 }, () => Object.assign(j(T.bat), { bats: hand() }));
    return { level: lv, lineup: lineup, pitcher: Object.assign(j(T.pit), { throws: hand() }), defense: clamp(T.def + r.int(-5, 5), 1, 100), arm: clamp(T.def + r.int(-5, 5), 1, 100) };
  }
  // o:{ seed, mode:'bat'|'pitch', my, op(強さ), winP(省略で見積もる) }
  function newGame(o, cfg) {
    const C = cfg || CONFIG, seed = (o.seed >>> 0);
    const r = new Rng(mix(seed, 0x7e41));
    const G = { seed: seed, mode: o.mode === 'pitch' ? 'pitch' : 'bat', myLevel: o.my || 'normal', opLevel: o.op || 'normal', my: o.teams ? o.teams.my : makeTeam(o.my || 'normal', r, C), op: o.teams ? o.teams.op : makeTeam(o.op || 'normal', r, C),
      paSeed: o.paSeed != null ? o.paSeed : mix(seed, 1), quiet: !!o.quiet, plain: !!o.plain, C: C };
    resetGame(G);
    G.winP = o.winP != null ? o.winP : priorWinP(G);
    return G;
  }
  function resetGame(G) {
    Object.assign(G, { inning: 1, top: true, outs: 0, bases: [null, null, null], score: { my: 0, op: 0 }, line: { my: [], op: [] }, hits: { my: 0, op: 0 }, idx: { my: 0, op: 0 },
      pa: 0, keysUsed: 0, keyLog: [], log: [], halfNo: 0, rec: newRec(), done: false, result: null, walkoff: false, pending: null, skipKey: false, lastTpl: {}, paLog: [] });
  }
  const newRec = () => ({ batters: 0, hits: 0, walks: 0, runs: 0 });
  // 事前勝率:同じ編成で、自動の試合(別系統の乱数)を priorN 回。引き分けは 0.5
  function priorWinP(G) {
    const N = G.C.game.priorN;
    let w = 0;
    for (let i = 0; i < N; i++) {
      const g = { seed: G.seed, mode: G.mode, my: G.my, op: G.op, paSeed: mix(G.seed ^ 0x51ed, i + 1), quiet: true, plain: true, C: G.C, winP: 0.5 };
      resetGame(g);
      while (!g.done) advance(g);
      w += g.result === 'win' ? 1 : g.result === 'draw' ? 0.5 : 0;
    }
    return Math.round(w / N * 1000) / 1000;
  }
  // いまの打席の場面(自校から見た点差・攻守)
  function curScene(G) {
    const batMy = G.top, key = batMy ? 'my' : 'op', bt = G[key], ft = batMy ? G.op : G.my, i = G.idx[key];
    return makeScene({ inning: G.inning, half: G.top ? 'top' : 'bottom', side: batMy ? 'bat' : 'pitch', outs: G.outs, bases: G.bases.slice(), diff: G.score.my - G.score.op,
      batter: bt.lineup[i], pitcher: ft.pitcher, defense: ft.defense, arm: ft.arm, winP: G.winP, hero: G.mode === 'bat' && batMy && i === G.C.game.myOrder - 1, focus: false,
      bats: bt.lineup[i].bats, throws: ft.pitcher.throws, order: i + 1, name: '' });
  }
  function isGameKey(G, sc) {
    if (G.plain || G.keysUsed >= G.C.game.maxKeys) return false;
    if ((G.mode === 'bat') !== (sc.side === 'bat')) return false;
    return isKeyScene(sc, G.C.game.key, G.C);
  }
  // 試合の勝率(自校から見て)。終わっていれば 1 / 0.5 / 0
  function gameWin(G) { return G.done ? (G.result === 'win' ? 1 : G.result === 'draw' ? 0.5 : 0) : gameWinProb(curScene(G), null, G.C); }
  // 1打席(盗塁は、打席を消費しない)
  function playPA(G, order) {
    const sc = curScene(G), key = G.top ? 'my' : 'op';
    const r = resolve(sc, order, new Rng(mix(G.paSeed, G.pa)), G.C);
    if (!G.quiet) G.paLog.push(G.pa + ':' + r.kind + ':' + r.runs);
    G.pa++;
    const steal = /^st_/.test(r.kind);
    if (!steal) { G.rec.batters++; G.idx[key] = (G.idx[key] + 1) % 9; }
    if (r.kind === 'S' || r.kind === 'XB' || r.kind === 'HR' || r.kind === 'bunt_hit') { G.rec.hits++; G.hits[key]++; }
    if (r.kind === 'BB') G.rec.walks++;
    G.score[key] += r.runs; G.rec.runs += r.runs;
    G.outs = r.outs; G.bases = r.bases.slice();
    if (!G.top && G.inning === 9 && G.score.op > G.score.my) { G.walkoff = true; endHalf(G); }
    else if (G.outs >= 3) endHalf(G);
    return { sc: sc, r: r, steal: steal };
  }
  function endHalf(G) {
    const key = G.top ? 'my' : 'op', rec = G.rec;
    G.line[key][G.inning - 1] = rec.runs;
    const lob = G.outs >= 3 || G.walkoff ? G.bases.filter((x) => x != null).length : 0;
    if (!G.quiet) halfLog(G, key, rec, G.walkoff ? 0 : lob);
    G.halfNo++;
    if (G.top) {
      if (G.inning === 9 && G.score.op > G.score.my) { G.line.op[8] = 'x'; return endGame(G); }
      G.top = false;
    } else {
      if (G.walkoff || G.inning === 9) return endGame(G);
      G.inning++; G.top = true;
    }
    G.outs = 0; G.bases = [null, null, null]; G.rec = newRec();
  }
  function endGame(G) {
    G.done = true;
    G.result = G.score.my > G.score.op ? 'win' : G.score.my < G.score.op ? 'lose' : 'draw';
    if (!G.quiet) {
      const res = G.result === 'win' ? '勝ち' : G.result === 'draw' ? '引き分け' : (G.walkoff ? 'サヨナラ負け' : '負け');
      G.log.push({ kind: 'end', hl: true, score: [G.score.my, G.score.op], result: G.result, text: '試合終了。' + res + '(' + G.score.my + '-' + G.score.op + ')' });
    }
  }
  const halfName = (inn, top) => inn + '回' + (top ? '表' : '裏');
  // 半イニングの記録から、ログの文を作る(嘘をつかない。数字は記録から)
  function pickText(G, cat) {
    const L = G.C.game.text[cat];
    let i = mix(G.seed, G.halfNo * 31 + cat.length) % L.length;
    if (G.lastTpl[cat] === i) i = (i + 1) % L.length;
    G.lastTpl[cat] = i;
    return L[i];
  }
  function fill(t, d) { return t.replace(/\{(\w+)\}/g, (m, k) => (d[k] != null ? d[k] : m)); }
  function halfLog(G, key, rec, lob) {
    const on = rec.hits + rec.walks;
    const cat = key + '_' + (rec.runs > 0 ? 'score' : rec.batters <= 3 && on === 0 ? 'three' : rec.hits > 0 ? 'hit' : on > 0 ? 'walk' : 'three');
    const d = { h: halfName(G.inning, G.top), runs: rec.runs, hits: rec.hits, on: on, lob: lob, score: G.score.my + '-' + G.score.op };
    G.log.push({ kind: 'half', team: key, inn: G.inning, top: G.top, cat: cat, hl: rec.runs > 0, runs: rec.runs, hits: rec.hits, walks: rec.walks, batters: rec.batters, lob: lob, score: [G.score.my, G.score.op], text: fill(pickText(G, cat), d) });
  }
  // 次の介入場面・半イニングの終わり・試合の終わりまで進める
  function advance(G) {
    if (G.done) return { type: 'end' };
    if (G.pending) return { type: 'key', sc: G.pending.sc, ev: G.pending.ev };
    const h = G.halfNo;
    while (!G.done && G.halfNo === h) {
      const sc = curScene(G);
      if (!G.skipKey && isGameKey(G, sc)) { G.pending = { sc: sc, ev: evaluate(sc, G.C), w0: gameWin(G) }; return { type: 'key', sc: sc, ev: G.pending.ev }; }
      G.skipKey = false;
      playPA(G, 'normal');
    }
    return { type: G.done ? 'end' : 'half' };
  }
  // 介入場面の確定:指示 order で、その打席を進める。ログ(介入場面の結果)と、ふりかえりの記録を残す
  function choose(G, order) {
    const P = G.pending;
    if (!P) return null;
    G.pending = null; G.keysUsed++;
    const sc = P.sc, row = P.ev.rows.find((x) => x.order === order) || P.ev.rows[0], at = G.log.length;
    const inn = G.inning, top = G.top;
    const out = playPA(G, row.order);
    if (out.steal) G.skipKey = true;   // 盗塁のあとの同じ打者の打席は、自動
    const w1 = gameWin(G), r = out.r, bat = sc.side === 'bat';
    const sit = (bat ? '自分の打席' : 'ピンチ') + '(' + OUT_NAME[sc.outs] + basesText(sc.bases) + ')';
    const res = r.label + (r.runs ? '、' + r.runs + '点' + (bat ? '' : 'を取られた') : (bat ? '' : '、無失点'));
    const pc = (v) => Math.round(v * 100) + '%';
    const item = { kind: 'key', hl: true, inn: inn, top: top, order: row.order, label: row.label, rating: row.rating, result: r.label, runs: r.runs, w0: P.w0, w1: w1, sit: sit, score: [G.score.my, G.score.op],
      text: halfName(inn, top) + ' ' + sit + '。『' + row.label + '』を選んだ。' + res + '(勝率 ' + pc(P.w0) + '→' + pc(w1) + ')' };
    G.log.splice(at, 0, item);
    G.keyLog.push(item);
    return { r: r, row: row, item: item };
  }
  // 結果だけ見る:以降の介入場面を、すべて「通常」で、最後まで
  function finishPlain(G) {
    if (G.pending) choose(G, 'normal');
    G.plain = true;
    while (!G.done) advance(G);
  }
  // 方針 policy(sc, ev) → 指示 で、最後まで(検証用)
  function playGame(G, policy) {
    while (!G.done) { const e = advance(G); if (e.type === 'key') choose(G, policy ? policy(e.sc, e.ev) : 'normal'); }
    return G;
  }

  return {
    CONFIG: CONFIG, newGame: newGame, advance: advance, choose: choose, finishPlain: finishPlain, playGame: playGame, gameWin: gameWin, curScene: curScene, priorWinP: priorWinP, basesText: basesText, mixSeed: mix, OUTCOMES: OUTCOMES, OUTCOME_LABEL: OUTCOME_LABEL, ORDER_LABEL: ORDER_LABEL, PRESETS: PRESETS, SCENES: SCENES,
    Rng: Rng, probs: probs, orderBranches: orderBranches, legalOrders: legalOrders, reTable: reTable, reOf: reOf, p1Table: p1Table, p1Of: p1Of, expectOrderP1: expectOrderP1, expectOrder: expectOrder,
    evaluate: evaluate, ratingOf: ratingOf, featureOf: featureOf, twoChoice: twoChoice, cardsOf: cardsOf, resolve: resolve, goodBadOf: goodBadOf, gameWinProb: gameWinProb, strengthLabel: strengthLabel, inWinRange: inWinRange, makeScene: makeScene, randomScene: randomScene, handsOf: handsOf, tagsOf: tagsOf, uiStep: uiStep, isKeyScene: isKeyScene,
    buntP: buntP, squeezeP: squeezeP, stealP: stealP, rankOf: rankOf, kmh: kmh, breakTotal: breakTotal,
  };
});
