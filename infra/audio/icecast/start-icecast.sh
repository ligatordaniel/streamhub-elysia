#!/bin/sh
set -eu

export AUDIO_ICECAST_SOURCE_PASSWORD="${AUDIO_ICECAST_SOURCE_PASSWORD:-streamhub-source}"
export AUDIO_ICECAST_ADMIN_PASSWORD="${AUDIO_ICECAST_ADMIN_PASSWORD:-streamhub-admin}"
export AUDIO_ICECAST_RELAY_PASSWORD="${AUDIO_ICECAST_RELAY_PASSWORD:-streamhub-relay}"
export AUDIO_ICECAST_HOSTNAME="${AUDIO_ICECAST_HOSTNAME:-localhost}"

envsubst < /etc/streamhub/icecast.xml.template > /etc/icecast2/icecast.xml

exec icecast2 -c /etc/icecast2/icecast.xml