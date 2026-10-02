# trend-study（IT・AIトレンド学習サイト）

毎朝AIがIT・AIのニュースを選んで要約し、用語解説・総括・学習ネタまで付けてくれる個人用Webサイトです。

- Next.js（App Router）＋ Supabase ＋ Gemini API ＋ Vercel（Cron）
- 費用0円（各サービスの無料枠）で運用する前提

## セットアップ

### 1. Supabase

1. プロジェクトを作成する
2. SQL Editor で [`supabase/schema.sql`](supabase/schema.sql) を実行する（全テーブルRLS有効・ポリシーなし）
3. Project URL とシークレットキーを控える

### 2. Gemini

Google AI Studio でAPIキーを発行し、使えるモデルを確認して `GEMINI_MODELS` を決める。

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" | grep '"name"' | grep -i flash
```

### 3. 手元で動かす

```bash
cp .env.example .env.local   # 値を入れる
npm install
npm run dev
```

画面の「記事を取得して今日のおすすめを作る」ボタンで日次処理を実行できます。

### 4. Vercel にデプロイ

1. GitHub連携でインポートし、**Root Directory を `trend-study` にする**
2. 環境変数を設定する

| 名前 | 内容 |
|---|---|
| `GEMINI_API_KEY` | GeminiのAPIキー |
| `GEMINI_MODELS` | 使うモデル（優先順、カンマ区切り） |
| `SUPABASE_URL` | `https://<Project ID>.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabaseのシークレットキー |
| `CRON_SECRET` | 定期実行用の合言葉（ランダムな文字列） |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` | サイトに入るためのIDとパスワード |

`vercel.json` で毎朝6時（日本時間）に `/api/daily` が実行されます（Hobbyプランは1日1回・最大1時間程度のずれあり）。

## 各自で設定するところ

- [`lib/feeds.ts`](lib/feeds.ts)：情報源（RSS）
- [`lib/config.ts`](lib/config.ts)：おすすめの選定基準・下げるもの、学習ネタの条件（自分の環境）

## API

| パス | 内容 |
|---|---|
| `GET /api/daily` | 日次処理（`Authorization: Bearer <CRON_SECRET>`）。`?date=YYYY-MM-DD` で過去の日の分を作る |
| `GET /api/ingest` | RSSの取得と保存だけ |

どちらもベーシック認証の対象外で、`CRON_SECRET` で守られます。

## ファイル構成

```
app/page.tsx          トップページ（URLパラメータで表示を切り替え）
app/actions.ts        Server Actions（日次処理・要約・後で見る/お気に入り・閲覧記録）
app/api/daily         日次処理
app/api/ingest        RSS取得のみ
proxy.ts              ベーシック認証
lib/daily.ts          日次処理の流れ（取得→タグ→選別→要約→総括→学習ネタ）
lib/ai.ts             Geminiへのプロンプトと出力の形
lib/gemini.ts         モデルの切り替え・再試行・記録
lib/rss.ts            RSS取得
lib/queries.ts        画面用の読み込み（トレンドワード・急上昇ワード・検索など）
lib/logs.ts           動作記録（run_logs / gemini_logs / feed_logs）
components/           画面の部品
supabase/schema.sql   テーブル定義
```

## 注意

- AIの要約・総括・学習ネタはRSSのタイトルと冒頭文をもとに作るため、元記事と細部がずれることがあります
- Geminiの無料枠では入力・出力がサービス改善に使われる可能性があるため、個人情報や業務情報は入れないでください
- クリップボードへのコピーはhttpsのサイトでのみ動きます
