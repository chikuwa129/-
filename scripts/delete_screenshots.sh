#!/usr/bin/env bash
# ダウンロードフォルダに溜まったスクリーンショットを完全削除する。
# ChromeOS の Linux(Crostini) 環境から実行する想定。
# 手動実行(端末から直接)のときだけ件数を表示して確認を挟む。
# cron などの非対話実行では確認なしでそのまま削除する。
set -euo pipefail

# ChromeOS の Downloads は Linux コンテナから既定でここにマウントされる。
DOWNLOAD_DIR="${SCREENSHOT_CLEANUP_DIR:-/mnt/chromeos/MyFiles/Downloads}"

if [[ ! -d "$DOWNLOAD_DIR" ]]; then
  echo "Downloads folder not found: $DOWNLOAD_DIR" >&2
  exit 1
fi

mapfile -d '' -t targets < <(find "$DOWNLOAD_DIR" -maxdepth 1 -type f \( \
    -iname "Screenshot *" -o \
    -iname "Screen Shot *" -o \
    -iname "スクリーンショット *" \
  \) -print0)

if [[ ${#targets[@]} -eq 0 ]]; then
  echo "削除対象のスクリーンショットはありませんでした。"
  exit 0
fi

if [[ -t 0 ]]; then
  echo "以下 ${#targets[@]} 件を完全削除します:"
  printf '%s\n' "${targets[@]}"
  read -r -p "削除してよろしいですか？ [y/N] " answer
  case "$answer" in
    y|Y) ;;
    *) echo "キャンセルしました。"; exit 0 ;;
  esac
fi

printf '%s\0' "${targets[@]}" | xargs -0 rm -v --
