// =============================================================
// logic.js : ゲームロジック(DOM 非依存)
//   - Core       : 乱数・選手生成・成長・記録。高校版/プロ版で共通に使う部分
//   - HighSchool : 高校版の進行(カレンダー、大会、入学、卒業)
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
  const ABILITIES = {
    pitcher: [
      { key: 'velocity', label: '球速' },
      { key: 'control', label: '制球' },
      { key: 'breaking', label: '変化球' },
      { key: 'stamina', label: 'スタミナ' },
    ],
    fielder: [
      { key: 'contact', label: 'ミート' },
      { key: 'power', label: 'パワー' },
      { key: 'speed', label: '走力' },
      { key: 'defense', label: '守備' },
    ],
  };
  const ABILITY_LABEL = {};
  for (const pos of Object.keys(ABILITIES)) for (const a of ABILITIES[pos]) ABILITY_LABEL[a.key] = a.label;

  const POSITION_LABEL = { pitcher: '投手', fielder: '野手' };

  const POLICIES = {
    pitcher: [
      { key: 'velocity', label: '球速特化', focus: 'velocity' },
      { key: 'control', label: '制球特化', focus: 'control' },
      { key: 'breaking', label: '変化球特化', focus: 'breaking' },
      { key: 'balance', label: 'バランス', focus: null },
    ],
    fielder: [
      { key: 'power', label: '長打特化', focus: 'power' },
      { key: 'contact', label: '巧打特化', focus: 'contact' },
      { key: 'speed', label: '俊足特化', focus: 'speed' },
      { key: 'defense', label: '守備特化', focus: 'defense' },
      { key: 'balance', label: 'バランス', focus: null },
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

  // ---------- 小物 ----------
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function round1(v) { return Math.round(v * 10) / 10; }
  function abilityKeys(position) { return ABILITIES[position].map((a) => a.key); }
  function policyLabel(position, key) {
    const p = POLICIES[position].find((x) => x.key === key);
    return p ? p.label : '-';
  }
  function reincarnationName(key) {
    return key ? CONFIG.reincarnationTypes[key].name : 'なし';
  }

  // 総合値(見える能力の平均)
  function overall(abilities) {
    const vals = Object.values(abilities);
    return round1(vals.reduce((s, v) => s + v, 0) / vals.length);
  }
  function maxAbility(abilities) { return Math.max.apply(null, Object.values(abilities)); }

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
  // opts: { id, year, grade, takenSurnames, position, policy }
  function createPlayer(rng, opts) {
    const T = CONFIG.talent;
    const reincarnation = rng.chance(T.reincarnationRate)
      ? rng.pick(Object.keys(CONFIG.reincarnationTypes)) : null;
    const talent = rng.chance(T.geniusRate) ? 'genius' : 'normal';
    const geniusBust = talent === 'genius' && rng.chance(T.geniusBustRate);

    let position = opts.position;
    if (reincarnation) position = CONFIG.reincarnationTypes[reincarnation].position;
    if (!position) position = rng.chance(CONFIG.pitcherRate) ? 'pitcher' : 'fielder';

    const IA = CONFIG.initialAbility;
    const abilities = {};
    for (const key of abilityKeys(position)) {
      let v = rng.normal(IA.mean, IA.sd);
      v = clamp(Math.round(v), IA.min, IA.max);
      if (reincarnation) {
        const rt = CONFIG.reincarnationTypes[reincarnation];
        v += (rt.allBonus || 0) + (rt.bonus[key] || 0);
      }
      abilities[key] = clamp(v, 0, 100);
    }

    const name = generateName(rng, opts.takenSurnames);
    const p = {
      id: opts.id,
      surname: name.surname,
      given: name.given,
      name: name.surname + ' ' + name.given,
      grade: opts.grade || 1,
      position: position,
      abilities: abilities,
      initialAbilities: Object.assign({}, abilities),
      talent: talent,
      geniusBust: geniusBust,
      reincarnation: reincarnation,
      reincarnationRevealed: false,
      policy: opts.policy || 'balance',
      enrolledYear: opts.year,
      history: [],      // 出来事のメモ { y, g, ev, res, d }
      snapshots: [],    // 年ごとの能力 { y, g, a }
      record: { games: 0, wins: 0, titles: [] },
      hidden: { clutch: 0 }, // 内部の隠れ数値(後のフェーズで使う)
      retired: false,
    };
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
  function policyWeights(position, policyKey) {
    const C = CONFIG.camp;
    const pol = POLICIES[position].find((x) => x.key === policyKey) || { focus: null };
    const w = {};
    for (const key of abilityKeys(position)) {
      if (!pol.focus) w[key] = C.balanceWeight;
      else w[key] = key === pol.focus ? C.focusWeight : C.otherWeight;
    }
    return w;
  }

  // 成長を適用し、能力の増分 { key: +n } を返す
  function applyGrowth(rng, p, outcome) {
    const C = CONFIG.camp;
    const range = C.points[outcome];
    let pts = rng.int(range[0], range[1]);
    if (isBloomingGenius(p)) pts *= C.geniusPointMult;
    if (p.policy === 'balance') pts *= C.balancePointMult;
    pts = Math.floor(pts) + (rng.chance(pts - Math.floor(pts)) ? 1 : 0);

    const weights = policyWeights(p.position, p.policy);
    const acc = {};
    for (const key of Object.keys(weights)) acc[key] = 0;
    for (let i = 0; i < pts; i++) {
      const key = rng.weighted(weights);
      acc[key] += growthEfficiency(p.abilities[key] + Math.floor(acc[key]));
    }
    const delta = {};
    for (const key of Object.keys(acc)) {
      let gain = Math.floor(acc[key]) + (rng.chance(acc[key] - Math.floor(acc[key])) ? 1 : 0);
      gain = Math.min(gain, 100 - p.abilities[key]);
      if (gain > 0) {
        p.abilities[key] += gain;
        delta[key] = gain;
      }
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

  // ---------- 記録 ----------
  function addHistory(p, year, ev, res, delta) {
    p.history.push({ y: year, g: p.grade, ev: ev, res: res || '', d: delta || null });
  }
  function takeSnapshot(p, year) {
    p.snapshots.push({ y: year, g: p.grade, a: Object.assign({}, p.abilities) });
  }
  function formatDelta(delta) {
    if (!delta) return '';
    const parts = Object.keys(delta).map((k) => ABILITY_LABEL[k] + '+' + delta[k]);
    return parts.join(' ');
  }

  // 卒業・引退時の進路を決める
  function decideCareer(rng, p) {
    const C = CONFIG.career;
    const score = overall(p.abilities) * C.overallWeight
      + maxAbility(p.abilities) * C.maxWeight
      + rng.normal(0, C.noiseSd);
    for (const path of C.paths) if (score >= path.min) return path.label;
    return C.paths[C.paths.length - 1].label;
  }

  // 名鑑に残す記録を作る
  function makeAlumniRecord(p, extra) {
    return Object.assign({
      id: p.id,
      name: p.name,
      position: p.position,
      talent: p.talent,
      geniusBust: p.geniusBust,
      reincarnation: p.reincarnation,
      policy: p.policy,
      initialAbilities: Object.assign({}, p.initialAbilities),
      finalAbilities: Object.assign({}, p.abilities),
      overall: overall(p.abilities),
      history: p.history.slice(),
      snapshots: p.snapshots.slice(),
      record: JSON.parse(JSON.stringify(p.record)),
      enrolledYear: p.enrolledYear,
      origin: p.origin || 'recruit',
    }, extra || {});
  }

  // ---------- チームの強さ・試合 ----------
  // 試合に出る主力(野手 lineupSize 人 + 投手2人)
  function getLineup(players) {
    const L = CONFIG.teamStrength;
    const active = players.filter((p) => !p.retired && !p.excluded);
    const byOverall = (a, b) => overall(b.abilities) - overall(a.abilities);
    const fielders = active.filter((p) => p.position === 'fielder').sort(byOverall).slice(0, L.lineupSize);
    const pitchers = active.filter((p) => p.position === 'pitcher').sort(byOverall).slice(0, 2);
    return { fielders: fielders, pitchers: pitchers };
  }

  // チームの強さ(この関数1つで計算する)
  function calcTeamStrength(players) {
    const L = CONFIG.teamStrength;
    const lu = getLineup(players);
    const f = lu.fielders.map((p) => overall(p.abilities));
    while (f.length < L.lineupSize) f.push(L.missingValue);
    const pi = lu.pitchers.map((p) => overall(p.abilities));
    while (pi.length < 2) pi.push(L.missingValue);
    const fAvg = f.reduce((s, v) => s + v, 0) / f.length;
    const pVal = pi[0] * L.aceShare + pi[1] * (1 - L.aceShare);
    return round1(fAvg * L.fielderWeight + pVal * L.pitcherWeight);
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
    ABILITIES: ABILITIES,
    ABILITY_LABEL: ABILITY_LABEL,
    POSITION_LABEL: POSITION_LABEL,
    POLICIES: POLICIES,
    OUTCOME_LABEL: OUTCOME_LABEL,
    TALENT_LABEL: TALENT_LABEL,
    SURNAMES: SURNAMES,
    GIVEN_NAMES: GIVEN_NAMES,
    clamp: clamp,
    overall: overall,
    maxAbility: maxAbility,
    abilityKeys: abilityKeys,
    policyLabel: policyLabel,
    reincarnationName: reincarnationName,
    generateName: generateName,
    createPlayer: createPlayer,
    drawGrowthOutcome: drawGrowthOutcome,
    growthEfficiency: growthEfficiency,
    applyGrowth: applyGrowth,
    growthEvent: growthEvent,
    addHistory: addHistory,
    takeSnapshot: takeSnapshot,
    formatDelta: formatDelta,
    decideCareer: decideCareer,
    makeAlumniRecord: makeAlumniRecord,
    getLineup: getLineup,
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

  function newPlayer(state, rng, grade, origin) {
    const p = createPlayer(rng, {
      id: state.nextId++,
      year: state.year - (grade - 1),
      grade: grade,
      takenSurnames: takenSurnames(state),
    });
    p.origin = origin;
    return p;
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
      tournaments: {
        summer: { played: 0, champion: 0, roundsWon: 0 },
        autumn: { played: 0, champion: 0, roundsWon: 0 },
      },
      teamStrengthSum: 0,
      teamStrengthCount: 0,
    };
  }

  // 新しいゲームを作る。opts: { seed }
  function newGame(opts) {
    opts = opts || {};
    const seed = (opts.seed != null ? Number(opts.seed) : Math.floor(Math.random() * 4294967296)) >>> 0;
    const state = {
      version: 1,
      seed: seed,
      rngState: seed,
      year: 1,
      stageIndex: 0,
      awaiting: null,        // 'enrollment' のとき、方針選択待ち
      players: [],
      pendingRecruits: [],
      alumni: [],
      nextId: 1,
      log: [],
      lastEvents: [],
      stats: emptyStats(),
    };

    withRng(state, (rng) => {
      // 開始時の2年生・3年生(育成方針はランダム。入学前の合宿を済ませた状態にする)
      for (const grade of [3, 2]) {
        for (let i = 0; i < CONFIG.initialPlayersPerGrade; i++) {
          const p = newPlayer(state, rng, 1, 'initial');
          p.enrolledYear = state.year - (grade - 1);
          p.policy = rng.pick(POLICIES[p.position]).key;
          p.reincarnationRevealed = true;
          addHistory(p, p.enrolledYear, '入学', '方針:' + policyLabel(p.position, p.policy));
          takeSnapshot(p, p.enrolledYear);
          for (let g = 1; g < grade; g++) {
            const y = p.enrolledYear + g - 1;
            growthEvent(rng, p, y, '夏合宿');
            growthEvent(rng, p, y, '冬合宿');
            takeSnapshot(p, y);
            p.grade++;
          }
          state.players.push(p);
        }
      }
    });
    pushLog(state, CONFIG.schoolName + 'の監督に就任した。');
    startEnrollment(state);
    return state;
  }

  // 新入生を引く(方針選択待ちにする)
  function startEnrollment(state) {
    withRng(state, (rng) => {
      state.pendingRecruits = [];
      for (let i = 0; i < CONFIG.newcomersPerYear; i++) {
        const p = newPlayer(state, rng, 1, 'recruit');
        p.policy = 'balance';
        if (p.reincarnation && CONFIG.reincarnationReveal === 'enrollment') p.reincarnationRevealed = true;
        state.pendingRecruits.push(p);
      }
    });
    state.stageIndex = 0;
    state.awaiting = 'enrollment';
  }

  // 方針を決めて入学させる。policies: { 選手id: 方針key }
  function confirmEnrollment(state, policies) {
    if (state.awaiting !== 'enrollment') throw new Error('入学の受付中ではありません');
    policies = policies || {};
    const lines = [];
    for (const p of state.pendingRecruits) {
      const key = policies[p.id];
      if (key && POLICIES[p.position].some((x) => x.key === key)) p.policy = key;
      takeSnapshot(p, state.year);
      addHistory(p, state.year, '入学', '方針:' + policyLabel(p.position, p.policy));
      state.players.push(p);
      state.stats.recruits++;
      if (p.talent === 'genius') state.stats.genius++;
      if (p.reincarnation) {
        state.stats.reincarnation++;
        state.stats.reincarnationByType[p.reincarnation] = (state.stats.reincarnationByType[p.reincarnation] || 0) + 1;
      }
      lines.push(p.name + '(' + POSITION_LABEL[p.position] + ')方針:' + policyLabel(p.position, p.policy));
      if (p.reincarnation && p.reincarnationRevealed) {
        pushLog(state, '【転生】' + p.name + 'は' + reincarnationName(p.reincarnation) + 'の転生者だった!');
      }
    }
    state.pendingRecruits = [];
    state.awaiting = null;
    state.stageIndex = 1;
    pushLog(state, '新入生' + lines.length + '人が入部した。');
    const ev = { type: 'enrollment', title: formatYear(state.year) + ' 4月 新入生が入部', lines: lines };
    state.lastEvents = [ev];
    return ev;
  }

  // ---------- 各ステージの処理 ----------
  function runCamp(state, rng, label) {
    const lines = [];
    const counts = { big: 0, small: 0, none: 0 };
    const targets = state.players.filter((p) => !p.retired);
    for (const p of targets) {
      const r = growthEvent(rng, p, state.year, label);
      counts[r.outcome]++;
      const mark = r.outcome === 'big' ? '◎' : r.outcome === 'small' ? '○' : '-';
      const text = mark + ' ' + p.name + '(' + p.grade + '年・' + POSITION_LABEL[p.position].charAt(0) + ')'
        + OUTCOME_LABEL[r.outcome] + (Object.keys(r.delta).length ? ' ' + formatDelta(r.delta) : '');
      lines.push({ text: text, cls: r.outcome });
      // 転生の型の判明(設定が 'firstCamp' の場合)
      if (p.reincarnation && !p.reincarnationRevealed) {
        p.reincarnationRevealed = true;
        const msg = '【判明】' + p.name + 'は' + reincarnationName(p.reincarnation) + 'の転生者だった!';
        lines.unshift({ text: msg, cls: 'special' });
        addHistory(p, state.year, '転生判明', reincarnationName(p.reincarnation));
        pushLog(state, msg);
      }
    }
    const summary = '大きく伸びた ' + counts.big + '人 / 少し伸びた ' + counts.small + '人 / 変わらない ' + counts.none + '人';
    lines.unshift({ text: summary, cls: 'summary' });
    pushLog(state, label + ':' + summary);
    return { type: 'camp', title: formatYear(state.year) + ' ' + label + 'の結果', lines: lines };
  }

  // フェーズ1の簡易トーナメント(勝ち抜き。フェーズ2で本格版に置き換え)
  function runSimpleTournament(state, rng, key) {
    const T = CONFIG.tournaments[key];
    const st = state.stats.tournaments[key];
    const myStrength = calcTeamStrength(state.players);
    const lineup = getLineup(state.players);
    const members = lineup.fielders.concat(lineup.pitchers);
    const usedNames = new Set();
    const lines = [{ text: '自校の強さ ' + myStrength, cls: 'summary' }];
    let wins = 0;
    let champion = true;
    st.played++;
    state.stats.teamStrengthSum += myStrength;
    state.stats.teamStrengthCount++;
    for (let r = 1; r <= T.rounds; r++) {
      let opp = rng.pick(CONFIG.opponentNames);
      for (let i = 0; i < 20 && usedNames.has(opp); i++) opp = rng.pick(CONFIG.opponentNames);
      usedNames.add(opp);
      const oppStrength = round1(rng.normal(T.oppBase + T.oppStep * (r - 1), T.oppSd));
      const res = playMatch(rng, myStrength, oppStrength);
      const roundName = r === T.rounds ? '決勝' : r + '回戦';
      lines.push({
        text: roundName + ' vs ' + opp + '高校(強さ ' + oppStrength + ')  '
          + res.my + '対' + res.opp + 'で' + (res.win ? '勝利' : '敗戦'),
        cls: res.win ? 'win' : 'lose',
      });
      for (const p of members) {
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
      for (const p of members) p.record.titles.push(formatYear(state.year) + ' ' + T.name + '優勝');
    } else {
      resultText = T.name + ' ' + (wins === 0 ? '初戦敗退' : (wins + 1 === T.rounds ? '準優勝' : wins + '勝で敗退'));
    }
    lines.splice(1, 0, { text: resultText, cls: champion ? 'special' : 'summary' });
    pushLog(state, resultText);
    return { type: 'tournament', title: formatYear(state.year) + ' ' + T.name, lines: lines, champion: champion };
  }

  function retireThirdYears(state) {
    const retired = state.players.filter((p) => p.grade === 3 && !p.retired);
    for (const p of retired) {
      p.retired = true;
      addHistory(p, state.year, '引退', '夏の大会を最後に引退');
    }
    return retired;
  }

  function runYearEnd(state, rng) {
    const lines = [];
    const graduates = state.players.filter((p) => p.grade >= 3);
    for (const p of graduates) {
      const career = decideCareer(rng, p);
      takeSnapshot(p, state.year);
      addHistory(p, state.year, '卒業', career);
      state.alumni.push(makeAlumniRecord(p, { graduatedYear: state.year, career: career }));
      lines.push(p.name + '(' + POSITION_LABEL[p.position].charAt(0) + '・総合' + overall(p.abilities) + ')→ ' + career);
    }
    state.players = state.players.filter((p) => p.grade < 3);
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
    teamStrength: (state) => calcTeamStrength(state.players),
  };

  return { CONFIG: CONFIG, Core: Core, HighSchool: HighSchool };
});
