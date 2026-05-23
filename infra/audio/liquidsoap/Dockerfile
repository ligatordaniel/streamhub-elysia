FROM debian:bookworm-slim

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    liquidsoap \
    nodejs \
    sqlite3 \
  && rm -rf /var/lib/apt/lists/*

COPY liquidsoap/start-liquidsoap.sh /usr/local/bin/start-liquidsoap.sh
COPY scripts/render-audio-streams.mjs /usr/local/bin/render-audio-streams.mjs

RUN chmod +x /usr/local/bin/start-liquidsoap.sh \
  && chmod +x /usr/local/bin/render-audio-streams.mjs \
  && mkdir -p /etc/streamhub /etc/liquidsoap /srv/audio/library /srv/audio/playlists /srv/audio/state

ENTRYPOINT ["/usr/local/bin/start-liquidsoap.sh"]