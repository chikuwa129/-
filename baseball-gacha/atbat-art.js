// =============================================================
// atbat-art.js : 打席の場面の線画(自分の視点)。SVG の文字列を返す、独立した部品
//   入力:{ mode:'bat'|'pitch', bats:'R'|'L', throws:'R'|'L', color, bg, width, height, strokeWidth, heads }
//   出力:SVG の文字列。画面や試作の状態に依存しない(監督モードでも使えるように)
//   描き方:輪郭の線だけ(塗りは背景色で、重なりを表す)。線の太さは一定、角は丸める。静止画(アニメーションなし)
//   人の形(T1d):頭(あご)と首、肩幅と厚みのある胴、太さのある腕と脚(閉じた輪郭)、ミトン状の手、靴の形。
//     打者はヘルメット(つば)とバット、投手は帽子とグラブ、捕手はマスクとミット。各部品に data-el を付ける(テストで確かめる)
//   頭身:heads(仮 3。頭の大きさだけを変える)。人物は、足もとを原点、頭1つ分を 10 とする座標で描き、場面の大きさに写す
//   左右:基準の向き(右打席・右投げ)で描き、左のときは、その人物だけを左右反転する(transform の scale(-1,1))
// =============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AtBatArt = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const W = 200, H = 120;
  const DEF = { heads: 3, strokeWidth: 1.7 };
  const MIRROR = 'translate(' + W + ',0) scale(-1,1)';
  const f = (v) => String(Math.round(v * 10) / 10);
  // 人物ごとのグループ。flip のとき左右反転する(data-flip で向きを残す。テストはこれで確かめる)
  const group = (name, flip, body) => '<g data-part="' + name + '" data-flip="' + (flip ? 1 : 0) + '"' + (flip ? ' transform="' + MIRROR + '"' : '') + '>' + body + '</g>';
  const P = (el, d, tf) => '<path data-el="' + el + '"' + (tf ? ' transform="' + tf + '"' : '') + ' d="' + d + '"/>';

  // ---------- 形の部品(閉じた輪郭) ----------
  // 座標の写し:足もと (ox, oy)、倍率 s。頭は、首の付け根を中心に k 倍(頭身)
  function mapper(ox, oy, s, k) {
    const p = (x, y) => f(ox + s * x) + ' ' + f(oy + s * y);
    const h = (x, y) => p(x * k, -24 + (y + 24) * k);
    return { p: p, h: h, s: s, k: k, at: (x, y, rot) => 'translate(' + f(ox + s * x) + ',' + f(oy + s * y) + ')' + (rot ? ' rotate(' + rot + ')' : '') };
  }
  // 太さのある棒(腕・脚):両端が丸い、閉じた輪郭
  function limb(m, x1, y1, x2, y2, w) {
    const ax = x1, ay = y1, dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L * w / 2, ny = dx / L * w / 2, r = f(w / 2 * m.s);
    return 'M' + m.p(ax + nx, ay + ny) + ' L' + m.p(x2 + nx, y2 + ny) + ' A' + r + ' ' + r + ' 0 0 0 ' + m.p(x2 - nx, y2 - ny) + ' L' + m.p(ax - nx, ay - ny) + ' A' + r + ' ' + r + ' 0 0 0 ' + m.p(ax + nx, ay + ny) + ' Z';
  }
  // 先が太い棒(バット):握り w1、先 w2
  function taper(m, x1, y1, x2, y2, w1, w2) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = -dy / L, uy = dx / L;
    const r1 = f(w1 / 2 * m.s), r2 = f(w2 / 2 * m.s);
    return 'M' + m.p(x1 + ux * w1 / 2, y1 + uy * w1 / 2) + ' L' + m.p(x2 + ux * w2 / 2, y2 + uy * w2 / 2) + ' A' + r2 + ' ' + r2 + ' 0 0 0 ' + m.p(x2 - ux * w2 / 2, y2 - uy * w2 / 2)
      + ' L' + m.p(x1 - ux * w1 / 2, y1 - uy * w1 / 2) + ' A' + r1 + ' ' + r1 + ' 0 0 0 ' + m.p(x1 + ux * w1 / 2, y1 + uy * w1 / 2) + ' Z';
  }
  // 楕円(中心からの大きさは、場面の単位)
  const ell = (rx, ry, cx, cy) => { cx = cx || 0; cy = cy || 0; return 'M' + f(cx - rx) + ' ' + f(cy) + ' A' + f(rx) + ' ' + f(ry) + ' 0 1 1 ' + f(cx + rx) + ' ' + f(cy) + ' A' + f(rx) + ' ' + f(ry) + ' 0 1 1 ' + f(cx - rx) + ' ' + f(cy) + ' Z'; };
  // ミトン状の手(親指つき):r は場面の単位。2つの輪郭(親指を先に描き、手のひらで重ねる)
  const mitten = (tf, r) => P('hand', ell(r * 0.42, r * 0.62, -r * 0.8, r * 0.15), tf + ' rotate(-20)') + P('hand', ell(r * 0.8, r, 0, 0), tf);
  // グラブ(指の分かれ目つき)
  function glove(tf, r) {
    const d = 'M' + f(-r * 0.95) + ' ' + f(r * 0.5) + ' Q' + f(-r * 1.25) + ' ' + f(-r * 0.6) + ' ' + f(-r * 0.6) + ' ' + f(-r * 1.1) + ' Q' + f(-r * 0.1) + ' ' + f(-r * 1.45) + ' ' + f(r * 0.35) + ' ' + f(-r * 1.15)
      + ' Q' + f(r * 0.95) + ' ' + f(-r * 1.15) + ' ' + f(r * 1.05) + ' ' + f(-r * 0.3) + ' Q' + f(r * 1.3) + ' ' + f(r * 0.4) + ' ' + f(r * 0.6) + ' ' + f(r * 0.95) + ' Q' + f(-r * 0.2) + ' ' + f(r * 1.2) + ' ' + f(-r * 0.95) + ' ' + f(r * 0.5) + ' Z';
    const lines = 'M' + f(-r * 0.35) + ' ' + f(-r * 1.0) + ' L' + f(-r * 0.25) + ' ' + f(r * 0.2) + ' M' + f(r * 0.3) + ' ' + f(-r * 1.0) + ' L' + f(r * 0.2) + ' ' + f(r * 0.25);
    return P('glove', d, tf) + P('glove', lines, tf);
  }
  // 靴(正面・後ろから見た形:甲の丸みと靴底)
  const shoe = (tf, w) => P('shoe', 'M' + f(-w) + ' 0 Q' + f(-w) + ' ' + f(-w * 0.75) + ' 0 ' + f(-w * 0.75) + ' Q' + f(w) + ' ' + f(-w * 0.75) + ' ' + f(w) + ' 0 Z', tf);
  const ball = (tf, r) => P('ball', ell(r, r) + ' M' + f(-r * 0.5) + ' ' + f(-r * 0.8) + ' Q0 0 ' + f(-r * 0.5) + ' ' + f(r * 0.8) + ' M' + f(r * 0.5) + ' ' + f(-r * 0.8) + ' Q0 0 ' + f(r * 0.5) + ' ' + f(r * 0.8), tf);

  // ---------- 人の体(足もとが原点、頭1つ分が 10) ----------
  // 胴(ユニフォーム):肩幅と、腰へのすぼまり。ベルトと前立て(後ろ姿は、ベルトだけ)
  function body(m, back, sw) {
    const t = 'M' + m.p(-7, -20.5) + ' Q' + m.p(-8.2, -15) + ' ' + m.p(-5.3, -11) + ' L' + m.p(5.3, -11) + ' Q' + m.p(8.2, -15) + ' ' + m.p(7, -20.5) + ' Q' + m.p(0, -22.3) + ' ' + m.p(-7, -20.5) + ' Z';
    const u = 'M' + m.p(-5.6, -12.7) + ' L' + m.p(5.6, -12.7) + (back ? '' : ' M' + m.p(0, -21.3) + ' L' + m.p(0, -12.7));
    const legs = P('leg', limb(m, -3.6, -12, -6.5 * sw, -1.6, 4.8)) + P('leg', limb(m, 3.6, -12, 6.5 * sw, -1.6, 4.8));
    const shoes = shoe(m.at(-6.8 * sw, 0), 3.4 * m.s) + shoe(m.at(6.8 * sw, 0), 3.4 * m.s);
    const neck = P('neck', 'M' + m.h(-1.8, -24.5) + ' L' + m.h(-1.8, -20.3) + ' L' + m.h(1.8, -20.3) + ' L' + m.h(1.8, -24.5) + ' Z');
    return legs + shoes + neck + P('torso', t) + P('uniform', u);
  }
  // 頭(丸い頭と、あご)
  const head = (m) => P('head', 'M' + m.h(-4.3, -28) + ' A' + f(4.3 * m.s * m.k) + ' ' + f(4.3 * m.s * m.k) + ' 0 0 1 ' + m.h(4.3, -28) + ' Q' + m.h(4.4, -24.2) + ' ' + m.h(0, -23) + ' Q' + m.h(-4.4, -24.2) + ' ' + m.h(-4.3, -28) + ' Z');
  // 帽子(正面):山と、つば
  const cap = (m) => P('cap', 'M' + m.h(-4.6, -28.4) + ' Q' + m.h(-4.7, -33.2) + ' ' + m.h(0, -33.2) + ' Q' + m.h(4.7, -33.2) + ' ' + m.h(4.6, -28.4) + ' Z')
    + P('cap', 'M' + m.h(-5.6, -28.4) + ' Q' + m.h(0, -29.4) + ' ' + m.h(5.6, -28.4) + ' Q' + m.h(0, -26.3) + ' ' + m.h(-5.6, -28.4) + ' Z');
  // ヘルメット:つば(front:正面に見える / 後ろ姿は、山の両側にのぞく)、山、耳あて(画面の左の耳)
  function helmet(m, front) {
    const brim = front ? 'M' + m.h(-5.8, -28.2) + ' Q' + m.h(0, -29.2) + ' ' + m.h(5.8, -28.2) + ' Q' + m.h(0, -25.8) + ' ' + m.h(-5.8, -28.2) + ' Z'
      : 'M' + m.h(-6.2, -28.3) + ' Q' + m.h(0, -30.2) + ' ' + m.h(6.2, -28.3) + ' Q' + m.h(0, -27.2) + ' ' + m.h(-6.2, -28.3) + ' Z';
    const dome = 'M' + m.h(-5, -27.4) + ' Q' + m.h(-5.2, -34) + ' ' + m.h(0, -34) + ' Q' + m.h(5.2, -34) + ' ' + m.h(5, -27.4) + (front ? ' Z' : ' L' + m.h(5, -26.4) + ' L' + m.h(-5, -26.4) + ' Z');
    const flap = 'M' + m.h(-5, -27.6) + ' Q' + m.h(-6.9, -27) + ' ' + m.h(-6.2, -24.2) + ' Q' + m.h(-5.2, -23.4) + ' ' + m.h(-4.1, -24.6) + ' Z';
    return front ? P('helmet', dome) + P('helmet', brim) + P('helmet', flap) : P('helmet', brim) + P('helmet', dome) + P('helmet', flap);
  }

  // ---------- 打者のモード(打席から、投手を見る) ----------
  // 奥の投手(正面。基準:右投げ。投手は打者の方を向くので、投げる腕は画面の左に出る)
  function farPitcher() {
    const m = mapper(100, 54, 1.35, K);
    return body(m, false, 1)
      + P('arm', limb(m, 6.2, -19.8, 10, -15.6, 3.4)) + P('arm', limb(m, 10, -15.6, 8.2, -19.2, 3))      // グラブの腕(胸の前に構える)
      + glove(m.at(8, -20.2), 3.6 * m.s)
      + head(m) + cap(m)
      + P('arm', limb(m, -6.2, -19.8, -10.6, -23.4, 3.4)) + P('arm', limb(m, -10.6, -23.4, -9.8, -29.6, 3))   // 投げる腕(振りかぶる)
      + mitten(m.at(-9.8, -30.6), 1.9 * m.s) + ball(m.at(-9.6, -32.6), 1.1 * m.s);
  }
  // 手前の打者(後ろ姿。基準:右打席=画面の左寄り、バットは左側に構える)
  function nearBatter() {
    const m = mapper(57, 118, 3.0, K);
    return body(m, true, 1) + head(m) + helmet(m, false)
      + P('arm', limb(m, 6.3, -20, 1.6, -18.2, 3.8)) + P('arm', limb(m, 1.6, -18.2, -6.6, -23.2, 3.4))   // 奥の腕(背中を横切る)
      + P('bat', taper(m, -7.4, -23.6, -17.2, -34.2, 1.3, 2.7))
      + P('arm', limb(m, -6.3, -20, -10.8, -19, 3.8)) + P('arm', limb(m, -10.8, -19, -8.6, -23.8, 3.4))   // 手前の腕
      + mitten(m.at(-7.2, -23.4), 1.7 * m.s) + mitten(m.at(-8.6, -24.8), 1.7 * m.s);
  }
  function homePlate() { return P('plate', 'M86 104 L114 104 L114 110 L100 116 L86 110 Z'); }
  function mound() { return P('mound', 'M78 58 Q100 50 122 58 Z'); }

  // ---------- 投手のモード(マウンドから、打者を見る) ----------
  // 奥の打者(正面寄り。基準:右打席。投手から見て、右打者は画面の右側に立つ。バットは画面の右上に立てる)
  function farBatter() {
    const m = mapper(124, 74, 1.2, K);
    return body(m, false, 1.1) + head(m) + helmet(m, true)
      + P('arm', limb(m, -6.2, -19.8, -1, -16.6, 3.4)) + P('arm', limb(m, -1, -16.6, 6.6, -22.4, 3))
      + P('bat', taper(m, 7.6, -23.4, 14, -35, 1.3, 2.6))
      + P('arm', limb(m, 6.2, -19.8, 10.6, -18, 3.4)) + P('arm', limb(m, 10.6, -18, 8.6, -23.4, 3))
      + mitten(m.at(7.2, -22.6), 1.8 * m.s) + mitten(m.at(8.4, -24), 1.8 * m.s);
  }
  // 捕手(しゃがんだ形を簡略に):マスクとミット。ホームベースは手前
  function farCatcher() {
    const m = mapper(100, 68, 0.95, K);
    const legs = P('leg', limb(m, -3.2, -9.5, -8.4, -7.5, 4.6)) + P('leg', limb(m, -8.4, -7.5, -6.2, -1.4, 4.2))
      + P('leg', limb(m, 3.2, -9.5, 8.4, -7.5, 4.6)) + P('leg', limb(m, 8.4, -7.5, 6.2, -1.4, 4.2));
    const torso = P('torso', 'M' + m.p(-6.8, -17.5) + ' Q' + m.p(-7.8, -13) + ' ' + m.p(-5, -9) + ' L' + m.p(5, -9) + ' Q' + m.p(7.8, -13) + ' ' + m.p(6.8, -17.5) + ' Q' + m.p(0, -19.2) + ' ' + m.p(-6.8, -17.5) + ' Z');
    const hm = mapper(100, 68 + 6.5 * 0.95, 0.95, K);   // 頭は、しゃがんだぶん低い
    const mask = P('mask', 'M' + hm.h(-3.4, -27) + ' L' + hm.h(3.4, -27) + ' M' + hm.h(-3.6, -25) + ' L' + hm.h(3.6, -25) + ' M' + hm.h(0, -29.5) + ' L' + hm.h(0, -23.4));
    return legs + torso + head(hm) + mask + glove(m.at(1.5, -13), 3.8 * m.s).replace(/data-el="glove"/g, 'data-el="mitt"') + homePlate2();
  }
  function homePlate2() { return P('plate', 'M92 72 L108 72 L108 75 L100 78 L92 75 Z'); }
  // 手前の自分の投手(帽子のつば、袖、投げる腕とボール、グラブ。基準:右投げ=投げる手は画面の右、グラブは左)
  function nearPitcher() {
    const m = mapper(0, 0, 1, 1);
    return P('cap', 'M48 0 Q100 17 152 0 Z')
      + P('uniform', limb(m, 166, 130, 172, 106, 17)) + P('arm', limb(m, 172, 106, 176, 90, 11))
      + mitten(m.at(176, 86) + ' rotate(-15)', 8.5) + ball(m.at(170, 79), 5)
      + P('uniform', limb(m, 32, 130, 40, 110, 17)) + P('arm', limb(m, 40, 110, 48, 100, 11))
      + glove(m.at(52, 92) + ' rotate(15)', 13);
  }

  let K = 1;
  function draw(o) {
    o = o || {};
    const mode = o.mode === 'pitch' ? 'pitch' : 'bat';
    const bats = o.bats === 'L' ? 'L' : 'R', throws = o.throws === 'L' ? 'L' : 'R';
    const color = o.color || '#222', bg = o.bg || '#fff', sw = o.strokeWidth || DEF.strokeWidth;
    K = 3 / Math.max(2, Math.min(8, o.heads || DEF.heads));   // 頭身:3 で頭の大きさがそのまま。大きいほど頭が小さい
    let body;
    if (mode === 'bat') body = mound() + group('pitcher', throws === 'L', farPitcher()) + homePlate() + group('batter', bats === 'L', nearBatter());
    else body = group('plate', false, farCatcher()) + group('batter', bats === 'L', farBatter()) + group('pitcher', throws === 'L', nearPitcher());
    const size = (o.width ? ' width="' + o.width + '"' : '') + (o.height ? ' height="' + o.height + '"' : '');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '"' + size + ' preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + (mode === 'bat' ? '打席から投手を見る' : 'マウンドから打者を見る') + '"'
      + ' data-mode="' + mode + '" data-bats="' + bats + '" data-throws="' + throws + '">'
      + '<g fill="' + bg + '" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round">' + body + '</g></svg>';
  }
  return { draw: draw, VIEWBOX: [W, H], DEFAULTS: DEF };
});
