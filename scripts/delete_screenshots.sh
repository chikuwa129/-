#!/usr/bin/env bash
# ダウンロードフォルダに溜まったスクリーンショットを完全削除する。
# ChromeOS の Linux(Crostini) 環境から実行する想定。
set -euo pipefail

# ChromeOS の Downloads は Linux コンテナから既定でここにマウントされる。
DOWNLOAD_DIR="${SCREENSHOT_CLEANUP_DIR:-/mnt/chromeos/MyFiles/Downloads}"

if [[ ! -d "$DOWNLOAD_DIR" ]]; then
  echo "Downloads folder not found: $DOWNLOAD_DIR" >&2
  exit 1
fi

find "$DOWNLOAD_DIR" -maxdepth 1 -type f \( \
    -iname "Screenshot *" -o \
    -iname "Screen Shot *" -o \
    -iname "スクリーンショット *" \
  \) -print -delete
