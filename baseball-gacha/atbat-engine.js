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
        power:  { K: { m: 0.3, con: -0.3 }, S: { m: -0.15 }, GO: { m: -0.15 }, FO: { m: 0.15 }, XB: { m: 0.3, pow: 0.15 }, HR: { m: 0.45, pow: 0.2 } },
        contact: { K: { m: -0.4 }, BB: { m: -0.1 }, GO: { m: 0.1 }, S: { m: 0.2, con: 0.1 }, XB: { m: -0.3 }, HR: { m: -0.7 } },
      },
      pitch: {
        normal: {},
        fast:   { K: { m: 0.1, vel: 0.35 }, BB: { m: -0.1 }, GO: { m: -0.1 }, XB: { m: 0.15, ctl: -0.35 }, HR: { m: 0.2, ctl: -0.4 } },
        breaking: { K: { m: 0.1, brk: 0.3 }, GO: { m: 0.2 }, BB: { m: 0.15, ctl: -0.35 }, XB: { m: -0.05 }, S: { m: 0.05 } },
        outside: { XB: { m: -0.25, pow: -0.15 }, HR: { m: -0.4, pow: -0.25 }, BB: { m: 0.22, ctl: -0.25 }, S: { m: 0.08 }, K: { m: -0.05 } },
        inside: { K: { m: 0.1, con: -0.15 }, FO: { m: 0.12 }, BB: { m: 0.1, ctl: -0.3 }, XB: { m: 0.1, ctl: -0.3, pow: 0.15 }, HR: { m: 0.2, ctl: -0.4, pow: 0.25 }, S: { m: -0.1 } },
      },
    },
    // 送りバント:成功率 = clamp(base + con × z(ミート) + spd × z(走力) − def × z(守備))。成功で走者が1つ進み、打者はアウト
    bunt: { base: 0.78, con: 0.1, spd: 0.06, def: 0.08, min: 0.4, max: 0.96, hitBase: 0.04, hitSpd: 0.06, hitMax: 0.15 },
    // スクイズ:成功率 = clamp(base + con × z(ミート) − def × z(守備))。成功で三塁走者が生還し、打者はアウト(他の走者は1つ進む)
    //   失敗:三塁走者が本塁でアウト。打者は一塁へ(野選)、他の走者は進まない
    squeeze: { base: 0.68, con: 0.25, def: 0.08, min: 0.3, max: 0.93 },
    // 盗塁(一塁走者だけ):成功率 = clamp(base + spd × z(走者の走力) − arm × z(肩) − quick × z(クイック))
    steal: { base: 0.66, spd: 0.3, arm: 0.15, quick: 0.12, min: 0.15, max: 0.95 },
    // 走者の進塁(z は走者の走力、肩は守備側)
    run: {
      goAdv: 0.5,                                  // ゴロのアウト(2アウト未満):走者が、そろって1つ進む確率(内野ゴロの進塁打)
      s2home: { base: 0.6, spd: 0.3, arm: 0.2 },   // 単打:二塁走者が生還する確率(残りは三塁へ)
      s1third: { base: 0.25, spd: 0.3, arm: 0.2 }, // 単打:一塁走者が三塁まで進む確率(三塁が空いたとき。残りは二塁へ)
      x1home: { base: 0.45, spd: 0.3, arm: 0.2 },  // 長打:一塁走者が生還する確率(残りは三塁へ)
      triple: { base: 0.1, spd: 0.1 },             // 長打のうち、三塁打の割合(打者の走力)
      pMin: 0.05, pMax: 0.95,
    },
    // 得点期待値の基準の打者・投手・守備(能力はすべて中位)
    reBase: 50,
    // 終盤の接戦(inning 回以降、点差が diff 以内)は、最善の指示を「1点以上取る(取られる)確率」で選ぶ。それ以外は得点期待値
    lateClose: { inning: 8, diff: 1 },
    // 介入場面の判定(isKeyScene)のプリセット
    keyScene: {
      success: { bat: { who: 'all', minInning: 1, chance: false }, pitch: { pinch: true, maxDiff: 3, minInning: 1 } },
      manager: { bat: { who: 'focus', minInning: 7, chance: true }, pitch: { pinch: true, maxDiff: 3, minInning: 7 } },
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
    return w;
  }
  const p01 = (C, x) => clamp(x, C.run.pMin, C.run.pMax);
  function buntP(sc, C) { const Z = zs(sc), B = C.bunt; return clamp(B.base + B.con * Z.con + B.spd * Z.spd - B.def * Z.def, B.min, B.max); }
  function buntHitP(sc, C) { const B = C.bunt; return clamp(B.hitBase + B.hitSpd * z(sc.batter.speed), 0, B.hitMax); }
  function squeezeP(sc, C) { const Z = zs(sc), Q = C.squeeze; return clamp(Q.base + Q.con * Z.con - Q.def * Z.def, Q.min, Q.max); }
  function stealP(sc, C) { const S = C.steal; return clamp(S.base + S.spd * z(runnerSpd(sc, 1)) - S.arm * z(sc.arm) - S.quick * z(sc.pitcher.quick), S.min, S.max); }
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
        add(R.goAdv, outs + 1, adv, bs[2] != null ? 1 : 0);
        add(1 - R.goAdv, outs + 1, bs, 0);
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
      push(ps - ph, [{ q: 1, outs: sc.outs + 1, b: adv, runs: sc.bases[2] != null ? 1 : 0 }], 'bunt_ok');
      push(ph, [{ q: 1, outs: sc.outs, b: [sc.batter.speed, sc.bases[0], sc.bases[1]], runs: sc.bases[2] != null ? 1 : 0 }], 'bunt_hit');
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
      push(1 - ps, [{ q: 1, outs: sc.outs + 1, b: [null, sc.bases[1], sc.bases[2]], runs: 0 }], 'st_ng');
      return out;
    }
    const P = probs(sc, order, C);
    for (const k of OUTCOMES) if (P[k] > 0) push(P[k], branchesOf(sc, k, C), k);
    return out;
  }
  // 指示が使えるか
  function legalOrders(sc) {
    const b = sc.bases, side = sc.side === 'pitch' ? 'pitch' : 'bat';
    if (side === 'pitch') return ['normal', 'fast', 'breaking', 'outside', 'inside'].concat(b[0] == null ? ['walk'] : []);
    const L = ['normal', 'power', 'contact'];
    if (sc.outs < 2 && b.some((x) => x != null)) L.push('bunt');
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
      return { order: o, label: ORDER_LABEL[sc.side === 'pitch' ? 'pitch' : 'bat'][o], ev: expectOrder(sc, o, C), p1: expectOrderP1(sc, o, C), probs: P, delta: delta, success: succ };
    });
    const metric = isLateClose(sc, C) ? 'p1' : 'ev';
    const pick = sc.side === 'pitch' ? (a, b) => (b[metric] < a[metric] ? b : a) : (a, b) => (b[metric] > a[metric] ? b : a);
    return { re: now, p1: p1Of(sc.outs, sc.bases, C), metric: metric, rows: rows, best: rows.reduce(pick).order };
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
  const KIND_LABEL = { bunt_ok: '送りバント成功', bunt_hit: 'バントヒット', bunt_ng: '送りバント失敗', sq_ok: 'スクイズ成功', sq_ng: 'スクイズ失敗(三塁走者アウト)', st_ok: '盗塁成功', st_ng: '盗塁失敗' };

  // ---------- 場面 ----------
  // 場面:{ inning, side:'bat'|'pitch', outs, bases:[走力|null ×3], diff(自校−相手), batter, pitcher, defense, arm, hero, focus }
  function makeScene(o) {
    return Object.assign({ inning: 1, side: 'bat', outs: 0, bases: [null, null, null], diff: 0, batter: Object.assign({}, PRESETS.batter.normal), pitcher: Object.assign({}, PRESETS.pitcher.normal),
      defense: 50, arm: 50, hero: true, focus: false }, o);
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
    return makeScene({ name: 'シード ' + seed, inning: r.int(1, 9), side: r.chance(0.5) ? 'bat' : 'pitch', outs: r.int(0, 2), bases: bases, diff: r.int(-4, 4),
      batter: jit(pick(PRESETS.batter)), pitcher: jit(pick(PRESETS.pitcher)), defense: r.int(30, 70), arm: r.int(30, 70), hero: r.chance(0.6), focus: r.chance(0.3) });
  }

  // ---------- 介入場面の判定 ----------
  //   rule:プリセット名('success' / 'manager')か、{ bat:{ who:'all'|'focus', minInning, chance }, pitch:{ pinch, maxDiff, minInning } }
  //   野手:who が 'all' なら主人公の打席、'focus' なら注目選手の打席。chance が true なら、得点圏に走者がいるときだけ
  //   投手:得点圏に走者(満塁を含む)、かつ |点差| ≤ maxDiff、かつ minInning 回以降
  function isKeyScene(sc, rule, cfg) {
    const C = cfg || CONFIG;
    const K = typeof rule === 'string' ? C.keyScene[rule] : rule;
    if (!K) return false;
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

  return {
    CONFIG: CONFIG, OUTCOMES: OUTCOMES, OUTCOME_LABEL: OUTCOME_LABEL, ORDER_LABEL: ORDER_LABEL, PRESETS: PRESETS, SCENES: SCENES,
    Rng: Rng, probs: probs, orderBranches: orderBranches, legalOrders: legalOrders, reTable: reTable, reOf: reOf, p1Table: p1Table, p1Of: p1Of, expectOrderP1: expectOrderP1, expectOrder: expectOrder,
    evaluate: evaluate, resolve: resolve, makeScene: makeScene, randomScene: randomScene, isKeyScene: isKeyScene,
    buntP: buntP, squeezeP: squeezeP, stealP: stealP, rankOf: rankOf, kmh: kmh, breakTotal: breakTotal,
  };
});
