#!/bin/sh
set -eu

export AUDIO_ICECAST_HOST="${AUDIO_ICECAST_HOST:-icecast}"
export AUDIO_ICECAST_PORT="${AUDIO_ICECAST_PORT:-8000}"
export AUDIO_ICECAST_SOURCE_PASSWORD="${AUDIO_ICECAST_SOURCE_PASSWORD:-streamhub-source}"
export AUDIO_PUBLIC_URL="${AUDIO_PUBLIC_URL:-http://localhost:8090}"
export AUDIO_STATION_NAME="${AUDIO_STATION_NAME:-Streamhub Live}"
export AUDIO_LIVE_SOURCE_PORT="${AUDIO_LIVE_SOURCE_PORT:-8010}"
export AUDIO_LIVE_SOURCE_PASSWORD="${AUDIO_LIVE_SOURCE_PASSWORD:-Q7mLp2Xv9RtK}"
export AUDIO_DATABASE_PATH="${AUDIO_DATABASE_PATH:-/srv/database/data/streamhub.sqlite3}"

mkdir -p /srv/audio/library/music /srv/audio/playlists /srv/audio/state

node /usr/local/bin/render-audio-streams.mjs json > /etc/streamhub/audio-streams.json
node /usr/local/bin/render-audio-streams.mjs liquidsoap > /etc/liquidsoap/radio.liq

exec liquidsoap /etc/liquidsoap/radio.liq