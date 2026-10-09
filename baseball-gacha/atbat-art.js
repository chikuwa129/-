// =============================================================
// atbat-art.js : 打席の場面の線画(自分の視点)。SVG の文字列を返す、独立した部品
//   入力:{ mode:'bat'|'pitch', bats:'R'|'L', throws:'R'|'L', color, bg, width, height, strokeWidth, heads }
//   出力:SVG の文字列。画面や試作の状態に依存しない(監督モードでも使えるように)
//   描き方:輪郭の線だけ(塗りは背景色で、重なりを表す)。線の太さは一定、角は丸める。静止画(アニメーションなし)
//   人の形(T1d):頭(あご)と首、肩幅と厚みのある胴、太さのある腕と脚(閉じた輪郭)、ミトン状の手、靴の形。
//     打者はヘルメット(つば)とバット、投手は帽子とグラブ、捕手はマスクとミット。各部品に data-el を付ける(テストで確かめる)
//   打者(T1f):横向き(胸をホームベースへ、体の側面を見せる)。ホームベースの横に立ち、前の足と後ろの足を軽く開き、
//     バットは後ろの肩の上に、両手で斜めに寝かせて構える(先は後ろ上方)。打者のモードは後ろ寄り、投手のモードは顔をこちらへ
//   投手のモード(T1f):自分の投手を、引きの後ろ姿で手前に。奥に打者、捕手、ホームベース
//   頭身:heads(仮 3。頭の大きさだけを変える)。人物は、足もとを原点、頭1つ分を 10 とする座標で描き、場面の大きさに写す
//   左右:基準の向きで描き、左のときは、その人物だけを左右反転する(transform の scale(-1,1))。
//     打者の基準は「ホームベースの左に立ち、右を向く」。打者のモードの右打者は、画面の左(基準のまま)。
//     投手のモードは、投手から見ると右打者は画面の右に立つので、右打者を反転する(pitchRightyOn で 'left' にもできる)
// =============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AtBatArt = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const W = 200, H = 120;
  const DEF = { heads: 3, strokeWidth: 1.7, pitchRightyOn: 'right' };
  const mirror = (cx) => 'translate(' + 2 * cx + ',0) scale(-1,1)';
  const f = (v) => String(Math.round(v * 10) / 10);
  // 人物ごとのグループ。flip のとき左右反転する(data-flip で向きを残す。テストはこれで確かめる)
  //   cx:反転の中心(既定は画面の中央。投手のモードの自分の投手は、その場で反転する)。view:向き(side=横向き、back=後ろ姿、front=正面)
  const group = (name, flip, body, cx, view) => '<g data-part="' + name + '" data-flip="' + (flip ? 1 : 0) + '"' + (view ? ' data-view="' + view + '"' : '') + (flip ? ' transform="' + mirror(cx == null ? W / 2 : cx) + '"' : '') + '>' + body + '</g>';
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
  // 帽子(後ろ姿):つばが両側にのぞき、後ろに調節の帯
  const capBack = (m) => P('cap', 'M' + m.h(-5.8, -28.6) + ' Q' + m.h(0, -30.4) + ' ' + m.h(5.8, -28.6) + ' Q' + m.h(0, -27.6) + ' ' + m.h(-5.8, -28.6) + ' Z')
    + P('cap', 'M' + m.h(-4.6, -28.2) + ' Q' + m.h(-4.7, -33.2) + ' ' + m.h(0, -33.2) + ' Q' + m.h(4.7, -33.2) + ' ' + m.h(4.6, -28.2) + ' Z M' + m.h(-1.6, -28.6) + ' Q' + m.h(0, -30) + ' ' + m.h(1.6, -28.6));
  // ヘルメット:つば(front:正面に見える / 後ろ姿は、山の両側にのぞく)、山、耳あて(side:-1 で画面の左、+1 で右)
  function helmet(m, front, side) {
    const q = -(side || -1);
    const brim = front ? 'M' + m.h(-5.8, -28.2) + ' Q' + m.h(0, -29.2) + ' ' + m.h(5.8, -28.2) + ' Q' + m.h(0, -25.8) + ' ' + m.h(-5.8, -28.2) + ' Z'
      : 'M' + m.h(-6.2, -28.3) + ' Q' + m.h(0, -30.2) + ' ' + m.h(6.2, -28.3) + ' Q' + m.h(0, -27.2) + ' ' + m.h(-6.2, -28.3) + ' Z';
    const dome = 'M' + m.h(-5, -27.4) + ' Q' + m.h(-5.2, -34) + ' ' + m.h(0, -34) + ' Q' + m.h(5.2, -34) + ' ' + m.h(5, -27.4) + (front ? ' Z' : ' L' + m.h(5, -26.4) + ' L' + m.h(-5, -26.4) + ' Z');
    const flap = 'M' + m.h(-5 * q, -27.6) + ' Q' + m.h(-6.9 * q, -27) + ' ' + m.h(-6.2 * q, -24.2) + ' Q' + m.h(-5.2 * q, -23.4) + ' ' + m.h(-4.1 * q, -24.6) + ' Z';
    return front ? P('helmet', dome) + P('helmet', brim) + P('helmet', flap) : P('helmet', brim) + P('helmet', dome) + P('helmet', flap);
  }

  // ---------- 横向きの打者(相手の打者も、自分の打者も共通) ----------
  //   基準:ホームベースの左に立ち、胸をホームベース(右、+x)へ向ける。後ろ(-x)の肩の上にバットを寝かせて構え、先は後ろ上方
  //   face:'front'(顔をこちら=投手へ。投手のモード)/ 'back'(後ろ寄り。打者のモード)。fy:前の足の上下(奥行き。負で奥)
  const POSE = {
    grip: [-4.8, -23.8], batTip: [-13.8, -34.6],   // 握りは後ろの肩のそば・頭の高さの近く。バットは垂直から後ろへ約40度
    torso: [-4.4, 4.6],   // 胴の左右の端(横向きの厚み)
    backFoot: [-5.8, 0], frontFoot: [6.2, 0],
  };
  function sideBatter(m, face, fy) {
    const sx = (x0, y0, w) => shoe(m.at(x0, y0), w * m.s);
    // 横向きの靴(つま先がホームベースの方)
    const shoeSide = (x0, y0) => P('shoe', 'M' + m.p(x0 - 2.4, y0) + ' L' + m.p(x0 + 2.9, y0) + ' Q' + m.p(x0 + 3.5, y0 - 1.3) + ' ' + m.p(x0 + 1.8, y0 - 1.7) + ' L' + m.p(x0 - 1.7, y0 - 2) + ' Q' + m.p(x0 - 2.6, y0 - 1.5) + ' ' + m.p(x0 - 2.4, y0) + ' Z');
    void sx;
    const bf = POSE.backFoot, ff = POSE.frontFoot;
    const legs = P('leg', limb(m, -1.4, -12, -4.4, -6.6, 5)) + P('leg', limb(m, -4.4, -6.6, bf[0], -1.6, 4.6))       // 後ろの足(捕手の側)
      + P('leg', limb(m, 1.4, -12, 4.6, -6.9 + fy / 2, 5)) + P('leg', limb(m, 4.6, -6.9 + fy / 2, ff[0], -1.6 + fy, 4.6));   // 前の足(投手の側)
    const shoes = shoeSide(bf[0], bf[1]) + shoeSide(ff[0], ff[1] + fy);
    // 胴(横向き):胸が右、背中が左。厚みは肩幅より狭い
    const t = 'M' + m.p(-4.1, -21) + ' Q' + m.p(-5.4, -16) + ' ' + m.p(-3.7, -11) + ' L' + m.p(3.7, -11) + ' Q' + m.p(5.3, -15.6) + ' ' + m.p(4.3, -20.4) + ' Q' + m.p(0, -22.6) + ' ' + m.p(-4.1, -21) + ' Z';
    const u = 'M' + m.p(-4, -12.7) + ' L' + m.p(4.2, -12.7) + ' M' + m.p(2.4, -21.6) + ' Q' + m.p(3.4, -17) + ' ' + m.p(3, -12.7);   // ベルトと、前立て(胸の側)
    const neck = P('neck', 'M' + m.h(-1.8, -24.5) + ' L' + m.h(-1.8, -20.3) + ' L' + m.h(1.8, -20.3) + ' L' + m.h(1.8, -24.5) + ' Z');
    const g = POSE.grip, tip = POSE.batTip;
    const L = Math.hypot(tip[0] - g[0], tip[1] - g[1]), ux = (tip[0] - g[0]) / L, uy = (tip[1] - g[1]) / L;   // バットの向き
    const h2 = [g[0] + ux * 1.6, g[1] + uy * 1.6];   // 上の手(握りの少し先)
    // 両腕は体の前で曲げ、肘を下に。肩は胴の輪郭の中。手前へ突き出さない
    return legs + shoes
      + P('arm', limb(m, -1.8, -20.2, -5, -16.8, 3.4)) + P('arm', limb(m, -5, -16.8, h2[0], h2[1], 3))   // 後ろの腕(奥。胴の後ろで肘を下に)
      + neck + P('torso', t) + P('uniform', u) + head(m) + helmet(m, face === 'front', 1)
      + P('bat', taper(m, g[0] - ux * 0.8, g[1] - uy * 0.8, tip[0], tip[1], 1.1, 2.5))
      + P('arm', limb(m, 1.4, -20.2, -2.4, -17.2, 3.4)) + P('arm', limb(m, -2.4, -17.2, g[0], g[1], 3))         // 前の腕(胸の前で曲げ、肘を下に)
      + mitten(m.at(h2[0], h2[1]), 1.6 * m.s) + mitten(m.at(g[0], g[1]), 1.6 * m.s);
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
  // 手前の自分の打者(横向き・後ろ寄り。やや大きめ。基準:右打席=ホームベースの左)
  const NEAR_BATTER = { ox: 55, oy: 117, s: 2.85 };
  const nearBatter = () => sideBatter(mapper(NEAR_BATTER.ox, NEAR_BATTER.oy, NEAR_BATTER.s, K), 'back', -1.4);
  function homePlate() { return P('plate', 'M86 104 L114 104 L114 110 L100 116 L86 110 Z'); }
  function mound() { return P('mound', 'M78 58 Q100 50 122 58 Z'); }

  // ---------- 投手のモード(マウンドの後ろから、自分の投手の背中ごしに、打者を見る) ----------
  // 奥の打者(横向き。顔をこちらへ。基準の位置はホームベースの左。右打者は反転して右に立つ)
  const FAR_BATTER = { ox: 79, oy: 57, s: 1.05 };
  const farBatter = () => sideBatter(mapper(FAR_BATTER.ox, FAR_BATTER.oy, FAR_BATTER.s, K), 'front', 0.8);
  // 捕手(ホームベースの後ろに、しゃがむ):マスクとミット。ホームベースは手前
  function farCatcher() {
    const m = mapper(100, 51, 0.8, K);
    const legs = P('leg', limb(m, -3.2, -9.5, -8.4, -7.5, 4.6)) + P('leg', limb(m, -8.4, -7.5, -6.2, -1.4, 4.2))
      + P('leg', limb(m, 3.2, -9.5, 8.4, -7.5, 4.6)) + P('leg', limb(m, 8.4, -7.5, 6.2, -1.4, 4.2));
    const torso = P('torso', 'M' + m.p(-6.8, -17.5) + ' Q' + m.p(-7.8, -13) + ' ' + m.p(-5, -9) + ' L' + m.p(5, -9) + ' Q' + m.p(7.8, -13) + ' ' + m.p(6.8, -17.5) + ' Q' + m.p(0, -19.2) + ' ' + m.p(-6.8, -17.5) + ' Z');
    const hm = mapper(100, 51 + 6.5 * 0.8, 0.8, K);   // 頭は、しゃがんだぶん低い
    const mask = P('mask', 'M' + hm.h(-3.4, -27) + ' L' + hm.h(3.4, -27) + ' M' + hm.h(-3.6, -25) + ' L' + hm.h(3.6, -25) + ' M' + hm.h(0, -29.5) + ' L' + hm.h(0, -23.4));
    return legs + torso + head(hm) + mask + glove(m.at(1.5, -13), 3.8 * m.s).replace(/data-el="glove"/g, 'data-el="mitt"')
      + P('plate', 'M90 52 L110 52 L110 55 L100 58.5 L90 55 Z');
  }
  // 手前の自分の投手(引きの後ろ姿。全身。基準:右投げ=投げる腕は画面の右、グラブは左。左投げは、その場で反転)
  const NEAR_PITCHER = { ox: 100, oy: 117, s: 1.6 };
  function nearPitcher() {
    const m = mapper(NEAR_PITCHER.ox, NEAR_PITCHER.oy, NEAR_PITCHER.s, K);
    return P('mound', 'M' + f(NEAR_PITCHER.ox - 40) + ' 121 Q' + f(NEAR_PITCHER.ox) + ' 104 ' + f(NEAR_PITCHER.ox + 40) + ' 121 Z')
      + body(m, true, 1.15)
      + P('arm', limb(m, -6.2, -19.8, -10.4, -16.2, 3.4)) + P('arm', limb(m, -10.4, -16.2, -12.4, -20.2, 3))   // グラブの腕(前へ)
      + glove(m.at(-12.8, -21.6), 3.4 * m.s)
      + head(m) + capBack(m)
      + P('arm', limb(m, 6.2, -19.8, 10.6, -23.2, 3.4)) + P('arm', limb(m, 10.6, -23.2, 10.2, -29.6, 3))   // 投げる腕(振りかぶる)
      + mitten(m.at(10.2, -30.6), 1.9 * m.s) + ball(m.at(10, -32.6), 1.1 * m.s);
  }

  let K = 1;
  // 打者の反転:打者のモードは左打席だけ。投手のモードは、右打者を画面の右に立てる(pitchRightyOn:'right')
  const batterFlip = (mode, bats, o) => (mode === 'bat' ? bats === 'L' : (bats === 'L') !== ((o.pitchRightyOn || DEF.pitchRightyOn) === 'right'));
  function draw(o) {
    o = o || {};
    const mode = o.mode === 'pitch' ? 'pitch' : 'bat';
    const bats = o.bats === 'L' ? 'L' : 'R', throws = o.throws === 'L' ? 'L' : 'R';
    const color = o.color || '#222', bg = o.bg || '#fff', sw = o.strokeWidth || DEF.strokeWidth;
    K = 3 / Math.max(2, Math.min(8, o.heads || DEF.heads));   // 頭身:3 で頭の大きさがそのまま。大きいほど頭が小さい
    let body;
    if (mode === 'bat') body = mound() + group('pitcher', throws === 'L', farPitcher(), null, 'front') + homePlate() + group('batter', batterFlip(mode, bats, o), nearBatter(), null, 'side');
    else body = group('plate', false, farCatcher()) + group('batter', batterFlip(mode, bats, o), farBatter(), null, 'side') + group('pitcher', throws === 'L', nearPitcher(), NEAR_PITCHER.ox, 'back');
    const size = (o.width ? ' width="' + o.width + '"' : '') + (o.height ? ' height="' + o.height + '"' : '');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '"' + size + ' preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + (mode === 'bat' ? '打席から投手を見る' : 'マウンドの後ろから打者を見る') + '"'
      + ' data-mode="' + mode + '" data-bats="' + bats + '" data-throws="' + throws + '">'
      + '<g fill="' + bg + '" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round">' + body + '</g></svg>';
  }
  // 打者の立ち方(テスト用。画面の座標):胴の中心、胸の向き(+1 右 / −1 左)、握り、バットの先、両足、ホームベースの中心
  function batterModel(o) {
    o = o || {};
    const mode = o.mode === 'pitch' ? 'pitch' : 'bat', flip = batterFlip(mode, o.bats === 'L' ? 'L' : 'R', o);
    const B = mode === 'bat' ? NEAR_BATTER : FAR_BATTER;
    const pt = (x, y) => { const X = B.ox + B.s * x; return [flip ? W - X : X, B.oy + B.s * y]; };
    return { flip: flip, center: pt((POSE.torso[0] + POSE.torso[1]) / 2, -16), facing: flip ? -1 : 1, grip: pt(POSE.grip[0], POSE.grip[1]), batTip: pt(POSE.batTip[0], POSE.batTip[1]),
      backFoot: pt(POSE.backFoot[0], 0), frontFoot: pt(POSE.frontFoot[0], 0), headTop: pt(0, -34), torsoDepth: (POSE.torso[1] - POSE.torso[0]) * B.s, plateX: 100 };
  }
  return { draw: draw, batterModel: batterModel, VIEWBOX: [W, H], DEFAULTS: DEF, POSE: POSE };
});
