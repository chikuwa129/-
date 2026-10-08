// =============================================================
// hero.js : 新入部員モード(新入部員になって、3年間を追う)
//   前半:進行と判定(DOM 非依存。node から require できる。tests/hero.test.js と tools/hero-sim.js が使う)
//   後半:画面(ブラウザで hero.html / play-hero.html から mountUI() を呼ぶ)
//   既存の成長・試合・編成・コンバート・前史・世代の基準は logic.js を共有する。
//   このモード専用のルールは state.hero があるときだけ有効(育成監督モードでは常に無効)。
// =============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./logic.js'), require('./story.js'));
  else root.Hero = factory(root.Logic, root.STORY);
})(typeof self !== 'undefined' ? self : this, function (Logic, STORY) {
  'use strict';
  const { CONFIG, Core, HighSchool, Generation } = Logic;
  const HM = () => CONFIG.heroMode;
  const POS_LABEL = Core.POSITION_LABEL;
  const AXIS_LABEL = { P: '投手枠', C: '捕手枠', IF: '内野枠', OF: '外野枠' };

  // ---------- 作成のタイプ ----------
  const PITCH_TYPES = {
    gouwan: { label: '剛腕', strong: ['velocity'] },
    gikou: { label: '技巧', strong: ['control', 'breaking'] },
    jikyuu: { label: '持久', strong: ['stamina', 'control'] },
  };
  const BAT_TYPES = {
    kouda: { label: '巧打', strong: ['contact'], pos: 'IF' },
    kyouda: { label: '強打', strong: ['power'], pos: 'OF' },
    shunsoku: { label: '俊足', strong: ['speed'], pos: 'OF' },
    shubi: { label: '守備', strong: ['defense', 'arm'], pos: null },     // 能力から捕手・内野・外野のいずれか
    kyouken: { label: '強肩', strong: ['arm'], pos: null },
  };
  const LEVELS = { low: '控えめ', mid: '普通', high: '高め' };
  // 引きの選手のタイプ(いちばん高い能力から決める。前歴の一言用)
  const KEY_TYPE = { velocity: 'gouwan', control: 'gikou', breaking: 'gikou', stamina: 'jikyuu', contact: 'kouda', power: 'kyouda', speed: 'shunsoku', defense: 'shubi', arm: 'kyouken' };

  // ---------- このモード専用の乱数 ----------
  function hrng(st, fn) {
    const r = new Core.Rng(st.hero.rng);
    try { return fn(r); } finally { st.hero.rng = r.s; }
  }
  const serialOf = (st) => HighSchool.monthSerial(st.year, st.month);
  const byId = (st, id) => (id == null ? null : st.players.find((p) => p.id === id) || st.pendingRecruits.find((p) => p.id === id) || null);
  const heroOf = (st) => byId(st, st.hero.id);
  const rivalOf = (st) => byId(st, st.hero.rivalId);
  const twoWayKnown = (p) => !!p && Core.isTwoWayKnown(p);
  const pitchR = (p) => Core.ratingOfKeys(p.abilities, Core.PITCH_KEYS);
  const batR = (p) => Core.ratingOfKeys(p.abilities, Core.BAT_KEYS);

  // ---------- 新しいゲーム(前史を経て、1年目4月の新入部員の一覧) ----------
  function newHeroGame(seed) {
    const st = HighSchool.newGame({ seed: seed });
    st.hero = {
      v: HM().saveVersion,
      phase: 'select',              // select → (create → rival) → start → play → graduate
      rng: HighSchool.hashSeed(st.seed, HM().seedSalt),
      rerollsLeft: HM().rerollMax,
      id: null, created: false, choice: null, draftName: null,
      rivalId: null, rivalMode: null, mainAxis: null, rivalSide: null,
      axes: {}, axisList: [],
      setbacks: 0, setbackStories: 0, rebound: null, boostsUsed: 0, reboundStories: 0,
      converts: 0, convert: null, settleCount: 0,
      switches: {}, switchCount: 0,
      benchStreak: 0, startStreak: 0, everStarted: false, settledTold: false, prevSlot: null, lostAll: false,
      ms: { hit: false, hr: false, win: false, complete: false, capped: false },
      rank: null, rankSwaps: 0,
      bothStartYear: null, rivalTwoWayYear: null, twoWayBothTold: {},
      stories: [], recent: [], stopsByYear: {},
      starterMonths: 0, slotMonths: { P: 0, bat: 0, bench: 0 }, contestEver: {},
      bestGame: null, retiredTold: false, rivalMovedTold: false,
      practiceApps: 0, graduation: null,
    };
    return st;
  }

  // 引き直し:新入生の一覧を作り直す(このモード専用の乱数。人数と評判による質は同じ)
  function reroll(st) {
    const H = st.hero;
    if (H.phase !== 'select' || H.rerollsLeft <= 0) return false;
    const n = st.pendingRecruits.length;
    st.pendingRecruits = [];
    const q = HighSchool.recruitQuality(st.newcomerInfo ? st.newcomerInfo.x : 0);
    hrng(st, (r) => HighSchool.drawRecruitBatch(st, r, n, q));
    H.rerollsLeft--;
    return true;
  }

  // ---------- 作成 ----------
  // 選べない組み合わせを理由つきで返す(なければ null)
  function invalidChoice(c) {
    if (!c) return '内容がありません';
    if (c.talent === 'reincarnation') return '転生は、作成では選べません(引きでしか出ません)';
    if (['pitcher', 'fielder', 'twoWay'].indexOf(c.pos) < 0) return 'ポジションを選んでください';
    if (!LEVELS[c.level]) return 'レベル感を選んでください';
    if (['normal', 'genius'].indexOf(c.talent) < 0) return '素質を選んでください';
    if (c.pos === 'pitcher' && !PITCH_TYPES[c.type]) return 'タイプを選んでください';
    if (c.pos === 'fielder' && !BAT_TYPES[c.type]) return 'タイプを選んでください';
    if (c.pos === 'twoWay' && (!PITCH_TYPES[c.pitchType] || !BAT_TYPES[c.batType])) return '投手側と野手側のタイプを選んでください';
    if (c.pos === 'twoWay' && c.talent === 'genius') return '二刀流は、天才を選べません';
    if (c.pos === 'twoWay' && c.level === 'high') return '二刀流は、高めを選べません';
    if (c.talent === 'genius' && c.level === 'high') return '天才は、高めを選べません';
    return null;
  }
  function ratingRange(c) {
    const C = HM().create;
    return c.pos === 'twoWay' ? C.twoWayLevels[c.level] : C.levels[c.level];
  }
  // 1つの側の能力を作る:得意項目は平均 + typeBias(他の項目が下限を割らない範囲)、残りで総合値を合わせる
  function fillTyped(r, abil, keys, strong, R) {
    const C = HM().create;
    const n = keys.length;
    const avg = R / CONFIG.ratingMultiplier;
    const k = strong.length;
    const maxBias = Math.max(0, (avg - C.itemMin - 2) * (n - k) / k);
    let used = 0;
    for (const key of strong) {
      const b = Math.min(r.float(C.typeBias[0], C.typeBias[1]), maxBias);
      abil[key] = Core.round1(avg + b);
      used += abil[key];
    }
    const others = keys.filter((x) => strong.indexOf(x) < 0);
    const rest = avg * n - used;
    const vals = others.map(() => rest / others.length + r.normal(0, 2));
    const shift = (rest - vals.reduce((a, b) => a + b, 0)) / others.length;
    others.forEach((key, i) => { abil[key] = Core.round1(Math.max(C.itemMin, vals[i] + shift)); });
    // 丸めと下限で生じたずれを、得意でない最大の項目で吸収する(総合値を範囲に収めるため)
    const diff = avg * n - keys.reduce((a, x) => a + abil[x], 0);
    const big = others.slice().sort((a, b) => abil[b] - abil[a])[0];
    if (big) abil[big] = Core.round1(Math.max(C.itemMin, abil[big] + diff));
  }
  function bestFieldPos(p) {
    let best = 'IF';
    for (const pos of ['IF', 'OF', 'C']) if (Core.aptitude(p, pos) > Core.aptitude(p, best)) best = pos;
    return best;
  }
  // 名前(作成画面の「名前を引き直す」)
  function drawName(st) {
    const taken = new Set(st.players.map((p) => p.surname).concat(st.pendingRecruits.map((p) => p.surname)));
    st.hero.draftName = hrng(st, (r) => Core.generateName(r, taken));
    return st.hero.draftName;
  }
  // 主人公の選手を作る(このモード専用の乱数。state には加えない)
  function makeHeroPlayer(st, c) {
    const range = ratingRange(c);
    const H = st.hero;
    return hrng(st, (r) => {
      const isTW = c.pos === 'twoWay';
      const genius = c.talent === 'genius';
      const pl = HighSchool.newPlayer(st, r, {
        position: isTW || c.pos === 'pitcher' ? 'P' : 'IF', forceTwoWay: isTW, noReincarnation: true,
        forceTalent: genius ? 'genius' : 'normal', forceBust: genius ? r.chance(CONFIG.talent.geniusBustRate) : false,
        ratingOverride: (range[0] + range[1]) / 2,
      });
      const A = pl.abilities;
      if (c.pos === 'pitcher' || isTW) {
        const t = PITCH_TYPES[isTW ? c.pitchType : c.type];
        fillTyped(r, A, Core.PITCH_KEYS, t.strong, r.float(range[0], range[1]));
      }
      if (c.pos === 'fielder' || isTW) {
        const t = BAT_TYPES[isTW ? c.batType : c.type];
        fillTyped(r, A, Core.BAT_KEYS, t.strong, r.float(range[0], range[1]));
      }
      if (c.pos === 'fielder') {
        const t = BAT_TYPES[c.type];
        // 投手系は、通常の野手と同じく低い副能力のまま(createPlayer の値)
        pl.position = t.pos || bestFieldPos(pl);
        pl.originalPosition = pl.position;
      }
      if (isTW) {
        const t = BAT_TYPES[c.batType];
        pl.batPos = t.pos || bestFieldPos(pl);
        pl.twoWayRevealed = true;    // 自分で選んだ二刀流は、最初から判明
        pl.policy = 'both';
      }
      if (genius) pl.heroGrowthRatio = HM().create.geniusGrowthRatio;
      pl.initialAbilities = Object.assign({}, A);
      const nm = H.draftName || Core.generateName(r, new Set(st.players.map((q) => q.surname)));
      pl.surname = nm.surname; pl.given = nm.given; pl.name = nm.surname + ' ' + nm.given;
      pl.origin = 'recruit';
      pl.heroType = isTW ? { pitch: c.pitchType, bat: c.batType } : { [c.pos === 'pitcher' ? 'pitch' : 'bat']: c.type };
      Core.computeLimitCaps(pl);
      return pl;
    });
  }
  // 主人公を作る(能力・守備区分・隠れた値は、ここで抽選)。作れなかったら理由の文字列を返す
  function createHero(st, c) {
    const H = st.hero;
    if (H.phase !== 'select' && H.phase !== 'create') return '今は作れません';
    const bad = invalidChoice(c);
    if (bad) return bad;
    const p = makeHeroPlayer(st, c);
    // 部員の総数の上限を超えるなら、主人公以外の新入生で総合値が最も低い選手を1人減らす
    const cap = CONFIG.newcomers.rosterCap;
    st.pendingRecruits.push(p);
    if (HighSchool.members(st).length + st.pendingRecruits.length > cap) {
      const others = st.pendingRecruits.filter((q) => q !== p).sort((a, b) => Core.rating(a) - Core.rating(b) || b.id - a.id);
      if (others.length) st.pendingRecruits.splice(st.pendingRecruits.indexOf(others[0]), 1);
    }
    H.id = p.id;
    H.created = true;
    H.choice = Object.assign({}, c);
    enroll(st);
    H.phase = 'rival';
    return null;
  }
  // 一覧から選ぶ
  function pickHero(st, id) {
    const H = st.hero;
    if (H.phase !== 'select' || !st.pendingRecruits.some((p) => p.id === id)) return false;
    H.id = id;
    H.created = false;
    enroll(st);
    setRival(st, 'auto');
    H.phase = 'start';
    return true;
  }
  // 入部(おまかせの方針)。主人公は注目選手として扱う(画面の★は出さない)
  function enroll(st) {
    const H = st.hero;
    H.preEnrollRng = st.rngState;      // テスト用:入部の直前のゲーム本体の乱数の状態
    HighSchool.confirmPolicies(st, HighSchool.autoPolicies(st));
    const p = heroOf(st);
    HighSchool.setWatch(st, p.id, true);
    H.initRating = Core.rating(p);
    H.initSides = Core.ratingSides(p);
    const r = Generation.getGenerationRank(p, 1, 4);
    H.initTop = r ? r.top : null;
    H.initLabel = r ? r.label : '';
    H.originText = hrng(st, (rr) => originText(st, rr, p));
    H.enrolledYear = p.enrolledYear;
  }

  // ---------- 役割と争いの軸 ----------
  function rolesOf(p) {
    if (!p) return [];
    if (twoWayKnown(p)) return ['P', Core.twoWayBatPos(p)];
    return [p.position];
  }
  function axesOf(h, r) {
    const rr = rolesOf(r);
    return rolesOf(h).filter((x) => rr.indexOf(x) >= 0);
  }
  // 軸の側の総合値(二刀流は、投手枠なら投手側、野手の枠なら野手側)
  function sideRating(p, axis) {
    if (!p) return 0;
    if (twoWayKnown(p)) return axis === 'P' ? pitchR(p) : batR(p);
    return Core.rating(p);
  }
  function sameGrade(st, h) {
    return st.players.filter((p) => p !== h && !p.helper && p.enrolledYear === h.enrolledYear);
  }
  // ライバルの自動の決め方
  function autoRival(st) {
    const h = heroOf(st);
    const mates = sameGrade(st, h);
    const best = (list, axis) => list.slice().sort((a, b) => sideRating(b, axis) - sideRating(a, axis) || a.id - b.id)[0];
    if (twoWayKnown(h)) {
      const p = mates.filter((q) => rolesOf(q).indexOf('P') >= 0);
      if (p.length) return { id: best(p, 'P').id, axis: 'P' };
      const bp = Core.twoWayBatPos(h);
      const f = mates.filter((q) => rolesOf(q).indexOf(bp) >= 0);
      if (f.length) return { id: best(f, bp).id, axis: bp };
    } else {
      const f = mates.filter((q) => rolesOf(q).indexOf(h.position) >= 0);
      if (f.length) return { id: best(f, h.position).id, axis: h.position };
    }
    const any = mates.slice().sort((a, b) => Core.rating(b) - Core.rating(a) || a.id - b.id)[0];
    return any ? { id: any.id, axis: null } : { id: null, axis: null };
  }
  // ライバルを選び直す一覧(作成した主人公だけ)。二刀流は投手側・野手側の2つ
  function rivalCandidates(st) {
    const h = heroOf(st);
    const mates = sameGrade(st, h);
    const n = HM().rival.candidateCount;
    const mk = (p, side) => ({ id: p.id, name: p.name, position: p.position, rating: Core.rating(p), sides: Core.ratingSides(p),
      twoWay: twoWayKnown(p), axes: axesOf(h, p), side: side, rank: Generation.getGenerationRank(p, 1, 4) });
    if (twoWayKnown(h)) {
      return {
        pitch: mates.slice().sort((a, b) => pitchR(b) - pitchR(a) || a.id - b.id).slice(0, n).map((p) => mk(p, 'pitch')),
        bat: mates.slice().sort((a, b) => batR(b) - batR(a) || a.id - b.id).slice(0, n).map((p) => mk(p, 'bat')),
      };
    }
    return { list: mates.slice().sort((a, b) => Core.rating(b) - Core.rating(a) || a.id - b.id).slice(0, n).map((p) => mk(p, null)) };
  }
  // choice:'auto' / 'none' / { id, side }(side は二刀流の主人公の 'pitch' / 'bat')
  function setRival(st, choice) {
    const H = st.hero;
    const h = heroOf(st);
    let id = null;
    let axis = null;
    if (choice === 'auto') { const a = autoRival(st); id = a.id; axis = a.axis; H.rivalMode = 'auto'; }
    else if (choice && choice.id != null && sameGrade(st, h).some((p) => p.id === choice.id)) {
      id = choice.id;
      const r = byId(st, id);
      const ax = axesOf(h, r);
      if (twoWayKnown(h)) axis = choice.side === 'bat' ? (ax.indexOf(Core.twoWayBatPos(h)) >= 0 ? Core.twoWayBatPos(h) : ax[0] || null) : (ax.indexOf('P') >= 0 ? 'P' : ax[0] || null);
      else axis = ax[0] || null;
      H.rivalMode = 'pick';
      H.rivalSide = choice.side || null;
    } else { H.rivalMode = 'none'; }
    H.rivalId = id;
    H.mainAxis = axis;
    const r = rivalOf(st);
    H.startDiff = r ? sideRating(h, axis || 'X') - sideRating(r, axis || 'X') : null;
    H.rivalInit = r ? { rating: Core.rating(r), side: sideRating(r, axis || 'X') } : null;
    H.rank = r ? { confirmed: lead(st), pend: null, cnt: 0 } : null;
    recalcAxes(st, true);
    return true;
  }
  function confirmRival(st, choice) {
    if (st.hero.phase !== 'rival') return false;
    setRival(st, choice);
    st.hero.phase = 'start';
    return true;
  }
  function startPlay(st) {
    if (st.hero.phase !== 'start') return false;
    st.hero.phase = 'play';
    return true;
  }
  function lead(st) {
    const h = heroOf(st);
    const r = rivalOf(st);
    if (!h || !r) return null;
    const ax = st.hero.mainAxis || 'X';
    const a = sideRating(h, ax);
    const b = sideRating(r, ax);
    return a > b ? 'hero' : b > a ? 'rival' : 'tie';
  }
  function recalcAxes(st, init) {
    const H = st.hero;
    const h = heroOf(st);
    const r = rivalOf(st);
    const list = h && r ? axesOf(h, r) : [];
    const had = (H.axisList || []).length > 0;
    H.axisList = list;
    for (const a of list) if (!H.axes[a]) H.axes[a] = { first: null, last: null, bench: 0, swaps: 0, holder: null, lastSwapStory: -99, startYear: null };
    if (H.mainAxis && list.indexOf(H.mainAxis) < 0) H.mainAxis = list[0] || null;
    if (!H.mainAxis && list.length) H.mainAxis = list[0];
    return !init && had && !list.length;   // 軸がなくなった
  }

  // ---------- 物語 ----------
  function fill(text, vars) {
    return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  }
  // 直近の数回と同じ文を避けて選ぶ(このモード専用の乱数)
  function pickText(st, r, list, vars, recentKey) {
    const H = st.hero;
    const recent = recentKey ? (H[recentKey] = H[recentKey] || []) : H.recent;   // 静かな月の文は、物語とは別に数える
    let cands = list.filter((t) => recent.indexOf(t) < 0);
    if (!cands.length) cands = list.slice();
    const t = r.pick(cands);
    recent.push(t);
    while (recent.length > HM().story.recentNoRepeat) recent.shift();
    return fill(t, vars);
  }
  function typeOf(p) {
    if (p.heroType) return p.heroType;
    const keys = Core.visibleKeys(p);
    let best = keys[0];
    for (const k of keys) if (p.abilities[k] > p.abilities[best]) best = k;
    if (twoWayKnown(p)) {
      let bp = Core.PITCH_KEYS[0], bb = Core.BAT_KEYS[0];
      for (const k of Core.PITCH_KEYS) if (p.abilities[k] > p.abilities[bp]) bp = k;
      for (const k of Core.BAT_KEYS) if (p.abilities[k] > p.abilities[bb]) bb = k;
      return { pitch: KEY_TYPE[bp], bat: KEY_TYPE[bb] };
    }
    return Core.sideOf(p.position) === 'pitch' ? { pitch: KEY_TYPE[best] } : { bat: KEY_TYPE[best] };
  }
  function originText(st, r, p) {
    const t = typeOf(p);
    const vars = { n: p.name };
    if (t.pitch && t.bat) {
      vars.pt = PITCH_TYPES[t.pitch].label + 'タイプ';
      vars.bt = BAT_TYPES[t.bat].label + 'タイプ';
      return pickText(st, r, STORY.origin.twoWay, vars);
    }
    return pickText(st, r, STORY.origin[t.pitch || t.bat], vars);
  }
  // 重要度:3以上は山場(自動進行を止める)
  //   山場:仕様の節目(初スタメン・初安打・初本塁打・初勝利・活躍選手・壁を破る・順位の逆転・入れ替わり・役割の切り替え・転向・再起)
  //   と、争いの始まり・控えが続く・スタメン落ち・成長が大きい月・転向後に慣れた・再起しなかった・投手兼打者・ライバルの位置の変化・引退
  const STOP_KINDS = { firstStart: 1, firstHit: 1, firstHR: 1, firstWin: 1, tourneyStar: 1, limitBreak: 1, rankUp: 1, rankDown: 1, stole: 1, lost: 1,
    switchToBat: 1, switchToPitch: 1, convertOk: 1, convertFail: 1, rebound: 1, retire: 1, twoWayLost: 1,
    contestStart: 1, bench3: 1, bench6: 1, dropped: 1, bigMonth: 1, settle: 1, noRebound: 1, twoWayBoth: 1, rivalMoved: 1, benchMonth: 1 };
  const BAD_KINDS = { lost: 1, bench3: 1, bench6: 1, convertFail: 1, twoWayLost: 1 };
  function addStory(st, r, out, kind, list, vars, imp) {
    const text = pickText(st, r, list, vars);
    const s = { s: serialOf(st), y: st.year, m: HighSchool.CALENDAR[st.month].month, kind: kind, text: text,
      imp: imp || (STOP_KINDS[kind] ? (kind === 'rebound' ? 4 : 3) : 2), bad: !!BAD_KINDS[kind] };
    out.push(s);
    return s;
  }

  // ---------- 挫折と再起 ----------
  // 挫折が起きた。物語を出せるなら出して、再起の期間を始める(出せないときは状態だけ更新)
  function setback(st, r, out, kind, list, vars) {
    const H = st.hero;
    H.setbacks++;
    if (H.setbackStories >= HM().setbackMax || (H.rebound && !H.rebound.done)) return false;
    H.setbackStories++;
    addStory(st, r, out, kind, list, vars);
    const h = heroOf(st);
    const rv = rivalOf(st);
    H.rebound = { start: serialOf(st), kind: kind, below: rv ? lead(st) === 'rival' : false, done: false, benched: H.prevSlotNow == null };
    return true;
  }
  function tryRebound(st, r, out, cond, vars) {
    const H = st.hero;
    if (!H.rebound || H.rebound.done) return false;
    H.rebound.done = true;
    H.rebound.result = cond;
    H.reboundStories++;
    addStory(st, r, out, 'rebound', STORY.rebound[cond], vars, 4);
    // 再起のあとの後押し:最初の合宿で「大きく伸びる」の確率を上げる(3年間で最大 maxBoosts 回)
    if (H.boostsUsed < HM().rebound.maxBoosts) {
      H.boostsUsed++;
      heroOf(st).heroCampBonus = true;
    }
    return true;
  }

  // ---------- 毎月の判定(既存の月の処理のあと) ----------
  function slotOf(slots, p) {
    if (!p) return null;
    const s = slots.find((x) => x.player && x.player.id === p.id);
    return s ? s.pos : null;
  }
  function stageOf(card, gi, g) {
    const key = Object.keys(CONFIG.tournaments).find((k) => card.title && card.title.indexOf(CONFIG.tournaments[k].name) >= 0);
    const rounds = key ? CONFIG.tournaments[key].rounds : 0;
    if (g.round === '決勝') return { key: 'final', label: '決勝', w: 3 };
    if (rounds && g.round === (rounds - 1) + '回戦') return { key: 'semi', label: '準決勝', w: 2 };
    return { key: 'early', label: gi === 0 ? '初戦' : g.round, w: 1 };
  }
  function boxScore(box, id) {
    let sc = 0;
    const b = box.batters.find((x) => x.id === id);
    if (b) sc += b.h * 2 + b.rbi * 2 + b.hr * 3;
    if (box.pitcher && box.pitcher.id === id && box.pitcher.win) sc = Math.max(sc, 3 + (box.pitcher.runs <= 2 ? 2 : box.pitcher.runs <= 4 ? 1 : 0));
    return sc;
  }
  // 争いの成立(軸ごと):その役割の候補が枠の必要人数を超えていて、主人公とライバルのちょうど1人がその枠にいる
  function contestOf(avail, axis, heroSlot, rivalSlot) {
    const cands = avail.filter((p) => rolesOf(p).indexOf(axis) >= 0).length;
    return cands > CONFIG.lineup[axis] && (heroSlot === axis) !== (rivalSlot === axis);
  }
  function afterMonth(st, mev) {
    const H = st.hero;
    const out = [];
    const h = heroOf(st);
    if (!h) return out;
    const rv = rivalOf(st);
    const vars = { n: h.name, r: rv ? rv.name : '' };
    const sv = serialOf(st);
    const year = st.year;
    const avail = st.players.filter((p) => !p.retired && !p.excluded);
    const slots = Core.buildLineup(st.players, { heroTwoWay: true });
    const hs = h.retired ? null : slotOf(slots, h);
    const rs = rv && !rv.retired ? slotOf(slots, rv) : null;
    H.prevSlotNow = hs;
    H.slot = hs;
    if (!h.retired) (H.monthLog = H.monthLog || []).push([sv, hs]);
    hrng(st, (r) => {
      // 引退
      if (h.retired) {
        if (!H.retiredTold) { H.retiredTold = true; addStory(st, r, out, 'retire', STORY.retire, vars); }
        return;
      }
      // 出場の記録
      if (hs) H.starterMonths++;
      if (twoWayKnown(h)) H.slotMonths[hs === 'P' ? 'P' : hs ? 'bat' : 'bench']++;
      // ライバルの守備位置が変わって、軸がなくなった
      if (rv && recalcAxes(st, false) && !H.rivalMovedTold) { H.rivalMovedTold = true; addStory(st, r, out, 'rivalMoved', STORY.rivalMoved, vars); }
      // スタメン
      const wasStart = H.prevSlot != null;
      if (hs) {
        H.startStreak++;
        if (!H.everStarted) { H.everStarted = true; addStory(st, r, out, 'firstStart', STORY.firstStart, vars); }
        else if (H.startStreak === 3 && !H.settledTold) { H.settledTold = true; addStory(st, r, out, 'settled', STORY.settled, vars); }
      } else H.startStreak = 0;
      // ポジション争い(軸ごと)
      let contestNow = false;
      let lostNow = null;
      for (const a of H.axisList) {
        const A = H.axes[a];
        const hin = hs === a;
        if (!contestOf(avail, a, hs, rs)) continue;
        contestNow = true;
        H.contestEver[a] = true;
        const vv = Object.assign({ pos: AXIS_LABEL[a].replace('枠', '') }, vars);
        if (A.first == null || (A.startYear !== year && A.first != null && A.last != null && sv - A.last > 12)) {
          if (A.first == null) A.first = sv;
          if (A.startYear !== year) { A.startYear = year; addStory(st, r, out, 'contestStart', STORY.contestStart, vv); }
        }
        const holder = hin ? 'hero' : 'rival';
        if (A.holder && A.holder !== holder && A.last === sv - 1) {
          A.swaps++;
          if (holder === 'hero') {
            if (sv - A.lastSwapStory >= HM().contest.swapStoryGap) { A.lastSwapStory = sv; addStory(st, r, out, 'stole', STORY.stole, vv); }
          } else if (!hs) {
            lostNow = { a: a, vv: vv };
          } else if (twoWayKnown(h)) {
            // 投手枠を奪われても、野手側の枠で出ている:役割の切り替え(挫折に数えない)
          }
        }
        A.holder = holder;
        A.last = sv;
        A.bench = hin ? 0 : A.bench + 1;
      }
      // 二刀流:役割の切り替え
      if (twoWayKnown(h) && wasStart && hs && hs !== H.prevSlot) {
        const yk = String(year);
        H.switches[yk] = H.switches[yk] || 0;
        H.switchCount++;
        if (H.switches[yk] < HM().contest.switchPerYear) {
          H.switches[yk]++;
          const vv = Object.assign({ pos: POS_LABEL[Core.twoWayBatPos(h)] }, vars);
          if (hs === 'P') addStory(st, r, out, 'switchToPitch', STORY.switchToPitch, vv);
          else addStory(st, r, out, 'switchToBat', STORY.switchToBat, vv);
        }
      }
      // 控え
      if (!hs) H.benchStreak++; else H.benchStreak = 0;
      if (lostNow) {
        if (twoWayKnown(h)) setback(st, r, out, 'twoWayLost', STORY.twoWayLost, Object.assign({}, lostNow.vv, { pos: POS_LABEL[Core.twoWayBatPos(h)] }));
        else setback(st, r, out, 'lost', STORY.lost, lostNow.vv);
      } else if (!hs && wasStart && twoWayKnown(h)) {
        setback(st, r, out, 'twoWayLost', STORY.twoWayLost, Object.assign({ pos: POS_LABEL[Core.twoWayBatPos(h)] }, vars));
      } else if (!hs && wasStart) {
        addStory(st, r, out, 'dropped', STORY.dropped, vars);
      }
      const BS = HM().contest.benchStory;
      if (!hs && (H.benchStreak === BS[0] || H.benchStreak === BS[1])) {
        const inContest = H.axisList.some((a) => H.axes[a].last != null && sv - H.axes[a].last <= 1 && H.axes[a].holder === 'rival');
        if (inContest) {
          H.lostBench = true;
          setback(st, r, out, H.benchStreak === BS[0] ? 'bench3' : 'bench6', H.benchStreak === BS[0] ? STORY.bench3 : STORY.bench6, vars);
        } else addStory(st, r, out, 'benchMonth', STORY.benchMonth, vars);
      }
      // 節目(既存の簡易成績)
      const c = h.stats.career;
      if (!H.ms.hit && c.h > 0) { H.ms.hit = true; addStory(st, r, out, 'firstHit', STORY.firstHit, vars); }
      if (!H.ms.hr && c.hr > 0) { H.ms.hr = true; addStory(st, r, out, 'firstHR', STORY.firstHR, vars); }
      if (!H.ms.win && c.w > 0) { H.ms.win = true; addStory(st, r, out, 'firstWin', STORY.firstWin, vars); }
      else if (!H.ms.complete && c.pg > 0) { H.ms.complete = true; addStory(st, r, out, 'firstComplete', STORY.firstComplete, vars); }
      // 大会での活躍(試合の中身の活躍選手)
      let best = null;
      let rivalStar = false;
      let both = false;
      let rivalBatInP = false;
      for (const card of mev.cards || []) {
        if (card.type !== 'tournament' || !card.games) continue;
        card.games.forEach((g, gi) => {
          if (!g.box) return;
          const stg = stageOf(card, gi, g);
          const sc = boxScore(g.box, h.id);
          if (sc >= CONFIG.visual.highlightMinScore && (!best || stg.w > best.stage.w || (stg.w === best.stage.w && sc > best.sc))) best = { sc: sc, stage: stg, win: g.win, title: card.title };
          if (rv && boxScore(g.box, rv.id) >= CONFIG.visual.highlightMinScore) rivalStar = true;
          const ids = g.box.batters.map((b) => b.id).concat(g.box.pitcher ? [g.box.pitcher.id] : []);
          if (rv && ids.indexOf(h.id) >= 0 && ids.indexOf(rv.id) >= 0) both = true;
          if (rv && twoWayKnown(rv) && g.box.pitcher && g.box.pitcher.id === rv.id && g.box.batters.some((b) => b.id === rv.id && b.h > 0)) rivalBatInP = true;
        });
      }
      if (best) {
        addStory(st, r, out, 'tourneyStar', STORY.tourneyStar[best.stage.key + '_' + (best.win ? 'win' : 'loss')], Object.assign({ stage: best.stage.label }, vars));
        const score = best.stage.w * 10 + (best.win ? 5 : 0) + best.sc;
        if (!H.bestGame || score > H.bestGame.score) H.bestGame = { score: score, label: best.title.replace(/^\S+ /, '') + 'の' + best.stage.label + (best.win ? '(勝利)' : '(敗戦)') };
      }
      if (rivalStar && !best) addStory(st, r, out, 'rivalStar', STORY.rivalStar, vars);
      if (both && H.bothStartYear !== year) { H.bothStartYear = year; addStory(st, r, out, 'bothStart', STORY.bothStart, vars); }
      if (rv && twoWayKnown(rv) && (rivalBatInP || rs === 'P') && H.rivalTwoWayYear !== year && (mev.cards || []).some((c2) => c2.type === 'tournament')) {
        H.rivalTwoWayYear = year;
        addStory(st, r, out, 'rivalTwoWay', STORY.rivalTwoWay, vars);
      }
      // 二刀流:投手兼打者(節目の月に1回まで:初めて投手枠に入った月と、大会の月)
      if (twoWayKnown(h) && hs === 'P') {
        const tk = (mev.cards || []).some((c2) => c2.type === 'tournament') ? year + '-' + st.month : 'first';
        if (!H.twoWayBothTold[tk] && (tk !== 'first' || !Object.keys(H.twoWayBothTold).length)) { H.twoWayBothTold[tk] = true; addStory(st, r, out, 'twoWayBoth', STORY.twoWayBoth, vars); }
      }
      // 成長
      const newHist = h.history.slice(H.histLen || 0);
      H.histLen = h.history.length;
      const broke = newHist.some((e) => e.ev === '限界突破');
      if (newHist.some((e) => /合宿/.test(e.ev) && e.res === Core.OUTCOME_LABEL.big)) addStory(st, r, out, 'campBig', STORY.campBig, vars);
      const md = HighSchool.monthDelta(h, sv);
      if (md) {
        const keys = Core.visibleKeys(h);
        const gain = Math.round(keys.reduce((a, k) => a + md.d[k], 0) / keys.length * CONFIG.ratingMultiplier);
        if (gain >= HM().story.bigMonthGain && sv - (H.lastBigMonth == null ? -99 : H.lastBigMonth) >= HM().story.bigMonthGap) H.lastBigMonth = sv, addStory(st, r, out, 'bigMonth', STORY.bigMonth, Object.assign({ k: gain }, vars));
        H.halfGain = H.halfGain || {};
        const half = (h.grade || 1) + '年' + (HighSchool.CALENDAR[st.month].month >= 4 && HighSchool.CALENDAR[st.month].month <= 9 ? '前半' : '後半');
        H.halfGain[half] = (H.halfGain[half] || 0) + gain;
      }
      if (broke) { H.breakAt = h.grade + '年' + HighSchool.CALENDAR[st.month].month + '月'; addStory(st, r, out, 'limitBreak', STORY.limitBreak, vars); }
      if (!H.ms.capped && Core.isCappedOut(h)) { H.ms.capped = true; addStory(st, r, out, 'capped', STORY.capped, vars); }
      // ライバルとの順位(2か月続けて入れ替わった状態のときだけ)
      if (rv && H.rank) {
        const now = lead(st);
        if (now !== 'tie' && now !== H.rank.confirmed) {
          if (H.rank.pend === now) H.rank.cnt++; else { H.rank.pend = now; H.rank.cnt = 1; }
          if (H.rank.cnt >= HM().rival.swapMonths) {
            H.rank.confirmed = now; H.rank.pend = null; H.rank.cnt = 0; H.rankSwaps++;
            if (now === 'hero' && H.rebound && !H.rebound.done && H.rebound.below) tryRebound(st, r, out, 'overtake', vars);
            else addStory(st, r, out, now === 'hero' ? 'rankUp' : 'rankDown', now === 'hero' ? STORY.rankUp : STORY.rankDown, vars);
          }
        } else { H.rank.pend = null; H.rank.cnt = 0; }
      }
      // 転向(投手と野手の主人公だけ)
      convertCheck(st, r, out, vars, hs, rv);
      // 再起(挫折の期間中)
      if (H.rebound && !H.rebound.done) {
        const R = H.rebound;
        if (sv > R.start) {
          if (hs && R.benched !== false && H.prevSlot == null) tryRebound(st, r, out, twoWayKnown(h) && hs === 'P' && R.kind === 'twoWayLost' ? 'pitchBack' : 'back', vars);
          else if (broke) tryRebound(st, r, out, 'breakthrough', vars);
          else if (R.below && lead(st) === 'hero') tryRebound(st, r, out, 'overtake', vars);
        }
        if (!R.done && sv - R.start >= HM().rebound.windowMonths) {
          R.done = true;
          R.result = 'none';
          addStory(st, r, out, 'noRebound', STORY.noRebound, vars);
        }
      }
      H.prevSlot = hs;
    });
    return out;
  }
  // 転向の条件(すべてを満たしたときだけ)。満たしたら発生の抽選をして、既存のコンバートの処理で転向させる
  function convertEligible(st, hs, rv) {
    const H = st.hero;
    const h = heroOf(st);
    const C = HM().convert;
    if (!h || h.twoWay || h.retired) return null;
    if (H.converts >= C.maxPerRun) return null;
    if (h.grade >= 3 && HighSchool.CALENDAR[st.month].month >= 8) return null;   // 3年生の夏の大会のあと
    if (H.benchStreak < C.benchMonths || hs) return null;
    if (!rv) return null;
    const ax = H.mainAxis || 'X';
    if (!(sideRating(h, ax) < sideRating(rv, ax))) return null;
    const cur = Core.aptitude(h, h.position);
    let best = null;
    for (const pos of Core.POSITIONS) {
      if (pos === h.position) continue;
      const apt = Core.aptitude(h, pos);
      if (apt >= cur * C.aptitudeRatio && (!best || apt > best.apt)) best = { pos: pos, apt: apt };
    }
    return best;
  }
  function convertCheck(st, r, out, vars, hs, rv) {
    const H = st.hero;
    const h = heroOf(st);
    // 転向後:「慣れてきた」
    if (H.convert && H.convert.ok && serialOf(st) - H.convert.at <= HM().convert.settleMonths && H.settleCount < HM().convert.settleStories) {
      if (Core.aptitude(h, h.position) >= H.convert.apt + HM().convert.settleAptGain * (H.settleCount + 1)) {
        H.settleCount++;
        addStory(st, r, out, 'settle', STORY.settle, Object.assign({ pos: POS_LABEL[h.position] }, vars));
      }
    }
    const best = convertEligible(st, hs, rv);
    if (!best) return;
    if (!r.chance(HM().convert.probability)) return;
    H.converts++;
    const from = h.position;
    const ok = HighSchool.tryConvert(st, r, h, best.pos, null);
    const vv = Object.assign({ pos: POS_LABEL[best.pos] }, vars);
    H.convert = { ok: ok, at: serialOf(st), from: from, to: best.pos, apt: Core.aptitude(h, best.pos) };
    if (ok) {
      H.convertedOk = true;
      if (H.rebound && !H.rebound.done) tryRebound(st, r, out, 'convert', vv);
      else addStory(st, r, out, 'convertOk', STORY.convertOk, vv);
      if (recalcAxes(st, false) && !H.rivalMovedTold) { /* 主人公の転向で争いが終わった(物語は転向の文で十分) */ }
      H.benchStreak = 0;
    } else {
      setback(st, r, out, 'convertFail', STORY.convertFail, vv);
    }
  }

  // ---------- 進行 ----------
  function heroEventStop(mev) { return (mev.cards || []).some((c) => c.type === 'tournament' || c.type === 'camp' || c.type === 'yearEnd'); }   // 大会・合宿・年度末の月
  // mode:'month'(1か月)/ 'event'(次のイベントまで)。戻り値:{ months, stories }
  function advance(st, mode) {
    const H = st.hero;
    if (H.phase !== 'play') return null;
    const months = [];
    const stories = [];
    for (let guard = 0; guard < 24; guard++) {
      if (st.awaiting) {
        if (st.policyContext === 'review') HighSchool.resolveReviewAuto(st);
        else HighSchool.confirmPolicies(st, HighSchool.autoPolicies(st));
        continue;
      }
      const mev = HighSchool.processMonth(st);
      months.push(mev);
      // 処理した月(processMonth は月を進めるので、1つ前の月で判定する)
      const out = withPrevMonth(st, () => afterMonth(st, mev));
      for (const s of out) stories.push(s);
      for (const s of out) H.stories.push(s);
      if (!heroOf(st)) { graduate(st); break; }
      if (mode === 'month') break;
      const yk = String(st.year);
      const storyStop = HM().stopOnStory && out.some((s) => s.imp >= 3) && (H.stopsByYear[yk] || 0) < HM().stopsPerYearMax;
      const h = heroOf(st);
      if (h && h.retired && !out.some((s) => s.kind === 'retire')) continue;   // 引退後は、卒業まで止まらずに進む
      if (heroEventStop(mev) || storyStop) break;
    }
    const yk = String(st.year);
    H.stopsByYear[yk] = (H.stopsByYear[yk] || 0) + 1;
    st.lastEvents = months;
    H.lastStories = stories;
    // ひとことがない月は、固定の短い文(このモードの乱数で選ぶ)
    H.lastQuiet = stories.length ? null : hrng(st, (r) => pickText(st, r, STORY.quiet, {}, 'recentQuiet'));
    return { months: months, stories: stories };
  }
  // processMonth のあとは state.month が次の月を指す。判定は処理した月で行う
  function withPrevMonth(st, fn) {
    const y = st.year;
    const m = st.month;
    if (st.month === 0) { st.year = y - 1; st.month = HighSchool.CALENDAR.length - 1; } else st.month = m - 1;
    try { return fn(); } finally { st.year = y; st.month = m; }
  }

  // ---------- 卒業 ----------
  function graduate(st) {
    const H = st.hero;
    const a = st.alumni.find((x) => x.id === H.id);
    if (!a) return;
    H.phase = 'graduate';
    const rv = st.alumni.find((x) => x.id === H.rivalId) || byId(st, H.rivalId);
    const rank = Generation.getGenerationRank({ finalAbilities: a.finalAbilities, abilities: a.finalAbilities, position: a.position, twoWay: a.twoWay, twoWayRevealed: true, rating: a.rating }, 3, 3);
    const vars = { n: a.name, r: rv ? rv.name : '' };
    const lines = hrng(st, (r) => {
      const L = [];
      const G = STORY.grad;
      L.push(pickText(st, r, G.entry, Object.assign({ k: H.initRating }, vars))
        + (H.initTop != null ? '同世代では上位' + Generation.formatTop(H.initTop) + (H.initLabel ? '(' + H.initLabel + ')' : '') + 'だった。' : '') + (H.originText || ''));
      const halves = Object.keys(H.halfGain || {});
      if (halves.length) {
        const top = halves.sort((x, y) => H.halfGain[y] - H.halfGain[x])[0];
        L.push(pickText(st, r, G.peak, Object.assign({ stage: top }, vars)));
      }
      if (H.breakAt) L.push(pickText(st, r, G.breakthrough, Object.assign({ stage: H.breakAt }, vars)));
      if (H.bestGame) L.push(pickText(st, r, G.game, Object.assign({ stage: H.bestGame.label }, vars)));
      if (rv) {
        const ax = H.mainAxis || 'X';
        const hr = gradSide(a, ax);
        const rr = gradSide(rv, ax);
        const d0 = H.startDiff;
        const d1 = hr - rr;
        const key = Math.abs(d1) <= 3 ? 'rival_tied'
          : d1 > 0 ? (d0 <= 0 ? 'rival_reversed' : d1 > d0 ? 'rival_pulled' : 'rival_kept')
          : (d0 >= 0 ? 'rival_overtaken' : -d1 < -d0 ? 'rival_shrank' : 'rival_widened');
        L.push(pickText(st, r, G[key], vars));
        if (Object.keys(H.contestEver).length) {
          const ck = H.convertedOk ? 'contest_converted' : H.switchCount > 0 ? 'contest_switched'
            : H.axes[H.mainAxis] && H.axes[H.mainAxis].holder === 'hero' ? 'contest_won' : H.lostBench ? 'contest_lost' : 'contest_fought';
          L.push(pickText(st, r, G[ck], Object.assign({ pos: AXIS_LABEL[H.mainAxis || 'P'].replace('枠', '') }, vars)));
        }
      }
      if (H.rebound && H.rebound.result && H.rebound.result !== 'none') {
        const s0 = H.rebound.start;
        const g = Math.floor(s0 / 12) - H.enrolledYear + 2;
        const m = HighSchool.CALENDAR[((s0 % 12) + 12) % 12].month;
        L.push(pickText(st, r, G.setback, Object.assign({ stage: g + '年の' + (m >= 4 && m <= 8 ? '夏' : m >= 9 && m <= 11 ? '秋' : '冬') }, vars)));
      }
      const best = bestResult(st, H.enrolledYear);
      L.push(pickText(st, r, G.result, Object.assign({ stage: best, pos: a.career }, vars)));
      return L.slice(0, 7);
    });
    H.graduation = {
      lines: lines,
      init: { rating: H.initRating, sides: H.initSides, top: H.initTop, label: H.initLabel },
      fin: { rating: a.rating, sides: a.twoWay ? { pitch: Core.ratingOfKeys(a.finalAbilities, Core.PITCH_KEYS), bat: Core.ratingOfKeys(a.finalAbilities, Core.BAT_KEYS) } : null, top: rank ? rank.top : null, label: rank ? rank.label : '' },
      career: a.career, twoWay: !!a.twoWay,
    };
  }
  function gradSide(p, axis) {
    const A = p.finalAbilities || p.abilities;
    if (p.twoWay && (p.twoWayRevealed || p.finalAbilities)) return axis === 'P' ? Core.ratingOfKeys(A, Core.PITCH_KEYS) : Core.ratingOfKeys(A, Core.BAT_KEYS);
    return p.finalAbilities ? p.rating : Core.rating(p);
  }
  function bestResult(st, y0) {
    let best = null;
    let bestRank = -1;
    const RANK = ['初戦敗退', '2回戦敗退', '3回戦敗退', 'ベスト8', 'ベスト4', '準優勝', '優勝'];
    for (let y = y0; y <= y0 + 2; y++) {
      const rec = st.yearRecords[y];
      if (!rec) continue;
      for (const k of ['summer', 'autumn']) {
        const v = rec[k];
        if (!v) continue;
        const i = RANK.findIndex((x) => v.indexOf(x) >= 0);
        const rk = i < 0 ? 0 : i;
        if (rk > bestRank) { bestRank = rk; best = CONFIG.tournaments[k].name + ' ' + v; }
      }
    }
    return best || '大会の出場';
  }

  // ---------- 保存とリセット ----------
  function keys() {
    const pre = CONFIG.storagePrefix + 'hero_v' + HM().saveVersion + '_';
    return { save: pre + 'save', ui: pre + 'ui' };
  }
  function save(storage, st) {
    try { storage.setItem(keys().save, JSON.stringify(Object.assign({}, st, { powerLog: [] }))); return true; } catch (e) { return false; }
  }
  function load(storage) {
    try {
      const s = JSON.parse(storage.getItem(keys().save));
      if (!s || !s.hero || s.hero.v !== HM().saveVersion || s.version !== CONFIG.saveVersion) return null;
      if (!Array.isArray(s.powerLog)) s.powerLog = [];
      return s;
    } catch (e) { return null; }
  }
  // このモードの保存データ(bbgacha_hero_)をすべて消す
  function wipeKeys(storage) {
    const pre = CONFIG.storagePrefix + 'hero_';
    const del = [];
    for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.indexOf(pre) === 0) del.push(k); }
    for (const k of del) storage.removeItem(k);
  }
  function startNew(storage, seed) {
    wipeKeys(storage);
    const st = newHeroGame(seed);
    save(storage, st);
    return st;
  }
  function resetSameSeed(storage, st) { return startNew(storage, st.seed); }
  function resetNewSeed(storage, seed) { return startNew(storage, seed); }
  function wipeAll(storage, seed) { wipeKeys(storage); return newHeroGame(seed); }
  function startup(storage, search) {
    if (/[?&]reset=1(&|$)/.test(search || '')) { wipeKeys(storage); const st = newHeroGame(); save(storage, st); return { state: st, reset: true }; }
    const s = load(storage);
    if (s) return { state: s, reset: false };
    wipeKeys(storage);
    const st = newHeroGame();
    save(storage, st);
    return { state: st, reset: false };
  }

  // ---------- 画面用の小さな関数 ----------
  function statusLabel(st) {
    const h = heroOf(st);
    if (!h) return '';
    if (h.retired) return '引退';
    const s = st.hero.slot;
    if (twoWayKnown(h)) return s === 'P' ? '投手兼打者' : s ? '野手として出場' : '控え';
    return s ? 'スタメン' : '控え';
  }
  function contestAxisNow(st) {
    const H = st.hero;
    const sv = serialOf(st);
    const act = H.axisList.filter((a) => H.axes[a] && H.axes[a].last != null && sv - H.axes[a].last <= 1);
    if (!act.length) return null;
    return act.indexOf(H.mainAxis) >= 0 ? H.mainAxis : act[0];
  }
  function rivalLine(st) {
    const H = st.hero;
    const rv = rivalOf(st) || (st.alumni || []).find((a) => a.id === H.rivalId);
    if (!rv) return null;
    const last = H.stories.slice().reverse().find((s) => /rival|contest|stole|lost|rank|both/.test(s.kind));
    return { rival: rv, note: last ? last.text : '', axis: contestAxisNow(st) };
  }


  // =============================================================
  // 画面(ブラウザだけ)
  // =============================================================
  function mountUI() {
    const doc = document;
    const DEV = /[?&]dev=1(&|$)/.test(window.location.search);
    const storage = (function () {
      try { const t = '__bbgacha_test__'; window.localStorage.setItem(t, '1'); window.localStorage.removeItem(t); return window.localStorage; } catch (e) {
        const m = new Map();
        return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
          key: (i) => Array.from(m.keys())[i] || null, get length() { return m.size; }, memory: true };
      }
    })();
    let st = null;
    let screen = null;       // 'create' / 'settings' / null(進行の状態に従う)
    let modal = null;        // { text, ok, action }
    let detail = false;      // 選手詳細
    let form = { pos: 'fielder', type: 'kouda', pitchType: 'gouwan', batType: 'kouda', level: 'mid', talent: 'normal' };
    let rivalPick = 'auto';
    let rivalTab = 'pitch';
    let ui = {};
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const int = (v) => Math.round(v);
    const vClass = (v) => (v > 100 ? 'v100' : v >= 80 ? 'v80' : v >= 60 ? 'v60' : v >= 40 ? 'v40' : 'v0');
    function loadUi() { try { ui = JSON.parse(storage.getItem(keys().ui)) || {}; } catch (e) { ui = {}; } if (!ui.open) ui.open = {}; }
    function saveUi() { try { storage.setItem(keys().ui, JSON.stringify(ui)); } catch (e) { /* なし */ } }
    function persist() { save(storage, st); }
    // 折りたたみ(押したときに初めて中身を描く。開閉はパネルごとに記憶)
    function renderCollapsible(key, summary, body) {
      const open = !!ui.open[key];
      return '<div class="col"><button class="colhead" data-col="' + esc(key) + '" aria-expanded="' + open + '"><span class="ar">' + (open ? '▾' : '▸') + '</span>'
        + summary + (open ? '' : '<span class="more">詳しく</span>') + '</button>' + (open ? '<div class="colbody">' + body() + '</div>' : '') + '</div>';
    }
    function abilGrid(keys, a, base) {
      const dec = !!ui.decimal;
      return '<div class="abil" style="--cols:' + keys.length + '">' + keys.map((k) => {
        const d = base ? int(a[k]) - int(base[k]) : 0;
        return '<div class="' + vClass(a[k]) + '">' + Core.ABILITY_LABEL[k] + '<b>' + (dec ? Core.round1(a[k]).toFixed(1) : int(a[k])) + '</b>'
          + (base ? '<span class="small">' + (d > 0 ? '+' + d : '±0') + '</span>' : '') + '</div>';
      }).join('') + '</div>';
    }
    function boxes(p, base) {
      if (twoWayKnown(p)) return '<div class="sublabel">投手系</div>' + abilGrid(Core.PITCH_KEYS, p.abilities, base) + '<div class="sublabel">野手系</div>' + abilGrid(Core.BAT_KEYS, p.abilities, base);
      return abilGrid(Core.sideKeys(Core.sideOf(p.position)), p.abilities, base);
    }
    const posTag = (pos) => '<span class="tag ' + pos + '">' + POS_LABEL[pos] + '</span>';
    function extraTags(p) {
      let t = '';
      if (twoWayKnown(p)) t += '<span class="tag twoway">二刀流</span>';
      if (p.reincarnation && p.reincarnationRevealed) t += '<span class="tag reinc">転生:' + esc(Core.reincarnationName(p.reincarnation)) + '</span>';
      if (p.convert) t += '<span class="tag conv">転向中</span>';
      return t;
    }
    function rankOf(p) {
      const pend = st.pendingRecruits.indexOf(p) >= 0;
      const grade = pend ? 1 : p.retired ? 3 : p.grade;
      const month = pend ? 4 : p.retired ? 3 : HighSchool.CALENDAR[st.month].month;
      return Generation.getGenerationRank(p, grade, month);
    }
    function ratingHtml(p) {
      const r = rankOf(p);
      const badge = r ? (r.label ? '<span class="rlabel' + (r.label === '規格外' ? ' r400' : r.label === '怪物級' ? ' r200' : '') + '">' + r.label + '</span>' : '')
        + '<span class="gen">同世代 上位' + Generation.formatTop(r.top) + '</span>' : '';
      if (twoWayKnown(p)) { const s = Core.ratingSides(p); return '総合値 投<span class="rt">' + s.pitch + '</span>/打<span class="rt">' + s.bat + '</span>' + badge; }
      return '総合値 <span class="rt">' + Core.rating(p) + '</span>' + badge;
    }
    function impression(p) {
      const r = Core.rating(p);
      const pool = STORY.impression.find((x) => r >= x[0])[1];
      return pool[p.id % pool.length];
    }
    function monthBand() {
      return '<div class="months">' + HighSchool.CALENDAR.map((c, i) => '<span class="' + (i < st.month ? 'done' : i === st.month ? 'now' : '') + '">' + c.month + '月</span>').join('') + '</div>';
    }
    // ---------- 入口:新入部員の一覧 ----------
    function renderSelect() {
      const H = st.hero;
      let html = '<div class="card"><h2>🌸 今年の新入部員</h2><div class="small">この中の1人になって、3年間を過ごします。名前の右の数字は総合値。</div>'
        + '<div class="btns"><button class="btn sub small" id="hReroll"' + (H.rerollsLeft > 0 ? '' : ' disabled') + '>引き直す(残り' + H.rerollsLeft + '回)</button>'
        + '<button class="btn sub small" id="hCreate">自分で作る</button></div></div>';
      html += '<div class="card">' + st.pendingRecruits.map((p) => {
        let c = '<div class="player"><span class="pname">' + esc(p.name) + '</span>' + posTag(p.position) + extraTags(p) + ' <span class="small">' + ratingHtml(p) + '</span>'
          + '<div class="impress">' + esc(impression(p)) + '</div>' + boxes(p);
        if (p.reincarnation && p.reincarnationRevealed) c += '<div class="reveal">……!? この新入生、ただ者ではない。<br>【' + esc(Core.reincarnationName(p.reincarnation)) + '】の転生者だ!</div>';
        if (p.twoWay && p.twoWayRevealed) c += '<div class="reveal">投げても打っても本職級……! <br>【二刀流】の素質を持っている!</div>';
        return c + '<div class="btns"><button class="btn small" data-pick="' + p.id + '">この選手で始める</button></div></div>';
      }).join('') + '</div><div class="small">ライバル:同じポジションの、最も強い選手(自動)</div>';
      return html;
    }
    // ---------- 自分で作る ----------
    function renderCreate() {
      const H = st.hero;
      if (!H.draftName) drawName(st);
      const f = form;
      const opt = (name, v, label, dis) => '<option value="' + v + '"' + (f[name] === v ? ' selected' : '') + (dis ? ' disabled' : '') + '>' + label + '</option>';
      const sel = (name, opts) => '<select data-form="' + name + '">' + opts + '</select>';
      const isTW = f.pos === 'twoWay';
      let html = '<div class="card"><h2>✏️ 自分で作る</h2>'
        + '<div class="row2"><span>ポジション</span>' + sel('pos', opt('pos', 'pitcher', '投手') + opt('pos', 'fielder', '野手') + opt('pos', 'twoWay', '二刀流')) + '</div>';
      if (f.pos === 'pitcher') html += '<div class="row2"><span>タイプ</span>' + sel('type', Object.keys(PITCH_TYPES).map((k) => opt('type', k, PITCH_TYPES[k].label + 'タイプ')).join('')) + '</div>';
      if (f.pos === 'fielder') html += '<div class="row2"><span>タイプ</span>' + sel('type', Object.keys(BAT_TYPES).map((k) => opt('type', k, BAT_TYPES[k].label + 'タイプ')).join('')) + '</div>';
      if (isTW) {
        html += '<div class="row2"><span>投手側</span>' + sel('pitchType', Object.keys(PITCH_TYPES).map((k) => opt('pitchType', k, PITCH_TYPES[k].label + 'タイプ')).join('')) + '</div>'
          + '<div class="row2"><span>野手側</span>' + sel('batType', Object.keys(BAT_TYPES).map((k) => opt('batType', k, BAT_TYPES[k].label + 'タイプ')).join('')) + '</div>';
      }
      const highOff = isTW || f.talent === 'genius';
      html += '<div class="row2"><span>レベル感</span>' + sel('level', opt('level', 'low', '控えめ') + opt('level', 'mid', '普通') + opt('level', 'high', '高め', highOff)) + '</div>'
        + '<div class="row2"><span>素質</span>' + sel('talent', opt('talent', 'normal', '凡人') + opt('talent', 'genius', '天才', isTW || f.level === 'high')) + '</div>';
      if (isTW) html += '<div class="small">二刀流は、天才と「高め」を選べません。</div>';
      else if (f.talent === 'genius') html += '<div class="small">天才は、「高め」を選べません。開花しないこともあります。</div>';
      else if (f.level === 'high') html += '<div class="small">「高め」は、天才を選べません。</div>';
      html += '<div class="row2"><span>名前</span><b>' + esc(H.draftName.surname + ' ' + H.draftName.given) + '</b><button class="minibtn" id="hName">名前を引き直す</button></div>';
      if (f.pos !== 'pitcher') html += '<div class="small">守備区分は、能力から自動で決まります。</div>';
      // 確定前の情報:総合値の範囲と、得意な項目の印だけ
      const bad = invalidChoice(f);
      const range = LEVELS[f.level] ? ratingRange(f) : null;
      const strong = [];
      if (f.pos === 'pitcher' && PITCH_TYPES[f.type]) strong.push.apply(strong, PITCH_TYPES[f.type].strong);
      if (f.pos === 'fielder' && BAT_TYPES[f.type]) strong.push.apply(strong, BAT_TYPES[f.type].strong);
      if (isTW && PITCH_TYPES[f.pitchType] && BAT_TYPES[f.batType]) strong.push.apply(strong, PITCH_TYPES[f.pitchType].strong.concat(BAT_TYPES[f.batType].strong));
      html += '<div class="info">' + (range ? '初期の総合値:' + range[0] + '〜' + range[1] + (isTW ? '(投手側・野手側それぞれ)' : '') : '')
        + (strong.length ? '<br>得意な項目:' + strong.map((k) => Core.ABILITY_LABEL[k] + '◎').join(' ') : '') + '</div>';
      if (bad) html += '<div class="needpol">' + esc(bad) + '</div>';
      html += '<div class="btns"><button class="btn sub small" id="hBack">一覧に戻る</button><button class="btn small" id="hMake"' + (bad ? ' disabled' : '') + '>この内容で作る</button></div></div>';
      return html;
    }
    // ---------- ライバルを選び直す ----------
    function renderRival() {
      const h = heroOf(st);
      const C = rivalCandidates(st);
      const row = (c) => {
        const val = c.id + ':' + (c.side || '');
        return '<label class="rv"><input type="radio" name="rival" value="' + val + '"' + (rivalPick === val ? ' checked' : '') + '> <b>' + esc(c.name) + '</b>' + posTag(c.position)
          + (c.twoWay ? '<span class="tag twoway">二刀流</span>' : '') + ' <span class="small">総合値 ' + (c.twoWay ? '投' + c.sides.pitch + '/打' + c.sides.bat : c.rating)
          + (c.rank && c.rank.label ? '<span class="rlabel">' + c.rank.label + '</span>' : '') + (c.rank ? '<span class="gen">同世代 上位' + Generation.formatTop(c.rank.top) + '</span>' : '') + '</span>'
          + (c.axes.length ? ' <span class="axis">' + c.axes.map((a) => AXIS_LABEL[a]).join('・') + 'で争う</span>' : '') + '</label>';
      };
      let html = '<div class="card"><h2>⚔️ ライバルを選ぶ</h2><div class="small">同学年から1人。3年間変わりません。</div>';
      if (C.pitch) {
        html += '<div class="btns"><button class="btn small ' + (rivalTab === 'pitch' ? '' : 'sub') + '" data-rtab="pitch">投手側で争う</button><button class="btn small ' + (rivalTab === 'bat' ? '' : 'sub') + '" data-rtab="bat">野手側で争う</button></div>'
          + C[rivalTab].map(row).join('');
      } else html += C.list.map(row).join('');
      html += '<label class="rv"><input type="radio" name="rival" value="auto"' + (rivalPick === 'auto' ? ' checked' : '') + '> 自動(同じポジションの、最も強い選手)</label>'
        + '<label class="rv"><input type="radio" name="rival" value="none"' + (rivalPick === 'none' ? ' checked' : '') + '> ライバルなし</label>'
        + '<div class="btns"><button class="btn" id="hRivalOk">決める</button></div></div>';
      return '<div class="card">' + heroCard(h, false) + '</div>' + html;
    }
    // ---------- 主人公のカード ----------
    function heroCard(h, withStatus) {
      return '<div class="hero"><button class="pnamebtn" data-detail="1">' + esc(h.name) + '</button>' + posTag(h.position) + extraTags(h)
        + ' <span class="small">' + (h.grade || 1) + '年</span>' + (withStatus ? ' <span class="status">' + esc(statusLabel(st)) + '</span>' : '')
        + '<div class="small">' + ratingHtml(h) + '</div>' + boxes(h) + '</div>';
    }
    function rivalSummary(rv) {
      if (!rv) return '';
      const r = rv.finalAbilities ? null : rankOf(rv);
      const rt = twoWayKnown(rv) ? '投' + Core.ratingSides(rv).pitch + '/打' + Core.ratingSides(rv).bat : (rv.finalAbilities ? rv.rating : Core.rating(rv));
      return '<b>' + esc(rv.name) + '</b>(' + POS_LABEL[rv.position] + '、総合値 ' + rt + (r ? '、同世代 上位' + Generation.formatTop(r.top) : '') + ')';
    }
    function renderStart() {
      const H = st.hero;
      const h = heroOf(st);
      const rv = rivalOf(st);
      return '<div class="card"><h2>🎒 ' + esc(h.name) + 'の3年間が始まる</h2>' + heroCard(h, false)
        + '<div class="story">' + esc(H.originText) + '</div>'
        + (rv ? '<div class="small">ライバル:' + rivalSummary(rv) + '</div>' : '<div class="small">ライバル:なし</div>')
        + '<div class="btns"><button class="btn" id="hStart">始める</button></div></div>';
    }
    // ---------- ホーム ----------
    function renderHome() {
      const H = st.hero;
      const h = heroOf(st);
      let html = monthBand();
      html += '<div class="card">' + heroCard(h, true) + '</div>';
      const ls = (H.lastStories || []).slice().sort((a, b) => b.imp - a.imp || b.s - a.s).slice(0, 2);
      html += '<div class="card"><div class="small">今月のひとこと</div>' + (ls.length ? ls.map((x) => '<div class="story">' + esc(x.text) + '</div>').join('')
        : '<div class="story quiet">' + esc(H.lastQuiet || '(静かな1か月だった)') + '</div>') + '</div>';
      const rl = rivalLine(st);
      if (rl) {
        html += '<div class="card small">ライバル:' + rivalSummary(rl.rival) + (rl.axis ? ' — 同じ' + AXIS_LABEL[rl.axis] + 'を争っている' : '')
          + (rl.note ? '<div>' + esc(rl.note) + '</div>' : '') + '</div>';
      }
      html += '<div class="btns"><button class="btn" id="hNextEvent">次のイベントまで</button><button class="btn sub" id="hNextMonth">次の月へ</button></div>';
      html += '<div class="card">' + renderCollapsible('team', 'チームの様子', lineupTable) + '</div>';
      html += '<div class="card">' + renderCollapsible('chron', '主人公の年表', chronicle) + '</div>';
      return html;
    }
    function lineupTable() {
      const slots = Core.buildLineup(st.players, { heroTwoWay: true });
      const order = Core.battingOrder(slots);
      const h = heroOf(st);
      const rows = slots.filter((s) => s.player).sort((a, b) => (order[a.player.id] || 10) - (order[b.player.id] || 10)).map((s) => {
        const p = s.player;
        return '<tr class="' + (s.outOfPosition ? 'oop' : '') + (h && p.id === h.id ? ' me' : '') + '"><td>' + (order[p.id] || '-') + '</td><td>' + Core.POSITION_SHORT[s.pos] + '</td><td>'
          + esc(p.name) + (twoWayKnown(p) ? ' <span class="tag twoway">二刀流</span>' : '') + (s.outOfPosition ? ' <span class="small">(本職:' + Core.POSITION_SHORT[p.position] + ')</span>' : '')
          + '</td><td>' + p.grade + '年</td><td class="num">' + (twoWayKnown(p) && s.pos !== 'P' ? batR(p) : twoWayKnown(p) ? pitchR(p) : Core.rating(p)) + '</td></tr>';
      }).join('');
      return '<div class="scroll"><table class="lu"><tr><th>打順</th><th>守</th><th>名前</th><th>学年</th><th>総合値</th></tr>' + rows + '</table></div><div class="small">赤字は本職外の起用。</div>';
    }
    function chronicle() {
      const H = st.hero;
      const list = H.stories.slice().reverse();
      return (list.length ? list.map((x) => '<div class="small">' + x.y + '年目' + x.m + '月:' + esc(x.text) + '</div>').join('') : '<div class="small">まだ記録がありません。</div>');
    }
    function renderDetail() {
      if (!detail) return '';
      const h = heroOf(st) || (st.alumni || []).find((a) => a.id === st.hero.id);
      if (!h) return '';
      const p = h.finalAbilities ? Object.assign({}, h, { abilities: h.finalAbilities }) : h;
      const c = (h.stats && h.stats.career) || Core.emptyStatLine();
      return '<div class="modal-bg"><div class="modal pdetail"><div><span class="pname">' + esc(h.name) + '</span>' + posTag(h.position) + extraTags(p) + '</div>'
        + '<div class="small">入学時からの変化</div>' + boxes(p, h.initialAbilities)
        + '<div class="small">成績(大会):' + c.g + '試合 打率 ' + Core.formatAverage(c) + ' ' + c.hr + '本 ' + c.rbi + '点' + (c.pg ? ' / ' + c.w + '勝' + c.l + '敗 防' + Core.formatEra(c) : '') + '</div>'
        + '<div class="small">年表</div><ul class="hist">' + h.history.map((x) => '<li>' + x.y + '年目(' + x.g + '年)' + esc(x.ev) + (x.res ? ':' + esc(x.res) : '') + '</li>').join('') + '</ul>'
        + '<div class="btns"><button class="btn sub small" id="hDetailClose">閉じる</button></div></div></div>';
    }
    // ---------- 卒業 ----------
    function renderGraduate() {
      const G = st.hero.graduation;
      const num = (x) => '<div class="bignum"><b>' + x + '</b></div>';
      const sides = (o) => (o.sides && G.twoWay ? '投' + o.sides.pitch + ' / 打' + o.sides.bat : String(o.rating));
      return '<div class="card"><h2>🎓 卒業</h2>' + G.lines.map((l) => '<div class="story">' + esc(l) + '</div>').join('')
        + '<div class="grad"><div><div class="small">入学時</div>' + num(sides(G.init)) + '<div class="small">' + (G.init.top != null ? '同世代 上位' + Generation.formatTop(G.init.top) : '同世代 上位50%より下') + '</div></div>'
        + '<div class="arrow">→</div><div><div class="small">卒業時</div>' + num(sides(G.fin)) + '<div class="small">' + (G.fin.top != null ? '同世代 上位' + Generation.formatTop(G.fin.top) : '同世代 上位50%より下') + '</div></div></div>'
        + '<div class="btns"><button class="btn sub small" data-detail="1">3年間の年表</button></div>'
        + '<div class="btns"><button class="btn" id="hAgain">もう一度引く</button><button class="btn sub" id="hSame">同じシードでやり直す</button></div></div>';
    }
    // ---------- 設定 ----------
    function renderSettings() {
      return '<div class="card"><h2>設定</h2><label class="small"><input type="checkbox" id="hDecimal"' + (ui.decimal ? ' checked' : '') + '> 能力を小数で表示</label>'
        + '<div class="btns"><button class="btn sub small" id="hResetSame">同じシードでやり直す</button></div>'
        + '<div class="btns"><button class="btn sub small" id="hResetNew">新しいシードで始める</button></div>'
        + '<div class="btns"><button class="btn danger small" id="hWipe">セーブを完全に消す</button></div>'
        + '<div class="small">「セーブを完全に消す」は、新入部員モードの保存データをすべて消します。URL の末尾に ?reset=1 を付けて開いても同じです。</div>'
        + '<div class="btns"><button class="btn small" id="hSettingsClose">戻る</button></div></div>';
    }
    function renderDev() {
      if (!DEV) return '';
      const H = st.hero;
      return '<div class="card dev small">dev:シード ' + st.seed + ' / 保存 v' + H.v + '(' + esc(keys().save) + ')/ 引き直しの残り ' + H.rerollsLeft
        + '<br>軸 ' + (H.axisList.join('・') || 'なし') + ' / 主軸 ' + (H.mainAxis || '-') + ' / 挫折 ' + H.setbacks + '(物語 ' + H.setbackStories + ')'
        + ' / 再起の期間 ' + (H.rebound ? (H.rebound.done ? '終了(' + (H.rebound.result || '') + ')' : H.rebound.start + 'から') : 'なし') + ' / 転向 ' + H.converts
        + ' / 後押し ' + H.boostsUsed + '<br>争いの状態 ' + esc(JSON.stringify(H.axes)) + '</div>';
    }
    function renderModal() {
      if (!modal) return '';
      return '<div class="modal-bg"><div class="modal"><p>' + esc(modal.text) + '</p><div class="btns"><button class="btn sub small" id="mCancel">やめる</button><button class="btn small" id="mOk">' + esc(modal.ok || 'はい') + '</button></div></div></div>';
    }
    function render() {
      const H = st.hero;
      const h = heroOf(st);
      doc.getElementById('meta').innerHTML = '<b>' + HighSchool.formatYear(st.year) + ' ' + esc(HighSchool.monthLabel(st.month)) + '</b>' + (h ? ' ・ ' + esc(h.name) + '(' + (h.grade || 1) + '年)' : '');
      let html;
      if (screen === 'settings') html = renderSettings();
      else if (H.phase === 'select') html = screen === 'create' ? renderCreate() : renderSelect();
      else if (H.phase === 'rival') html = renderRival();
      else if (H.phase === 'start') html = renderStart();
      else if (H.phase === 'graduate') html = renderGraduate();
      else html = renderHome();
      doc.getElementById('main').innerHTML = renderDev() + html + renderDetail() + renderModal();
    }
    function act(fn) { fn(); persist(); render(); }
    doc.getElementById('main').addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.form) { form[t.dataset.form] = t.value; if (form.pos === 'pitcher' && !PITCH_TYPES[form.type]) form.type = 'gouwan'; if (form.pos === 'fielder' && !BAT_TYPES[form.type]) form.type = 'kouda'; render(); return; }
      if (t.name === 'rival') { rivalPick = t.value; return; }
      if (t.id === 'hDecimal') { ui.decimal = t.checked; saveUi(); render(); }
    });
    doc.getElementById('main').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const id = b.id;
      const ds = b.dataset;
      if (ds.col) { ui.open[ds.col] = b.getAttribute('aria-expanded') !== 'true'; saveUi(); render(); return; }
      if (ds.detail) { detail = true; render(); return; }
      if (id === 'hDetailClose') { detail = false; render(); return; }
      if (ds.rtab) { rivalTab = ds.rtab; render(); return; }
      if (id === 'mCancel') { modal = null; render(); return; }
      if (id === 'mOk' && modal) { const a = modal.action; modal = null; act(a); window.scrollTo(0, 0); return; }
      if (ds.pick) {
        const pid = Number(ds.pick);
        modal = { text: 'この選手で3年間を始めますか?', ok: '始める', action: () => { pickHero(st, pid); } };
        render(); return;
      }
      if (id === 'hReroll') { act(() => reroll(st)); return; }
      if (id === 'hCreate') { screen = 'create'; render(); return; }
      if (id === 'hBack') { screen = null; render(); return; }
      if (id === 'hName') { act(() => drawName(st)); return; }
      if (id === 'hMake') {
        modal = { text: 'この内容で作りますか?(能力と守備区分は、ここで決まります。作ったあとは、一覧に戻れません)', ok: '作る',
          action: () => { const err = createHero(st, Object.assign({}, form)); if (!err) { screen = null; rivalPick = 'auto'; rivalTab = twoWayKnown(heroOf(st)) ? 'pitch' : null; } } };
        render(); return;
      }
      if (id === 'hRivalOk') {
        const v = rivalPick;
        act(() => confirmRival(st, v === 'auto' || v === 'none' ? v : { id: Number(v.split(':')[0]), side: v.split(':')[1] || null }));
        return;
      }
      if (id === 'hStart') { act(() => startPlay(st)); return; }
      if (id === 'hNextEvent') { act(() => advance(st, 'event')); window.scrollTo(0, 0); return; }
      if (id === 'hNextMonth') { act(() => advance(st, 'month')); return; }
      if (id === 'hAgain') { modal = { text: '新しいシード(' + ((st.seed + 1) >>> 0) + ')で、もう一度引きますか?', ok: '引く', action: () => { st = resetNewSeed(storage, (st.seed + 1) >>> 0); screen = null; detail = false; ui = { open: {} }; } }; render(); return; }
      if (id === 'hSame' || id === 'hResetSame') { modal = { text: '同じシード(' + st.seed + ')で、最初からやり直しますか?', ok: 'やり直す', action: () => { st = resetSameSeed(storage, st); screen = null; detail = false; ui = { open: {} }; } }; render(); return; }
      if (id === 'hResetNew') { modal = { text: '新しいシードで始めますか?', ok: '始める', action: () => { st = resetNewSeed(storage); screen = null; detail = false; ui = { open: {} }; } }; render(); return; }
      if (id === 'hWipe') { modal = { text: '新入部員モードの保存データをすべて消して、初めからにしますか?', ok: '完全に消す', action: () => { st = wipeAll(storage); screen = null; detail = false; ui = { open: {} }; } }; render(); return; }
      if (id === 'hSettingsClose') { screen = null; render(); return; }
    });
    doc.getElementById('hSettings').addEventListener('click', () => { screen = screen === 'settings' ? null : 'settings'; render(); });
    const boot = startup(storage, window.location.search);
    st = boot.state;
    if (boot.reset) { try { window.history.replaceState(null, '', window.location.pathname + (DEV ? '?dev=1' : '')); } catch (e) { /* なし */ } }
    loadUi();
    render();
  }

  const Hero = {
    PITCH_TYPES: PITCH_TYPES, BAT_TYPES: BAT_TYPES, LEVELS: LEVELS, AXIS_LABEL: AXIS_LABEL, KEY_TYPE: KEY_TYPE,
    newHeroGame: newHeroGame, reroll: reroll, invalidChoice: invalidChoice, ratingRange: ratingRange, drawName: drawName,
    createHero: createHero, pickHero: pickHero, rivalCandidates: rivalCandidates, confirmRival: confirmRival, setRival: setRival,
    startPlay: startPlay, advance: advance, afterMonth: afterMonth, rolesOf: rolesOf, axesOf: axesOf, sideRating: sideRating,
    autoRival: autoRival, makeHeroPlayer: makeHeroPlayer, contestOf: contestOf, convertEligible: convertEligible, heroOf: heroOf, rivalOf: rivalOf, statusLabel: statusLabel,
    rivalLine: rivalLine, contestAxisNow: contestAxisNow, keys: keys, save: save, load: load, wipeKeys: wipeKeys,
    startNew: startNew, resetSameSeed: resetSameSeed, resetNewSeed: resetNewSeed, wipeAll: wipeAll, startup: startup,
    pickText: pickText, fill: fill, typeOf: typeOf, setback: setback, tryRebound: tryRebound, hrng: hrng, serialOf: serialOf,
    mountUI: mountUI,
  };
  return Hero;
});
