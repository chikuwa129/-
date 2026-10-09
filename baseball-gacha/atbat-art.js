// =============================================================
// atbat-art.js : 打席の場面の線画(自分の視点)。SVG の文字列を返す、独立した部品
//   入力:{ mode:'bat'|'pitch', bats:'R'|'L', throws:'R'|'L', color, bg, width, height }
//   出力:SVG の文字列。画面や試作の状態に依存しない(監督モードでも使えるように)
//   描き方:輪郭の線だけ(塗りは背景色のみ)。線の太さは一定、角は丸める。静止画(アニメーションなし)
//   左右:基準の向き(右打席・右投げ)で描き、左のときは、その人物だけを左右反転する(transform の scale(-1,1))
// =============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AtBatArt = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const W = 200, H = 120;
  const MIRROR = 'translate(' + W + ',0) scale(-1,1)';
  // 人物ごとのグループ。flip のとき左右反転する(data-flip で向きを残す。テストはこれで確かめる)
  const group = (name, flip, body) => '<g data-part="' + name + '" data-flip="' + (flip ? 1 : 0) + '"' + (flip ? ' transform="' + MIRROR + '"' : '') + '>' + body + '</g>';
  const P = (d) => '<path d="' + d + '"/>';
  const circle = (x, y, r) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '"/>';

  // ---------- 打者のモード(打席から、投手を見る) ----------
  // 奥の投手(基準:右投げ。投手は打者の方を向くので、右腕は画面の左に出る)
  function farPitcher() {
    return circle(100, 22, 4)                       // 頭
      + P('M100 26 L100 42')                          // 胴
      + P('M100 30 L92 24 L88 16')                    // 投げる腕(振りかぶる)
      + P('M100 30 L107 34 L110 31')                  // グラブの腕
      + P('M100 42 L95 52 M100 42 L106 51')           // 脚
      + P('M86 54 Q100 50 114 54');                   // マウンド
  }
  // 手前の打者(後ろ姿。基準:右打席=画面の左寄り、バットは左側に構える)
  function nearBatter() {
    return circle(62, 64, 9)                        // 頭(後ろ姿)
      + P('M40 84 Q62 72 84 84')                      // 肩
      + P('M44 84 L44 120 M80 84 L80 120')            // 胴の輪郭
      + P('M46 86 L38 74 L36 66')                     // 腕(グリップへ)
      + P('M36 68 L22 34');                           // バット(左側に構える)
  }
  function homePlate() { return P('M86 104 L114 104 L114 110 L100 116 L86 110 Z'); }

  // ---------- 投手のモード(マウンドから、打者を見る) ----------
  // 奥の打者(基準:右打席。投手から見て、右打者は画面の右側に立つ)
  function farBatter() {
    return circle(120, 34, 4.5)                     // 頭
      + P('M120 39 L118 56')                          // 胴
      + P('M119 43 L112 40 L110 34')                  // 腕(グリップ)
      + P('M110 35 L104 22')                          // バット
      + P('M118 56 L113 68 M118 56 L124 68');         // 脚
  }
  function farPlateAndMitt() {
    return P('M92 72 L108 72 L108 75 L100 78 L92 75 Z')  // ホームベース
      + P('M96 60 Q100 55 104 60 Q104 66 100 67 Q96 66 96 60 Z');   // 捕手のミット(小)
  }
  // 手前の自分の投手(投げる腕とグラブの一部。基準:右投げ=投げる手は画面の右、グラブは左)
  function nearPitcher() {
    return P('M150 120 Q156 98 168 88')               // 投げる腕
      + circle(172, 84, 7)                            // ボールを持つ手
      + P('M30 120 Q36 104 46 98')                    // グラブの腕
      + P('M44 92 Q56 86 62 98 Q60 110 48 110 Q40 104 44 92 Z');   // グラブ
  }

  function draw(o) {
    o = o || {};
    const mode = o.mode === 'pitch' ? 'pitch' : 'bat';
    const bats = o.bats === 'L' ? 'L' : 'R', throws = o.throws === 'L' ? 'L' : 'R';
    const color = o.color || '#222', bg = o.bg || '#fff', sw = o.strokeWidth || 2.4;
    let body;
    if (mode === 'bat') body = group('pitcher', throws === 'L', farPitcher()) + homePlate() + group('batter', bats === 'L', nearBatter());
    else body = group('plate', false, farPlateAndMitt()) + group('batter', bats === 'L', farBatter()) + group('pitcher', throws === 'L', nearPitcher());
    const size = (o.width ? ' width="' + o.width + '"' : '') + (o.height ? ' height="' + o.height + '"' : '');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '"' + size + ' preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + (mode === 'bat' ? '打席から投手を見る' : 'マウンドから打者を見る') + '"'
      + ' data-mode="' + mode + '" data-bats="' + bats + '" data-throws="' + throws + '">'
      + '<g fill="' + bg + '" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round">' + body + '</g></svg>';
  }
  return { draw: draw, VIEWBOX: [W, H] };
});
