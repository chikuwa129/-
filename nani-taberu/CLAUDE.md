# なに食べる？アキネーター — 作業メモ

- 仕様は `SPEC.md`。第1段階＋A（食材・料理名の指定）＋B（やる気度）まで実装済み。第2段階以降は未着手。
- 変更したら必ず `npm test`（ロジック）と `npm run build`（型チェック込み）を通す。
- 料理データ（`src/data/dishes.json`）を変えたら `npm run data:table` で `docs/dishes.md` を作り直す。
- **ユーザーの希望：変更が一区切りつくたびに試せるようにする。**
  `npm run build:single` で `dist-single/nani-taberu.html` を作り、`<html>`/`<head>`/`<body>` を外した形にして
  既存の試用ページ https://claude.ai/artifact/2vpNkeHWfpgyySxMqBJTAu に Artifact ツールで再公開する（URL を変えない）。
  試用ページは Service Worker と音声入力なし。
