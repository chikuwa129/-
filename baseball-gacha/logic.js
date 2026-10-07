// =============================================================
// logic.js : ゲームロジック(DOM 非依存)
//   - Core       : 乱数・選手生成・成長・適性・編成・記録。高校版/プロ版で共通に使う部分
//   - HighSchool : 高校版の進行(カレンダー、入部、コンバート、大会、卒業)
// ブラウザでは window.Logic、Node.js では module.exports で使う。
// =============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./config.js'));
  } else {
    root.Logic = factory(root.CONFIG);
  }
})(typeof self !== 'undefined' ? self : this, function (CONFIG) {
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
  function avgOf(abilities, keys) {
    return round1(keys.reduce((s, k) => s + abilities[k], 0) / keys.length);
  }
  function sideOf(pos) { return pos === 'P' ? 'pitch' : 'bat'; }
  function otherSide(side) { return side === 'pitch' ? 'bat' : 'pitch'; }
  function sideKeys(side) { return side === 'pitch' ? PITCH_KEYS : BAT_KEYS; }
  function mainSide(p) { return sideOf(p.position); }

  // 二刀流と判明しているか
  function isTwoWayKnown(p) { return !!(p.twoWay && p.twoWayRevealed); }
  // 副能力(本職でない側)が判明しているか
  function isSubKnown(p) { return !!(p.subRevealed || isTwoWayKnown(p)); }
  // 一覧に表示する能力(本職側。判明した二刀流は両方)
  function visibleKeys(p) {
    if (isTwoWayKnown(p)) return ALL_KEYS;
    return sideKeys(mainSide(p));
  }
  function subKeysOf(p) { return sideKeys(otherSide(mainSide(p))); }

  // 総合値(本職側の平均。二刀流は両側の平均)
  function overall(p) {
    if (p.twoWay) return round1((avgOf(p.abilities, PITCH_KEYS) + avgOf(p.abilities, BAT_KEYS)) / 2);
    return avgOf(p.abilities, sideKeys(mainSide(p)));
  }
  function maxAbility(abilities, keys) {
    return Math.max.apply(null, (keys || Object.keys(abilities)).map((k) => abilities[k]));
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
  // takenSurnames: 在籍中の選手の名字(Set)。被ったら引き直す
  function generateName(rng, takenSurnames) {
    let surname = rng.pick(SURNAMES);
    for (let i = 0; i < 100 && takenSurnames && takenSurnames.has(surname); i++) {
      surname = rng.pick(SURNAMES);
    }
    return { surname: surname, given: rng.pick(GIVEN_NAMES) };
  }

  // ---------- 選手の生成 ----------
  function genMainAbility(rng) {
    const IA = CONFIG.initialAbility;
    return clamp(Math.round(rng.normal(IA.mean, IA.sd)), IA.min, IA.max);
  }

  // opts: { id, year, grade, takenSurnames, position, positionWeights, forceTwoWay, abilityOverride }
  function createPlayer(rng, opts) {
    const T = CONFIG.talent;
    const reincarnation = rng.chance(T.reincarnationRate)
      ? rng.pick(Object.keys(CONFIG.reincarnationTypes)) : null;
    const talent = rng.chance(T.geniusRate) ? 'genius' : 'normal';
    const geniusBust = talent === 'genius' && rng.chance(T.geniusBustRate);
    const twoWay = opts.forceTwoWay != null ? opts.forceTwoWay : rng.chance(T.twoWayRate);

    let position;
    if (twoWay) position = 'P'; // 二刀流はスタメンで投手の枠に入る
    else if (reincarnation) position = CONFIG.reincarnationTypes[reincarnation].position;
    else if (opts.position) position = opts.position;
    else position = rng.weighted(opts.positionWeights || CONFIG.positionRates);

    const side = sideOf(position);
    const abilities = {};
    // 本職側
    for (const k of sideKeys(side)) abilities[k] = opts.abilityOverride ? opts.abilityOverride(rng) : genMainAbility(rng);
    const bonus = CONFIG.positionBonus[position] || {};
    for (const k of Object.keys(bonus)) abilities[k] += bonus[k];
    // もう一方の側
    const mainAvg = sideKeys(side).reduce((s, k) => s + abilities[k], 0) / sideKeys(side).length;
    for (const k of sideKeys(otherSide(side))) {
      if (twoWay) {
        abilities[k] = Math.round(genMainAbility(rng) * CONFIG.twoWay.subRatio);
      } else {
        const S = CONFIG.subAbility;
        abilities[k] = Math.round(mainAvg * rng.float(S.coefMin, S.coefMax) + rng.normal(0, S.sd));
      }
    }
    if (reincarnation) {
      const rt = CONFIG.reincarnationTypes[reincarnation];
      for (const k of sideKeys(sideOf(rt.position))) abilities[k] += (rt.allBonus || 0) + (rt.bonus[k] || 0);
    }
    for (const k of ALL_KEYS) abilities[k] = clamp(abilities[k], CONFIG.subAbility.min, 100);

    const name = generateName(rng, opts.takenSurnames);
    return {
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
      policy: opts.policy || 'balance',
      enrolledYear: opts.year,
      history: [],      // 出来事のメモ { y, g, ev, res, d }
      snapshots: [],    // 年ごとの能力 { y, g, a }
      record: { games: 0, wins: 0, titles: [] },
      hidden: { clutch: 0 }, // 内部の隠れ数値(後のフェーズで使う)
      retired: false,
    };
  }

  // 能力の低い助っ人を作る
  function createHelper(rng, opts) {
    const H = CONFIG.helper;
    const p = createPlayer(rng, Object.assign({}, opts, {
      forceTwoWay: false,
      abilityOverride: (r) => clamp(Math.round(r.normal(H.mean, H.sd)), H.min, H.max),
    }));
    // 助っ人に隠れた才能は持たせない
    p.talent = 'normal';
    p.geniusBust = false;
    p.reincarnation = null;
    p.helper = true;
    p.subRevealed = true;
    return p;
  }

  // ---------- 成長 ----------
  function isBloomingGenius(p) { return p.talent === 'genius' && !p.geniusBust; }

  // 合宿の結果(大きく伸びる / 少し伸びる / 変わらない)を抽選
  function drawGrowthOutcome(rng, p) {
    const rates = CONFIG.camp.outcomeRates[isBloomingGenius(p) ? 'genius' : 'normal'];
    return rng.weighted(rates);
  }

  // 現在値に応じた伸びの効率
  function growthEfficiency(cur) {
    const E = CONFIG.camp.efficiency;
    const S = CONFIG.camp.softCap;
    if (cur >= 100) return 0;
    let eff = clamp(1 + ((cur - E.pivot) / 100) * E.slope, E.min, E.max);
    if (cur >= S.start) eff *= S.mult;
    return eff;
  }

  // 育成方針から、能力ごとの伸びやすさの重みを作る
  function policyWeights(side, policyKey) {
    const C = CONFIG.camp;
    const pol = POLICIES[side].find((x) => x.key === policyKey) || { focus: null };
    const w = {};
    for (const key of sideKeys(side)) {
      if (!pol.focus) w[key] = C.balanceWeight;
      else w[key] = key === pol.focus ? C.focusWeight : C.otherWeight;
    }
    return w;
  }

  // pts 点を weights に従って振り分け、delta に加算する
  function distributePoints(rng, p, weights, pts, delta) {
    pts = Math.floor(pts) + (rng.chance(pts - Math.floor(pts)) ? 1 : 0);
    const acc = {};
    for (const key of Object.keys(weights)) acc[key] = 0;
    for (let i = 0; i < pts; i++) {
      const key = rng.weighted(weights);
      acc[key] += growthEfficiency(p.abilities[key] + Math.floor(acc[key]));
    }
    for (const key of Object.keys(acc)) {
      let gain = Math.floor(acc[key]) + (rng.chance(acc[key] - Math.floor(acc[key])) ? 1 : 0);
      gain = Math.min(gain, 100 - p.abilities[key]);
      if (gain > 0) {
        p.abilities[key] += gain;
        delta[key] = (delta[key] || 0) + gain;
      }
    }
  }

  // 成長を適用し、能力の増分 { key: +n } を返す(合宿では本職側だけが伸びる)
  function applyGrowth(rng, p, outcome) {
    const C = CONFIG.camp;
    const range = C.points[outcome];
    let pts = rng.int(range[0], range[1]);
    if (isBloomingGenius(p)) pts *= C.geniusPointMult;
    const delta = {};
    const twoWayPolicy = POLICIES.twoWay.find((x) => x.key === p.policy);
    if (p.twoWay && twoWayPolicy) {
      if (twoWayPolicy.side) {
        distributePoints(rng, p, policyWeights(twoWayPolicy.side, 'balance'), pts, delta);
      } else {
        // 両方:伸びを分け合う
        distributePoints(rng, p, policyWeights('pitch', 'balance'), pts * CONFIG.twoWay.bothShare, delta);
        distributePoints(rng, p, policyWeights('bat', 'balance'), pts * CONFIG.twoWay.bothShare, delta);
      }
    } else {
      if (p.policy === 'balance') pts *= C.balancePointMult;
      distributePoints(rng, p, policyWeights(mainSide(p), p.policy), pts, delta);
    }
    return delta;
  }

  // 成長の1イベント(抽選→適用→履歴)をまとめて行う
  function growthEvent(rng, p, year, label) {
    const outcome = drawGrowthOutcome(rng, p);
    const delta = applyGrowth(rng, p, outcome);
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
  // 区分ごとの適性(能力の重み付き平均。全選手同じ式)
  function aptitude(p, pos) {
    const w = CONFIG.aptitudeWeights[pos];
    let s = 0;
    let t = 0;
    for (const k of Object.keys(w)) { s += p.abilities[k] * w[k]; t += w[k]; }
    return round1(s / t);
  }
  // 出場時の実効適性(転向直後の減点と、適性が低い区分での減点を引く)
  function effectiveAptitude(p, pos) {
    const apt = aptitude(p, pos);
    let v = apt;
    if (p.convert && p.convert.pos === pos) v -= p.convert.penalty;
    const L = CONFIG.lowAptitude;
    if (apt < L.threshold) v -= (L.threshold - apt) * L.rate;
    return round1(Math.max(0, v));
  }
  // 打撃力
  function batting(p) {
    const w = CONFIG.teamStrength.batWeights;
    let s = 0;
    let t = 0;
    for (const k of Object.keys(w)) { s += p.abilities[k] * w[k]; t += w[k]; }
    return round1(s / t);
  }

  // ---------- 記録 ----------
  function addHistory(p, year, ev, res, delta) {
    p.history.push({ y: year, g: p.grade, ev: ev, res: res || '', d: delta || null });
  }
  function takeSnapshot(p, year) {
    p.snapshots.push({ y: year, g: p.grade, a: Object.assign({}, p.abilities) });
  }
  function formatDelta(delta) {
    if (!delta) return '';
    return Object.keys(delta).map((k) => ABILITY_LABEL[k] + '+' + delta[k]).join(' ');
  }

  // 卒業・引退時の進路を決める
  function decideCareer(rng, p) {
    const C = CONFIG.career;
    let ov = overall(p);
    let mx = maxAbility(p.abilities, sideKeys(mainSide(p)));
    if (p.twoWay) {
      ov = Math.max(avgOf(p.abilities, PITCH_KEYS), avgOf(p.abilities, BAT_KEYS)) + CONFIG.twoWay.careerBonus;
      mx = maxAbility(p.abilities, ALL_KEYS);
    }
    const score = ov * C.overallWeight + mx * C.maxWeight + rng.normal(0, C.noiseSd);
    for (const path of C.paths) if (score >= path.min) return path.label;
    return C.paths[C.paths.length - 1].label;
  }

  // 名鑑に残す記録を作る
  function makeAlumniRecord(p, extra) {
    return Object.assign({
      id: p.id,
      name: p.name,
      position: p.position,
      originalPosition: p.originalPosition,
      talent: p.talent,
      geniusBust: p.geniusBust,
      reincarnation: p.reincarnation,
      twoWay: p.twoWay,
      helper: !!p.helper,
      subRevealed: isSubKnown(p),
      policy: p.policy,
      policyLabel: policyLabel(p),
      mainKeys: p.twoWay ? ALL_KEYS.slice() : sideKeys(mainSide(p)).slice(),
      initialAbilities: Object.assign({}, p.initialAbilities),
      finalAbilities: Object.assign({}, p.abilities),
      overall: overall(p),
      history: p.history.slice(),
      snapshots: p.snapshots.slice(),
      record: JSON.parse(JSON.stringify(p.record)),
      enrolledYear: p.enrolledYear,
      origin: p.origin || 'recruit',
    }, extra || {});
  }

  // ---------- スタメン編成・チームの強さ ----------
  // 捕手 → 投手 → 内野 → 外野 の順に、適性の高い順で割り当てる。
  //   投手の枠:判明した二刀流がいれば優先(設定で切替)。次に本職の投手。1人もいなければ野手から。
  //   野手の枠:投手以外から。足りなければ控えの投手から。
  function buildLineup(players) {
    const avail = players.filter((p) => !p.retired && !p.excluded);
    const used = new Set();
    const slots = [];
    for (const pos of CONFIG.lineupOrder) {
      for (let i = 0; i < CONFIG.lineup[pos]; i++) {
        const cands = avail.filter((p) => !used.has(p.id));
        let pool;
        if (pos === 'P') {
          const primary = cands.filter((p) => p.position === 'P');
          const twoWays = CONFIG.twoWay.alwaysStartAsPitcher ? primary.filter(isTwoWayKnown) : [];
          pool = twoWays.length ? twoWays : primary.length ? primary : cands;
        } else {
          const nonP = cands.filter((p) => p.position !== 'P');
          pool = nonP.length ? nonP : cands;
        }
        const score = (p) => effectiveAptitude(p, pos) + (p.position === pos ? CONFIG.primaryBonus : 0);
        pool.sort((a, b) => score(b) - score(a) || a.id - b.id);
        const pl = pool[0] || null;
        if (pl) used.add(pl.id);
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

  // 編成されたメンバーから強さを計算する(この関数1つで計算する)
  //   opts: { gameNo, close } … 連戦・接戦でのスタミナ補正
  function evaluateLineup(slots, opts) {
    const TS = CONFIG.teamStrength;
    opts = opts || {};
    let pitch = TS.missingValue;
    let pitcherBat = TS.missingValue;
    let fatigue = 0;
    const fielderVals = [];
    for (const s of slots) {
      if (s.pos === 'P') {
        if (s.player) {
          pitch = s.apt;
          pitcherBat = batting(s.player);
          const ST = CONFIG.stamina;
          const lack = Math.max(0, ST.threshold - s.player.abilities.stamina);
          fatigue = lack * (ST.perGame * Math.max(0, (opts.gameNo || 1) - 1) + (opts.close ? ST.close : 0));
        }
      } else {
        fielderVals.push(s.player ? batting(s.player) * TS.fielderBat + s.apt * TS.fielderDef : TS.missingValue);
      }
    }
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
    };
  }

  function calcTeamStrength(players, opts) {
    return evaluateLineup(buildLineup(players), opts).strength;
  }

  // 強さの差から勝率を出し、勝敗とスコアを乱数で決める
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
    avgOf: avgOf,
    sideOf: sideOf,
    sideKeys: sideKeys,
    mainSide: mainSide,
    isTwoWayKnown: isTwoWayKnown,
    isSubKnown: isSubKnown,
    visibleKeys: visibleKeys,
    subKeysOf: subKeysOf,
    overall: overall,
    maxAbility: maxAbility,
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
    applyGrowth: applyGrowth,
    growthEvent: growthEvent,
    subRoleGrowth: subRoleGrowth,
    aptitude: aptitude,
    effectiveAptitude: effectiveAptitude,
    batting: batting,
    addHistory: addHistory,
    takeSnapshot: takeSnapshot,
    formatDelta: formatDelta,
    decideCareer: decideCareer,
    makeAlumniRecord: makeAlumniRecord,
    buildLineup: buildLineup,
    evaluateLineup: evaluateLineup,
    calcTeamStrength: calcTeamStrength,
    winProbability: winProbability,
    playMatch: playMatch,
  };

  // ===========================================================
  // 高校版(HighSchool)
  // ===========================================================

  // 1年のカレンダー(この順で進む)
  const STAGES = [
    { key: 'enrollment', label: '4月 入学' },
    { key: 'springKoshien', label: '春 甲子園' },
    { key: 'summerCamp', label: '夏 合宿' },
    { key: 'summerTournament', label: '夏 地区大会' },
    { key: 'autumnTournament', label: '秋 地区大会' },
    { key: 'winterCamp', label: '冬 合宿' },
    { key: 'yearEnd', label: '年度末 卒業' },
  ];

  function formatYear(y) { return y >= 1 ? y + '年目' : '就任' + (1 - y) + '年前'; }

  // 乱数状態を state に保存しながら処理を実行する
  function withRng(state, fn) {
    const rng = new Rng(state.rngState);
    try {
      return fn(rng);
    } finally {
      state.rngState = rng.s;
    }
  }

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

  function pushLog(state, text) {
    state.log.push({ y: state.year, t: text });
    if (state.log.length > CONFIG.logLimit) state.log.splice(0, state.log.length - CONFIG.logLimit);
  }

  function emptyStats() {
    return {
      years: 0,
      recruits: 0,
      genius: 0,
      reincarnation: 0,
      reincarnationByType: {},
      twoWay: 0,
      tournaments: {
        summer: { played: 0, champion: 0, roundsWon: 0 },
        autumn: { played: 0, champion: 0, roundsWon: 0 },
      },
      teamStrengthSum: 0,
      teamStrengthCount: 0,
      rosterByYear: [],        // { y, members, newcomers, strength }
      shortageBefore: { P01: 0, C0: 0 },   // 年度始め(コンバート前)に投手0〜1人・捕手0人だった年
      shortageAfter: { P01: 0, C0: 0 },    // コンバート後
      conversion: { attempts: 0, success: 0, fielderToPitcher: 0 },
      subReveal: { count: 0, values: [], fielderPitched: 0, pitcherFielded: 0 },
      helper: { years: 0, total: 0, _lastYear: 0 },
      pitcherSlot: { twoWay: [], normal: [] },  // 夏の大会でのエース枠の貢献(強さへの寄与)
    };
  }

  function newPlayer(state, rng, opts) {
    const p = createPlayer(rng, Object.assign({
      id: state.nextId++,
      year: state.year,
      grade: 1,
      takenSurnames: takenSurnames(state),
    }, opts));
    return p;
  }

  // 新しいゲームを作る。opts: { seed }
  function newGame(opts) {
    opts = opts || {};
    const seed = (opts.seed != null ? Number(opts.seed) : Math.floor(Math.random() * 4294967296)) >>> 0;
    const state = {
      version: CONFIG.saveVersion,
      seed: seed,
      rngState: seed,
      year: 1,
      stageIndex: 0,
      awaiting: null,        // 'enrollment' のとき、方針選択待ち
      players: [],
      pendingRecruits: [],
      newcomerInfo: null,
      alumni: [],
      nextId: 1,
      log: [],
      lastEvents: [],
      reputation: null,      // 前年夏のチームの強さ(入部人数に使う)
      stats: emptyStats(),
    };

    withRng(state, (rng) => {
      // 開始時の2年生・3年生:守備区分のバランスが取れるように人数を決める
      const positions = [];
      const IC = CONFIG.initialComposition;
      for (const pos of POSITIONS) {
        const n = rng.int(IC[pos][0], IC[pos][1]);
        for (let i = 0; i < n; i++) positions.push(pos);
      }
      // 学年を交互に割り振る(区分ごとに偏らないように)
      positions.forEach((pos, i) => {
        const grade = i % 2 === 0 ? 3 : 2;
        const p = newPlayer(state, rng, { position: pos });
        p.origin = 'initial';
        p.enrolledYear = state.year - (grade - 1);
        p.reincarnationRevealed = true;
        p.twoWayRevealed = true;
        p.policy = rng.pick(POLICIES[policySetOf(p)]).key;
        addHistory(p, p.enrolledYear, '入学', '方針:' + policyLabel(p));
        takeSnapshot(p, p.enrolledYear);
        for (let g = 1; g < grade; g++) {
          const y = p.enrolledYear + g - 1;
          growthEvent(rng, p, y, '夏合宿');
          growthEvent(rng, p, y, '冬合宿');
          takeSnapshot(p, y);
          p.grade++;
        }
        state.players.push(p);
      });
    });
    state.reputation = calcTeamStrength(state.players);
    pushLog(state, CONFIG.schoolName + 'の監督に就任した。');
    startEnrollment(state);
    return state;
  }

  // 新入生の人数を決める
  function newcomerCount(state, rng) {
    const N = CONFIG.newcomers;
    const strength = state.reputation != null ? state.reputation : calcTeamStrength(state.players);
    let n = N.base + Math.round((strength - N.strengthPivot) * N.perStrength) + rng.int(-N.noise, N.noise);
    n = clamp(n, N.min, N.max);
    const room = Math.max(0, N.rosterCap - members(state).length);
    return { count: Math.min(n, room), strength: strength, capped: n > room };
  }

  // 新入生を引く(方針選択待ちにする)
  function startEnrollment(state) {
    withRng(state, (rng) => {
      state.pendingRecruits = [];
      const info = newcomerCount(state, rng);
      state.newcomerInfo = info;
      for (let i = 0; i < info.count; i++) {
        // 本職が不足している区分だけ出現率を上げる
        const counts = countByPosition(members(state).concat(state.pendingRecruits));
        const weights = {};
        for (const pos of POSITIONS) {
          const d = CONFIG.positionDeficit[pos];
          weights[pos] = CONFIG.positionRates[pos] * (counts[pos] < d.min ? d.mult : 1);
        }
        const p = newPlayer(state, rng, { positionWeights: weights });
        p.origin = 'recruit';
        if (p.reincarnation && CONFIG.reincarnationReveal === 'enrollment') p.reincarnationRevealed = true;
        if (p.twoWay && CONFIG.twoWayReveal === 'enrollment') p.twoWayRevealed = true;
        p.policy = POLICIES[policySetOf(p)][POLICIES[policySetOf(p)].length - 1].key; // バランス / 両方
        state.pendingRecruits.push(p);
      }
    });
    state.stageIndex = 0;
    state.awaiting = 'enrollment';
  }

  // 年度始めのコンバート
  function runConversions(state, rng, lines) {
    const CV = CONFIG.conversion;
    const pool = members(state);
    const counts = countByPosition(pool);
    const tried = new Set();
    let attempts = 0;
    for (const pos of CONFIG.lineupOrder) {
      while (counts[pos] < CV.minimum[pos] && attempts < CV.maxPerYear) {
        const cands = pool.filter((p) => p.position !== pos && !p.twoWay && !tried.has(p.id)
          && counts[p.position] > CV.minimum[p.position]);
        if (!cands.length) break;
        cands.sort((a, b) => aptitude(b, pos) - aptitude(a, pos) || a.id - b.id);
        const p = cands[0];
        tried.add(p.id);
        attempts++;
        state.stats.conversion.attempts++;
        const apt = aptitude(p, pos);
        const rate = clamp(CV.successBase + (apt - 30) * CV.perAptitude, CV.successMin, CV.successMax);
        const from = p.position;
        if (rng.chance(rate)) {
          const sideChanged = sideOf(from) !== sideOf(pos);
          p.position = pos;
          p.convert = { pos: pos, penalty: CV.penaltyStart };
          if (sideChanged) {
            // 本職の側が変わる:それまでの副能力が本職側になる
            p.policy = 'balance';
            p.subRevealed = true;
          }
          counts[from]--;
          counts[pos]++;
          state.stats.conversion.success++;
          if (pos === 'P') state.stats.conversion.fielderToPitcher++;
          const msg = p.name + 'が' + POSITION_LABEL[from] + 'から' + POSITION_LABEL[pos] + 'に転向した。';
          addHistory(p, state.year, 'コンバート', POSITION_LABEL[from] + '→' + POSITION_LABEL[pos]);
          lines.push({ text: '【転向】' + msg, cls: 'special' });
          pushLog(state, msg);
        } else {
          const msg = p.name + 'の' + POSITION_LABEL[pos] + 'への転向を試したが、' + POSITION_LABEL[from] + 'に戻った。';
          addHistory(p, state.year, 'コンバート失敗', POSITION_LABEL[pos] + 'を試して' + POSITION_LABEL[from] + 'に戻る');
          lines.push({ text: '【転向失敗】' + msg, cls: 'none' });
          pushLog(state, msg);
        }
      }
    }
  }

  function recordShortage(state, key) {
    const c = countByPosition(members(state));
    if (c.P <= 1) state.stats[key].P01++;
    if (c.C === 0) state.stats[key].C0++;
  }

  // 方針を決めて入学させる。policies: { 選手id: 方針key }
  function confirmEnrollment(state, policies) {
    if (state.awaiting !== 'enrollment') throw new Error('入学の受付中ではありません');
    policies = policies || {};
    const lines = [];
    for (const p of state.pendingRecruits) {
      const key = policies[p.id];
      if (key && POLICIES[policySetOf(p)].some((x) => x.key === key)) p.policy = key;
      takeSnapshot(p, state.year);
      addHistory(p, state.year, '入学', POSITION_LABEL[p.position] + ' / 方針:' + policyLabel(p));
      state.players.push(p);
      const S = state.stats;
      S.recruits++;
      if (p.talent === 'genius') S.genius++;
      if (p.twoWay) S.twoWay++;
      if (p.reincarnation) {
        S.reincarnation++;
        S.reincarnationByType[p.reincarnation] = (S.reincarnationByType[p.reincarnation] || 0) + 1;
      }
      lines.push(p.name + '(' + POSITION_LABEL[p.position] + ')方針:' + policyLabel(p));
      if (p.reincarnation && p.reincarnationRevealed) {
        pushLog(state, '【転生】' + p.name + 'は' + reincarnationName(p.reincarnation) + 'の転生者だった!');
      }
      if (p.twoWay && p.twoWayRevealed) pushLog(state, '【二刀流】' + p.name + 'は投打両方で本職級の素質を持っている!');
    }
    const n = state.pendingRecruits.length;
    state.pendingRecruits = [];
    state.awaiting = null;
    state.stageIndex = 1;
    pushLog(state, '新入生' + n + '人が入部した。');
    lines.unshift({ text: '新入生 ' + n + '人 / 部員 ' + members(state).length + '人', cls: 'summary' });

    // 年度の始め:不足している区分があれば自動でコンバート
    recordShortage(state, 'shortageBefore');
    withRng(state, (rng) => runConversions(state, rng, lines));
    recordShortage(state, 'shortageAfter');
    state.stats.rosterByYear.push({
      y: state.year, members: members(state).length, newcomers: n,
      strength: state.newcomerInfo ? state.newcomerInfo.strength : null,
    });

    const ev = { type: 'enrollment', title: formatYear(state.year) + ' 4月 新入生が入部', lines: lines };
    state.lastEvents = [ev];
    return ev;
  }

  // ---------- 各ステージの処理 ----------
  function runCamp(state, rng, label) {
    const lines = [];
    const counts = { big: 0, small: 0, none: 0 };
    const targets = state.players.filter((p) => !p.retired);
    const reveals = [];
    for (const p of targets) {
      // 転生・二刀流の判明(設定が 'firstCamp' の場合)
      if (p.reincarnation && !p.reincarnationRevealed) {
        p.reincarnationRevealed = true;
        const msg = '【判明】' + p.name + 'は' + reincarnationName(p.reincarnation) + 'の転生者だった!';
        reveals.push({ text: msg, cls: 'special' });
        addHistory(p, state.year, '転生判明', reincarnationName(p.reincarnation));
        pushLog(state, msg);
      }
      if (p.twoWay && !p.twoWayRevealed) {
        p.twoWayRevealed = true;
        p.policy = 'both';
        const msg = '【判明】' + p.name + 'は打っても一流、二刀流の素質の持ち主だった!(方針は「両方」に)';
        reveals.push({ text: msg, cls: 'special' });
        addHistory(p, state.year, '二刀流判明', '方針:両方');
        pushLog(state, msg);
      }
      const r = growthEvent(rng, p, state.year, label);
      counts[r.outcome]++;
      const mark = r.outcome === 'big' ? '◎' : r.outcome === 'small' ? '○' : '-';
      const text = mark + ' ' + p.name + '(' + p.grade + '年・' + POSITION_SHORT[p.position] + ')'
        + OUTCOME_LABEL[r.outcome] + (Object.keys(r.delta).length ? ' ' + formatDelta(r.delta) : '');
      lines.push({ text: text, cls: r.outcome });
    }
    const summary = '大きく伸びた ' + counts.big + '人 / 少し伸びた ' + counts.small + '人 / 変わらない ' + counts.none + '人';
    pushLog(state, label + ':' + summary);
    return { type: 'camp', title: formatYear(state.year) + ' ' + label + 'の結果', lines: [{ text: summary, cls: 'summary' }].concat(reveals, lines) };
  }

  // 9人そろわなければ、助っ人を補う
  function ensureHelpers(state, rng, lines) {
    const need = Object.values(CONFIG.lineup).reduce((a, b) => a + b, 0);
    let active = activeMembers(state);
    let added = 0;
    while (active.length < need) {
      // 足りない区分を埋める(投手は野手が登板するので、捕手・内野・外野を優先)
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
      state.players.push(h);
      active = activeMembers(state);
      added++;
      const msg = '【助っ人】人数が足りず、' + h.name + 'が' + POSITION_LABEL[pos] + 'の助っ人として加わった。';
      lines.push({ text: msg, cls: 'special' });
      pushLog(state, msg);
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
  function handleSubRoles(state, rng, slots, lines) {
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
      lines.push({ text: '【判明】' + text, cls: 'special' });
      addHistory(p, state.year, '副能力判明', POSITION_LABEL[s.pos] + 'で出場');
      pushLog(state, text);
      const SR = state.stats.subReveal;
      SR.count++;
      SR.values.push(val);
      if (side === 'pitch') SR.fielderPitched++;
      else SR.pitcherFielded++;
    }
  }

  // 簡易トーナメント(勝ち抜き。フェーズ2で本格版に置き換え)
  function runSimpleTournament(state, rng, key) {
    const T = CONFIG.tournaments[key];
    const st = state.stats.tournaments[key];
    const lines = [];
    ensureHelpers(state, rng, lines);
    const slots = buildLineup(state.players);
    handleSubRoles(state, rng, slots, lines);
    const ev0 = evaluateLineup(slots);
    const myStrength = ev0.strength;
    const members_ = slots.filter((s) => s.player).map((s) => s.player);
    const usedNames = new Set();
    lines.unshift({ text: '自校の強さ ' + myStrength, cls: 'summary' });
    let wins = 0;
    let champion = true;
    st.played++;
    state.stats.teamStrengthSum += myStrength;
    state.stats.teamStrengthCount++;
    if (key === 'summer') {
      state.reputation = myStrength;
      const ace = slots.find((s) => s.pos === 'P').player;
      if (ace) state.stats.pitcherSlot[ace.twoWay ? 'twoWay' : 'normal'].push(ev0.pitcherSlotValue);
    }
    const games = [];
    for (let r = 1; r <= T.rounds; r++) {
      let opp = rng.pick(CONFIG.opponentNames);
      for (let i = 0; i < 20 && usedNames.has(opp); i++) opp = rng.pick(CONFIG.opponentNames);
      usedNames.add(opp);
      const oppStrength = round1(rng.normal(T.oppBase + T.oppStep * (r - 1), T.oppSd));
      // 連戦・接戦ではスタミナの低い投手が失点しやすい
      const close = Math.abs(myStrength - oppStrength) < CONFIG.stamina.closeRange;
      const evr = evaluateLineup(slots, { gameNo: r, close: close });
      const res = playMatch(rng, evr.strength, oppStrength);
      const roundName = r === T.rounds ? '決勝' : r + '回戦';
      games.push({
        text: roundName + ' vs ' + opp + '高校(強さ ' + oppStrength + ')  '
          + res.my + '対' + res.opp + 'で' + (res.win ? '勝利' : '敗戦')
          + (evr.fatigue >= 1 ? '(投手に疲れ -' + evr.fatigue + ')' : ''),
        cls: res.win ? 'win' : 'lose',
      });
      for (const p of members_) {
        p.record.games++;
        if (res.win) p.record.wins++;
      }
      if (!res.win) { champion = false; break; }
      wins++;
    }
    st.roundsWon += wins;
    let resultText;
    if (champion) {
      st.champion++;
      resultText = T.name + ' 優勝!';
      for (const p of members_) p.record.titles.push(formatYear(state.year) + ' ' + T.name + '優勝');
    } else {
      resultText = T.name + ' ' + (wins === 0 ? '初戦敗退' : (wins + 1 === T.rounds ? '準優勝' : wins + '勝で敗退'));
    }
    lines.splice(1, 0, { text: resultText, cls: champion ? 'special' : 'summary' });
    pushLog(state, resultText);
    return {
      type: 'tournament', title: formatYear(state.year) + ' ' + T.name,
      lines: lines.concat(games), champion: champion, lineup: lineupSummary(slots),
    };
  }

  // 画面表示用のスタメン(保存できる形)
  function lineupSummary(slots) {
    return slots.map((s) => ({
      pos: s.pos,
      id: s.player ? s.player.id : null,
      name: s.player ? s.player.name : '(欠員)',
      apt: s.apt,
      primary: s.player ? s.player.position : null,
      outOfPosition: s.outOfPosition,
      helper: s.player ? !!s.player.helper : false,
      twoWay: s.player ? isTwoWayKnown(s.player) : false,
    }));
  }

  function retireThirdYears(state) {
    const retired = state.players.filter((p) => p.grade === 3 && !p.retired && !p.helper);
    for (const p of retired) {
      p.retired = true;
      addHistory(p, state.year, '引退', '夏の大会を最後に引退');
    }
    return retired;
  }

  function runYearEnd(state, rng) {
    const lines = [];
    // 副能力の側で出場した選手は、副能力が少し伸びる(転向ボーナス)
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
    }
    // 助っ人は元の部活に戻る
    const helpers = state.players.filter((p) => p.helper);
    for (const p of helpers) {
      addHistory(p, state.year, '助っ人終了', CONFIG.career.helperLabel);
      state.alumni.push(makeAlumniRecord(p, { graduatedYear: state.year, career: CONFIG.career.helperLabel }));
    }
    if (helpers.length) lines.push({ text: '助っ人' + helpers.length + '人が元の部活に戻った。', cls: 'none' });
    const graduates = state.players.filter((p) => p.grade >= 3 && !p.helper);
    for (const p of graduates) {
      const career = decideCareer(rng, p);
      takeSnapshot(p, state.year);
      addHistory(p, state.year, '卒業', career);
      state.alumni.push(makeAlumniRecord(p, { graduatedYear: state.year, career: career }));
      lines.push(p.name + '(' + POSITION_SHORT[p.position] + '・総合' + overall(p) + ')→ ' + career);
    }
    state.players = state.players.filter((p) => p.grade < 3 && !p.helper);
    for (const p of state.players) {
      takeSnapshot(p, state.year);
      p.grade++;
    }
    pushLog(state, graduates.length + '人が卒業した。');
    state.stats.years++;
    state.year++;
    lines.unshift({ text: graduates.length + '人が卒業。名鑑に記録されました。', cls: 'summary' });
    return { type: 'yearEnd', title: formatYear(state.year - 1) + ' 年度末 卒業式', lines: lines };
  }

  // 現在のステージを1つ実行する。止まる場面ならイベントを返し、そうでなければ null
  function step(state) {
    if (state.awaiting) return null;
    const stage = STAGES[state.stageIndex];
    let ev = null;
    withRng(state, (rng) => {
      switch (stage.key) {
        case 'springKoshien':
          // フェーズ2で実装(秋の成績で出場が決まる)
          break;
        case 'summerCamp':
          ev = runCamp(state, rng, '夏合宿');
          break;
        case 'summerTournament': {
          ev = runSimpleTournament(state, rng, 'summer');
          const retired = retireThirdYears(state);
          if (retired.length) ev.lines.push({ text: '3年生' + retired.length + '人が引退した。', cls: 'summary' });
          break;
        }
        case 'autumnTournament':
          ev = runSimpleTournament(state, rng, 'autumn');
          break;
        case 'winterCamp':
          ev = runCamp(state, rng, '冬合宿');
          break;
        case 'yearEnd':
          ev = runYearEnd(state, rng);
          break;
        default:
          break;
      }
    });
    if (stage.key === 'yearEnd') startEnrollment(state);
    else state.stageIndex++;
    return ev;
  }

  // 次に止まる場面まで進める
  function advanceToNextStop(state) {
    while (!state.awaiting) {
      const ev = step(state);
      if (ev) {
        state.lastEvents = [ev];
        return ev;
      }
    }
    return null;
  }

  // 次の4月(新入生の引き)まで一気に進める。途中のイベントを配列で返す
  function advanceToApril(state) {
    const events = [];
    while (!state.awaiting) {
      const ev = step(state);
      if (ev) events.push(ev);
    }
    state.lastEvents = events;
    return events;
  }

  function currentStage(state) { return STAGES[state.stageIndex]; }

  const HighSchool = {
    STAGES: STAGES,
    formatYear: formatYear,
    newGame: newGame,
    confirmEnrollment: confirmEnrollment,
    step: step,
    advanceToNextStop: advanceToNextStop,
    advanceToApril: advanceToApril,
    currentStage: currentStage,
    members: members,
    countByPosition: countByPosition,
    lineup: (state) => lineupSummary(buildLineup(state.players)),
    teamStrength: (state) => calcTeamStrength(state.players),
  };

  return { CONFIG: CONFIG, Core: Core, HighSchool: HighSchool };
});
