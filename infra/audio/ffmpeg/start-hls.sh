#!/bin/sh
set -eu

export AUDIO_DATABASE_PATH="${AUDIO_DATABASE_PATH:-/srv/database/data/streamhub.sqlite3}"

mkdir -p /srv/audio/hls /etc/streamhub
rm -rf /srv/audio/hls/*

cleanup() {
  trap - EXIT INT TERM
  kill 0 >/dev/null 2>&1 || true
}

run_worker() {
  streaming_alias="$1"
  publish_key="$2"
  source_mount="$3"
  source_url="http://icecast:8000${source_mount}"
  output_dir="/srv/audio/hls/${streaming_alias}/${publish_key}"

  mkdir -p "$output_dir"

  while true; do
    rm -f "$output_dir"/live.m3u8 "$output_dir"/live*.ts

    ffmpeg \
      -hide_banner \
      -loglevel warning \
      -reconnect 1 \
      -reconnect_streamed 1 \
      -reconnect_delay_max 2 \
      -i "$source_url" \
      -c:a copy \
      -f hls \
      -hls_time 2 \
      -hls_list_size 6 \
      -hls_allow_cache 0 \
      -hls_flags delete_segments+append_list+omit_endlist+independent_segments \
      -hls_segment_filename "$output_dir/live%03d.ts" \
      "$output_dir/live.m3u8" || true

    sleep 1
  done
}

trap cleanup EXIT INT TERM

streams_file="$(mktemp)"
node /usr/local/bin/render-audio-streams.mjs list > "$streams_file"

worker_count=0
tab=$(printf '\t')

while IFS="$tab" read -r streaming_alias publish_key harbor_mount mp3_mount aac_mount; do
  if [ -z "$streaming_alias" ] || [ -z "$publish_key" ] || [ -z "$aac_mount" ]; then
    continue
  fi

  worker_count=$((worker_count + 1))
  run_worker "$streaming_alias" "$publish_key" "$aac_mount" &
done < "$streams_file"

rm -f "$streams_file"

if [ "$worker_count" -eq 0 ]; then
  echo "No audio streamings found in $AUDIO_DATABASE_PATH" >&2
  exit 1
fi

wait