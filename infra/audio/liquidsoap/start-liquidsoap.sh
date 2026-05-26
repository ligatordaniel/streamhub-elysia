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
export AUDIO_AUTODJ_SYNC_INTERVAL_SECONDS="${AUDIO_AUTODJ_SYNC_INTERVAL_SECONDS:-5}"

mkdir -p /srv/audio/library/music /srv/audio/library/companies /srv/audio/playlists /srv/audio/playlists/companies /srv/audio/state

node /usr/local/bin/render-audio-streams.mjs sync-autodj > /etc/streamhub/audio-autodj.json
node /usr/local/bin/render-audio-streams.mjs json > /etc/streamhub/audio-streams.json
node /usr/local/bin/render-audio-streams.mjs liquidsoap > /etc/liquidsoap/radio.liq

sync_autodj() {
	while true; do
		node /usr/local/bin/render-audio-streams.mjs sync-autodj > /etc/streamhub/audio-autodj.json || true
		sleep "$AUDIO_AUTODJ_SYNC_INTERVAL_SECONDS"
	done
}

sync_autodj &

exec liquidsoap /etc/liquidsoap/radio.liq