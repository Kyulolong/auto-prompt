#!/usr/bin/env bash
# Downloads the small Korean Vosk model and repackages it as the .tar.gz that
# vosk-browser loads. Free, one-time, ~82MB. Not committed to git.
set -euo pipefail

MODEL="vosk-model-small-ko-0.22"
URL="https://alphacephei.com/vosk/models/${MODEL}.zip"
OUT_DIR="public/models"
OUT="${OUT_DIR}/vosk-model-small-ko.tar.gz"

if [ -f "$OUT" ]; then
  echo "이미 있음: $OUT (다시 받으려면 삭제 후 실행)"
  exit 0
fi

command -v curl >/dev/null || { echo "curl 이 필요합니다."; exit 1; }
command -v unzip >/dev/null || { echo "unzip 이 필요합니다."; exit 1; }

mkdir -p "$OUT_DIR"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "다운로드: $MODEL (~82MB)…"
curl -L --fail --progress-bar -o "$tmp/model.zip" "$URL"

echo "압축 해제…"
unzip -q "$tmp/model.zip" -d "$tmp"

echo "vosk-browser 용 tar.gz 로 재포장…"
tar -czf "$OUT" -C "$tmp" "$MODEL"

echo "완료 → $OUT"
