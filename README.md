# auto-delete-screenshots

ダウンロードフォルダに溜まったスクリーンショットを定期的に完全削除するスクリプトです。
Chromebook の Linux(Crostini) 環境上で cron から実行することを想定しています。

## 対象ファイル

ファイル名が以下のパターンに一致するものを、更新日時に関係なく即削除します。

- `Screenshot *`（ChromeOSの標準的な英語ロケール名）
- `Screen Shot *`
- `スクリーンショット *`（日本語ロケール名）

## セットアップ手順（Chromebook）

### 1. Linux(Crostini) を有効化する

まだ有効化していない場合: 設定 → 詳細設定 → デベロッパー → Linux開発環境 → オンにする

### 2. ターミナル(Linux)を開き、このスクリプトを配置する

```bash
mkdir -p ~/scripts
cp /path/to/scripts/delete_screenshots.sh ~/scripts/
chmod +x ~/scripts/delete_screenshots.sh
```

### 3. 動作確認

```bash
~/scripts/delete_screenshots.sh
```

`/mnt/chromeos/MyFiles/Downloads` が見つからない場合、Files アプリで
「Linux ファイル」を右クリック →「Linux とのファイル共有を管理」から
ダウンロードフォルダの共有が許可されているか確認してください。

### 4. cron をインストールして定期実行を設定する

```bash
sudo apt update
sudo apt install -y cron
sudo service cron start

crontab -e
```

エディタが開いたら、例えば30分ごとに実行する場合は以下を追記します。

```
*/30 * * * * /home/$(whoami)/scripts/delete_screenshots.sh >> /home/$(whoami)/scripts/delete_screenshots.log 2>&1
```

保存して終了すれば設定完了です。

### 5. Linux コンテナ起動時に cron が自動起動するようにする

Crostini の Linux コンテナは systemd に対応しているため、`cron` パッケージを
インストールしていれば通常は次回コンテナ起動時から自動的に `cron` サービスが
立ち上がります。もし立ち上がらない場合は以下で有効化してください。

```bash
sudo systemctl enable cron
```

## 注意点

- cron は **Linux コンテナが起動している間のみ** 動作します。ターミナルアプリを
  閉じてもコンテナ自体はしばらく起動したままのことが多いですが、Chromebook を
  再起動した直後などコンテナが起動していないタイミングでは削除は実行されません。
- このスクリプトは対象ファイルを **完全削除（ゴミ箱を経由しない）** します。
  誤って必要なファイルまで消えないよう、ファイル名パターンは必要に応じて
  `scripts/delete_screenshots.sh` 内で調整してください。
