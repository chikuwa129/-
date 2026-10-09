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

  // ---------- 骨格で描く人物(T1f:打者と、自分の投手) ----------
  //   座標は、幅100・高さ180の枠(x は右、y は下。足もとが y=180)。各部位を、太い線(丸い端)で描く:
  //   黒の線(幅 w+2t)を描き、その上に背景色の線(幅 w)を重ねて、輪郭にする。奥から手前の順に描く
  //   面の部位(胴の台形、ヘルメット、グラブ)は、黒の輪郭(幅 2t)で塗り、内側を背景色で塗り直す
  let COLOR = '#222', BG = '#fff', SW = 1.7;
  function skel(fx, fy, sf) {
    const X = (x) => f(fx + (x - SKEL_O[0]) * sf), Y = (y) => f(fy - (180 - y) * sf);
    const pts = (a) => a.map((q, i) => (i ? 'L' : 'M') + X(q[0]) + ' ' + Y(q[1])).join(' ');
    const sp = (el, d, w, stroke) => '<path data-el="' + el + '" d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + f(w) + '"/>';
    const seg = (el, a, w) => sp(el, pts(a), w * sf + 2 * SW, COLOR) + sp(el, pts(a), w * sf, BG);
    const area = (el, d) => '<path data-el="' + el + '" d="' + d + '" fill="' + BG + '" stroke="' + COLOR + '" stroke-width="' + f(2 * SW) + '"/><path data-el="' + el + '" d="' + d + '" fill="' + BG + '" stroke="none"/>';
    return {
      X: X, Y: Y, pts: pts, seg: seg, area: area,
      dot: (el, x, y, r) => seg(el, [[x, y], [x + 0.01, y]], 2 * r),
      line: (el, a) => sp(el, pts(a), SW, COLOR),
      // 細いほうから太いほうへの棒(バット):握り a(幅 w1)→ 先 b(幅 w2)。両端は丸い
      taper: (el, a, b, w1, w2) => {
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ux = -dy / L, uy = dx / L;
        const r1 = f(w1 / 2 * sf), r2 = f(w2 / 2 * sf), q = (x, y) => X(x) + ' ' + Y(y);
        const d = 'M' + q(a[0] + ux * w1 / 2, a[1] + uy * w1 / 2) + ' L' + q(b[0] + ux * w2 / 2, b[1] + uy * w2 / 2) + ' A' + r2 + ' ' + r2 + ' 0 0 0 ' + q(b[0] - ux * w2 / 2, b[1] - uy * w2 / 2)
          + ' L' + q(a[0] - ux * w1 / 2, a[1] - uy * w1 / 2) + ' A' + r1 + ' ' + r1 + ' 0 0 0 ' + q(a[0] + ux * w1 / 2, a[1] + uy * w1 / 2) + ' Z';
        return area(el, d);
      },
      ellipse: (el, cx, cy, rx, ry) => area(el, 'M' + X(cx - rx) + ' ' + Y(cy) + ' A' + f(rx * sf) + ' ' + f(ry * sf) + ' 0 1 1 ' + X(cx + rx) + ' ' + Y(cy) + ' A' + f(rx * sf) + ' ' + f(ry * sf) + ' 0 1 1 ' + X(cx - rx) + ' ' + Y(cy) + ' Z'),
    };
  }
  let SKEL_O = [45, 180];   // 枠の基準点(この点を、場面の (fx, fy) に置く)
  // 打者の骨格(右打席。右向き=胸がホームベースの方。左打席は鏡像)
  const BAT = {
    head: [46, 26], headR: 20, neck: [46, 48], torso: [[44, 62], [42, 112]], torsoW: 28,
    frontLeg: [[42, 112], [56, 142], [62, 170]], frontToe: [76, 176], backLeg: [[42, 112], [30, 142], [26, 170]], backToe: [40, 176], legW: 16,
    arm: [[44, 62], [54, 84], [34, 52]], armW: 12, hands: [34, 52], batTip: [4, 0], batW: [4, 10],
  };
  // 自分の投手の骨格(後ろ姿。右投げ=投げる腕は画面の右。左投げは鏡像)
  const PIT = {
    head: [50, 24], headR: 20, neck: [50, 46], torso: [[24, 60], [76, 60], [68, 112], [32, 112]],
    legL: [[40, 112], [38, 142], [36, 172]], legR: [[60, 112], [62, 142], [64, 172]], legW: 16,
    throwArm: [[76, 60], [90, 44], [84, 16]], gloveArm: [[24, 60], [12, 80], [22, 98]], armW: 12, ballR: 6, glove: [22, 98, 11, 13],
  };
  // テスト用(頭1つ分を 10 とした単位):胴の厚み(横向き)
  const POSE = { torso: [-BAT.torsoW / 8, BAT.torsoW / 8], frame: BAT };
  function skelBatter(fx, fy, sf) {
    SKEL_O = [45, 180];
    const k = skel(fx, fy, sf), B = BAT, X = k.X, Y = k.Y;
    const toe = (a, t) => k.seg('shoe', [a, t], 10);
    const [hx, hy] = B.head, r = B.headR;
    // ヘルメット:頭の上半分と後ろ(左)を覆う。耳当ては左。つばは右(前)に短く
    const helmet = 'M' + X(hx + r + 2) + ' ' + Y(hy + 2) + ' A' + f((r + 2) * sf) + ' ' + f((r + 2) * sf) + ' 0 0 0 ' + X(hx - r - 2) + ' ' + Y(hy + 2)
      + ' L' + X(hx - r - 1) + ' ' + Y(hy + 14) + ' Q' + X(hx - r + 4) + ' ' + Y(hy + 20) + ' ' + X(hx - r + 10) + ' ' + Y(hy + 15) + ' L' + X(hx - r + 11) + ' ' + Y(hy + 3) + ' Z';
    return k.seg('leg', B.backLeg, B.legW) + toe(B.backLeg[2], B.backToe)                           // 奥の足
      + k.seg('neck', [[B.neck[0], B.neck[1] - 8], [B.neck[0] - 1, B.neck[1] + 8]], 12)
      + k.seg('torso', B.torso, B.torsoW) + k.line('uniform', [[30, 104], [56, 104]])                // 胴(横向き)とベルト
      + k.seg('leg', B.frontLeg, B.legW) + toe(B.frontLeg[2], B.frontToe)                           // 手前の足
      + k.dot('head', hx, hy, r) + k.area('helmet', helmet) + k.seg('helmet', [[hx + r - 2, hy + 3], [hx + r + 6, hy + 4]], 5)
      + k.taper('bat', B.hands, B.batTip, B.batW[0], B.batW[1])                                     // バット(両手から後ろ上方へ)
      + k.seg('arm', B.arm, B.armW) + k.dot('hand', B.hands[0], B.hands[1], 7);                      // 手前の腕(肘は下)と両手
  }
  function skelPitcher(fx, fy, sf) {
    SKEL_O = [50, 180];
    const k = skel(fx, fy, sf), Q = PIT, X = k.X, Y = k.Y;
    const shoe = (a) => k.seg('shoe', [[a[0] - 7, a[1] + 2], [a[0] + 7, a[1] + 2]], 9);
    const torso = 'M' + Q.torso.map((q) => X(q[0]) + ' ' + Y(q[1])).join(' L') + ' Z';
    const [hx, hy] = Q.head, r = Q.headR;
    const cap = 'M' + X(hx - r - 1.5) + ' ' + Y(hy + 1) + ' A' + f((r + 1.5) * sf) + ' ' + f((r + 1.5) * sf) + ' 0 0 1 ' + X(hx + r + 1.5) + ' ' + Y(hy + 1) + ' Z';
    return k.seg('leg', Q.legL, Q.legW) + k.seg('leg', Q.legR, Q.legW) + shoe(Q.legL[2]) + shoe(Q.legR[2])
      + k.seg('neck', [[Q.neck[0], Q.neck[1] - 6], [Q.neck[0], Q.neck[1] + 8]], 14)
      + k.area('torso', torso) + k.line('uniform', [[33, 104], [67, 104]])                           // 背中とベルト
      + k.dot('head', hx, hy, r) + k.area('cap', cap)   // 後頭部と帽子(つばは見えない。顔は描かない)
      + k.seg('arm', Q.gloveArm, Q.armW) + k.ellipse('glove', Q.glove[0], Q.glove[1], Q.glove[2], Q.glove[3])
      + k.seg('arm', Q.throwArm, Q.armW) + k.dot('hand', Q.throwArm[2][0], Q.throwArm[2][1], 6.5) + k.dot('ball', Q.throwArm[2][0] + 1, Q.throwArm[2][1] - 7, Q.ballR);
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
  const NEAR_BATTER = { ox: 58, oy: 117, s: 0.55 };   // 枠の倍率(高さ 180 → 約 99)
  const nearBatter = () => skelBatter(NEAR_BATTER.ox, NEAR_BATTER.oy, NEAR_BATTER.s);
  function homePlate() { return P('plate', 'M86 104 L114 104 L114 110 L100 116 L86 110 Z'); }
  function mound() { return P('mound', 'M78 58 Q100 50 122 58 Z'); }

  // ---------- 投手のモード(マウンドの後ろから、自分の投手の背中ごしに、打者を見る) ----------
  // 奥の打者(横向き。顔をこちらへ。基準の位置はホームベースの左。右打者は反転して右に立つ)
  const FAR_BATTER = { ox: 80, oy: 57, s: 0.2 };
  const farBatter = () => skelBatter(FAR_BATTER.ox, FAR_BATTER.oy, FAR_BATTER.s);
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
  const NEAR_PITCHER = { ox: 100, oy: 117, s: 0.3 };
  function nearPitcher() {
    return P('mound', 'M' + f(NEAR_PITCHER.ox - 40) + ' 121 Q' + f(NEAR_PITCHER.ox) + ' 104 ' + f(NEAR_PITCHER.ox + 40) + ' 121 Z')
      + skelPitcher(NEAR_PITCHER.ox, NEAR_PITCHER.oy, NEAR_PITCHER.s);
  }

  let K = 1;
  // 打者の反転:打者のモードは左打席だけ。投手のモードは、右打者を画面の右に立てる(pitchRightyOn:'right')
  const batterFlip = (mode, bats, o) => (mode === 'bat' ? bats === 'L' : (bats === 'L') !== ((o.pitchRightyOn || DEF.pitchRightyOn) === 'right'));
  function draw(o) {
    o = o || {};
    const mode = o.mode === 'pitch' ? 'pitch' : 'bat';
    const bats = o.bats === 'L' ? 'L' : 'R', throws = o.throws === 'L' ? 'L' : 'R';
    const color = o.color || '#222', bg = o.bg || '#fff', sw = o.strokeWidth || DEF.strokeWidth;
    K = 3 / Math.max(2, Math.min(8, o.heads || DEF.heads));
    COLOR = color; BG = bg; SW = sw;   // 頭身:3 で頭の大きさがそのまま。大きいほど頭が小さい
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
    const Bm = mode === 'bat' ? NEAR_BATTER : FAR_BATTER, B = BAT;
    const pt = (x, y) => { const X = Bm.ox + Bm.s * (x - 45); return [flip ? W - X : X, Bm.oy - Bm.s * (180 - y)]; };
    return { flip: flip, center: pt((B.torso[0][0] + B.torso[1][0]) / 2, 87), facing: flip ? -1 : 1, grip: pt(B.hands[0], B.hands[1]), batTip: pt(B.batTip[0], B.batTip[1]),
      backFoot: pt(B.backLeg[2][0], 180), frontFoot: pt(B.frontLeg[2][0], 180), headTop: pt(B.head[0], B.head[1] - B.headR), torsoDepth: B.torsoW * Bm.s, plateX: 100 };
  }
  return { draw: draw, batterModel: batterModel, VIEWBOX: [W, H], DEFAULTS: DEF, POSE: POSE };
});
