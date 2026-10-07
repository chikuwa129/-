// =============================================================
// logic.js : ゲームロジック(DOM 非依存)
//   - Core       : 乱数・選手生成・成長・適性・編成・記録。高校版/プロ版で共通に使う部分
//   - HighSchool : 高校版の進行(月カレンダー、入部、コンバート、大会、卒業、指導力)
//   - Generation : 世代の基準(benchmark.js)と比べた「同世代の上位○%」とラベル
//   - Tuning     : 調整画面の上書き設定(config.js の値を差し替える)
//   - Persist    : 保存・読み込み・リセット(localStorage と同じ形のオブジェクトを渡す)
//   - Sim        : 画面なしの自動実行と集計(sim.js と調整画面の試し計算が共用)
// ブラウザでは window.Logic、Node.js では module.exports で使う。
// =============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    let bench = null;
    try { bench = require('./benchmark.js'); } catch (e) { bench = null; }
    module.exports = factory(require('./config.js'), bench);
  } else {
    root.Logic = factory(root.CONFIG, root.BENCHMARK || null);
  }
})(typeof self !== 'undefined' ? self : this, function (CONFIG, BENCHMARK) {
  'use strict';

  // ===========================================================
  // 共通モジュール(Core)
  // ===========================================================

  // ---------- 乱数(シード指定可能:mulberry32) ----------
  function Rng(seed) {
    this.s = seed >>> 0;
  }
  Rng.prototype.next = function () {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Rng.prototype.int = function (min, max) { // 両端を含む
    return min + Math.floor(this.next() * (max - min + 1));
  };
  Rng.prototype.float = function (min, max) { return min + this.next() * (max - min); };
  Rng.prototype.chance = function (p) { return this.next() < p; };
  Rng.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  Rng.prototype.normal = function (mean, sd) {
    const u = 1 - this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  // { key: weight } または [weight, ...] から1つ選ぶ
  Rng.prototype.weighted = function (weights) {
    const keys = Object.keys(weights);
    let total = 0;
    for (const k of keys) total += weights[k];
    let r = this.next() * total;
    for (const k of keys) {
      r -= weights[k];
      if (r < 0) return Array.isArray(weights) ? Number(k) : k;
    }
    const last = keys[keys.length - 1];
    return Array.isArray(weights) ? Number(last) : last;
  };
  // 配列をシャッフルした新しい配列
  Rng.prototype.shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };

  // ---------- 定義(ラベル類) ----------
  const PITCH_KEYS = ['velocity', 'control', 'breaking', 'stamina'];
  const BAT_KEYS = ['contact', 'power', 'speed', 'defense', 'arm'];
  const ALL_KEYS = PITCH_KEYS.concat(BAT_KEYS);
  const ABILITY_LABEL = {
    velocity: '球速', control: '制球', breaking: '変化球', stamina: 'スタミナ',
    contact: 'ミート', power: 'パワー', speed: '走力', defense: '守備', arm: '肩',
  };
  const POSITIONS = ['P', 'C', 'IF', 'OF'];
  const POSITION_LABEL = { P: '投手', C: '捕手', IF: '内野', OF: '外野' };
  const POSITION_SHORT = { P: '投', C: '捕', IF: '内', OF: '外' };
  const SIDE_LABEL = { pitch: '投手系', bat: '野手系' };

  const POLICIES = {
    pitch: [
      { key: 'velocity', label: '球速特化', focus: 'velocity' },
      { key: 'control', label: '制球特化', focus: 'control' },
      { key: 'breaking', label: '変化球特化', focus: 'breaking' },
      { key: 'balance', label: 'バランス', focus: null },
    ],
    bat: [
      { key: 'power', label: '長打特化', focus: 'power' },
      { key: 'contact', label: '巧打特化', focus: 'contact' },
      { key: 'speed', label: '俊足特化', focus: 'speed' },
      { key: 'defense', label: '守備特化', focus: 'defense' },
      { key: 'balance', label: 'バランス', focus: null },
    ],
    twoWay: [
      { key: 'pitch', label: '投手側を伸ばす', side: 'pitch' },
      { key: 'bat', label: '打者側を伸ばす', side: 'bat' },
      { key: 'both', label: '両方', side: null },
    ],
  };

  const OUTCOME_LABEL = { big: '大きく伸びた', small: '少し伸びた', none: '変わらない' };
  const TALENT_LABEL = { normal: '通常', genius: '天才' };

  // 名字(日本に多い一般的な名字のみ)
  const SURNAMES = [
    '佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤',
    '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水',
    '山崎', '森', '池田', '橋本', '阿部', '石川', '山下', '中島', '石井', '小川',
    '前田', '岡田', '長谷川', '藤田', '後藤', '近藤', '村上', '遠藤', '青木', '坂本',
    '福田', '太田', '西村', '藤井', '金子', '岡本', '藤原', '中野', '三浦', '原田',
    '中川', '松田', '竹内', '小野', '田村', '中山', '和田', '石田', '森田', '上田',
    '原', '内田', '柴田', '酒井', '宮崎', '横山', '高木', '安藤', '宮本', '大野',
    '小島', '谷口', '今井', '工藤', '高田', '増田', '丸山', '杉山', '村田', '大塚',
    '新井', '小山', '平野', '藤本', '河野', '上野', '野口', '武田', '松井', '千葉',
    '岩崎', '菅原', '木下', '久保', '佐野', '野村', '松尾', '市川', '菊地', '杉本',
    '古川', '大西', '島田', '水野', '桜井', '高野', '吉川', '山内', '西田', '飯田',
    '中西', '服部', '樋口', '福島', '川口', '永井', '松岡', '北村', '安田', '中田',
  ];
  // 名前(漢字1文字)
  const GIVEN_NAMES = [
    '翔', '大', '健', '誠', '蓮', '陸', '湊', '颯', '樹', '悠',
    '隼', '拓', '亮', '海', '匠', '駿', '響', '遼', '剛', '勇',
    '優', '輝', '航', '新', '圭', '渉', '塁', '迅', '尚', '智',
    '聖', '仁', '光', '司', '純', '進', '昇', '雄', '豪', '力',
    '武', '敦', '啓', '峻', '碧', '凌', '朔', '晴', '陽', '稜',
  ];

  // 副能力が判明したときの文面(固定リストから乱数で選ぶ)
  const REVEAL_TEXTS = {
    pitch: {
      good: ['{n}がマウンドへ。意外にも球速が出た!', '{n}がマウンドへ。思わぬ好投にベンチがざわつく。', '{n}が急きょ登板。案外さまになっている。'],
      bad: ['{n}がマウンドへ。ストライクが入らない…', '{n}が急きょ登板。山なりのボールが精一杯だった。', '{n}がマウンドへ。やはり本職ではなかった。'],
    },
    bat: {
      good: ['{n}が野手で出場。意外にもバットが振れる!', '{n}が守備につく。思った以上に動けている。', '{n}が野手で出場。打席でも存在感を見せた。'],
      bad: ['{n}が野手で出場。守備でもたついた…', '{n}が野手で出場。バットに当たらない…', '{n}が守備につく。打球への一歩目が遅い。'],
    },
  };

  // ---------- 小物 ----------
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function round1(v) { return Math.round(v * 10) / 10; }
  function mean(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
  function avgOf(abilities, keys) {
    return round1(keys.reduce((s, k) => s + abilities[k], 0) / keys.length);
  }
  function sideOf(pos) { return pos === 'P' ? 'pitch' : 'bat'; }
  function otherSide(side) { return side === 'pitch' ? 'bat' : 'pitch'; }
  function sideKeys(side) { return side === 'pitch' ? PITCH_KEYS : BAT_KEYS; }
  function mainSide(p) { return sideOf(p.position); }

  function isTwoWayKnown(p) { return !!(p.twoWay && p.twoWayRevealed); }
  function isSubKnown(p) { return !!(p.subRevealed || isTwoWayKnown(p)); }
  // 一覧に表示する能力(本職側。判明した二刀流は両方)
  function visibleKeys(p) {
    if (isTwoWayKnown(p)) return ALL_KEYS;
    return sideKeys(mainSide(p));
  }
  function subKeysOf(p) { return sideKeys(otherSide(mainSide(p))); }
  // 成長する側(本職側。二刀流は両方)
  function growthKeys(p) { return p.twoWay ? ALL_KEYS : sideKeys(mainSide(p)); }

  // ---------- 総合値 ----------
  // 総合値 = 指定した能力の平均 × ratingMultiplier(整数)
  function ratingOfKeys(abilities, keys) {
    return Math.round(keys.reduce((s, k) => s + abilities[k], 0) / keys.length * CONFIG.ratingMultiplier);
  }
  function abilitiesOf(p) { return p.finalAbilities || p.abilities; }
  // 投手側・野手側それぞれの総合値
  function ratingSides(p) {
    const a = abilitiesOf(p);
    return { pitch: ratingOfKeys(a, PITCH_KEYS), bat: ratingOfKeys(a, BAT_KEYS) };
  }
  // 総合値(本職側。二刀流は高い方)
  function rating(p) {
    if (p.twoWay) {
      const s = ratingSides(p);
      return Math.max(s.pitch, s.bat);
    }
    return ratingOfKeys(abilitiesOf(p), sideKeys(mainSide(p)));
  }
  function initialRating(p) {
    if (p.twoWay) {
      return Math.max(ratingOfKeys(p.initialAbilities, PITCH_KEYS), ratingOfKeys(p.initialAbilities, BAT_KEYS));
    }
    return ratingOfKeys(p.initialAbilities, sideKeys(sideOf(p.originalPosition || p.position)));
  }
  // 旧来の「総合」(能力の平均)。内部の比較用
  function overall(p) {
    if (p.twoWay) return round1((avgOf(p.abilities, PITCH_KEYS) + avgOf(p.abilities, BAT_KEYS)) / 2);
    return avgOf(p.abilities, sideKeys(mainSide(p)));
  }
  function maxAbility(abilities, keys) {
    return Math.max.apply(null, (keys || Object.keys(abilities)).map((k) => abilities[k]));
  }

  // 100を超えた分を割り引いた、試合・成績用の能力値
  let overCapOverride = null; // 検証用に一時的に差し替える値(null なら設定値)
  function effAbility(v) {
    const w = overCapOverride != null ? overCapOverride : CONFIG.overCapWeight;
    return v <= 100 ? v : 100 + (v - 100) * w;
  }
  function withOverCapWeight(w, fn) {
    const prev = overCapOverride;
    overCapOverride = w;
    try { return fn(); } finally { overCapOverride = prev; }
  }

  function policySetOf(p) { return isTwoWayKnown(p) ? 'twoWay' : mainSide(p); }
  function policyLabelByKey(key) {
    for (const set of ['twoWay', 'pitch', 'bat']) {
      const x = POLICIES[set].find((q) => q.key === key);
      if (x) return x.label;
    }
    return '-';
  }
  function policyLabel(p) {
    const x = POLICIES[policySetOf(p)].find((q) => q.key === p.policy);
    return x ? x.label : policyLabelByKey(p.policy);
  }
  function reincarnationName(key) {
    return key ? CONFIG.reincarnationTypes[key].name : 'なし';
  }

  // 能力から育成方針を自動で決める(一番高い能力に特化。該当する方針が無い能力ならバランス)
  function autoPolicy(p) {
    const set = policySetOf(p);
    if (set === 'twoWay') return 'both';
    let bestKey = null;
    let best = -1;
    for (const k of sideKeys(set)) {
      if (p.abilities[k] > best) { best = p.abilities[k]; bestKey = k; }
    }
    const pol = POLICIES[set].find((x) => x.focus === bestKey);
    return pol ? pol.key : 'balance';
  }

  // ---------- 名前の生成 ----------
  function generateName(rng, takenSurnames) {
    let surname = rng.pick(SURNAMES);
    for (let i = 0; i < 100 && takenSurnames && takenSurnames.has(surname); i++) {
      surname = rng.pick(SURNAMES);
    }
    return { surname: surname, given: rng.pick(GIVEN_NAMES) };
  }

  // ---------- 選手の生成 ----------
  function isBloomingGenius(p) { return p.talent === 'genius' && !p.geniusBust; }
  function isSpecial(p) { return isBloomingGenius(p) || !!p.reincarnation; }

  // 新入生の初期の総合値を抽選する
  //   highRate:通常の新入生が上位層(120〜160)になる割合(評判で変わる。省くと rating.normal.highRate)
  function drawInitialRating(rng, talent, reincarnation, highRate) {
    const R = CONFIG.rating;
    if (reincarnation) {
      const r = rng.float(R.reincarnation.min, R.reincarnation.max);
      return talent === 'genius' ? Math.min(r, R.geniusReincarnationMax) : r;
    }
    if (talent === 'genius') return rng.float(R.genius.min, R.genius.max);
    const N = R.normal;
    if (rng.chance(highRate != null ? highRate : N.highRate)) return rng.float(N.highMin, N.highMax);
    return clamp(rng.normal(N.mean, N.sd), N.min, N.max);
  }

  // 総合値 targetRating になるように、keys の能力を作る。bonus の項目に偏らせる(平均は変えない)
  function fillSide(rng, abilities, keys, targetRating, bonus) {
    const R = CONFIG.rating;
    const avg = targetRating / CONFIG.ratingMultiplier;
    for (const k of keys) abilities[k] = avg + rng.normal(0, R.keySd) + ((bonus && bonus[k]) || 0);
    // 平均を目標に戻す(上下限で切れた分も、2回で概ね戻る)
    for (let pass = 0; pass < 3; pass++) {
      const shift = avg - mean(keys.map((k) => abilities[k]));
      for (const k of keys) abilities[k] = clamp(abilities[k] + shift, R.min, R.itemMax);
    }
    for (const k of keys) abilities[k] = round1(abilities[k]);
  }

  // opts: { id, year, grade, takenSurnames, position, positionWeights, forceTwoWay, ratingOverride, quality }
  //   quality:{ talentMult, highRate }(学校の評判による新入生の質。天才・転生の出現率の倍率と、上位層の割合)
  function createPlayer(rng, opts) {
    const T = CONFIG.talent;
    const q = opts.quality || {};
    const tm = q.talentMult || 1;
    const reincarnation = rng.chance(T.reincarnationRate * tm)
      ? rng.pick(Object.keys(CONFIG.reincarnationTypes)) : null;
    const talent = rng.chance(T.geniusRate * tm) ? 'genius' : 'normal';
    const geniusBust = talent === 'genius' && rng.chance(T.geniusBustRate);
    const twoWay = opts.forceTwoWay != null ? opts.forceTwoWay : rng.chance(T.twoWayRate);

    let position;
    if (twoWay) position = 'P'; // 二刀流はスタメンで投手の枠に入る
    else if (reincarnation) position = CONFIG.reincarnationTypes[reincarnation].position;
    else if (opts.position) position = opts.position;
    else position = rng.weighted(opts.positionWeights || CONFIG.positionRates);

    const side = sideOf(position);
    const targetRating = opts.ratingOverride != null ? opts.ratingOverride : drawInitialRating(rng, talent, reincarnation, q.highRate);
    const abilities = {};
    // 得意項目への偏り(守備区分と転生の型)
    const bonusFor = (s) => {
      const b = {};
      if (s === side) Object.assign(b, CONFIG.positionBonus[position] || {});
      if (reincarnation) {
        const rt = CONFIG.reincarnationTypes[reincarnation];
        if (sideOf(rt.position) === s) for (const k of Object.keys(rt.bonus)) b[k] = (b[k] || 0) + rt.bonus[k];
      }
      return b;
    };
    fillSide(rng, abilities, sideKeys(side), targetRating, bonusFor(side));
    // もう一方の側
    const os = otherSide(side);
    if (twoWay) {
      fillSide(rng, abilities, sideKeys(os), targetRating * CONFIG.twoWay.subRatio, bonusFor(os));
    } else {
      const S = CONFIG.subAbility;
      const mainAvg = targetRating / CONFIG.ratingMultiplier;
      for (const k of sideKeys(os)) {
        abilities[k] = round1(Math.max(S.min, mainAvg * rng.float(S.coefMin, S.coefMax) + rng.normal(0, S.sd)));
      }
    }

    const name = generateName(rng, opts.takenSurnames);
    const p = {
      id: opts.id,
      surname: name.surname,
      given: name.given,
      name: name.surname + ' ' + name.given,
      grade: opts.grade || 1,
      position: position,
      originalPosition: position,
      abilities: abilities,
      initialAbilities: Object.assign({}, abilities),
      talent: talent,
      geniusBust: geniusBust,
      reincarnation: reincarnation,
      reincarnationRevealed: false,
      twoWay: twoWay,
      twoWayRevealed: false,
      subRevealed: false,
      subPlayedThisYear: false,  // 副能力の側で出場したか(年度末の転向ボーナス用)
      convert: null,             // 転向中の減点 { pos, penalty }
      needsPolicy: false,        // 本職の側が変わるコンバートで方針がバランスに戻った
      policy: opts.policy || 'balance',
      enrolledYear: opts.year,
      statCap: 100,
      limit: null,               // 成長限界(通常の選手のみ){ rating, jitter, caps }。画面には出さない
      limitBreaks: 0,
      exp: 0,                    // 試合経験値(未消費)
      expTotal: 0,               // 試合経験値の累計
      growthBy: { practice: 0, camp: 0, exp: 0 },  // 成長の内訳(能力値の合計)
      yearGain: {},              // 今年度の練習・試合経験による増分(年度末に履歴へ)
      bigWinThisMonth: false,    // 決勝以上の試合に出て勝った月
      starts: 0,                 // スタメン出場(大会・練習試合)
      teamGames: 0,              // 在籍中にチームが戦った試合数
      history: [],      // 出来事のメモ { y, g, ev, res, d }
      snapshots: [],    // 年ごとの能力 { y, g, a }
      timeline: [],     // 能力の推移(グラフ用){ label, a }
      mlog: null,       // 月ごとの能力の記録 { s: 最初の月の番号, a: [[能力×10の整数 ×9], ...] }(成長タブ・グラフ用)
      record: { games: 0, wins: 0, titles: [] },
      stats: { career: emptyStatLine(), byYear: {} },
      watched: false,
      lastNotice: null,
      hidden: { clutch: 0 },
      retired: false,
    };
    p.statCap = isSpecial(p) ? CONFIG.statCap.special : CONFIG.statCap.normal;
    if (!isSpecial(p)) {
      const L = CONFIG.growth.limit;
      const r = rng.chance(L.rareRate) ? rng.float(L.rareMin, L.rareMax) : clamp(rng.normal(L.mean, L.sd), L.min, L.max);
      const jitter = {};
      for (const k of ALL_KEYS) jitter[k] = round1(rng.normal(0, L.jitter));
      p.limit = { rating: Math.round(r), jitter: jitter, caps: {} };
      computeLimitCaps(p);
    }
    return p;
  }

  // 能力の低い助っ人を作る
  function createHelper(rng, opts) {
    const H = CONFIG.helper;
    const p = createPlayer(rng, Object.assign({}, opts, {
      forceTwoWay: false,
      ratingOverride: clamp(rng.normal(H.mean, H.sd), H.min, H.max),
    }));
    p.talent = 'normal';
    p.geniusBust = false;
    p.reincarnation = null;
    p.helper = true;
    p.subRevealed = true;
    p.statCap = CONFIG.statCap.normal;
    return p;
  }

  // ---------- 成長限界 ----------
  // 成長限界(総合値)を、項目ごとの実効上限に配分する(特化した項目は高く、それ以外は低く。1項目の最大は100)
  function computeLimitCaps(p) {
    if (!p.limit) return;
    const L = CONFIG.growth.limit;
    const avg = p.limit.rating / CONFIG.ratingMultiplier;
    const caps = {};
    const sides = p.twoWay ? ['pitch', 'bat'] : [mainSide(p)];
    for (const side of sides) {
      const keys = sideKeys(side);
      let focus = null;
      const tw = POLICIES.twoWay.find((x) => x.key === p.policy);
      if (!(p.twoWay && tw)) {
        const pol = POLICIES[side].find((x) => x.key === p.policy);
        focus = pol ? pol.focus : null;
      }
      const base = {};
      if (focus) {
        const capF = Math.min(100, avg + L.focusBonus);
        const rest = Math.min(100, (avg * keys.length - capF) / (keys.length - 1));
        for (const k of keys) base[k] = k === focus ? capF : rest;
      } else {
        for (const k of keys) base[k] = Math.min(100, avg);
      }
      for (const k of keys) caps[k] = round1(clamp(base[k] + (p.limit.jitter[k] || 0), 10, 100));
    }
    p.limit.caps = caps;
  }
  // 頭打ち(成長限界に達した)
  function isCappedOut(p) {
    if (!p.limit) return false;
    return rating(p) >= p.limit.rating * CONFIG.growth.limit.cappedRatio
      || growthKeys(p).every((k) => p.limit.caps[k] == null || p.abilities[k] >= p.limit.caps[k] - 1);
  }

  // ---------- 成長 ----------
  // 現在値に応じた伸びの効率(元々高い能力ほど伸びやすい)
  function growthEfficiency(cur) {
    const E = CONFIG.growth.efficiency;
    return clamp(1 + ((Math.min(cur, 100) - E.pivot) / 100) * E.slope, E.min, E.max);
  }
  // 上限に近づくほど成長が鈍る係数(0〜1)
  function slowFactor(p, k) {
    const cur = p.abilities[k];
    const cap = p.statCap;
    if (cur >= cap) return 0;
    if (p.limit) {
      const c = p.limit.caps[k] != null ? p.limit.caps[k] : cap;
      return clamp((c - cur) / CONFIG.growth.limit.zone, 0, 1);
    }
    const S = isBloomingGenius(p) && p.reincarnation ? CONFIG.growth.special.both : CONFIG.growth.special.solo;
    if (cur < 100) return 1 - S.soft * Math.pow(cur / 100, 2);
    return (1 - S.soft) * Math.pow((cap - cur) / (cap - 100), S.hardExp);
  }
  function talentMult(p) {
    const T = CONFIG.growth.talentMult;
    if (isBloomingGenius(p) && p.reincarnation) return T.both;
    if (isBloomingGenius(p)) return T.genius;
    if (p.reincarnation) return T.reincarnation;
    return 1;
  }

  // 育成方針から、能力ごとの伸びやすさの重みを作る
  function policyWeights(side, policyKey) {
    const G = CONFIG.growth;
    const pol = POLICIES[side].find((x) => x.key === policyKey) || { focus: null };
    const w = {};
    for (const key of sideKeys(side)) {
      if (!pol.focus) w[key] = G.balanceWeight;
      else w[key] = key === pol.focus ? G.focusWeight : G.otherWeight;
    }
    return w;
  }
  // 成長の振り分け先 [{ weights, share }]
  function growthTargets(p) {
    const tw = POLICIES.twoWay.find((x) => x.key === p.policy);
    if (p.twoWay && tw) {
      if (tw.side) return [{ weights: policyWeights(tw.side, 'balance'), share: 1 }];
      return [
        { weights: policyWeights('pitch', 'balance'), share: CONFIG.twoWay.bothShare },
        { weights: policyWeights('bat', 'balance'), share: CONFIG.twoWay.bothShare },
      ];
    }
    return [{ weights: policyWeights(mainSide(p), p.policy), share: 1 }];
  }

  // 選手の今の方針で、各項目がどれだけ伸びやすいか(最大を1にした重み)。表示用
  function policyWeightMap(p) {
    const w = {};
    for (const t of growthTargets(p)) for (const k of Object.keys(t.weights)) w[k] = (w[k] || 0) + t.weights[k] * t.share;
    const mx = Math.max.apply(null, Object.values(w).concat([1e-9]));
    for (const k of Object.keys(w)) w[k] /= mx;
    return w;
  }
  // 方針の選択肢に添える、伸びやすい項目(◎ 重みが大きい / ○ 中くらい)
  function policyHint(setName, key) {
    const PS = CONFIG.policyScreen;
    if (setName === 'twoWay') {
      const tw = POLICIES.twoWay.find((x) => x.key === key);
      return tw && tw.side ? SIDE_LABEL[tw.side] + 'の全体' : '投手系・野手系の全体(伸びを分け合う)';
    }
    const w = policyWeights(setName, key);
    const mx = Math.max.apply(null, Object.values(w));
    const keys = Object.keys(w);
    if (keys.every((k) => w[k] === mx)) return '全体が少しずつ';
    const strong = keys.filter((k) => w[k] / mx >= PS.strongWeight).map((k) => ABILITY_LABEL[k] + '◎');
    const mid = keys.filter((k) => w[k] / mx >= PS.midWeight && w[k] / mx < PS.strongWeight).map((k) => ABILITY_LABEL[k] + '○');
    return strong.concat(mid).join(' ') || '-';
  }

  // amount(能力値の合計)だけ成長させる。source は 'practice' / 'camp' / 'exp'
  //   season は { 項目: 倍率 }(季節の補正)。戻り値は増分 { key: +n }
  function grow(rng, p, amount, source, season) {
    const delta = {};
    if (amount <= 0) return delta;
    amount *= talentMult(p);
    const chunk = CONFIG.growth.chunk;
    let total = 0;
    for (const t of growthTargets(p)) {
      const amt = amount * t.share;
      const n = Math.max(1, Math.round(amt / chunk));
      const size = amt / n;
      for (let i = 0; i < n; i++) {
        // 上限に近い項目には振り分けにくくする(その分、他の項目が伸びる)
        const w = {};
        let sum = 0;
        for (const k of Object.keys(t.weights)) {
          const sf = slowFactor(p, k);
          w[k] = t.weights[k] * ((season && season[k]) || 1) * Math.sqrt(sf);
          sum += w[k];
        }
        if (sum <= 0) break;
        const k = rng.weighted(w);
        const cur = p.abilities[k];
        const gain = Math.min(size * growthEfficiency(cur) * slowFactor(p, k), p.statCap - cur);
        if (gain <= 0) continue;
        p.abilities[k] = cur + gain;
        delta[k] = (delta[k] || 0) + gain;
        total += gain;
      }
    }
    if (p.growthBy) p.growthBy[source] = (p.growthBy[source] || 0) + total;
    return delta;
  }

  // 合宿の結果(大きく伸びる / 少し伸びる / 変わらない)を抽選。bigBonus は指導力による加算
  function drawGrowthOutcome(rng, p, bigBonus) {
    const base = CONFIG.growth.camp.outcomeRates[isBloomingGenius(p) ? 'genius' : 'normal'];
    const r = Object.assign({}, base);
    if (bigBonus) {
      r.big += bigBonus;
      const fromNone = Math.min(r.none, bigBonus);
      r.none -= fromNone;
      r.small = Math.max(0, r.small - (bigBonus - fromNone));
    }
    return rng.weighted(r);
  }
  // 合宿の成長の1イベント(抽選→適用→履歴)
  function campGrowth(rng, p, year, label, bigBonus) {
    const outcome = drawGrowthOutcome(rng, p, bigBonus);
    const range = CONFIG.growth.camp.points[outcome];
    const delta = grow(rng, p, rng.float(range[0], range[1]), 'camp');
    addHistory(p, year, label, OUTCOME_LABEL[outcome], delta);
    return { outcome: outcome, delta: delta };
  }

  // 副能力の側で出場した年の、年度末の伸び(転向ボーナス)
  function subRoleGrowth(rng, p) {
    const delta = {};
    const r = CONFIG.subRoleGrowth;
    for (const k of subKeysOf(p)) {
      const gain = Math.min(rng.int(r[0], r[1]), 100 - p.abilities[k]);
      if (gain > 0) { p.abilities[k] += gain; delta[k] = gain; }
    }
    return delta;
  }

  // ---------- 適性 ----------
  function aptitude(p, pos) {
    const w = CONFIG.aptitudeWeights[pos];
    let s = 0;
    let t = 0;
    for (const k of Object.keys(w)) { s += effAbility(p.abilities[k]) * w[k]; t += w[k]; }
    return round1(s / t);
  }
  function effectiveAptitude(p, pos) {
    const apt = aptitude(p, pos);
    let v = apt;
    if (p.convert && p.convert.pos === pos) v -= p.convert.penalty;
    const L = CONFIG.lowAptitude;
    if (apt < L.threshold) v -= (L.threshold - apt) * L.rate;
    return round1(Math.max(0, v));
  }
  function batting(p) {
    const w = CONFIG.teamStrength.batWeights;
    let s = 0;
    let t = 0;
    for (const k of Object.keys(w)) { s += effAbility(p.abilities[k]) * w[k]; t += w[k]; }
    return round1(s / t);
  }

  // ---------- 記録 ----------
  function roundDelta(d) {
    const out = {};
    for (const k of Object.keys(d || {})) {
      const v = round1(d[k]);
      if (v > 0) out[k] = v;
    }
    return out;
  }
  function addHistory(p, year, ev, res, delta) {
    p.history.push({ y: year, g: p.grade, ev: ev, res: res || '', d: delta ? roundDelta(delta) : null });
  }
  function takeSnapshot(p, year) {
    const a = {};
    for (const k of ALL_KEYS) a[k] = round1(p.abilities[k]);
    p.snapshots.push({ y: year, g: p.grade, a: a });
  }
  function addTimeline(p, label) {
    const a = {};
    for (const k of ALL_KEYS) a[k] = round1(p.abilities[k]);
    p.timeline.push({ label: label, a: a });
  }
  function fmtNum(v) {
    const r = round1(v);
    return Math.abs(r) >= 10 || r === Math.round(r) ? String(Math.round(r)) : String(r);
  }
  function formatDelta(delta) {
    if (!delta) return '';
    return Object.keys(delta).filter((k) => round1(delta[k]) > 0)
      .map((k) => ABILITY_LABEL[k] + '+' + fmtNum(delta[k])).join(' ');
  }

  // 卒業・引退時の進路を決める
  function decideCareer(rng, p) {
    const C = CONFIG.career;
    let r = rating(p);
    let mx = maxAbility(p.abilities, sideKeys(mainSide(p)));
    if (p.twoWay) { r += C.twoWayBonus; mx = maxAbility(p.abilities, ALL_KEYS); }
    const score = r * C.overallWeight + mx * CONFIG.ratingMultiplier * C.maxWeight + rng.normal(0, C.noiseSd);
    for (const path of C.paths) if (score >= path.min) return path.label;
    return C.paths[C.paths.length - 1].label;
  }

  // 名鑑に残す記録を作る
  function makeAlumniRecord(p, extra) {
    const fin = {};
    for (const k of ALL_KEYS) fin[k] = round1(p.abilities[k]);
    return Object.assign({
      id: p.id,
      name: p.name,
      position: p.position,
      originalPosition: p.originalPosition,
      talent: p.talent,
      geniusBust: p.geniusBust,
      reincarnation: p.reincarnation,
      twoWay: p.twoWay,
      twoWayRevealed: true,
      helper: !!p.helper,
      subRevealed: isSubKnown(p),
      policy: p.policy,
      policyLabel: policyLabel(p),
      mainKeys: p.twoWay ? ALL_KEYS.slice() : sideKeys(mainSide(p)).slice(),
      initialAbilities: Object.assign({}, p.initialAbilities),
      finalAbilities: fin,
      rating: rating(p),
      initialRating: initialRating(p),
      statCap: p.statCap,
      cappedOut: isCappedOut(p),
      limitBreaks: p.limitBreaks,
      expTotal: round1(p.expTotal),
      growthBy: Object.assign({}, p.growthBy),
      starts: p.starts,
      teamGames: p.teamGames,
      lvAtEntry: p.lvAtEntry || 1,
      history: p.history.slice(),
      snapshots: p.snapshots.slice(),
      timeline: p.timeline.slice(),
      mlog: p.mlog ? { s: p.mlog.s, a: p.mlog.a.slice() } : null,   // 古い卒業生は学期ごとに圧縮(timeline だけ残す)
      record: JSON.parse(JSON.stringify(p.record)),
      stats: JSON.parse(JSON.stringify(p.stats)),
      watched: !!p.watched,
      enrolledYear: p.enrolledYear,
      origin: p.origin || 'recruit',
    }, extra || {});
  }

  // ---------- スタメン編成・チームの強さ ----------
  // 本職(守備区分)の人数が、必要人数に何人足りないか { P, C, IF, OF }
  //   編成(本職外の起用が起きる条件)と、年度始めのコンバート(不足の判定)の両方で使う
  function getPositionShortage(list, required) {
    const c = countByPosition(list);
    const out = {};
    for (const pos of POSITIONS) out[pos] = Math.max(0, (required[pos] || 0) - c[pos]);
    return out;
  }
  // スタメン編成:本職を先に決める
  //   1) 区分ごと(捕手→投手→内野→外野)に、本職の選手を総合値の高い順に必要人数まで(判明した二刀流は投手枠で最優先)
  //   2) 埋まらなかった枠だけ、残った選手から適性の高い順に補う(不足人数が多い区分から)
  //   3) offPositionStarGap > 0 のときだけ、控えの選手を本職外で起用してよい(総合値の差と適性の条件つき)
  function buildLineup(players) {
    const avail = players.filter((p) => !p.retired && !p.excluded);
    const used = new Set();
    const chosen = { P: [], C: [], IF: [], OF: [] };
    const byRating = (a, b) => rating(b) - rating(a) || a.id - b.id;
    for (const pos of CONFIG.lineupOrder) {
      const prim = avail.filter((p) => p.position === pos && !used.has(p.id));
      if (pos === 'P' && CONFIG.twoWay.alwaysStartAsPitcher) {
        prim.sort((a, b) => (isTwoWayKnown(b) ? 1 : 0) - (isTwoWayKnown(a) ? 1 : 0) || byRating(a, b));
      } else prim.sort(byRating);
      for (const p of prim.slice(0, CONFIG.lineup[pos])) { chosen[pos].push(p); used.add(p.id); }
    }
    // 不足の補充(本職の投手が0人なら、適性の最も高い野手が登板する)
    const short = getPositionShortage(avail, CONFIG.lineup);
    const order = CONFIG.lineupOrder.slice().sort((a, b) => short[b] - short[a] || CONFIG.lineupOrder.indexOf(a) - CONFIG.lineupOrder.indexOf(b));
    for (const pos of order) {
      while (chosen[pos].length < CONFIG.lineup[pos]) {
        const cands = avail.filter((p) => !used.has(p.id));
        if (!cands.length) break;
        cands.sort((a, b) => effectiveAptitude(b, pos) - effectiveAptitude(a, pos) || a.id - b.id);
        chosen[pos].push(cands[0]);
        used.add(cands[0].id);
      }
    }
    // 例外:スター起用(初期値 0 = 無効)
    const gap = CONFIG.offPositionStarGap;
    if (gap > 0) {
      const bench = avail.filter((p) => !used.has(p.id)).sort(byRating);
      for (const b of bench) {
        let best = null;
        for (const pos of CONFIG.lineupOrder) {
          if (pos === b.position) continue;
          chosen[pos].forEach((q, i) => {
            if (q.position !== pos) return;
            if (rating(b) - rating(q) < gap || effectiveAptitude(b, pos) < effectiveAptitude(q, pos)) return;
            if (!best || rating(q) < rating(best.q)) best = { pos: pos, i: i, q: q };
          });
        }
        if (best) { chosen[best.pos][best.i] = b; used.add(b.id); used.delete(best.q.id); }
      }
    }
    const slots = [];
    for (const pos of CONFIG.lineupOrder) {
      for (let i = 0; i < CONFIG.lineup[pos]; i++) {
        const pl = chosen[pos][i] || null;
        slots.push({
          pos: pos,
          player: pl,
          apt: pl ? effectiveAptitude(pl, pos) : null,
          outOfPosition: pl ? pl.position !== pos : false,
          subRole: pl ? sideOf(pos) !== mainSide(pl) && !pl.twoWay : false,
        });
      }
    }
    return slots;
  }

  // 編成の確認:本職外の起用と、本職の控えが、不変条件を満たしているか(テストと sim.js 用)
  //   違反1:本職外の起用が、その区分の本職が必要人数を満たしているのに起きた
  //   違反2:本職の選手が控えなのに、その区分の枠が本職だけで埋まっていない(offPositionStarGap が 0 のとき)
  function checkLineup(players, slots) {
    const avail = players.filter((p) => !p.retired && !p.excluded);
    const short = getPositionShortage(avail, CONFIG.lineup);
    const inLineup = new Set(slots.filter((x) => x.player).map((x) => x.player.id));
    const primFilled = { P: 0, C: 0, IF: 0, OF: 0 };
    const oopByPos = { P: 0, C: 0, IF: 0, OF: 0 };
    let violations = 0;
    let oop = 0;
    for (const x of slots) {
      if (!x.player) continue;
      if (x.player.position === x.pos) primFilled[x.pos]++;
      else { oop++; oopByPos[x.pos]++; if (short[x.pos] === 0 && !(CONFIG.offPositionStarGap > 0)) violations++; }
    }
    if (!(CONFIG.offPositionStarGap > 0)) {
      for (const p of avail) if (!inLineup.has(p.id) && primFilled[p.position] < CONFIG.lineup[p.position]) violations++;
    }
    const top3 = avail.filter((p) => !p.helper).sort((a, b) => rating(b) - rating(a) || a.id - b.id).slice(0, 3);
    return { violations: violations, oop: oop, oopByPos: oopByPos, starters: inLineup.size, top3: top3.length, top3Out: top3.filter((p) => !inLineup.has(p.id)).length };
  }

  // 編成されたメンバーから強さを計算する(この関数1つで計算する)
  //   opts: { gameNo, close } … 連戦・接戦でのスタミナ補正
  function evaluateLineup(slots, opts) {
    const TS = CONFIG.teamStrength;
    opts = opts || {};
    let pitch = TS.missingValue;
    let pitcherBat = TS.missingValue;
    let fatigue = 0;
    const fielderVals = [];
    const posVals = { P: [], C: [], IF: [], OF: [] };
    for (const s of slots) {
      if (s.pos === 'P') {
        if (s.player) {
          pitch = effectiveAptitude(s.player, 'P');
          pitcherBat = batting(s.player);
          const ST = CONFIG.stamina;
          const lack = Math.max(0, ST.threshold - effAbility(s.player.abilities.stamina));
          fatigue = lack * (ST.perGame * Math.max(0, (opts.gameNo || 1) - 1) + (opts.close ? ST.close : 0));
        }
      } else {
        const fv = s.player ? batting(s.player) * TS.fielderBat + effectiveAptitude(s.player, s.pos) * TS.fielderDef : TS.missingValue;
        fielderVals.push(fv);
        posVals[s.pos].push(fv);
      }
    }
    posVals.P.push(pitch);
    const fieldAvg = fielderVals.length ? fielderVals.reduce((a, b) => a + b, 0) / fielderVals.length : TS.missingValue;
    const pitchPart = TS.pitchWeight * pitch;
    const pitcherBatPart = TS.pitcherBatWeight * pitcherBat;
    const strength = pitchPart + TS.fieldWeight * fieldAvg + pitcherBatPart - fatigue;
    return {
      strength: round1(strength),
      pitch: round1(pitch),
      pitcherBat: round1(pitcherBat),
      pitcherSlotValue: round1(pitchPart + pitcherBatPart),
      field: round1(fieldAvg),
      fatigue: round1(fatigue),
      byPos: { P: round1(mean(posVals.P)), C: round1(mean(posVals.C)), IF: round1(mean(posVals.IF)), OF: round1(mean(posVals.OF)) },
    };
  }

  // ---------- チーム戦力(総合値スケール。表示用) ----------
  // チームの強さ(overCapWeight 適用後)を、総合値と同じ尺度(× ratingMultiplier)に換算する
  function getTeamPower(players) {
    const ev = evaluateLineup(buildLineup(players));
    const M = CONFIG.ratingMultiplier;
    return {
      power: Math.round(ev.strength * M),
      strength: ev.strength,
      byPos: { P: Math.round(ev.byPos.P * M), C: Math.round(ev.byPos.C * M), IF: Math.round(ev.byPos.IF * M), OF: Math.round(ev.byPos.OF * M) },
    };
  }
  // 他校の強さ:相手を抽選する分布(大会の1回戦〜決勝の正規分布の混合)の平均と、上位の値
  function normalCdf(x) {
    // erf の近似(Abramowitz-Stegun)
    const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
    return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }
  function opponentRef() {
    const T = CONFIG.tournaments[CONFIG.visual.opponentTournament];
    const means = [];
    for (let r = 0; r < T.rounds; r++) means.push(T.oppBase + T.oppStep * r);
    const avg = mean(means);
    const cdf = (x) => mean(means.map((m) => normalCdf((x - m) / T.oppSd)));
    let lo = avg - 6 * T.oppSd;
    let hi = avg + 6 * T.oppSd;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (cdf(mid) < CONFIG.visual.opponentTopQuantile) lo = mid; else hi = mid;
    }
    const M = CONFIG.ratingMultiplier;
    return { avg: avg, top: (lo + hi) / 2, avgPower: Math.round(avg * M), topPower: Math.round((lo + hi) / 2 * M) };
  }
  function calcTeamStrength(players, opts) {
    return evaluateLineup(buildLineup(players), opts).strength;
  }

  function winProbability(my, opp) {
    const M = CONFIG.match;
    return clamp(1 / (1 + Math.exp(-(my - opp) / M.scale)), M.minWinRate, M.maxWinRate);
  }
  function playMatch(rng, myStrength, oppStrength) {
    const M = CONFIG.match;
    const win = rng.chance(winProbability(myStrength, oppStrength));
    const loser = rng.weighted(M.loserRunsWeights);
    const winner = loser + 1 + rng.weighted(M.marginWeights);
    return { win: win, my: win ? winner : loser, opp: win ? loser : winner };
  }

  // ---------- 試合経験値 ----------
  // 倍率を掛け合わせて経験値を加える(倍率の合計は上限あり)
  function expMultiplier(opt) {
    const X = CONFIG.growth.exp;
    let m = 1;
    if (opt.win) m *= X.winMult;
    if (opt.stageMult) m *= opt.stageMult;
    if (opt.oppDiff != null) {
      if (opt.oppDiff > X.margin) m *= X.strongerMult;
      else if (opt.oppDiff < -X.margin) m *= X.weakerMult;
    }
    return Math.min(m, X.maxMult);
  }
  function gainExp(p, base, mult) {
    const v = base * mult;
    p.exp += v;
    p.expTotal += v;
  }

  // ---------- 成長の見える化(乱数は使わない) ----------
  function growthSinceEntry(p, keys) {
    keys = keys || visibleKeys(p);
    const base = p.initialAbilities;
    const now = abilitiesOf(p);
    let best = null;
    let total = 0;
    for (const k of keys) {
      const d = now[k] - base[k];
      total += d;
      if (!best || d > best.delta) best = { key: k, delta: d };
    }
    return { best: best && Math.round(best.delta) > 0 ? best : null, total: total };
  }
  function formatBestGrowth(g) {
    return g && g.best ? ABILITY_LABEL[g.best.key] + ' +' + Math.round(g.best.delta) : '';
  }
  // 能力の推移(入学・各合宿・卒業の時点)。在籍中なら「現在」を足す。グラフ用
  function growthSeries(p) {
    const out = (p.timeline || []).slice();
    if (!p.finalAbilities) out.push({ label: '現在', a: p.abilities });
    return out;
  }

  // ---------- 打順(強さの計算には影響しない) ----------
  function weightedScore(p, w) {
    let s = 0;
    let t = 0;
    for (const k of Object.keys(w)) { s += effAbility(p.abilities[k]) * w[k]; t += w[k]; }
    return s / t;
  }
  function battingOrder(slots) {
    const BO = CONFIG.battingOrder;
    const left = slots.filter((s) => s.player).map((s) => s.player);
    const order = {};
    const used = new Set();
    const take = (num, score, lowest) => {
      if (!left.length) return;
      left.sort((a, b) => (lowest ? score(a) - score(b) : score(b) - score(a)) || a.id - b.id);
      const p = left.shift();
      order[p.id] = num;
      used.add(num);
    };
    for (const num of BO.pickSequence) {
      if (num === 9) take(9, batting, true);
      else take(num, (p) => weightedScore(p, BO.weights[num]));
    }
    left.sort((a, b) => batting(b) - batting(a) || a.id - b.id);
    for (let num = 1; num <= 9 && left.length; num++) {
      if (!used.has(num)) order[left.shift().id] = num;
    }
    return order;
  }

  // ---------- 簡易成績 ----------
  function emptyStatLine() {
    return { g: 0, pa: 0, ab: 0, h: 0, hr: 0, rbi: 0, k: 0, bb: 0, pg: 0, w: 0, l: 0, er: 0, outs: 0 };
  }
  function statLinesFor(p, year) {
    if (!p.stats) p.stats = { career: emptyStatLine(), byYear: {} };
    if (!p.stats.byYear[year]) p.stats.byYear[year] = emptyStatLine();
    return [p.stats.career, p.stats.byYear[year]];
  }
  function sumStatLines(lines) {
    const t = emptyStatLine();
    for (const l of lines) for (const k of Object.keys(t)) t[k] += l[k] || 0;
    return t;
  }
  function battingAverage(line) { return line && line.ab > 0 ? line.h / line.ab : null; }
  function formatAverage(line) {
    const v = battingAverage(line);
    if (v == null) return '---';
    return v >= 1 ? '1.000' : '.' + String(Math.round(v * 1000)).padStart(3, '0');
  }
  function earnedRunAverage(line) { return line && line.outs > 0 ? line.er * 27 / line.outs : null; }
  function formatEra(line) {
    const v = earnedRunAverage(line);
    return v == null ? '-.--' : v.toFixed(2);
  }
  function plateAppearances(rng, orderNum) {
    const S = CONFIG.stats;
    const x = S.paFirst - (S.paFirst - S.paLast) * (orderNum - 1) / 8;
    return Math.floor(x) + (rng.chance(x - Math.floor(x)) ? 1 : 0);
  }
  // 1打席の結果を、ミート・パワー・走力から抽選する(100超は割り引く)
  function plateAppearance(rng, p, orderNum) {
    const S = CONFIG.stats;
    const c = effAbility(p.abilities.contact);
    const pw = effAbility(p.abilities.power);
    const sp = effAbility(p.abilities.speed);
    const r = { pa: 1, ab: 0, h: 0, hr: 0, rbi: 0, k: 0, bb: 0 };
    if (rng.chance(S.walkRate)) { r.bb = 1; return r; }
    r.ab = 1;
    const H = S.hit;
    const hitP = clamp(H.base + (c - H.pivot) * H.perContact + (pw - H.pivot) * H.perPower
      + (sp - H.pivot) * H.perSpeed, H.min, H.max);
    const cleanup = orderNum >= 3 && orderNum <= 5 ? S.cleanupRbiBonus : 0;
    if (rng.chance(hitP)) {
      r.h = 1;
      const HR = S.homeRun;
      if (rng.chance(clamp(HR.base + (pw - HR.pivot) * HR.perPower, HR.min, HR.max))) {
        r.hr = 1;
        r.rbi = 1 + rng.weighted(S.homeRunRunners);
      } else if (rng.chance(S.rbiOnHit + cleanup)) {
        r.rbi = 1;
      }
      return r;
    }
    const K = S.strikeout;
    if (rng.chance(clamp(K.base - (c - K.pivot) * K.perContact, K.min, K.max))) r.k = 1;
    else if (rng.chance(S.rbiOnOut + cleanup / 2)) r.rbi = 1;
    return r;
  }
  // 1試合ぶんの成績を決めて記録する(成績用の乱数を使う。試合のスコアとは整合させる)
  //   打数・安打・三振・四死球は打席ごとの抽選。本塁打は得点を超えないように調整し、
  //   得点のうち一定割合は打点のつかない得点、残りを本塁打を優先して打順と能力で打点に配分する
  //   opts.record が false なら、選手の成績には加えない(練習試合など)
  //   戻り値:{ paByOrder, box }(box は試合の中身の表示用)
  function recordGameStats(rng, year, slots, order, result, opts) {
    const S = CONFIG.stats;
    const V = CONFIG.visual;
    const record = !opts || opts.record !== false;
    const paByOrder = {};
    const bat = [];
    for (const s of slots) {
      const p = s.player;
      if (!p) continue;
      const num = order[p.id] || 9;
      const n = plateAppearances(rng, num);
      paByOrder[num] = n;
      const g = emptyStatLine();
      g.g = 1;
      for (let i = 0; i < n; i++) {
        const r = plateAppearance(rng, p, num);
        for (const k of ['pa', 'ab', 'h', 'hr', 'k', 'bb']) g[k] += r[k];
      }
      bat.push({ p: p, pos: s.pos, num: num, g: g });
    }
    // 本塁打は得点を超えない(超えた分は、パワーの低い打者から単打に戻す)
    let hrTotal = bat.reduce((a, b) => a + b.g.hr, 0);
    const byPowerAsc = bat.slice().sort((a, b) => effAbility(a.p.abilities.power) - effAbility(b.p.abilities.power));
    for (const b of byPowerAsc) {
      while (hrTotal > result.my && b.g.hr > 0) { b.g.hr--; hrTotal--; }
    }
    // 打点:打点のつかない得点を除き、本塁打の分を先に、残りを打順と能力で重み付けして配分
    let unearned = result.my * V.unearnedRunRate;
    unearned = Math.floor(unearned) + (rng.chance(unearned - Math.floor(unearned)) ? 1 : 0);
    unearned = Math.min(unearned, result.my - hrTotal);
    for (const b of bat) b.g.rbi = b.g.hr;
    let rest = result.my - unearned - hrTotal;
    const w = bat.map((b) => (b.g.h + b.g.hr + 0.3) * (b.num >= 3 && b.num <= 5 ? 1.3 : 1)
      * (1 + (effAbility(b.p.abilities.power) + effAbility(b.p.abilities.contact)) / 200));
    while (rest > 0 && bat.length) {
      bat[rng.weighted(w)].g.rbi++;
      rest--;
    }
    // 投手(先発のみ。完投とみなす)
    const pit = bat.find((b) => b.pos === 'P');
    if (pit) {
      pit.g.pg = 1;
      if (result.win) pit.g.w = 1; else pit.g.l = 1;
      pit.g.er = Math.round(result.opp * S.earnedRate);
      pit.g.outs = S.innings * 3;
    }
    if (record) {
      for (const b of bat) {
        for (const line of statLinesFor(b.p, year)) for (const k of Object.keys(b.g)) line[k] += b.g[k];
      }
    }
    // ラインスコア(得点と失点をイニングに配分する)
    const spread = (runs) => {
      const inn = new Array(9).fill(0);
      for (let i = 0; i < runs; i++) inn[rng.weighted(V.inningWeights)]++;
      return inn;
    };
    const box = {
      my: result.my, opp: result.opp, win: result.win,
      line: { my: spread(result.my), opp: spread(result.opp) },
      unearned: unearned,
      batters: bat.filter((b) => b.pos !== 'P' || b.g.pa > 0).map((b) => ({ id: b.p.id, name: b.p.name, num: b.num, pos: b.pos, ab: b.g.ab, h: b.g.h, hr: b.g.hr, rbi: b.g.rbi })),
      pitcher: pit ? { id: pit.p.id, name: pit.p.name, outs: pit.g.outs, runs: result.opp, win: result.win } : null,
    };
    return { paByOrder: paByOrder, box: box };
  }

  // ---------- 世代の基準(同世代の上位○%) ----------
  // 世代の基準:学年×月ごとの総合値の分布(p50〜p99.9)。benchmark.js(組み込み)か、調整画面で再計算したもの
  let benchmark = BENCHMARK;
  let benchmarkSource = BENCHMARK ? 'builtin' : 'none';
  function setBenchmark(b, source) {
    benchmark = b || BENCHMARK;
    benchmarkSource = b ? (source || 'custom') : (BENCHMARK ? 'builtin' : 'none');
  }
  function getBenchmark() { return benchmark; }
  function getBenchmarkSource() { return benchmarkSource; }
  const BENCH_POINTS = [['p50', 50], ['p90', 10], ['p97', 3], ['p99', 1], ['p999', 0.1]];
  // 総合値 r が、分布の行 row の「上位○%」か(p50 未満は null)。分位点の間は対数で補間する
  function topPercentOf(r, row) {
    if (!row || r < row.p50) return null;
    let top = null;
    for (let i = 0; i < BENCH_POINTS.length - 1; i++) {
      const a = BENCH_POINTS[i];
      const b = BENCH_POINTS[i + 1];
      const va = row[a[0]];
      const vb = row[b[0]];
      if (r >= va && r <= vb) {
        const f = vb > va ? (r - va) / (vb - va) : 1;
        top = Math.exp(Math.log(a[1]) + f * (Math.log(b[1]) - Math.log(a[1])));
        break;
      }
    }
    if (top == null) {
      // p99.9 より上:最後の区間の傾きで外挿する
      const v99 = row.p99;
      const v999 = row.p999;
      const f = v999 > v99 ? (r - v999) / (v999 - v99) : 1;
      top = Math.max(0.001, 0.1 * Math.exp(-f * Math.log(10)));
    }
    return top;
  }
  function labelForTop(top) {
    const L = CONFIG.labelTop;
    if (top == null) return '';
    if (top <= L.beyond) return '規格外';
    if (top <= L.monster) return '怪物級';
    if (top <= L.excellent) return '逸材';
    if (top <= L.promising) return '有望';
    return '';
  }
  function formatTop(top) {
    if (top == null) return '';
    return top < 0.1 ? top.toFixed(2) + '%' : top < 1 ? top.toFixed(1) + '%' : top < 10 ? top.toFixed(1) + '%' : Math.round(top) + '%';
  }
  // 選手の「同世代の上位○%」とラベル(表示だけに使う。勝敗や成長には影響しない)
  //   二刀流は投手側・野手側の高い方。引退後の3年生・卒業生は 3年3月 の基準で判定する(呼ぶ側で grade=3, month=3)
  //   フェーズ4で、他校の選手にも同じ関数を使う
  function getGenerationRank(player, grade, month) {
    if (!benchmark) return null;
    const row = benchmark.rows[grade + '-' + month];
    const r = rating(player);
    const top = topPercentOf(r, row);
    if (top == null) return null;
    return { rating: r, top: top, label: labelForTop(top) };
  }
  // 世代の基準の作成に関わる設定のハッシュ(基準が古いかどうかの判定用)
  function benchmarkConfigHash() {
    const R = CONFIG.reputation;
    const src = JSON.stringify({ rating: CONFIG.rating, growth: CONFIG.growth, statCap: CONFIG.statCap, limitBreak: CONFIG.limitBreak, coach: CONFIG.baselineCoachLv,
      rep: { baseline: R.baseline, topShareBase: R.topShareBase, topShareMax: R.topShareMax, talentRateMaxMult: R.talentRateMaxMult }, pre: CONFIG.preHistory,
      lineup: { need: CONFIG.lineup, order: CONFIG.lineupOrder, starGap: CONFIG.offPositionStarGap, twoWayP: CONFIG.twoWay.alwaysStartAsPitcher } });
    let h = 0x811c9dc5;
    for (let i = 0; i < src.length; i++) {
      h ^= src.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }
  function isBenchmarkStale() {
    return !!benchmark && benchmark.hash !== benchmarkConfigHash();
  }

  const Core = {
    Rng: Rng,
    PITCH_KEYS: PITCH_KEYS,
    BAT_KEYS: BAT_KEYS,
    ALL_KEYS: ALL_KEYS,
    ABILITY_LABEL: ABILITY_LABEL,
    POSITIONS: POSITIONS,
    POSITION_LABEL: POSITION_LABEL,
    POSITION_SHORT: POSITION_SHORT,
    SIDE_LABEL: SIDE_LABEL,
    POLICIES: POLICIES,
    OUTCOME_LABEL: OUTCOME_LABEL,
    TALENT_LABEL: TALENT_LABEL,
    SURNAMES: SURNAMES,
    GIVEN_NAMES: GIVEN_NAMES,
    clamp: clamp,
    round1: round1,
    avgOf: avgOf,
    sideOf: sideOf,
    sideKeys: sideKeys,
    mainSide: mainSide,
    isTwoWayKnown: isTwoWayKnown,
    isSubKnown: isSubKnown,
    visibleKeys: visibleKeys,
    subKeysOf: subKeysOf,
    growthKeys: growthKeys,
    policyWeightMap: policyWeightMap,
    policyHint: policyHint,
    rating: rating,
    ratingSides: ratingSides,
    ratingOfKeys: ratingOfKeys,
    initialRating: initialRating,
    overall: overall,
    maxAbility: maxAbility,
    effAbility: effAbility,
    withOverCapWeight: withOverCapWeight,
    isBloomingGenius: isBloomingGenius,
    isSpecial: isSpecial,
    isCappedOut: isCappedOut,
    computeLimitCaps: computeLimitCaps,
    policySetOf: policySetOf,
    policyLabel: policyLabel,
    policyLabelByKey: policyLabelByKey,
    reincarnationName: reincarnationName,
    autoPolicy: autoPolicy,
    generateName: generateName,
    createPlayer: createPlayer,
    createHelper: createHelper,
    drawGrowthOutcome: drawGrowthOutcome,
    growthEfficiency: growthEfficiency,
    slowFactor: slowFactor,
    grow: grow,
    campGrowth: campGrowth,
    subRoleGrowth: subRoleGrowth,
    aptitude: aptitude,
    effectiveAptitude: effectiveAptitude,
    batting: batting,
    addHistory: addHistory,
    takeSnapshot: takeSnapshot,
    addTimeline: addTimeline,
    fmtNum: fmtNum,
    formatDelta: formatDelta,
    decideCareer: decideCareer,
    makeAlumniRecord: makeAlumniRecord,
    buildLineup: buildLineup,
    checkLineup: checkLineup,
    getPositionShortage: getPositionShortage,
    evaluateLineup: evaluateLineup,
    calcTeamStrength: calcTeamStrength,
    getTeamPower: getTeamPower,
    opponentRef: opponentRef,
    winProbability: winProbability,
    playMatch: playMatch,
    expMultiplier: expMultiplier,
    gainExp: gainExp,
    battingOrder: battingOrder,
    growthSinceEntry: growthSinceEntry,
    formatBestGrowth: formatBestGrowth,
    growthSeries: growthSeries,
    emptyStatLine: emptyStatLine,
    sumStatLines: sumStatLines,
    battingAverage: battingAverage,
    formatAverage: formatAverage,
    earnedRunAverage: earnedRunAverage,
    formatEra: formatEra,
    plateAppearances: plateAppearances,
    plateAppearance: plateAppearance,
    recordGameStats: recordGameStats,
  };

  const Generation = {
    setBenchmark: setBenchmark,
    getBenchmark: getBenchmark,
    getBenchmarkSource: getBenchmarkSource,
    topPercentOf: topPercentOf,
    labelForTop: labelForTop,
    formatTop: formatTop,
    getGenerationRank: getGenerationRank,
    configHash: benchmarkConfigHash,
    isStale: isBenchmarkStale,
    POINTS: BENCH_POINTS,
  };

  // ===========================================================
  // 高校版(HighSchool)
  // ===========================================================

  const CAL = CONFIG.calendar;
  function formatYear(y) { return y >= 1 ? y + '年目' : '就任' + (1 - y) + '年前'; }
  function monthLabel(i) { return CAL[i].label; }
  function monthIndexOf(monthNum) { return CAL.findIndex((c) => c.month === monthNum); }

  // 乱数状態を state に保存しながら処理を実行する
  function withRng(state, fn) {
    const rng = new Rng(state.rngState);
    try {
      return fn(rng);
    } finally {
      state.rngState = rng.s;
    }
  }
  function withStatRng(state, fn) {
    const rng = new Rng(state.statRngState);
    try {
      return fn(rng);
    } finally {
      state.statRngState = rng.s;
    }
  }

  // ---------- 見える化(チーム戦力・勝率予想・成長ログ・ハイライト) ----------
  // 月の番号(1年目4月 = 0 から1か月ごとに +1)
  function monthSerial(year, monthIdx) { return (year - 1) * CAL.length + monthIdx; }
  function serialLabel(serial) {
    const y = Math.floor(serial / CAL.length) + 1;
    return formatYear(y) + ' ' + CAL[((serial % CAL.length) + CAL.length) % CAL.length].label;
  }
  function packAbilities(a) { return ALL_KEYS.map((k) => Math.round(a[k] * 10)); }
  function unpackAbilities(arr) {
    const a = {};
    ALL_KEYS.forEach((k, i) => { a[k] = arr[i] / 10; });
    return a;
  }
  // 月ごとの記録から、その月末の能力を取り出す(なければ null)
  function abilitiesAt(p, serial) {
    if (!p.mlog || serial < p.mlog.s || serial >= p.mlog.s + p.mlog.a.length) return null;
    return unpackAbilities(p.mlog.a[serial - p.mlog.s]);
  }
  // その月の変化(前月末、または入学時との差)
  function monthDelta(p, serial) {
    const now = abilitiesAt(p, serial);
    if (!now) return null;
    const prev = abilitiesAt(p, serial - 1) || p.initialAbilities;
    const d = {};
    for (const k of ALL_KEYS) d[k] = now[k] - prev[k];
    return { now: now, prev: prev, d: d };
  }
  // 「成長の成果」:前年同月からの総合値の伸び。1年生は入学時から。
  //   前年同月の記録がない上級生(ゲーム開始時からいる選手)は、前年度末の記録と比べる
  function ratingGainForNote(p, serial) {
    const keys = sideKeys(mainSide(p));
    let base = abilitiesAt(p, serial - CAL.length);
    if (!base && p.grade === 1) base = p.initialAbilities;
    if (!base) {
      const y = Math.floor(serial / CAL.length) + 1;
      const snap = p.snapshots.filter((x) => x.y === y - 1).pop();
      base = snap ? snap.a : null;
    }
    if (!base) return 0;
    return ratingOfKeys(p.abilities, keys) - ratingOfKeys(base, keys);
  }
  // 月末の記録(チーム戦力と、在校生の能力)
  function recordMonthEnd(state) {
    const serial = monthSerial(state.year, state.month);
    for (const p of state.players) {
      if (p.helper) continue;
      if (!p.mlog) p.mlog = { s: serial, a: [] };
      p.mlog.a.push(packAbilities(p.abilities));
    }
    const tp = getTeamPower(state.players);
    const ref = opponentRef();
    // スタメン編成の確認(sim.js と試し計算の目安に使う)
    const ck = checkLineup(state.players, buildLineup(state.players));
    const LC = state.stats.lineupCheck;
    LC.months++;
    LC.violations += ck.violations;
    LC.oop += ck.oop;
    LC.starters += ck.starters;
    LC.top3 += ck.top3;
    LC.top3Out += ck.top3Out;
    if (ck.oop) { LC.oopMonths++; for (const k of POSITIONS) LC.oopByPos[k] += ck.oopByPos[k]; }
    state.powerLog.push({ s: serial, y: state.year, m: CAL[state.month].month, p: tp.power, st: tp.strength, pos: tp.byPos, oa: ref.avgPower, ot: ref.topPower });
    return serial;
  }
  // 古い卒業生の月ごとの記録を、学期ごと(timeline)に圧縮する
  function compressAlumniLogs(state, keepYears) {
    let n = 0;
    for (const a of state.alumni) {
      if (a.mlog && a.graduatedYear <= state.year - keepYears) { a.mlog = null; n++; }
    }
    return n;
  }
  // 結果への一言
  function upsetTag(pred, win) {
    const V = CONFIG.visual;
    if (win && pred < V.upsetBelow) return '番狂わせ';
    if (!win && pred >= V.shockAbove) return '波乱';
    return '';
  }
  function yearRecord(state, y) {
    if (!state.yearRecords[y]) state.yearRecords[y] = { upsets: 0, shocks: 0 };
    return state.yearRecords[y];
  }
  // 勝率予想と結果を記録する(校正・番狂わせ・波乱)
  function noteGameResult(state, pred, win) {
    const bin = Math.min(9, Math.floor(pred * 10));
    const c = state.stats.calib[bin] || (state.stats.calib[bin] = { n: 0, w: 0, p: 0 });
    c.n++;
    c.p += pred;
    if (win) c.w++;
    const tag = upsetTag(pred, win);
    if (tag) {
      const yr = yearRecord(state, state.year);
      if (tag === '番狂わせ') { state.stats.upsets++; yr.upsets++; } else { state.stats.shocks++; yr.shocks++; }
    }
    return tag;
  }
  // 活躍選手(1〜2人。注目選手は条件を満たせば必ず載せる)と「成長の成果」
  function buildHighlights(state, box) {
    const V = CONFIG.visual;
    const serial = monthSerial(state.year, state.month);
    const byId = {};
    for (const p of state.players) byId[p.id] = p;
    const cands = [];
    for (const b of box.batters) {
      const score = b.h * 2 + b.rbi * 2 + b.hr * 3;
      const text = b.name + ' ' + b.ab + '打数' + b.h + '安打' + (b.rbi ? b.rbi + '打点' : '') + (b.hr ? '(' + b.hr + '本塁打)' : '');
      cands.push({ id: b.id, score: score, text: text, active: b.h > 0 || b.rbi > 0 });
    }
    if (box.pitcher && box.pitcher.win) {
      const pi = box.pitcher;
      const score = 3 + (pi.runs <= 2 ? 2 : pi.runs <= 4 ? 1 : 0);
      const text = pi.name + ' ' + Math.floor(pi.outs / 3) + '回' + pi.runs + '失点で勝利投手' + (pi.outs >= 27 ? '(完投)' : '');
      const ex = cands.find((c) => c.id === pi.id);
      if (ex) { ex.score = Math.max(ex.score, score); ex.text = text + (ex.active ? ' / ' + ex.text.replace(pi.name + ' ', '') : ''); ex.active = true; }
      else cands.push({ id: pi.id, score: score, text: text, active: true });
    }
    cands.sort((a, b) => b.score - a.score || a.id - b.id);
    const picked = cands.filter((c) => c.score >= V.highlightMinScore).slice(0, V.highlightMax);
    for (const c of cands) {
      const p = byId[c.id];
      if (p && p.watched && c.active && picked.indexOf(c) < 0) picked.push(c);
    }
    const out = picked.map((c) => {
      const p = byId[c.id];
      const gain = p ? ratingGainForNote(p, serial) : 0;
      return { id: c.id, text: (p && p.watched ? '★' : '') + c.text, note: gain >= V.growthNoteRating ? '成長の成果 +' + gain : '' };
    });
    const H = state.stats.highlights;
    H.games++;
    H.count += out.length;
    H.withNote += out.filter((h) => h.note).length;
    return out;
  }
  // 大会の結果の呼び名(ベスト8・準優勝など)
  function resultLabel(wins, rounds, champion) {
    if (champion) return '優勝';
    const left = rounds - wins;
    if (left === 1) return '準優勝';
    if (left === 2) return 'ベスト4';
    if (left === 3) return 'ベスト8';
    return wins === 0 ? '初戦敗退' : (wins + 1) + '回戦敗退';
  }
  const RESULT_RANK = ['初戦敗退', '2回戦敗退', '3回戦敗退', 'ベスト8', 'ベスト4', '準優勝', '優勝'];

  function takenSurnames(state) {
    const set = new Set(state.players.map((p) => p.surname));
    for (const p of state.pendingRecruits) set.add(p.surname);
    return set;
  }
  function members(state) { return state.players.filter((p) => !p.helper); }
  function activeMembers(state) { return state.players.filter((p) => !p.retired); }
  function countByPosition(list) {
    const c = { P: 0, C: 0, IF: 0, OF: 0 };
    for (const p of list) c[p.position]++;
    return c;
  }

  function pushLog(state, text, importance) {
    state.log.push({ y: state.year, m: CAL[state.month].month, t: text, i: importance || 2 });
    if (state.log.length > CONFIG.logLimit) state.log.splice(0, state.log.length - CONFIG.logLimit);
  }

  // 通知をまとめて扱う(フェーズ1.8以降のイベントもここを通す)
  //   importance:1=小さな出来事 / 2=通常 / 3=大きな出来事 / 4=年表に載る出来事
  //   注目選手なら、重要度に関わらず通知する(文面に★を付ける)
  //   opt: { player, text, importance, cls, history: { ev, res }, silent }
  //     history … 選手の履歴に記録する  silent … 通知はせず、履歴だけに残す
  //   通知したら、その月の通知一覧とログに追加して true を返す
  function addEvent(state, opt) {
    const p = opt.player;
    const imp = opt.importance || 1;
    if (p && opt.history) addHistory(p, state.year, opt.history.ev, opt.history.res);
    if (opt.silent) return false;
    const watched = !!(p && p.watched);
    if (!watched && imp < CONFIG.notify.minImportance) return false;
    const text = (watched ? '★' : '') + opt.text;
    state.monthNotices.push({ text: text, importance: imp, cls: opt.cls || (imp >= 4 ? 'special' : imp >= 3 ? 'special' : 'watch') });
    pushLog(state, text, imp);
    if (p) p.lastNotice = { y: state.year, m: CAL[state.month].month, t: opt.text };
    return true;
  }

  function findPlayer(state, id) {
    return state.players.find((p) => p.id === id) || state.pendingRecruits.find((p) => p.id === id) || null;
  }
  function watchedPlayers(state) {
    return state.players.concat(state.pendingRecruits).filter((p) => p.watched);
  }
  function setWatch(state, id, on) {
    const p = findPlayer(state, id);
    if (!p) {
      const a = state.alumni.find((x) => x.id === id);
      if (a) a.watched = !!on;
      return { ok: !!a, needRemove: [] };
    }
    if (on && !p.watched) {
      const cur = watchedPlayers(state);
      if (cur.length >= CONFIG.watch.max) return { ok: false, needRemove: cur };
    }
    p.watched = !!on;
    return { ok: true, needRemove: [] };
  }

  function emptyStats() {
    return {
      years: 0,
      recruits: 0,
      genius: 0,
      reincarnation: 0,
      reincarnationByType: {},
      twoWay: 0,
      recruitRatings: [],      // { g: 区分, r: 入学時の総合値 }
      tournaments: {
        summer: { played: 0, champion: 0, runnerUp: 0, best4: 0, roundsWon: 0 },
        autumn: { played: 0, champion: 0, runnerUp: 0, best4: 0, roundsWon: 0 },
      },
      teamStrengthSum: 0,
      teamStrengthCount: 0,
      rosterByYear: [],
      shortageBefore: { P01: 0, C0: 0 },
      shortageAfter: { P01: 0, C0: 0 },
      conversion: { attempts: 0, success: 0, fielderToPitcher: 0 },
      subReveal: { count: 0, values: [], fielderPitched: 0, pitcherFielded: 0 },
      helper: { years: 0, total: 0, _lastYear: 0 },
      pitcherSlot: { twoWay: [], normal: [] },
      batting: { ab: 0, h: 0, paByOrder: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], games: 0 },
      camp: { events: 0, big: 0, small: 0, none: 0, points: 0 },
      practiceGames: { played: 0, won: 0 },
      limitBreak: { count: 0 },
      leadershipByYear: [],    // 年度末の指導力Lv
      policyReview: { reviewed: 0, changed: 0 },
      stops: 0,                // 「次のイベントまで」で止まった回数
      overCap: { n: 0, strengthDiff: 0, winDiff: 0 },
      repByYear: [],
      lineupCheck: { months: 0, violations: 0, oop: 0, starters: 0, top3: 0, top3Out: 0, oopMonths: 0, oopByPos: { P: 0, C: 0, IF: 0, OF: 0 } },   // スタメン編成の確認           // 年度末の評判 { y, rep, x, score }
      start: null,             // 開始時の2・3年生の総合値の平均 { g2, g3, rep }
      calib: [],               // 勝率予想の校正 [区間] = { n, w }
      upsets: 0,               // 番狂わせ
      shocks: 0,               // 波乱
      highlights: { games: 0, count: 0, withNote: 0 },
      freshmanSpecial: { onRoster: 0, starting: 0 },  // 夏の大会時点の1年生の天才・転生(在籍 / スタメン)
    };
  }

  function newPlayer(state, rng, opts) {
    return createPlayer(rng, Object.assign({
      id: state.nextId++,
      year: state.year,
      grade: 1,
      takenSurnames: takenSurnames(state),
    }, opts));
  }

  // ---------- 指導力 ----------
  function leadershipNeed(lv) { return Math.max(1, Math.ceil(CONFIG.leadership.needPerLv * lv)); }
  function leadershipMonthlyMult(lv) {
    const L = CONFIG.leadership;
    return 1 + (L.monthlyMultMax - 1) * (lv - 1) / (L.maxLv - 1);
  }
  function leadershipCampBonus(lv) {
    const L = CONFIG.leadership;
    return L.campBigBonusMax * (lv - 1) / (L.maxLv - 1);
  }
  function gainLeadership(state, n, reason) {
    const L = state.leadership;
    if (state.fixedCoachLv || L.lv >= CONFIG.leadership.maxLv || n <= 0) return; // 世代の基準づくりでは指導力を固定
    L.exp += n;
    while (L.lv < CONFIG.leadership.maxLv && L.exp >= leadershipNeed(L.lv)) {
      L.exp -= leadershipNeed(L.lv);
      L.lv++;
      addEvent(state, { importance: 3, text: '指導力が Lv.' + L.lv + ' に上がった!(' + reason + ')', cls: 'special' });
    }
    if (L.lv >= CONFIG.leadership.maxLv) L.exp = 0;
  }

  // ---------- 月ごとの成長 ----------
  function expectedPractice(p, lv) {
    const M = CONFIG.growth.monthly;
    return M.chance * leadershipMonthlyMult(lv) * (p.retired ? M.retiredMult : 1) * (M.amount[0] + M.amount[1]) / 2;
  }
  // 1人の1か月ぶんの成長(練習・試合経験値・限界突破)。増分を返す
  function growPlayerMonth(state, rng, p, monthNum, lv) {
    const M = CONFIG.growth.monthly;
    const X = CONFIG.growth.exp;
    const delta = {};
    const add = (d) => { for (const k of Object.keys(d)) delta[k] = (delta[k] || 0) + d[k]; };
    // (1) 練習
    const chance = M.chance * leadershipMonthlyMult(lv) * (p.retired ? M.retiredMult : 1);
    if (rng.chance(chance)) add(grow(rng, p, rng.float(M.amount[0], M.amount[1]), 'practice', M.season[monthNum]));
    // (3) 試合経験値(一部を消費して成長に変換。残りは上限まで持ち越す)
    if (p.exp > 0) {
      const used = p.exp * X.consumeRate;
      p.exp -= used;
      const amt = Math.min(used * X.growthPerExp, X.capVsPractice * expectedPractice(p, lv));
      add(grow(rng, p, amt, 'exp', M.season[monthNum]));
      p.exp = Math.min(p.exp, X.carryMax);
    }
    for (const k of Object.keys(delta)) p.yearGain[k] = (p.yearGain[k] || 0) + delta[k];
    // (6) 限界突破
    const B = CONFIG.limitBreak;
    if (state && p.limit && p.limitBreaks < B.maxTimes && rating(p) >= p.limit.rating * B.threshold) {
      let c = B.chance;
      if (p.bigWinThisMonth) c += B.bigWinBonus;
      if (lv >= B.leadershipLv) c += B.leadershipBonus;
      if (rng.chance(c)) {
        const gain = rng.int(B.gain[0], B.gain[1]);
        p.limit.rating += gain;
        p.limitBreaks++;
        computeLimitCaps(p);
        state.stats.limitBreak.count++;
        addEvent(state, {
          player: p, importance: 4, cls: 'special',
          text: rng.pick(B.texts).replace('{n}', p.name),
          history: { ev: '限界突破', res: '成長の壁を破った' },
        });
      }
    }
    p.bigWinThisMonth = false;
    return delta;
  }

  // 月ごとの成長をチーム全体で行い、月のまとめの行を返す
  function runMonthlyGrowth(state, rng) {
    const monthNum = CAL[state.month].month;
    const lv = state.leadership.lv;
    let grown = 0;
    const watchLines = [];
    for (const p of state.players) {
      const d = growPlayerMonth(state, rng, p, monthNum, lv);
      const any = Object.keys(d).some((k) => d[k] >= 0.05);
      if (any) grown++;
      if (p.watched) {
        watchLines.push('★' + p.name + ' ' + (any ? formatDelta(d) : '変化なし'));
      }
    }
    return { grown: grown, watchLines: watchLines };
  }

  // ---------- 学校の評判 ----------
  // 影響度 x(0〜1)。評判が基準以下なら 0(マイナスの補正は入れない)
  function reputationX(state) {
    const R = CONFIG.reputation;
    if (state.fixedRep) return 0;
    return clamp((state.schoolRep - R.baseline) / (100 - R.baseline), 0, 1);
  }
  function recruitQuality(x) {
    const R = CONFIG.reputation;
    return { x: x, highRate: R.topShareBase + (R.topShareMax - R.topShareBase) * x, talentMult: 1 + (R.talentRateMaxMult - 1) * x };
  }
  function recruitTrend(x) {
    const t = CONFIG.reputation.trend;
    return x >= t[2] ? '非常に良' : x >= t[1] ? '良' : x >= t[0] ? 'やや良' : '並';
  }
  // 年度末に評判を更新する(移動平均)。戻り値は今年の得点の内訳
  function updateReputation(state, pros) {
    const R = CONFIG.reputation;
    const rec = state.yearRecords[state.year] || {};
    const prog = ['summer', 'autumn'].map((k) => (rec[k + 'Wins'] != null ? rec[k + 'Wins'] / CONFIG.tournaments[k].rounds : 0));
    const tourney = mean(prog) * R.tourneyMax;
    const pro = Math.min(R.proMax, pros * R.proPer);
    const lead = Math.min(R.leadMax, state.leadership.lv * R.leadPerLv);
    const score = tourney + pro + lead;
    if (!state.fixedRep) state.schoolRep = clamp(state.schoolRep * (1 - R.rate) + score * R.rate, 0, 100);
    state.stats.repByYear.push({ y: state.year, rep: round1(state.schoolRep), x: round1(reputationX(state) * 1000) / 1000, score: round1(score) });
    return { tourney: tourney, pro: pro, lead: lead, score: score };
  }

  // ---------- 新しいゲーム(前史つき) ----------
  //   開始時の2・3年生は、過去 preHistory.years 年を通常のルールで内部シミュレーションして作る。
  //   前史は専用の乱数を使うので、本編の乱数の消費には影響しない。画面も通知も出さない。
  function hashSeed(seed, salt) {
    let h = (seed ^ salt) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }
  function newGame(opts) {
    opts = opts || {};
    const seed = (opts.seed != null ? Number(opts.seed) : Math.floor(Math.random() * 4294967296)) >>> 0;
    const preYears = Math.max(0, Math.round(CONFIG.preHistory.years));
    const state = {
      version: CONFIG.saveVersion,
      seed: seed,
      rngState: hashSeed(seed, CONFIG.preHistory.seedSalt),          // 前史の間は前史専用の乱数
      statRngState: hashSeed(seed ^ 0x5bd1e995, CONFIG.preHistory.seedSalt),
      year: 1 - preYears,
      month: 0,              // CONFIG.calendar の添字(0 = 4月)
      awaiting: null,        // 'policy' のとき方針の選択待ち
      policyContext: null,   // 'enrollment'(4月) / 'review'(見直し)
      players: [],
      pendingRecruits: [],
      newcomerInfo: null,
      alumni: [],
      nextId: 1,
      log: [],
      lastEvents: [],
      summaryUnread: null,   // ホームの月のまとめが未読なら、その月の番号(開くか次の月に進むと消える)
      carryCards: [],        // 次の月のまとめに載せる結果(入学の結果など)
      monthNotices: [],
      prevSummerStrength: CONFIG.newcomers.strengthPivot,   // 前年夏のチームの強さ(新入生の人数に使う)
      schoolRep: CONFIG.reputation.baseline,                 // 学校の評判(0〜100)
      fixedRep: !!opts.fixedRep,                             // 世代の基準づくりでは評判を固定(効果なし)
      leadership: { lv: opts.fixedCoachLv || 1, exp: 0 },
      fixedCoachLv: opts.fixedCoachLv || null,
      overrides: opts.overrides || {},   // このゲームを作ったときの上書き設定(調整画面)
      powerLog: [],          // 毎月末のチーム戦力 { s, y, m, p, st, pos, oa, ot }
      yearRecords: {},       // 年度ごとの記録 { 年: { summer, autumn, upsets, shocks } }
      stats: emptyStats(),
    };
    // 前史:方針は「おまかせ」(新入生と、選び直しが必要な選手)
    if (preYears > 0) {
      beginMonth(state);
      while (!(state.year === 1 && state.awaiting === 'policy' && state.policyContext === 'enrollment')) {
        if (state.awaiting) {
          const pol = {};
          for (const p of state.pendingRecruits) pol[p.id] = autoPolicy(p);
          for (const p of reviewablePlayers(state)) if (p.needsPolicy) pol[p.id] = autoPolicy(p);
          confirmPolicies(state, pol);
          continue;
        }
        processMonth(state);
      }
      // 前史の最後(3月の卒業・進級のあと)の在校生を、1年目4月の2・3年生として持ち越す
      state.pendingRecruits = [];
      state.awaiting = null;
      state.policyContext = null;
      const keepFrom = monthSerial(1, 0) - CAL.length;   // 成長のスナップショットは最後の12か月分だけ残す
      for (const p of state.players) {
        for (const h of p.history) h.ev += '(開始前)';
        if (p.mlog) {
          const cut = Math.max(0, keepFrom - p.mlog.s);
          p.mlog = cut >= p.mlog.a.length ? null : { s: p.mlog.s + cut, a: p.mlog.a.slice(cut) };
        }
        p.lastNotice = null;
        p.watched = false;
        p.origin = 'pre';    // 開始前からの部員(卒業生の集計では、就任後に入った選手と分ける)
      }
      // 持ち越さないもの:指導力・大会成績・チーム戦力の記録・練習試合の戦績・前年のまとめ・卒業生・ログ
      state.leadership = { lv: opts.fixedCoachLv || 1, exp: 0 };
      state.stats = emptyStats();
      state.powerLog = [];
      state.yearRecords = {};
      state.alumni = [];
      state.log = [];
      state.lastEvents = [];
      state.carryCards = [];
      state.monthNotices = [];
      state.newcomerInfo = null;
    }
    state.year = 1;
    state.month = 0;
    state.rngState = seed;
    state.statRngState = (seed ^ 0x5bd1e995) >>> 0; // 成績専用の乱数(試合展開の乱数とは別系統)
    const avgOfGrade = (g) => mean(state.players.filter((p) => p.grade === g && !p.helper).map((p) => rating(p)));
    state.stats.start = { g2: round1(avgOfGrade(2)), g3: round1(avgOfGrade(3)), rep: round1(state.schoolRep) };
    pushLog(state, CONFIG.schoolName + 'の監督に就任した。', 3);
    beginMonth(state);
    return state;
  }

  // 新入生の人数を決める
  function newcomerCount(state, rng) {
    const N = CONFIG.newcomers;
    const strength = state.prevSummerStrength != null ? state.prevSummerStrength : calcTeamStrength(state.players);
    let n = N.base + Math.round((strength - N.strengthPivot) * N.perStrength) + rng.int(-N.noise, N.noise);
    n = clamp(n, N.min, N.max);
    const room = Math.max(0, N.rosterCap - members(state).length);
    return { count: Math.min(n, room), strength: strength, capped: n > room };
  }

  // 新入生を引く
  function drawRecruits(state) {
    withRng(state, (rng) => {
      state.pendingRecruits = [];
      const info = newcomerCount(state, rng);
      const quality = recruitQuality(reputationX(state));
      info.x = quality.x;
      info.trend = recruitTrend(quality.x);
      state.newcomerInfo = info;
      for (let i = 0; i < info.count; i++) {
        const counts = countByPosition(members(state).concat(state.pendingRecruits));
        const weights = {};
        for (const pos of POSITIONS) {
          const d = CONFIG.positionDeficit[pos];
          weights[pos] = CONFIG.positionRates[pos] * (counts[pos] < d.min ? d.mult : 1);
        }
        const p = newPlayer(state, rng, { positionWeights: weights, quality: quality });
        p.origin = 'recruit';
        p.recruitX = quality.x;
        if (p.reincarnation && CONFIG.reincarnationReveal === 'enrollment') p.reincarnationRevealed = true;
        if (p.twoWay && CONFIG.twoWayReveal === 'enrollment') p.twoWayRevealed = true;
        p.policy = POLICIES[policySetOf(p)][POLICIES[policySetOf(p)].length - 1].key; // バランス / 両方
        computeLimitCaps(p);
        state.pendingRecruits.push(p);
      }
    });
  }

  // 月の始め:入学や方針見直しの月なら、選択待ちにする
  function beginMonth(state) {
    const c = CAL[state.month];
    const isEnroll = c.events.some((e) => CONFIG.eventTypes[e] && CONFIG.eventTypes[e].kind === 'enrollment');
    if (isEnroll) {
      drawRecruits(state);
      state.awaiting = 'policy';
      state.policyContext = 'enrollment';
    } else if (CONFIG.policyReviewMonths.indexOf(c.month) >= 0) {
      state.awaiting = 'policy';
      state.policyContext = 'review';
    }
  }

  // 方針の見直しの対象(引退後の3年生と助っ人は除く)
  function reviewablePlayers(state) {
    return state.players.filter((p) => !p.retired && !p.helper);
  }

  // 年度始めのコンバート
  function runConversions(state, rng, lines) {
    const CV = CONFIG.conversion;
    const pool = members(state);
    const counts = countByPosition(pool);
    const tried = new Set();
    let attempts = 0;
    for (const pos of CONFIG.lineupOrder) {
      while (getPositionShortage(pool, CV.minimum)[pos] > 0 && attempts < CV.maxPerYear) {   // 不足の判定は編成と同じ関数
        const cands = pool.filter((p) => p.position !== pos && !p.twoWay && !tried.has(p.id)
          && counts[p.position] > CV.minimum[p.position]);
        if (!cands.length) break;
        cands.sort((a, b) => aptitude(b, pos) - aptitude(a, pos) || a.id - b.id);
        const p = cands[0];
        tried.add(p.id);
        attempts++;
        state.stats.conversion.attempts++;
        const apt = aptitude(p, pos);
        const rate = clamp(CV.successBase + (apt - CV.pivot) * CV.perAptitude, CV.successMin, CV.successMax);
        const from = p.position;
        if (rng.chance(rate)) {
          const sideChanged = sideOf(from) !== sideOf(pos);
          p.position = pos;
          p.convert = { pos: pos, penalty: CV.penaltyStart };
          if (sideChanged) {
            // 本職の側が変わる:方針はバランスに戻し、選び直してもらう
            p.policy = 'balance';
            p.subRevealed = true;
            p.needsPolicy = true;
          }
          computeLimitCaps(p);
          counts[from]--;
          counts[pos]++;
          state.stats.conversion.success++;
          if (pos === 'P') state.stats.conversion.fielderToPitcher++;
          const msg = p.name + 'が' + POSITION_LABEL[from] + 'から' + POSITION_LABEL[pos] + 'に転向した。'
            + (sideChanged && CONFIG.policyControlEnabled ? '(方針を選び直してください)' : '');   // 方針の選択を出さないときは、おまかせで選び直す
          addEvent(state, { player: p, importance: 3, text: '【転向】' + msg, history: { ev: 'コンバート', res: POSITION_LABEL[from] + '→' + POSITION_LABEL[pos] } });
          lines.push({ text: '【転向】' + msg, cls: 'special' });
        } else {
          const msg = p.name + 'の' + POSITION_LABEL[pos] + 'への転向を試したが、' + POSITION_LABEL[from] + 'に戻った。';
          addEvent(state, { player: p, importance: 2, text: msg, history: { ev: 'コンバート失敗', res: POSITION_LABEL[pos] + 'を試して' + POSITION_LABEL[from] + 'に戻る' } });
          lines.push({ text: '【転向失敗】' + msg, cls: 'none' });
        }
      }
    }
  }

  function recordShortage(state, key) {
    const c = countByPosition(members(state));
    if (c.P <= 1) state.stats[key].P01++;
    if (c.C === 0) state.stats[key].C0++;
  }

  // 方針を変更する(在校生)。変更は通知せず、履歴に残す
  function changePolicy(state, p, key) {
    if (!key || !POLICIES[policySetOf(p)].some((x) => x.key === key)) return false;
    const changed = key !== p.policy;
    const before = policyLabel(p);
    p.policy = key;
    p.needsPolicy = false;
    if (changed) {
      computeLimitCaps(p);
      addEvent(state, { player: p, importance: 1, silent: true, text: '', history: { ev: '方針変更', res: before + ' → ' + policyLabel(p) } });
    }
    return changed;
  }

  // 方針を決める(4月は新入生の入学も行う)。policies: { 選手id: 方針key }
  function confirmPolicies(state, policies) {
    if (state.awaiting !== 'policy') throw new Error('方針の選択中ではありません');
    policies = policies || {};
    const lines = [];
    // 在校生の見直し
    let changed = 0;
    const reviewable = reviewablePlayers(state);
    for (const p of reviewable) {
      if (policies[p.id] != null && changePolicy(state, p, policies[p.id])) changed++;
    }
    state.stats.policyReview.reviewed += reviewable.length;
    state.stats.policyReview.changed += changed;
    if (changed && CONFIG.policyControlEnabled) lines.push({ text: '在校生 ' + changed + '人の方針を変更した。', cls: 'summary' });   // 表示だけ(方針の選択を出すときのみ)

    if (state.policyContext === 'enrollment') {
      const S = state.stats;
      for (const p of state.pendingRecruits) {
        const key = policies[p.id];
        if (key && POLICIES[policySetOf(p)].some((x) => x.key === key)) p.policy = key;
        computeLimitCaps(p);
        p.lvAtEntry = state.leadership.lv;
        takeSnapshot(p, state.year);
        addTimeline(p, '入学');
        addHistory(p, state.year, '入学', POSITION_LABEL[p.position] + ' / 方針:' + policyLabel(p) + ' / 総合値 ' + rating(p));
        state.players.push(p);
        S.recruits++;
        const grp = p.reincarnation && p.talent === 'genius' ? '天才かつ転生' : p.reincarnation ? '転生' : p.talent === 'genius' ? '天才' : p.twoWay ? '二刀流' : '通常';
        S.recruitRatings.push({ g: grp, r: rating(p), tw: p.twoWay, x: p.recruitX || 0 });
        if (p.talent === 'genius') S.genius++;
        if (p.twoWay) S.twoWay++;
        if (p.reincarnation) {
          S.reincarnation++;
          S.reincarnationByType[p.reincarnation] = (S.reincarnationByType[p.reincarnation] || 0) + 1;
        }
        lines.push(p.name + '(' + POSITION_LABEL[p.position] + '・総合値' + rating(p) + ')' + (CONFIG.policyControlEnabled ? '方針:' + policyLabel(p) : ''));
        if (p.reincarnation && p.reincarnationRevealed) {
          addEvent(state, { player: p, importance: 3, text: '【転生】' + p.name + 'は' + reincarnationName(p.reincarnation) + 'の転生者だった!' });
        }
        if (p.twoWay && p.twoWayRevealed) {
          addEvent(state, { player: p, importance: 3, text: '【二刀流】' + p.name + 'は投打両方で本職級の素質を持っている!' });
        }
      }
      const n = state.pendingRecruits.length;
      state.pendingRecruits = [];
      pushLog(state, '新入生' + n + '人が入部した。', 2);
      lines.unshift({ text: '新入生 ' + n + '人 / 部員 ' + members(state).length + '人', cls: 'summary' });
      // 入学処理の直後:不足している区分のコンバートと、助っ人
      recordShortage(state, 'shortageBefore');
      withRng(state, (rng) => {
        runConversions(state, rng, lines);
        ensureHelpers(state, rng);
      });
      recordShortage(state, 'shortageAfter');
      state.stats.rosterByYear.push({
        y: state.year, members: members(state).length, newcomers: n,
        strength: state.newcomerInfo ? state.newcomerInfo.strength : null,
      });
      state.carryCards.push({ type: 'enrollment', title: formatYear(state.year) + ' 4月 新入生が入部', lines: lines });
    } else if (lines.length) {
      state.carryCards.push({ type: 'review', title: formatYear(state.year) + ' ' + monthLabel(state.month) + ' 方針の見直し', lines: lines });
    }
    state.awaiting = null;
    state.policyContext = null;
    return true;
  }
  // 互換用(以前の名前)
  function confirmEnrollment(state, policies) { return confirmPolicies(state, policies); }

  // ---------- 各イベントの処理 ----------
  // 9人そろわなければ、助っ人を補う
  function ensureHelpers(state, rng) {
    const need = Object.values(CONFIG.lineup).reduce((a, b) => a + b, 0);
    let active = activeMembers(state);
    let added = 0;
    while (active.length < need) {
      const c = countByPosition(active);
      let pos = 'OF';
      let worst = -Infinity;
      for (const q of ['C', 'IF', 'OF']) {
        const lack = CONFIG.lineup[q] - c[q];
        if (lack > worst) { worst = lack; pos = q; }
      }
      const h = createHelper(rng, {
        id: state.nextId++, year: state.year, grade: rng.int(1, 2),
        takenSurnames: takenSurnames(state), position: pos,
      });
      h.origin = 'helper';
      addHistory(h, state.year, '助っ人', '人数不足のため' + POSITION_LABEL[pos] + 'で加入');
      takeSnapshot(h, state.year);
      addTimeline(h, '加入');
      state.players.push(h);
      active = activeMembers(state);
      added++;
      addEvent(state, { importance: 3, text: '【助っ人】人数が足りず、' + h.name + 'が' + POSITION_LABEL[pos] + 'の助っ人として加わった。' });
    }
    if (added) {
      state.stats.helper.total += added;
      if (state.stats.helper._lastYear !== state.year) {
        state.stats.helper.years++;
        state.stats.helper._lastYear = state.year;
      }
    }
  }

  // 副能力の側で出場した選手の処理(判明・通知)
  function handleSubRoles(state, rng, slots) {
    for (const s of slots) {
      if (!s.player || !s.subRole) continue;
      const p = s.player;
      p.subPlayedThisYear = true;
      if (isSubKnown(p)) continue;
      p.subRevealed = true;
      const side = sideOf(s.pos);
      const val = avgOf(p.abilities, sideKeys(side));
      const good = val >= CONFIG.subReveal.goodThreshold;
      const text = rng.pick(REVEAL_TEXTS[side][good ? 'good' : 'bad']).replace('{n}', p.name)
        + '(' + SIDE_LABEL[side] + 'の能力が判明)';
      addEvent(state, { player: p, importance: 3, text: '【判明】' + text, history: { ev: '副能力判明', res: POSITION_LABEL[s.pos] + 'で出場' } });
      const SR = state.stats.subReveal;
      SR.count++;
      SR.values.push(val);
      if (side === 'pitch') SR.fielderPitched++;
      else SR.pitcherFielded++;
    }
  }

  // 出場機会の記録(スタメン率の集計用)
  function countGame(state, starters) {
    const ids = new Set(starters.map((p) => p.id));
    for (const p of activeMembers(state)) {
      p.teamGames++;
      if (ids.has(p.id)) p.starts++;
    }
  }
  // ベンチ入り(スタメン以外の上位 benchSize 人)
  function benchOf(state, starters) {
    const ids = new Set(starters.map((p) => p.id));
    return activeMembers(state).filter((p) => !ids.has(p.id))
      .sort((a, b) => rating(b) - rating(a) || a.id - b.id).slice(0, CONFIG.growth.exp.benchSize);
  }

  // 練習試合:スコアは簡易に抽選。大会・指導力には影響しない。経験値は貯まる
  function runPracticeGames(state, rng) {
    const PG = CONFIG.practiceGames;
    const X = CONFIG.growth.exp;
    const slots = buildLineup(state.players);
    const starters = slots.filter((s) => s.player).map((s) => s.player);
    const my = evaluateLineup(slots).strength;
    const order = battingOrder(slots);
    let w = 0;
    let l = 0;
    const games = [];
    for (let i = 0; i < PG.perMonth; i++) {
      const opp = round1(rng.normal(PG.oppMean, PG.oppSd));
      const pred = winProbability(my, opp);   // 試合の勝敗と同じ関数(乱数は使わない)
      const res = playMatch(rng, my, opp);
      if (res.win) w++; else l++;
      const mult = expMultiplier({ win: res.win, oppDiff: opp - my });
      for (const p of starters) gainExp(p, X.practiceStarter, mult);
      const subs = benchOf(state, starters);
      const n = Math.round(subs.length * PG.subShare);
      for (const p of rng.shuffle(subs).slice(0, n)) gainExp(p, X.practiceSub, mult);
      countGame(state, starters);
      // 試合の中身(成績用の乱数)。成績に含めるかは設定で選ぶ
      const box = withStatRng(state, (srng) => recordGameStats(srng, state.year, slots, order, res, { record: PG.includeInStats }).box);
      const tag = noteGameResult(state, pred, res.win);
      games.push({ title: '練習試合' + (i + 1), pred: pred, win: res.win, tag: tag, box: box, highlights: buildHighlights(state, box) });
      state.stats.practiceGames.played++;
      if (res.win) state.stats.practiceGames.won++;
    }
    return { summary: '練習試合 ' + w + '勝' + l + '敗', practice: games };
  }

  // 合宿
  function runCamp(state, rng, type) {
    const label = type.label;
    const lines = [];
    const counts = { big: 0, small: 0, none: 0 };
    const targets = state.players.filter((p) => !p.retired);
    const bigLines = [];
    let unchanged = 0;
    const bonus = leadershipCampBonus(state.leadership.lv);
    for (const p of targets) {
      // 転生・二刀流の判明(設定が 'firstCamp' の場合)
      if (p.reincarnation && !p.reincarnationRevealed) {
        p.reincarnationRevealed = true;
        addEvent(state, { player: p, importance: 3, text: '【判明】' + p.name + 'は' + reincarnationName(p.reincarnation) + 'の転生者だった!', history: { ev: '転生判明', res: reincarnationName(p.reincarnation) } });
      }
      if (p.twoWay && !p.twoWayRevealed) {
        p.twoWayRevealed = true;
        p.policy = 'both';
        computeLimitCaps(p);
        addEvent(state, { player: p, importance: 3, text: '【判明】' + p.name + 'は打っても一流、二刀流の素質の持ち主だった!(方針は「両方」に)', history: { ev: '二刀流判明', res: '方針:両方' } });
      }
      const r = campGrowth(rng, p, state.year, label, bonus);
      addTimeline(p, p.grade + '年' + type.term);
      counts[r.outcome]++;
      const gained = formatDelta(r.delta) !== '';
      const CS = state.stats.camp;
      CS[r.outcome]++;
      CS.events++;
      for (const k of Object.keys(r.delta)) CS.points += r.delta[k];
      // 注目選手は、この一覧にだけ★付きで出す
      const who = (p.watched ? '★' : '') + p.name + '(' + p.grade + '年・' + POSITION_SHORT[p.position] + ')';
      if (!gained) {
        if (p.watched) lines.push({ text: '- ' + who + ' 変化なし', cls: 'watch' });
        else unchanged++;
      } else if (r.outcome === 'big') {
        bigLines.push({ text: '◎ ' + who + ' 大きく伸びた! ' + formatDelta(r.delta), cls: 'big' });
      } else {
        lines.push({ text: (r.outcome === 'small' ? '○ ' : '- ') + who + ' ' + formatDelta(r.delta), cls: p.watched ? 'watch' : r.outcome });
      }
    }
    const summary = '大きく伸びた ' + counts.big + '人 / 少し伸びた ' + counts.small + '人 / 変わらない ' + counts.none + '人';
    pushLog(state, label + ':' + summary, 2);
    const tail = unchanged ? [{ text: '変化なし:' + unchanged + '人', cls: 'none' }] : [];
    return {
      type: 'camp', title: formatYear(state.year) + ' ' + label + 'の結果',
      lines: [{ text: summary, cls: 'summary' }].concat(bigLines, lines, tail),
    };
  }

  // 簡易トーナメント(勝ち抜き。フェーズ2で本格版に置き換え)
  function runSimpleTournament(state, rng, type) {
    const key = type.key;
    const T = CONFIG.tournaments[key];
    const X = CONFIG.growth.exp;
    const st = state.stats.tournaments[key];
    const lines = [];
    ensureHelpers(state, rng);
    const slots = buildLineup(state.players);
    handleSubRoles(state, rng, slots);
    const ev0 = evaluateLineup(slots);
    const myStrength = ev0.strength;
    const members_ = slots.filter((s) => s.player).map((s) => s.player);
    const bench = benchOf(state, members_);
    const usedNames = new Set();
    let wins = 0;
    let champion = true;
    st.played++;
    state.stats.teamStrengthSum += myStrength;
    state.stats.teamStrengthCount++;
    if (key === 'summer') {
      state.prevSummerStrength = myStrength;
      const fs = activeMembers(state).filter((p) => p.grade === 1 && isSpecial(p));
      state.stats.freshmanSpecial.onRoster += fs.length;
      state.stats.freshmanSpecial.starting += fs.filter((p) => members_.indexOf(p) >= 0).length;
      const ace = slots.find((s) => s.pos === 'P').player;
      if (ace) state.stats.pitcherSlot[ace.twoWay ? 'twoWay' : 'normal'].push(ev0.pitcherSlotValue);
      // 100超の能力の寄与(割り引かない場合との差)
      const hasOver = members_.some((p) => ALL_KEYS.some((k) => p.abilities[k] > 100));
      if (hasOver) {
        const full = withOverCapWeight(1, () => evaluateLineup(slots).strength);
        const ref = T.oppBase + T.oppStep * (T.rounds - 1) / 2;
        state.stats.overCap.n++;
        state.stats.overCap.strengthDiff += full - myStrength;
        state.stats.overCap.winDiff += winProbability(full, ref) - winProbability(myStrength, ref);
      }
    }
    const order = battingOrder(slots);
    const careerBefore = {};
    for (const p of members_) careerBefore[p.id] = Object.assign({}, statLinesFor(p, state.year)[0]);
    const srng = new Rng(state.statRngState);
    const games = [];
    for (let r = 1; r <= T.rounds; r++) {
      let opp = rng.pick(CONFIG.opponentNames);
      for (let i = 0; i < 20 && usedNames.has(opp); i++) opp = rng.pick(CONFIG.opponentNames);
      usedNames.add(opp);
      const oppStrength = round1(rng.normal(T.oppBase + T.oppStep * (r - 1), T.oppSd));
      const close = Math.abs(myStrength - oppStrength) < CONFIG.stamina.closeRange;
      const evr = evaluateLineup(slots, { gameNo: r, close: close });
      const pred = winProbability(evr.strength, oppStrength);   // 試合の勝敗と同じ関数(乱数は使わない)
      const res = playMatch(rng, evr.strength, oppStrength);
      const roundName = r === T.rounds ? '決勝' : r + '回戦';
      const tag = noteGameResult(state, pred, res.win);
      games.push({
        text: roundName + ' 対' + opp + '高校 '
          + res.my + '対' + res.opp + 'で' + (res.win ? '勝利' : '敗戦') + (tag ? ' 【' + tag + '】' : '')
          + (evr.fatigue >= 1 ? '(投手に疲れ -' + evr.fatigue + ')' : ''),
        cls: tag ? 'special' : res.win ? 'win' : 'lose',
        round: roundName, opp: opp + '高校', pred: pred, win: res.win, tag: tag,
      });
      for (const p of members_) {
        p.record.games++;
        if (res.win) p.record.wins++;
      }
      // 試合経験値(上の段階ほど多い)
      const stageMult = X.tournamentMult[0] + (X.tournamentMult[1] - X.tournamentMult[0]) * (r - 1) / Math.max(1, T.rounds - 1);
      const mult = expMultiplier({ win: res.win, stageMult: stageMult, oppDiff: oppStrength - myStrength });
      for (const p of members_) gainExp(p, X.starter, mult);
      for (const p of bench) gainExp(p, X.bench, mult);
      if (r === T.rounds && res.win) for (const p of members_) p.bigWinThisMonth = true;
      countGame(state, members_);
      // 簡易成績(成績専用の乱数を使う)
      const before = members_.map((p) => statLinesFor(p, state.year)[1]).map((l) => [l.ab, l.h]);
      const rg = recordGameStats(srng, state.year, slots, order, res);
      const paByOrder = rg.paByOrder;
      games[games.length - 1].box = rg.box;
      games[games.length - 1].highlights = buildHighlights(state, rg.box);
      const B = state.stats.batting;
      members_.forEach((p, i) => {
        const l = statLinesFor(p, state.year)[1];
        B.ab += l.ab - before[i][0];
        B.h += l.h - before[i][1];
      });
      for (const num of Object.keys(paByOrder)) B.paByOrder[num] += paByOrder[num];
      B.games++;
      if (!res.win) { champion = false; break; }
      wins++;
    }
    state.statRngState = srng.s;
    // 成績の節目(小さな出来事なので、注目選手だけ通知される)
    const NT = CONFIG.notify;
    const crossed = (list, a, b) => list.filter((m) => a < m && b >= m).pop();
    for (const p of members_) {
      const b = careerBefore[p.id];
      const c = p.stats.career;
      const marks = [];
      const h = crossed(NT.hitMilestones, b.h, c.h);
      if (h) marks.push(h === 1 ? '初安打' : '通算' + h + '安打');
      const hr = crossed(NT.homeRunMilestones, b.hr, c.hr);
      if (hr) marks.push(hr === 1 ? '初本塁打' : '通算' + hr + '本塁打');
      const w = crossed(NT.winMilestones, b.w, c.w);
      if (w) marks.push(w === 1 ? '初勝利' : '通算' + w + '勝');
      if (marks.length) addEvent(state, { player: p, importance: 1, text: p.name + 'が' + marks.join('・') + 'を記録' });
    }
    st.roundsWon += wins;
    let resultText;
    const G = CONFIG.leadership.gains;
    if (champion) {
      st.champion++;
      resultText = T.name + ' 優勝!';
      for (const p of members_) p.record.titles.push(formatYear(state.year) + ' ' + T.name + '優勝');
      gainLeadership(state, G.champion, T.name + '優勝');
    } else {
      const runnerUp = wins + 1 === T.rounds;
      resultText = T.name + ' ' + (wins === 0 ? '初戦敗退' : (runnerUp ? '準優勝' : wins + '勝で敗退'));
      if (runnerUp) { st.runnerUp++; gainLeadership(state, G.runnerUp, T.name + '準優勝'); }
      else if (wins + 2 === T.rounds) { st.best4++; gainLeadership(state, G.best4, T.name + 'ベスト4'); }
    }
    lines.splice(1, 0, { text: resultText, cls: champion ? 'special' : 'summary' });
    pushLog(state, resultText, 3);
    yearRecord(state, state.year)[key] = resultLabel(wins, T.rounds, champion);
    yearRecord(state, state.year)[key + 'Wins'] = champion ? T.rounds : wins;
    const out = {
      type: 'tournament', title: formatYear(state.year) + ' ' + T.name,
      lines: lines, games: games,
      champion: champion, lineup: lineupSummary(slots, order),
    };
    if (type.retireAfter) {
      const retired = retireThirdYears(state);
      if (retired.length) out.lines.push({ text: '3年生' + retired.length + '人が引退した。', cls: 'summary' });
    }
    return out;
  }

  function lineupSummary(slots, order) {
    order = order || battingOrder(slots);
    return slots.map((s) => ({
      pos: s.pos,
      order: s.player ? order[s.player.id] || null : null,
      grade: s.player ? s.player.grade : null,
      id: s.player ? s.player.id : null,
      name: s.player ? s.player.name : '(欠員)',
      apt: s.apt,
      primary: s.player ? s.player.position : null,
      outOfPosition: s.outOfPosition,
      helper: s.player ? !!s.player.helper : false,
      twoWay: s.player ? isTwoWayKnown(s.player) : false,
    })).sort((a, b) => (a.order || 99) - (b.order || 99));
  }

  function retireThirdYears(state) {
    const retired = state.players.filter((p) => p.grade === 3 && !p.retired && !p.helper);
    for (const p of retired) {
      p.retired = true;
      addHistory(p, state.year, '引退', '夏の大会を最後に引退');
    }
    return retired;
  }

  // 年度末(卒業・進級・名鑑への記録)
  function runYearEnd(state, rng) {
    const lines = [];
    for (const p of state.players) {
      if (p.subPlayedThisYear) {
        const d = subRoleGrowth(rng, p);
        if (Object.keys(d).length) addHistory(p, state.year, '転向ボーナス', SIDE_LABEL[otherSide(mainSide(p))] + 'が伸びた', d);
        p.subPlayedThisYear = false;
      }
      if (p.convert) {
        p.convert.penalty -= CONFIG.conversion.recoverPerYear;
        if (p.convert.penalty <= 0) p.convert = null;
      }
      // 1年間の練習・試合経験による成長を、履歴に1行で残す
      if (Object.keys(p.yearGain).length) addHistory(p, state.year, '練習・試合経験(1年間)', '', p.yearGain);
      p.yearGain = {};
    }
    // 今年の成長トップ3(見えている能力の増分の合計。前年度末か入学時と比べる)
    const yearGrowth = state.players.filter((p) => !p.helper && p.snapshots.length).map((p) => {
      const last = p.snapshots[p.snapshots.length - 1].a;
      const d = {};
      let total = 0;
      for (const k of visibleKeys(p)) {
        const v = p.abilities[k] - last[k];
        if (v > 0) { d[k] = v; total += v; }
      }
      return { p: p, total: total, d: d };
    });
    const lowGrowth = yearGrowth.filter((x) => x.total / visibleKeys(x.p).length * CONFIG.ratingMultiplier < CONFIG.visual.lowGrowthRating).length;
    const topGrowth = yearGrowth.filter((x) => x.total >= 0.5).sort((a, b) => b.total - a.total || a.p.id - b.p.id).slice(0, CONFIG.growthTopN);
    const topLines = topGrowth.map((x, i) => ({
      text: (i + 1) + '位 ' + (x.p.watched ? '★' : '') + x.p.name + '(' + x.p.grade + '年・' + POSITION_SHORT[x.p.position] + ')'
        + ' 総合値+' + Math.round(x.total / visibleKeys(x.p).length * CONFIG.ratingMultiplier) + '(' + formatDelta(x.d) + ')',
      cls: i === 0 ? 'big' : '',
    }));
    const helpers = state.players.filter((p) => p.helper);
    for (const p of helpers) {
      addHistory(p, state.year, '助っ人終了', CONFIG.career.helperLabel);
      state.alumni.push(makeAlumniRecord(p, { graduatedYear: state.year, career: CONFIG.career.helperLabel }));
    }
    if (helpers.length) lines.push({ text: '助っ人' + helpers.length + '人が元の部活に戻った。', cls: 'none' });
    const graduates = state.players.filter((p) => p.grade >= 3 && !p.helper);
    const summaries = [];
    let pros = 0;
    for (const p of graduates) {
      const career = decideCareer(rng, p);
      if (career === CONFIG.career.paths[0].label) pros++;
      takeSnapshot(p, state.year);
      addTimeline(p, '卒業');
      addHistory(p, state.year, '卒業', career + '(総合値 ' + rating(p) + ')');
      state.alumni.push(makeAlumniRecord(p, { graduatedYear: state.year, career: career }));
      lines.push(p.name + '(' + POSITION_SHORT[p.position] + '・総合値' + rating(p) + ')→ ' + career);
      if (p.watched) summaries.push.apply(summaries, watchSummary(state, p, career));
    }
    if (pros) gainLeadership(state, pros * CONFIG.leadership.gains.pro, 'プロ入り' + pros + '人');
    updateReputation(state, pros);
    state.players = state.players.filter((p) => p.grade < 3 && !p.helper);
    for (const p of state.players) {
      takeSnapshot(p, state.year);
      p.grade++;
    }
    pushLog(state, graduates.length + '人が卒業した。', 2);
    const summary = yearSummary(state, lowGrowth);
    compressAlumniLogs(state, CONFIG.visual.keepMonthlyYears);
    state.stats.leadershipByYear.push(state.leadership.lv);
    state.stats.years++;
    state.year++;
    lines.unshift({ text: graduates.length + '人が卒業。名鑑に記録されました。', cls: 'summary' });
    const top = topLines.length ? [{ text: '今年の成長トップ' + topLines.length, cls: 'summary' }].concat(topLines) : [];
    return { type: 'yearEnd', title: formatYear(state.year - 1) + ' 年度末 卒業式', lines: top.concat(lines, summaries), yearSummary: summary };
  }

  // 年度末の「今年のまとめ」(表示用)。1年目は前年との比較を出さない。チーム戦力は出さない
  function yearSummary(state, lowGrowth) {
    const y = state.year;
    const rec = yearRecord(state, y);
    const prevRec = state.yearRecords[y - 1];
    const lines = [];
    lines.push({ text: '年間の伸びが小さかった選手(総合値 +' + CONFIG.visual.lowGrowthRating + ' 未満):' + lowGrowth + '人', cls: '' });
    for (const k of ['summer', 'autumn']) {
      const name = CONFIG.tournaments[k].name;
      const now = rec[k] || '-';
      if (y > 1 && prevRec && prevRec[k]) {
        const up = RESULT_RANK.indexOf(now) - RESULT_RANK.indexOf(prevRec[k]);
        lines.push({ text: name + ':昨年は' + prevRec[k] + ' → 今年は' + now + (up > 0 ? '(前進)' : up < 0 ? '(後退)' : ''), cls: up > 0 ? 'win' : '' });
      } else {
        lines.push({ text: name + ':' + now, cls: '' });
      }
    }
    lines.push({ text: '番狂わせ ' + rec.upsets + '回 / 波乱 ' + rec.shocks + '回', cls: '' });
    return { type: 'yearSummary', title: formatYear(y) + ' 今年のまとめ', lines: lines };
  }

  // 注目選手の「3年間のまとめ」(卒業時の表示行)
  function watchSummary(state, p, career) {
    const keys = visibleKeys(p);
    const g = growthSinceEntry(p, keys);
    const big = p.history.filter((h) => h.res === OUTCOME_LABEL.big).length;
    const major = p.history.filter((h) => ['転生判明', '二刀流判明', '副能力判明', 'コンバート', 'コンバート失敗', '限界突破'].indexOf(h.ev) >= 0)
      .map((h) => h.ev + (h.res ? '(' + h.res + ')' : ''));
    if (big) major.unshift('合宿で大きく伸びた ×' + big);
    if (p.record.titles.length) major.push(p.record.titles.join('、'));
    const l = p.stats.career;
    const statText = (l.pg ? l.w + '勝' + l.l + '敗 ' : '') + (l.ab ? '打率' + (l.h / l.ab).toFixed(3).replace(/^0/, '') + ' ' + l.hr + '本' : '');
    const ini = initialRating(p);
    const fin = rating(p);
    const out = [
      { text: '★3年間のまとめ:' + p.name + '(' + POSITION_LABEL[p.position] + ')→ ' + career, cls: 'watchhead' },
      { text: '  入学時 総合値' + ini + ' → 卒業時 総合値' + fin + '(+' + (fin - ini) + ')', cls: 'watch' },
      { text: '  一番伸びた:' + (formatBestGrowth(g) || 'なし'), cls: 'watch' },
      { text: '  主なイベント:' + (major.length ? major.join(' / ') : '特になし'), cls: 'watch' },
    ];
    if (statText) out.push({ text: '  通算成績:' + statText, cls: 'watch' });
    pushLog(state, '★' + p.name + 'が卒業(' + career + ')', 2);
    return out;
  }

  // イベントの種類ごとの処理(カレンダーの表から呼び出す)
  const EVENT_HANDLERS = {
    enrollment: () => null,                       // 月の始めに処理済み(方針選択の画面)
    practiceGames: (state, rng) => runPracticeGames(state, rng),
    camp: (state, rng, type) => runCamp(state, rng, type),
    tournament: (state, rng, type) => runSimpleTournament(state, rng, type),
    yearEnd: (state, rng) => runYearEnd(state, rng),
  };

  // 1か月を進める。月のまとめ { type:'month', ... } を返す
  //   observer(state, 月) … 検証用。その月の成長のあと(年度末の前)に呼ばれる。乱数は使わないこと
  function processMonth(state, observer) {
    if (state.awaiting) return null;
    const c = CAL[state.month];
    const mev = {
      type: 'month', year: state.year, month: c.month, label: c.label, note: c.note,
      cards: state.carryCards.splice(0), summaries: [], notices: [], hidden: 0, stop: false,
      watchLines: [], grown: 0,
    };
    state.monthNotices = [];
    const types = c.events.map((k) => Object.assign({ id: k }, CONFIG.eventTypes[k])).filter((t) => t.kind);
    withRng(state, (rng) => {
      const runEvent = (t) => {
        const res = EVENT_HANDLERS[t.kind](state, rng, t);
        if (res && res.summary) {
          mev.summaries.push(res.summary);
          if (res.practice) mev.practice = (mev.practice || []).concat(res.practice);
        } else if (res) mev.cards.push(res);
        if (CONFIG.stopKinds.indexOf(t.kind) >= 0 && t.kind !== 'enrollment') mev.stop = true;
      };
      // 年度末より前のイベント → 月ごとの成長 → 年度末
      for (const t of types) if (t.kind !== 'yearEnd') runEvent(t);
      const g = runMonthlyGrowth(state, rng);
      mev.grown = g.grown;
      mev.watchLines = g.watchLines;
      checkGenerationMilestones(state, c.month);
      // 月末の記録(チーム戦力・在校生の能力)と、成長の効果
      const serial = recordMonthEnd(state);
      mev.serial = serial;
      const PL = state.powerLog;
      const cur = PL[PL.length - 1];
      mev.power = cur.p;
      // 成長の効果:月末のスタメンをそのままにして、前月末の能力と今月末の能力で比べる(引退や入れ替えの影響を除く)
      {
        const ref = opponentRef();
        const slots = buildLineup(state.players);
        const prevSlots = slots.map((sl) => {
          if (!sl.player) return sl;
          // 前月の記録がなければ、今年の新入生は入学時と比べ、それ以外(ゲーム開始時の上級生)は変化なしとする
          const prev = abilitiesAt(sl.player, serial - 1) || (sl.player.enrolledYear === state.year ? sl.player.initialAbilities : sl.player.abilities);
          return Object.assign({}, sl, { player: Object.assign({}, sl.player, { abilities: prev }) });
        });
        const d = winProbability(evaluateLineup(slots).strength, ref.avg) - winProbability(evaluateLineup(prevSlots).strength, ref.avg);
        if (Math.abs(d) >= CONFIG.visual.growthWinMin) mev.winDelta = d;
      }
      const tops = [];
      for (const p of state.players) {
        if (p.helper) continue;
        const md = monthDelta(p, serial);
        if (!md) continue;
        const keys = visibleKeys(p);
        const gain = keys.reduce((a, k) => a + md.d[k], 0) / keys.length * CONFIG.ratingMultiplier;
        if (gain > 0.05) tops.push({ id: p.id, name: p.name, grade: p.grade, gain: round1(gain), watched: !!p.watched });
      }
      tops.sort((a, b) => b.gain - a.gain || a.id - b.id);
      mev.topGrowers = tops.slice(0, CONFIG.visual.topGrowersN);
      if (observer) observer(state, c.month);
      for (const t of types) if (t.kind === 'yearEnd') runEvent(t);
    });
    // 通知:重要度の高い順に上限まで
    const ns = state.monthNotices.slice().sort((a, b) => b.importance - a.importance);
    mev.notices = ns.slice(0, CONFIG.notify.monthMax);
    mev.hidden = Math.max(0, ns.length - CONFIG.notify.monthMax);
    if (CONFIG.autoStop.enabled && ns.some((n) => n.importance >= CONFIG.autoStop.minImportance)) mev.stop = true;
    state.monthNotices = [];
    // 次の月へ
    state.month = (state.month + 1) % CAL.length;
    beginMonth(state);
    return mev;
  }

  // 初めて同世代の上位(怪物級以上)に入った選手に印を付ける。注目選手(★)だけ通知する
  function checkGenerationMilestones(state, monthNum) {
    if (!benchmark) return;
    for (const p of state.players) {
      if (p.helper || p.reachedMonster) continue;
      const r = getGenerationRank(p, p.retired ? 3 : p.grade, p.retired ? 3 : monthNum);
      if (r && r.top <= CONFIG.labelTop.monster) {
        p.reachedMonster = true;
        if (p.watched) {
          addEvent(state, { player: p, importance: 3, cls: 'special',
            text: p.name + 'が同世代の上位' + formatTop(r.top) + '(' + r.label + ')に到達した!' });
        }
      }
    }
  }

  // 「おまかせ」の方針:新入生と、選び直しが必要な在校生に、能力から自動で決めた方針(画面の「おまかせ」ボタンと同じ)
  function autoPolicies(state) {
    const pol = {};
    for (const p of state.pendingRecruits) pol[p.id] = autoPolicy(p);
    for (const p of reviewablePlayers(state)) if (p.needsPolicy) pol[p.id] = autoPolicy(p);
    return pol;
  }
  // 方針の見直しの月(12月など)を、おまかせで確定して止まらずに進める(policyControlEnabled が false のとき。結果は「おまかせ」と同じ)
  function resolveReviewAuto(state) {
    if (state.awaiting === 'policy' && state.policyContext === 'review') { confirmPolicies(state, autoPolicies(state)); return true; }
    return false;
  }
  // 1か月だけ進める。opts.autoReview:方針の見直しの月を、おまかせで確定して止まらない
  function advanceMonth(state, opts) {
    const mev = processMonth(state);
    state.lastEvents = mev ? [mev] : [];
    if (opts && opts.autoReview) resolveReviewAuto(state);
    return state.lastEvents;
  }
  // 次のイベント(入学・合宿・大会・年度末、または重要な通知)のある月まで進める
  function advanceToNextEvent(state, observer, opts) {
    const out = [];
    const auto = opts && opts.autoReview;
    if (auto) resolveReviewAuto(state);
    while (!state.awaiting) {
      const mev = processMonth(state, observer);
      out.push(mev);
      if (mev.stop) break;
      if (auto) resolveReviewAuto(state);
    }
    if (auto) resolveReviewAuto(state);
    state.stats.stops++;
    state.lastEvents = out;
    return out;
  }
  // 次の4月(新入生の引き)まで進める。途中の方針見直しは、変更なしで確定する(opts.autoReview のときは、おまかせで確定)
  function advanceToApril(state, opts) {
    const out = [];
    for (;;) {
      if (state.awaiting) {
        if (state.policyContext === 'review') confirmPolicies(state, opts && opts.autoReview ? autoPolicies(state) : {});
        else break;
      }
      out.push(processMonth(state));
    }
    state.lastEvents = out;
    return out;
  }

  const HighSchool = {
    CALENDAR: CAL,
    formatYear: formatYear,
    monthLabel: monthLabel,
    monthIndexOf: monthIndexOf,
    newGame: newGame,
    confirmPolicies: confirmPolicies,
    autoPolicies: autoPolicies,
    resolveReviewAuto: resolveReviewAuto,
    confirmEnrollment: confirmEnrollment,
    reviewablePlayers: reviewablePlayers,
    processMonth: processMonth,
    advanceMonth: advanceMonth,
    advanceToNextEvent: advanceToNextEvent,
    advanceToApril: advanceToApril,
    members: members,
    addEvent: addEvent,
    setWatch: setWatch,
    watchedPlayers: watchedPlayers,
    countByPosition: countByPosition,
    leadershipNeed: leadershipNeed,
    reputationX: reputationX,
    recruitQuality: recruitQuality,
    recruitTrend: recruitTrend,
    monthSerial: monthSerial,
    serialLabel: serialLabel,
    abilitiesAt: abilitiesAt,
    monthDelta: monthDelta,
    unpackAbilities: unpackAbilities,
    compressAlumniLogs: compressAlumniLogs,
    resultLabel: resultLabel,
    lineup: (state) => lineupSummary(buildLineup(state.players)),
    teamStrength: (state) => calcTeamStrength(state.players),
  };

  // ===========================================================
  // 調整画面の上書き設定(Tuning)
  // ===========================================================
  const DEFAULTS = JSON.parse(JSON.stringify(CONFIG));
  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function setPath(obj, path, value) {
    const ks = path.split('.');
    let o = obj;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = value;
  }
  // 上書き設定 { path: 値 } を CONFIG に反映する(調整できる値だけ。指定のない値は初期値に戻す)
  function applyOverrides(overrides) {
    overrides = overrides || {};
    for (const m of CONFIG.paramMeta) {
      const v = overrides[m.path];
      const ok = (typeof v === 'number' && isFinite(v)) || (typeof v === 'boolean' && typeof getPath(DEFAULTS, m.path) === 'boolean')  // オン/オフの設定は真偽値
        || (typeof v === 'string' && m.options && m.options.indexOf(v) >= 0);                                                      // 選択肢の設定は文字列
      setPath(CONFIG, m.path, ok ? v : getPath(DEFAULTS, m.path));
    }
  }
  // 一時的に別の上書き設定で fn を実行する(試し計算用。終わったら元に戻す)
  function withOverrides(overrides, restore, fn) {
    applyOverrides(overrides);
    try { return fn(); } finally { applyOverrides(restore); }
  }
  // 進行中のゲームに使う設定:ゲームを作ったときの上書き + 表示だけに使う値は今の上書き
  function effectiveOverrides(gameOverrides, pending) {
    const out = Object.assign({}, gameOverrides || {});
    for (const m of CONFIG.paramMeta) {
      if (!m.displayOnly) continue;
      if (pending && pending[m.path] != null) out[m.path] = pending[m.path];
      else delete out[m.path];
    }
    return out;
  }
  function overridesToText(overrides) {
    return CONFIG.paramMeta.filter((m) => overrides && overrides[m.path] != null)
      .map((m) => m.path + ' = ' + overrides[m.path]).join('\n');
  }
  const Tuning = {
    DEFAULTS: DEFAULTS,
    getPath: getPath,
    defaultValue: (path) => getPath(DEFAULTS, path),
    currentValue: (path) => getPath(CONFIG, path),
    applyOverrides: applyOverrides,
    withOverrides: withOverrides,
    effectiveOverrides: effectiveOverrides,
    overridesToText: overridesToText,
  };

  // ===========================================================
  // 保存・リセット(Persist)
  //   storage は localStorage と同じ形(getItem / setItem / removeItem / key / length)
  // ===========================================================
  const KEYS = {
    save: CONFIG.storagePrefix + 'v' + CONFIG.saveVersion + '_save',
    overrides: CONFIG.storagePrefix + 'tune_overrides',
    benchmark: CONFIG.storagePrefix + 'tune_benchmark',
    lastTrial: CONFIG.storagePrefix + 'tune_lastTrial',
    ui: CONFIG.storagePrefix + 'v' + CONFIG.saveVersion + '_ui',   // 折りたたみの開閉の記憶・表示の詳しさ
  };
  function readJson(storage, key) {
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeJson(storage, key, value) {
    try { storage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  // チーム戦力の月ごとの記録(powerLog)は保存しない(遊ぶ画面では使わない。sim.js などの集計はメモリ上の記録を使う)
  function saveGame(storage, state) { return writeJson(storage, KEYS.save, Object.assign({}, state, { powerLog: [] })); }
  function loadGame(storage) {
    const s = readJson(storage, KEYS.save);
    if (s && s.version === CONFIG.saveVersion && !Array.isArray(s.powerLog)) s.powerLog = [];
    return s && s.version === CONFIG.saveVersion ? s : null;
  }
  function loadOverrides(storage) { return readJson(storage, KEYS.overrides) || {}; }
  function saveOverrides(storage, ov) { return writeJson(storage, KEYS.overrides, ov || {}); }
  // 新しいゲームを作る:今の上書き設定を、このゲームの設定として固定する
  function startGame(storage, seed) {
    try { storage.removeItem(KEYS.ui); } catch (e) { /* なし */ }   // 開閉の記憶もリセットで消す
    const ov = loadOverrides(storage);
    applyOverrides(ov);
    const state = newGame({ seed: seed, overrides: ov });
    saveGame(storage, state);
    return state;
  }
  // 「同じシードでやり直す」
  function resetSameSeed(storage, state) { return startGame(storage, state.seed); }
  // 「新しいシードで始める」(seed を省くとランダム)
  function resetNewSeed(storage, seed) { return startGame(storage, seed); }
  // 「セーブを完全に消す」:このゲームの保存データ(bbgacha_ で始まるキー)をすべて消して、初期状態から
  function wipeAll(storage, seed) {
    const keys = [];
    try {
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.indexOf(CONFIG.storagePrefix) === 0) keys.push(k);
      }
      for (const k of keys) storage.removeItem(k);
    } catch (e) { /* 保存できない環境 */ }
    setBenchmark(null);
    applyOverrides({});
    const state = newGame({ seed: seed });
    saveGame(storage, state);
    return state;
  }
  // 起動時:?reset=1 なら全部消す。そうでなければ読み込み(なければ新規)
  function startup(storage, search) {
    const reset = /[?&]reset=1(&|$)/.test(search || '');
    if (reset) return { state: wipeAll(storage), reset: true };
    const custom = readJson(storage, KEYS.benchmark);
    if (custom) setBenchmark(custom, 'custom');
    const saved = loadGame(storage);
    if (saved) {
      applyOverrides(effectiveOverrides(saved.overrides, loadOverrides(storage)));
      return { state: saved, reset: false };
    }
    return { state: startGame(storage), reset: false };
  }
  // このゲームの保存データの大きさ(bbgacha_ で始まるキーの、キーと値の文字数の合計)
  function usage(storage) {
    let n = 0;
    try {
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.indexOf(CONFIG.storagePrefix) === 0) n += k.length + (storage.getItem(k) || '').length;
      }
    } catch (e) { /* 読めない環境 */ }
    return n;
  }
  const Persist = {
    KEYS: KEYS,
    usage: usage,
    readJson: readJson,
    writeJson: writeJson,
    saveGame: saveGame,
    loadGame: loadGame,
    loadOverrides: loadOverrides,
    saveOverrides: saveOverrides,
    startGame: startGame,
    resetSameSeed: resetSameSeed,
    resetNewSeed: resetNewSeed,
    wipeAll: wipeAll,
    startup: startup,
  };

  // ===========================================================
  // 自動実行と集計(Sim)。sim.js と調整画面の試し計算で共用する
  // ===========================================================
  // 方針の選択(auto:新入生と在校生の全員をおまかせ / balance / random)
  function makeChooser(seed, mode) {
    const pickRng = new Rng(seed ^ 0x9e3779b9); // ゲーム本体の乱数とは別
    return (p) => {
      const list = POLICIES[policySetOf(p)];
      if (mode === 'balance') return list[list.length - 1].key;
      if (mode === 'random') return pickRng.pick(list).key;
      return autoPolicy(p);
    };
  }
  // 1シードを1年ずつ進めるランナー。opts: { seed, years, policyMode, fixedCoachLv, observer }
  function createSeedRunner(opts) {
    const choose = makeChooser(opts.seed, opts.policyMode || 'auto');
    const t0 = Date.now();
    const state = newGame({ seed: opts.seed, fixedCoachLv: opts.fixedCoachLv, fixedRep: opts.fixedRep });
    const startMs = Date.now() - t0;   // 前史の所要時間(状態には入れない。同じシードで同じ結果にするため)
    return {
      state: state,
      startMs: startMs,
      done: () => state.stats.years >= opts.years,
      stepYear: () => {
        const target = state.stats.years + 1;
        while (state.stats.years < target) {
          if (state.awaiting) {
            const pol = {};
            for (const p of state.pendingRecruits) pol[p.id] = choose(p);
            for (const p of reviewablePlayers(state)) {
              if ((opts.policyMode || 'auto') === 'auto' || p.needsPolicy) pol[p.id] = choose(p);
            }
            confirmPolicies(state, pol);
            continue;
          }
          advanceToNextEvent(state, opts.observer);
        }
      },
    };
  }
  // 自校の在校生のラベルの割合(毎月の観測)
  function labelObserver(acc) {
    return (state, month) => {
      if (!benchmark) return;
      for (const p of state.players) {
        if (p.helper) continue;
        const r = getGenerationRank(p, p.retired ? 3 : p.grade, p.retired ? 3 : month);
        acc.total++;
        if (r && r.top <= CONFIG.labelTop.promising) acc.promising++;
        if (r && r.top <= CONFIG.labelTop.monster) acc.monster++;
      }
    };
  }
  // 複数シードの実行を、少しずつ進められる形にする(画面が固まらないように)
  //   opts: { seeds: [..], years, policyMode }。step() を呼ぶたびに1年進む
  function createRunner(opts) {
    const labels = { total: 0, promising: 0, monster: 0 };
    const runners = [];
    let idx = 0;
    const totalSteps = opts.seeds.length * opts.years;
    let done = 0;
    return {
      labels: labels,
      progress: () => done / totalSteps,
      finished: () => idx >= opts.seeds.length,
      step: () => {
        if (idx >= opts.seeds.length) return true;
        if (!runners[idx]) runners[idx] = createSeedRunner({ seed: opts.seeds[idx], years: opts.years, policyMode: opts.policyMode, observer: labelObserver(labels) });
        const r = runners[idx];
        r.stepYear();
        done++;
        if (r.done()) idx++;
        return idx >= opts.seeds.length;
      },
      states: () => runners.map((r) => r.state),
      startMs: () => Math.max.apply(null, runners.map((r) => r.startMs).concat([0])),
    };
  }
  function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
  }
  function mean_(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN; }
  // 卒業生の区分
  function gradGroups(grads) {
    const starterRatio = (a) => (a.teamGames ? a.starts / a.teamGames : 0);
    const bloom = (a) => a.talent === 'genius' && !a.geniusBust;
    const isNormal = (a) => !a.reincarnation && !bloom(a);
    return {
      normal: grads.filter(isNormal),
      starter: grads.filter((a) => isNormal(a) && starterRatio(a) >= 0.6),
      bench: grads.filter((a) => isNormal(a) && starterRatio(a) <= 0.2),
      genius: grads.filter((a) => bloom(a) && !a.reincarnation),
      reinc: grads.filter((a) => a.reincarnation && !bloom(a)),
      both: grads.filter((a) => a.reincarnation && bloom(a)),
      twoWay: grads.filter((a) => a.twoWay),
    };
  }
  // 結果の集計(目安と比べる項目)
  //   extra:{ preMs }(前史の所要時間。ランナーの startMs())
  function analyze(states, labels, extra) {
    const grads = [];
    let years = 0;
    let limitBreaks = 0;
    const sum = { practice: 0, camp: 0, exp: 0 };
    const titles = { summer: [], autumn: [] };
    const reach = { lv5: [], lv10: [] };
    for (const st of states) {
      years += st.stats.years;
      limitBreaks += st.stats.limitBreak.count;
      for (const a of st.alumni) if (a.origin === 'recruit') grads.push(a);
      for (const k of ['summer', 'autumn']) {
        const t = st.stats.tournaments[k];
        if (t.played) titles[k].push(t.champion / t.played);
      }
      const L = st.stats.leadershipByYear;
      const f = (lv) => { const i = L.findIndex((v) => v >= lv); return i < 0 ? null : i + 1; };
      reach.lv5.push(f(5));
      reach.lv10.push(f(10));
    }
    for (const a of grads) for (const k of Object.keys(sum)) sum[k] += (a.growthBy && a.growthBy[k]) || 0;
    const tot = sum.practice + sum.camp + sum.exp;
    const g = gradGroups(grads);
    const avgR = (list) => mean_(list.map((a) => a.rating));
    // 指導力:Lv10 に最も早く届いたシード(強い年が続いたチーム)の、Lv5・Lv10 の到達年
    let strong = -1;
    reach.lv10.forEach((v, i) => { if (v != null && (strong < 0 || v < reach.lv10[strong])) strong = i; });
    if (strong < 0) reach.lv5.forEach((v, i) => { if (v != null && (strong < 0 || v < reach.lv5[strong])) strong = i; });
    return Object.assign({
      grads: grads.length,
      years: years,
      normalGrad: avgR(g.normal),
      starterGrad: avgR(g.starter),
      benchGrad: avgR(g.bench),
      geniusGrad: avgR(g.genius),
      reincGrad: avgR(g.reinc),
      bothGrad: avgR(g.both),
      counts: { normal: g.normal.length, starter: g.starter.length, bench: g.bench.length, genius: g.genius.length, reinc: g.reinc.length, both: g.both.length },
      over500: grads.length ? grads.filter((a) => a.rating > 500).length / grads.length : NaN,
      over600: grads.length ? grads.filter((a) => a.rating > 600).length / grads.length : NaN,
      cappedShare: g.normal.length ? g.normal.filter((a) => a.cappedOut).length / g.normal.length : NaN,
      limitBreaks: years ? limitBreaks / years * 10 : NaN,
      sharePractice: tot ? sum.practice / tot : NaN,
      shareCamp: tot ? sum.camp / tot : NaN,
      shareExp: tot ? sum.exp / tot : NaN,
      lv5Years: strong >= 0 ? reach.lv5[strong] : null,
      lv10Years: strong >= 0 ? reach.lv10[strong] : null,
      lvReach: reach,
      summerTitle: mean_(titles.summer),
      autumnTitle: mean_(titles.autumn),
      preHistoryMs: extra && extra.preMs != null ? extra.preMs : NaN,
      promisingUp: labels && labels.total ? labels.promising / labels.total : NaN,
      monsterUp: labels && labels.total ? labels.monster / labels.total : NaN,
    }, analyzeVisual(states), analyzeStartAndRep(states), repSynthetic(), analyzeLineup(states));
  }
  // スタメン編成の集計(不変条件の違反・本職外起用の割合・上位3人の控え)
  function analyzeLineup(states) {
    const t = { months: 0, violations: 0, oop: 0, starters: 0, top3: 0, top3Out: 0, oopMonths: 0, oopByPos: { P: 0, C: 0, IF: 0, OF: 0 } };
    for (const s of states) {
      const L = s.stats.lineupCheck;
      if (!L) continue;
      for (const k of Object.keys(t)) if (k !== 'oopByPos') t[k] += L[k];
      for (const k of POSITIONS) t.oopByPos[k] += L.oopByPos[k];
    }
    return {
      lineupViolations: t.months ? t.violations : NaN,
      offPositionShare: t.starters ? t.oop / t.starters : NaN,
      top3Benched: t.top3 ? t.top3Out / t.top3 : NaN,
      lineupStats: t,
    };
  }
  // 前史と評判の集計
  function analyzeStartAndRep(states) {
    const b = benchmark;
    const st = states.filter((s) => s.stats.start);
    const g2 = mean_(st.map((s) => s.stats.start.g2));
    const g3 = mean_(st.map((s) => s.stats.start.g3));
    let startVsBench = NaN;
    if (b && b.rows['2-4'] && b.rows['3-4']) startVsBench = Math.max(Math.abs(g2 / b.rows['2-4'].p50 - 1), Math.abs(g3 / b.rows['3-4'].p50 - 1));
    const april = (s, y) => { const e = s.powerLog.find((x) => x.y === y && x.m === 4); return e ? e.p : null; };
    const p1 = st.map((s) => april(s, 1)).filter((v) => v != null);
    const p23 = st.map((s) => [april(s, 2), april(s, 3)].filter((v) => v != null)).filter((a) => a.length).map((a) => mean_(a));
    const reps = [];
    for (const s of states) for (const r of s.stats.repByYear) reps.push(r);
    return {
      startG2: g2,
      startG3: g3,
      startVsBench: startVsBench,
      startPowerGap: p1.length && p23.length ? Math.abs(mean_(p1) / mean_(p23) - 1) : NaN,
      repCapYears: reps.length ? reps.filter((r) => r.x >= 0.999).length / reps.length : NaN,
      repAvg: reps.length ? mean_(reps.map((r) => r.rep)) : NaN,
      repXAvg: reps.length ? mean_(reps.map((r) => r.x)) : NaN,
    };
  }
  // 評判の効果:x = 0 と x = 1 で新入生をたくさん抽選して比べる(試し抽選。ゲームには影響しない)
  function repSynthetic(n) {
    n = n || 20000;
    const draw = (x) => {
      const rng = new Rng(20240607);
      const q = recruitQuality(x);
      const list = [];
      for (let i = 0; i < n; i++) list.push(createPlayer(rng, { id: i, year: 1, quality: q }));
      return list;
    };
    const special = (p) => p.talent === 'genius' || !!p.reincarnation;
    const a0 = draw(0);
    const a1 = draw(1);
    const normAvg = (list) => mean_(list.filter((p) => !special(p)).map((p) => rating(p)));
    const talentRate = (list) => list.filter(special).length / list.length;
    return {
      repTopGain: normAvg(a1) - normAvg(a0),
      repNormalShare: a1.filter((p) => !special(p) && rating(p) >= 80 && rating(p) <= 120).length / a1.length,
      repTalentMult: talentRate(a1) / talentRate(a0),
    };
  }
  // 見える化の集計:勝率予想の校正・チーム戦力の推移・成長の反映・ハイライト・保存容量
  function analyzeVisual(states) {
    const V = CONFIG.visual;
    const bins = [];
    for (let i = 0; i < 10; i++) bins.push({ n: 0, w: 0, p: 0 });
    let hl = { games: 0, count: 0, withNote: 0 };
    const powerByYear = {};
    const reflect = [];
    const growth = [];
    const storage = [];
    for (const st of states) {
      (st.stats.calib || []).forEach((c, i) => { if (c) { bins[i].n += c.n; bins[i].w += c.w; bins[i].p += c.p; } });
      const H = st.stats.highlights;
      hl = { games: hl.games + H.games, count: hl.count + H.count, withNote: hl.withNote + H.withNote };
      const byY = {};
      for (const e of st.powerLog) (byY[e.y] = byY[e.y] || []).push(e.p);
      const ys = Object.keys(byY).map(Number).sort((a, b) => a - b);
      for (const y of ys) (powerByYear[y] = powerByYear[y] || []).push(mean_(byY[y]));
      if (ys.length >= 6) {
        const first = mean_(byY[ys[0]]);
        const last5 = mean_(ys.slice(-5).map((y) => mean_(byY[y])));
        growth.push((last5 - first) / first);
      }
      const ref = opponentRef();
      const at = (y, m) => st.powerLog.find((e) => e.y === y && e.m === m);
      // 各年の4月と、その2年後の4月(その年の1年生が3年生になったとき)の差を、全学年ぶん平均する
      for (let y = 1; y + 2 <= st.stats.years; y++) {
        const a = at(y, 4);
        const b = at(y + 2, 4);
        if (a && b) reflect.push(winProbability(b.st, ref.avg) - winProbability(a.st, ref.avg));
      }
      // 保存容量:年数に比例して増える分を、50年ぶんに引き延ばして見積もる
      const size = JSON.stringify(st).length;
      const years = Math.max(1, st.stats.years);
      const base = 60000; // 開始直後のおおよその大きさ
      storage.push((base + Math.max(0, size - base) / years * 50) / V.storageQuotaChars);
    }
    const calibRows = bins.map((b, i) => ({ bin: i, n: b.n, pred: b.n ? b.p / b.n : NaN, actual: b.n ? b.w / b.n : NaN }));
    const used = calibRows.filter((r) => r.n >= V.calibrationMinGames);
    return {
      calibration: used.length ? Math.max.apply(null, used.map((r) => Math.abs(r.actual - r.pred))) : NaN,
      calibRows: calibRows,
      powerGrowth: growth.length ? mean_(growth) : NaN,
      powerByYear: Object.keys(powerByYear).map(Number).sort((a, b) => a - b).map((y) => ({ y: y, p: mean_(powerByYear[y]) })),
      growthReflect: reflect.length ? mean_(reflect) : NaN,
      highlightsPerGame: hl.games ? hl.count / hl.games : NaN,
      growthNoteShare: hl.count ? hl.withNote / hl.count : NaN,
      storageShare: storage.length ? Math.max.apply(null, storage) : NaN,
    };
  }
  // 目安との比較:✓ 範囲内 / △ 目安の±20%以内 / ✕ それ以外 / − データなし(該当する選手がいない、未到達など)
  function judgeValue(v, t) {
    if (v == null || Number.isNaN(v)) return '−';
    const lo = t.min != null ? t.min : -Infinity;
    const hi = t.max != null ? t.max : Infinity;
    if (v >= lo && v <= hi) return '✓';
    if (v >= lo * 0.8 && v <= hi * 1.2) return '△';
    return '✕';
  }
  function judge(metrics) {
    return Object.keys(CONFIG.targets).map((key) => {
      const t = CONFIG.targets[key];
      return { key: key, label: t.label, value: metrics[key], target: t, verdict: judgeValue(metrics[key], t), tune: t.tune };
    });
  }
  function formatMetric(v, t) {
    if (v == null || Number.isNaN(v)) return '-';
    if (t && t.pct) return (v * 100).toFixed(1) + '%';
    return Math.abs(v) >= 10 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toString();
  }
  function formatTarget(t) {
    const f = (v) => formatMetric(v, t);
    if (t.min != null && t.max != null) return f(t.min) + '〜' + f(t.max);
    if (t.max != null) return f(t.max) + '以下';
    return f(t.min) + '以上';
  }

  // 世代の基準をつくる(標準的な学校:指導力固定・おまかせ)。step() で1年ずつ進む
  function createBenchmarkRunner(opts) {
    opts = Object.assign({ seeds: CONFIG.benchmarkRuns.seeds, years: CONFIG.benchmarkRuns.years, burnIn: CONFIG.benchmarkRuns.burnIn, coachLv: CONFIG.baselineCoachLv, seedBase: 1000 }, opts || {});
    const samples = {};
    const observer = (state, month) => {
      if (state.stats.years < opts.burnIn) return;
      for (const p of state.players) {
        if (p.helper) continue;
        const grade = p.retired ? 3 : p.grade;
        const key = grade + '-' + month;
        (samples[key] = samples[key] || []).push(rating(p));
      }
    };
    const total = opts.seeds * opts.years;
    let done = 0;
    let i = 0;
    let cur = null;
    return {
      progress: () => done / total,
      finished: () => i >= opts.seeds,
      step: () => {
        if (i >= opts.seeds) return true;
        if (!cur) cur = createSeedRunner({ seed: opts.seedBase + i, years: opts.years, policyMode: 'auto', fixedCoachLv: opts.coachLv, fixedRep: true, observer: observer });
        cur.stepYear();
        done++;
        if (cur.done()) { i++; cur = null; }
        return i >= opts.seeds;
      },
      result: () => {
        const rows = {};
        for (const key of Object.keys(samples)) {
          const v = samples[key].slice().sort((a, b) => a - b);
          rows[key] = { n: v.length, p50: quantile(v, 0.5), p90: quantile(v, 0.9), p97: quantile(v, 0.97), p99: quantile(v, 0.99), p999: quantile(v, 0.999) };
        }
        return { hash: benchmarkConfigHash(), runs: { seeds: opts.seeds, years: opts.years, burnIn: opts.burnIn }, coachLv: opts.coachLv, rows: rows };
      },
    };
  }
  const Sim = {
    createSeedRunner: createSeedRunner,
    createRunner: createRunner,
    createBenchmarkRunner: createBenchmarkRunner,
    analyze: analyze,
    gradGroups: gradGroups,
    judge: judge,
    judgeValue: judgeValue,
    formatMetric: formatMetric,
    formatTarget: formatTarget,
    quantile: quantile,
  };

  return { CONFIG: CONFIG, Core: Core, HighSchool: HighSchool, Generation: Generation, Tuning: Tuning, Persist: Persist, Sim: Sim };
});
