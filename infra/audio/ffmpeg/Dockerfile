FROM debian:bookworm-slim

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    nodejs \
    sqlite3 \
  && rm -rf /var/lib/apt/lists/*

COPY ffmpeg/start-hls.sh /usr/local/bin/start-hls.sh
COPY scripts/render-audio-streams.mjs /usr/local/bin/render-audio-streams.mjs

RUN chmod +x /usr/local/bin/start-hls.sh \
  && chmod +x /usr/local/bin/render-audio-streams.mjs \
  && mkdir -p /srv/audio/hls /etc/streamhub

HEALTHCHECK --interval=15s --timeout=3s --retries=6 CMD sh -ec 'find /srv/audio/hls -type f -name live.m3u8 | grep -q .'

ENTRYPOINT ["/usr/local/bin/start-hls.sh"]