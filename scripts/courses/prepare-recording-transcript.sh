#!/usr/bin/env bash
# Prepares an NLB Weekly recording for summarising: extracts mono 16 kHz audio and splits it into
# 10-minute chunks, then (when the multix CLI is installed) transcribes each chunk verbatim with Gemini.
# Chunked transcripts are what the course description should be written from: whole-file summaries
# drift and stop early on 90+ minute sessions.
#
# Usage:
#   scripts/courses/prepare-recording-transcript.sh <record-YYMMDD.mp4> [out-dir]
#
# Output: <out-dir>/part-NN.mp3 and, with multix, <out-dir>/part-NN.md. Default out-dir is
# ./.recordings/<file name>/ (git-ignored).
# Needs ffmpeg. multix reads GEMINI_API_KEY from the environment; the key is never printed.
set -euo pipefail

file="${1:?usage: prepare-recording-transcript.sh <recording> [out-dir]}"
name="$(basename "${file%.*}")"
out="${2:-.recordings/$name}"
chunk_seconds="${CHUNK_SECONDS:-600}"

command -v ffmpeg >/dev/null || { echo "ffmpeg is required" >&2; exit 1; }
mkdir -p "$out"

if ! ls "$out"/part-*.mp3 >/dev/null 2>&1; then
  ffmpeg -hide_banner -loglevel error -i "$file" -vn -ac 1 -ar 16000 -b:a 24k \
    -f segment -segment_time "$chunk_seconds" -reset_timestamps 1 "$out/part-%02d.mp3"
fi
echo "audio chunks: $(ls "$out"/part-*.mp3 | wc -l) in $out"

if ! command -v multix >/dev/null; then
  echo "multix not found: transcribe the chunks with any tool, then write the summary from them."
  exit 0
fi

prompt="Transcribe this Vietnamese audio verbatim, in Vietnamese with full diacritics. Keep product and tool names exactly as spoken. Prefix each paragraph with its [mm:ss] offset. Do not summarise."
for part in "$out"/part-*.mp3; do
  md="${part%.mp3}.md"
  [ -s "$md" ] && continue
  echo "transcribing $(basename "$part")"
  multix gemini analyze --files "$part" --prompt "$prompt" --output "$md" >/dev/null
done
echo "transcripts: $out/part-*.md"
