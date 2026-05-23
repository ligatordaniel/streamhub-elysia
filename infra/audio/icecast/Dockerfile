FROM debian:bookworm-slim

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    gettext-base \
    icecast2 \
    media-types \
    wget \
  && rm -rf /var/lib/apt/lists/*

COPY start-icecast.sh /usr/local/bin/start-icecast.sh
COPY icecast.xml.template /etc/streamhub/icecast.xml.template

RUN chmod +x /usr/local/bin/start-icecast.sh \
  && mkdir -p /etc/streamhub /var/log/icecast2 /var/lib/icecast2 \
  && chown -R icecast2:icecast /etc/streamhub /etc/icecast2 /var/log/icecast2 /var/lib/icecast2

HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -q -O - http://127.0.0.1:8000/status-json.xsl >/dev/null || exit 1

USER icecast2:icecast

ENTRYPOINT ["/usr/local/bin/start-icecast.sh"]