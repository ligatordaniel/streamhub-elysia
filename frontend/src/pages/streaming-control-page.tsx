import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { runtime } from '../config/runtime';

function getStreamingSummary(type: string, companyName: string, streamingId: string): string {
  return `${type} · ${companyName} · ${streamingId}`;
}

function buildStreamPath(companyId: string, streamingId: string, ingestKey: string): string {
  return `tenants/${companyId}/streamings/${streamingId}/${ingestKey}`;
}

function EndpointCard({
  eyebrow,
  title,
  description,
  label,
  value,
}: {
  eyebrow: string;
  title: string;
  description: string;
  label: string;
  value: string;
}): JSX.Element {
  return (
    <article className="status-card streaming-endpoint-card">
      <span className="status-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <CopyableValue label={label} value={value} />
    </article>
  );
}

type CopyState = 'idle' | 'copied' | 'error';

function CopyableValue({ label, value }: { label: string; value: string }): JSX.Element {
  const [copyState, setCopyState] = useState<CopyState>('idle');

  useEffect(() => {
    if (copyState === 'idle') {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopyState('idle');
    }, 1800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [copyState]);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  return (
    <div className="streaming-endpoint-value">
      <div className="streaming-copyable-head">
        <span>{label}</span>
        <button
          className="secondary-button streaming-copy-button"
          type="button"
          onClick={() => void handleCopy()}
          aria-label={`Copy ${label}`}
        >
          {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Retry' : 'Copy'}
        </button>
      </div>
      <code>{value}</code>
    </div>
  );
}

function PublishSettingsCard({
  serverUrl,
  streamKey,
  ingestUrl,
}: {
  serverUrl: string;
  streamKey: string;
  ingestUrl: string;
}): JSX.Element {
  return (
    <article className="status-card streaming-endpoint-card streaming-publish-card">
      <span className="status-eyebrow">Transmitter PC</span>
      <h2>OBS / vMix publish settings</h2>
      <p>Enter the RTMP server URL and stream key separately in the transmitter app.</p>
      <CopyableValue label="RTMP server URL" value={serverUrl} />
      <CopyableValue label="Stream key" value={streamKey} />
      <CopyableValue label="Combined ingest URL" value={ingestUrl} />
    </article>
  );
}

type PlaybackState = 'connecting' | 'ready' | 'unsupported' | 'error';

function HlsPlayer({ src, title }: { src: string; title: string }): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<PlaybackState>('connecting');
  const [statusMessage, setStatusMessage] = useState('Waiting for the live HLS manifest.');

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    let hls: Hls | null = null;
    let disposed = false;

    const resetVideo = (): void => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };

    const markReady = (): void => {
      if (disposed) {
        return;
      }

      setStatus('ready');
      setStatusMessage('Live signal is ready. Press play if it does not start automatically.');
    };

    const markWaiting = (message: string): void => {
      if (disposed) {
        return;
      }

      setStatus('connecting');
      setStatusMessage(message);
    };

    const markUnsupported = (message: string): void => {
      if (disposed) {
        return;
      }

      setStatus('unsupported');
      setStatusMessage(message);
    };

    setStatus('connecting');
    setStatusMessage('Connecting to the live HLS playlist.');
    resetVideo();

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      const handleCanPlay = (): void => {
        markReady();
      };

      const handleError = (): void => {
        markUnsupported('Native HLS playback failed. Verify that the transmitter is publishing.');
      };

      video.src = src;
      video.addEventListener('canplay', handleCanPlay, { once: true });
      video.addEventListener('loadedmetadata', handleCanPlay, { once: true });
      video.addEventListener('error', handleError, { once: true });

      return () => {
        disposed = true;
        video.removeEventListener('error', handleError);
        resetVideo();
      };
    }

    if (!Hls.isSupported()) {
      markUnsupported('This browser does not support HLS playback.');
      return;
    }

    hls = new Hls({
      lowLatencyMode: true,
      backBufferLength: 30,
    });

    hls.attachMedia(video);
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      if (!disposed) {
        hls?.loadSource(src);
      }
    });
    hls.on(Hls.Events.MANIFEST_PARSED, markReady);
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (disposed) {
        return;
      }

      if (!data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          markWaiting('Waiting for the transmitter PC to publish the live stream.');
        }

        return;
      }

      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        markWaiting('Waiting for the transmitter PC to publish the live stream.');
        hls?.startLoad();
        return;
      }

      markUnsupported('HLS playback stopped because the stream reported a fatal error.');
    });

    return () => {
      disposed = true;
      hls?.destroy();
      resetVideo();
    };
  }, [src]);

  return (
    <article className="status-card streaming-player-card">
      <span className="status-eyebrow">Playback preview</span>
      <h2>Live HLS player</h2>
      <p>
        This player uses native HLS when available and hls.js everywhere else. It stays idle until the
        transmitter PC publishes a live feed.
      </p>
      <div className={`streaming-player-shell streaming-player-shell--${status}`}>
        <video
          ref={videoRef}
          className="streaming-player"
          controls
          playsInline
          preload="metadata"
          aria-label={`${title} HLS playback preview`}
        />
      </div>
      <p className="streaming-player-status">{statusMessage}</p>
    </article>
  );
}

export function StreamingControlPage(): JSX.Element {
  const navigate = useNavigate();
  const { streamingId } = useParams();
  const { session } = useAuth();

  if (!session || !streamingId) {
    return <Navigate to="/" replace />;
  }

  const streaming = session.streamings.find((entry) => entry.id === streamingId);

  if (!streaming) {
    return <Navigate to="/" replace />;
  }

  const streamPath = buildStreamPath(session.company.id, streaming.id, streaming.ingestKey);
  const rtmpServerUrl = runtime.streamingIngestUrl;
  const rtmpIngestUrl = `${rtmpServerUrl}/${streamPath}`;
  const hlsPlaybackUrl = `${runtime.streamingHlsUrl}/${streamPath}/index.m3u8`;
  const webRtcUrl = `${runtime.streamingWebrtcUrl}/${streamPath}`;

  return (
    <main className="dashboard-page w-full">
      <section className="dashboard-shell w-full">
        <header className="dashboard-topbar">
          <div>
            <span className="status-eyebrow">Streaming control</span>
            <h1>{streaming.name}</h1>
            <p>{getStreamingSummary(streaming.type, session.company.name, streaming.id)}</p>
          </div>

          <button className="ghost-button" type="button" onClick={() => void navigate('/')}>
            Back to dashboard
          </button>
        </header>

        <section className="dashboard-content streaming-control-grid">
          <div className="streaming-control-column">
            <PublishSettingsCard serverUrl={rtmpServerUrl} streamKey={streaming.ingestKey} ingestUrl={rtmpIngestUrl} />

            <article className="status-card streaming-settings-card">
              <span className="status-eyebrow">Recommended settings</span>
              <h2>Low server load preset</h2>
              <ul className="streaming-settings-list">
                <li>Video codec: H.264</li>
                <li>Audio codec: AAC</li>
                <li>Encoder: hardware on the transmitter PC</li>
                <li>Recording: local or separate worker only</li>
                <li>Server: MediaMTX relay, no live transcoding</li>
              </ul>
            </article>
          </div>

          <div className="streaming-control-column">
            <HlsPlayer src={hlsPlaybackUrl} title={streaming.name} />

            <EndpointCard
              eyebrow="Playback"
              title="HLS viewer URL"
              description="This is the default browser playback path. Keep it on the reverse proxy."
              label="HLS playlist"
              value={hlsPlaybackUrl}
            />

            <article className="status-card streaming-settings-card">
              <span className="status-eyebrow">Optional low latency</span>
              <h2>WebRTC path</h2>
              <p>
                Use this only when latency matters more than simplicity. The MediaMTX node already has
                WebRTC enabled, and the handshake is proxied through Nginx.
              </p>
              <CopyableValue label="WebRTC base URL" value={webRtcUrl} />
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}