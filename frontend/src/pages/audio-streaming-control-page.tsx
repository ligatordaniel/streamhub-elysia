import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

import { runtime } from '../config/runtime';

type CopyState = 'idle' | 'copied' | 'error';
type AudioPreviewState = 'connecting' | 'ready' | 'fallback' | 'error';
type SourceSignalState = 'checking' | 'live' | 'offline';

function SourceStatusBadge({ statusUrl, icecastMount }: { statusUrl: string; icecastMount: string }): JSX.Element {
  const [signal, setSignal] = useState<SourceSignalState>('checking');

  useEffect(() => {
    let canceled = false;

    async function poll(): Promise<void> {
      try {
        const res = await fetch(statusUrl, { cache: 'no-store' });
        if (!res.ok) {
          if (!canceled) setSignal('offline');
          return;
        }
        const data = (await res.json()) as { icestats?: { source?: unknown } };
        const raw = data?.icestats?.source;
        const sources: unknown[] = raw === null || raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
        const isLive = sources.some((s) => {
          if (s === null || typeof s !== 'object') return false;
          const src = s as { mount?: unknown; listenurl?: unknown };
          if (typeof src.mount === 'string') return src.mount === icecastMount;
          if (typeof src.listenurl === 'string') {
            try { return new URL(src.listenurl).pathname === icecastMount; } catch { return false; }
          }
          return false;
        });
        if (!canceled) setSignal(isLive ? 'live' : 'offline');
      } catch {
        if (!canceled) setSignal('offline');
      }
    }

    void poll();
    const id = window.setInterval(() => void poll(), 5000);
    return () => {
      canceled = true;
      window.clearInterval(id);
    };
  }, [statusUrl, icecastMount]);

  const dotClass =
    signal === 'live' ? 'source-dot source-dot--live' : signal === 'checking' ? 'source-dot source-dot--checking' : 'source-dot source-dot--offline';
  const label = signal === 'live' ? 'On air' : signal === 'checking' ? 'Checking…' : 'No signal';

  return (
    <div className="source-status-badge" aria-live="polite" aria-label={`Source signal: ${label}`}>
      <span className={dotClass} aria-hidden="true" />
      <span className="source-status-label">{label}</span>
    </div>
  );
}

function hashOpaqueToken(value: string): string {
  let firstHash = 0x811c9dc5;
  let secondHash = 0x9e3779b9;

  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);

    firstHash ^= codePoint;
    firstHash = Math.imul(firstHash, 0x01000193);
    secondHash ^= codePoint;
    secondHash = Math.imul(secondHash, 0x85ebca6b);
  }

  return `${(firstHash >>> 0).toString(16).padStart(8, '0')}${(secondHash >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}

function buildStreamingAlias(streamingId: string): string {
  return hashOpaqueToken(`streaming:${streamingId}`);
}

function buildPublishKey(streamingId: string, ingestKey: string): string {
  return hashOpaqueToken(`publish:${streamingId}:${ingestKey}`);
}

function encodeBase62FromHex(hexValue: string, minimumLength = 12): string {
  const opaqueAlphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const paddingCharacter = opaqueAlphabet.charAt(0);
  const base = BigInt(opaqueAlphabet.length);
  let numericValue = BigInt(`0x${hexValue}`);
  let encodedValue = '';

  if (numericValue === 0n) {
    return paddingCharacter.repeat(minimumLength);
  }

  while (numericValue > 0n) {
    encodedValue = opaqueAlphabet[Number(numericValue % base)] + encodedValue;
    numericValue /= base;
  }

  return encodedValue.padStart(minimumLength, paddingCharacter).slice(-minimumLength);
}

function buildPublishMountToken(streamingId: string, ingestKey: string): string {
  return encodeBase62FromHex(hashOpaqueToken(`mount:${streamingId}:${ingestKey}`), 12);
}

function getStreamingSummary(companyName: string, streamingId: string): string {
  return `audio · ${companyName} · ${streamingId}`;
}

function getAudioBaseUrl(): string {
  return runtime.audioPublicUrl.replace(/\/$/, '');
}

function getAudioLiveHost(): string {
  try {
    return new URL(getAudioBaseUrl()).hostname;
  } catch {
    return window.location.hostname || 'localhost';
  }
}

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

function AudioPreviewCard({
  hlsUrl,
  mp3Url,
  statusUrl,
  icecastMount,
}: {
  hlsUrl: string;
  mp3Url: string;
  statusUrl: string;
  icecastMount: string;
}): JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<AudioPreviewState>('connecting');
  const [statusMessage, setStatusMessage] = useState('Connecting to the audio HLS playlist.');
  const [reloadVersion, setReloadVersion] = useState(0);

  const playbackHlsUrl =
    reloadVersion > 0 ? `${hlsUrl}${hlsUrl.includes('?') ? '&' : '?'}reload=${reloadVersion}` : hlsUrl;
  const playbackMp3Url =
    reloadVersion > 0 ? `${mp3Url}${mp3Url.includes('?') ? '&' : '?'}reload=${reloadVersion}` : mp3Url;

  function handleReload(): void {
    setStatus('connecting');
    setStatusMessage('Reconnecting to the audio HLS playlist.');
    setReloadVersion((currentValue) => currentValue + 1);
  }

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    let disposed = false;
    let hls: Hls | null = null;
    let fallbackActivated = false;
    let fallbackTimeoutId: number | null = null;

    const resetAudio = (): void => {
      if (fallbackTimeoutId !== null) {
        window.clearTimeout(fallbackTimeoutId);
        fallbackTimeoutId = null;
      }

      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };

    const setMp3Fallback = (message: string): void => {
      if (disposed) {
        return;
      }

      fallbackActivated = true;
      if (fallbackTimeoutId !== null) {
        window.clearTimeout(fallbackTimeoutId);
        fallbackTimeoutId = null;
      }

      hls?.destroy();
      hls = null;
      audio.src = playbackMp3Url;
      audio.load();
      setStatus('fallback');
      setStatusMessage(message);
    };

    const handleReady = (): void => {
      if (disposed) {
        return;
      }

      if (fallbackTimeoutId !== null) {
        window.clearTimeout(fallbackTimeoutId);
        fallbackTimeoutId = null;
      }

      setStatus('ready');
      setStatusMessage('Audio HLS is ready. Use play to listen.');
    };

    const handleError = (): void => {
      if (disposed) {
        return;
      }

      if (!fallbackActivated) {
        setMp3Fallback('Audio HLS failed to start. Using the direct MP3 fallback preview.');
        return;
      }

      setStatus('error');
      setStatusMessage('Audio playback failed even on the direct MP3 fallback URL.');
    };

    setStatus('connecting');
    setStatusMessage('Connecting to the audio HLS playlist.');
    resetAudio();

    audio.addEventListener('canplay', handleReady);
    audio.addEventListener('loadedmetadata', handleReady);
    audio.addEventListener('error', handleError);

    fallbackTimeoutId = window.setTimeout(() => {
      if (disposed || fallbackActivated) {
        return;
      }

      setMp3Fallback('Audio HLS is taking too long. Using the direct MP3 fallback preview.');
    }, 8000);

    if (audio.canPlayType('application/vnd.apple.mpegurl')) {
      audio.src = playbackHlsUrl;
      audio.load();

      return () => {
        disposed = true;
        audio.removeEventListener('canplay', handleReady);
        audio.removeEventListener('loadedmetadata', handleReady);
        audio.removeEventListener('error', handleError);
        resetAudio();
      };
    }

    if (!Hls.isSupported()) {
      setMp3Fallback('This browser does not support HLS here. Using the MP3 fallback preview.');

      return () => {
        disposed = true;
        audio.removeEventListener('canplay', handleReady);
        audio.removeEventListener('loadedmetadata', handleReady);
        audio.removeEventListener('error', handleError);
        resetAudio();
      };
    }

    hls = new Hls({
      lowLatencyMode: true,
      backBufferLength: 30,
    });

    hls.attachMedia(audio);
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      if (!disposed) {
        hls?.loadSource(hlsUrl);
      }
    });
    hls.on(Hls.Events.MANIFEST_PARSED, handleReady);
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (disposed || !data.fatal) {
        return;
      }

      setMp3Fallback('Audio HLS failed in this browser. Using the direct MP3 fallback preview.');
    });

    return () => {
      disposed = true;
      audio.removeEventListener('canplay', handleReady);
      audio.removeEventListener('loadedmetadata', handleReady);
      audio.removeEventListener('error', handleError);
      hls?.destroy();
      resetAudio();
    };
  }, [playbackHlsUrl, playbackMp3Url]);

  return (
    <article className="status-card streaming-endpoint-card">
      <div className="streaming-player-head">
        <div className="streaming-player-head-copy">
          <span className="status-eyebrow">Preview</span>
          <h2>Audio HLS player</h2>
        </div>
        <div className="streaming-player-controls">
          <button className="streaming-reload-button" type="button" onClick={handleReload}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M20 12a8 8 0 1 1-2.34-5.66M20 4v6h-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Reload
          </button>
          <SourceStatusBadge statusUrl={statusUrl} icecastMount={icecastMount} />
        </div>
      </div>
      <p>
        This preview uses HLS first for the browser path. If HLS is not available in this browser, it falls back
        to the MP3 mount. If you start the source after opening this page, use Reload instead of refreshing the
        whole dashboard.
      </p>
      <audio ref={audioRef} className="w-full" controls preload="none" />
      <p className="field-hint">{statusMessage}</p>
      {status === 'fallback' ? <CopyableValue label="Preview fallback URL" value={playbackMp3Url} /> : null}
    </article>
  );
}

export function AudioStreamingControlPage({
  companyName,
  ingestKey,
  streamingId,
  streamingName,
  onBack,
}: {
  companyName: string;
  ingestKey: string;
  streamingId: string;
  streamingName: string;
  onBack: () => void;
}): JSX.Element {
  const audioBaseUrl = getAudioBaseUrl();
  const streamingAlias = buildStreamingAlias(streamingId);
  const publishKey = buildPublishKey(streamingId, ingestKey);
  const routeBase = `${streamingAlias}/${publishKey}`;
  const publishMountToken = buildPublishMountToken(streamingId, ingestKey);
  const statusUrl = `${audioBaseUrl}/status`;
  const healthUrl = `${audioBaseUrl}/healthz`;
  const hlsUrl = `${audioBaseUrl}/hls/${routeBase}/live.m3u8`;
  const aacUrl = `${audioBaseUrl}/listen/${routeBase}/radio.aac`;
  const mp3Url = `${audioBaseUrl}/listen/${routeBase}/radio.mp3`;
  const icecastMount = `/streams/${routeBase}/radio.mp3`;
  const livePublishHost = getAudioLiveHost();
  const livePublishPort = runtime.audioLiveSourcePort;
  const livePublishMount = icecastMount;
  const livePublishPassword = runtime.audioLiveSourcePassword;
  const livePublishUrl = `icecast://source:${livePublishPassword}@${livePublishHost}:${livePublishPort}${livePublishMount}`;

  return (
    <main className="dashboard-page w-full">
      <section className="dashboard-shell w-full">
        <header className="dashboard-topbar">
          <div>
            <span className="status-eyebrow">Audio control</span>
            <h1>{streamingName}</h1>
            <p>{getStreamingSummary(companyName, streamingId)}</p>
          </div>

          <button className="ghost-button" type="button" onClick={onBack}>
            Back to dashboard
          </button>
        </header>

        <section className="dashboard-content streaming-control-grid">
          <div className="streaming-control-column">
            <article className="status-card streaming-endpoint-card">
              <span className="status-eyebrow">Stage 6</span>
              <h2>Live-only per-stream audio pipeline</h2>
              <p>
                Audio streamings now keep their own inner live input, listener mounts, and HLS output while using a
                shorter publish mount for live sources. There is no Auto DJ in this stage.
              </p>
            </article>

            <article className="status-card streaming-endpoint-card streaming-publish-card">
              <h2>Live source publish settings</h2>
              <p className="streaming-publish-lead">
                Use any live source encoder here. When the source connects, Liquidsoap exposes the live audio. When
                it disconnects, the stack goes quiet.
              </p>
              <p className="field-hint">
                In BUTT: set connection type to <strong>Icecast 2</strong> (not Shoutcast). Codec must be{' '}
                <strong>MP3 at 192 kbps, 44.1 kHz, stereo</strong>. OGG is not supported on this path. Port is the
                direct Icecast port, not the listener gateway.
              </p>
              <div className="streaming-publish-list" role="list">
                <div className="streaming-publish-row" role="listitem">
                  <CopyableValue label="Live server host" value={livePublishHost} />
                </div>
                <div className="streaming-publish-row" role="listitem">
                  <CopyableValue label="Live server port" value={livePublishPort} />
                </div>
                <div className="streaming-publish-row" role="listitem">
                  <CopyableValue label="Source username" value="source" />
                </div>
                <div className="streaming-publish-row" role="listitem">
                  <CopyableValue label="Source password" value={livePublishPassword} />
                </div>
                <div className="streaming-publish-row" role="listitem">
                  <CopyableValue label="Mount" value={livePublishMount} />
                </div>
                <div className="streaming-publish-row" role="listitem">
                  <CopyableValue label="Combined live URL" value={livePublishUrl} />
                </div>
              </div>
            </article>

            <EndpointCard
              eyebrow="Default playback"
              title="HLS playlist URL"
              description="Use this as the default browser, iOS, and Android playback path for the shared audio stack."
              label="Audio HLS playlist"
              value={hlsUrl}
            />

            <EndpointCard
              eyebrow="Playback"
              title="Direct AAC listener URL"
              description="Use this for direct AAC clients or diagnostics when you want the raw Icecast mount."
              label="AAC listener"
              value={aacUrl}
            />

            <EndpointCard
              eyebrow="Fallback"
              title="MP3 listener URL"
              description="Use this when you need the broadest client compatibility across old players and apps."
              label="MP3 listener"
              value={mp3Url}
            />
          </div>

          <div className="streaming-control-column">
            <AudioPreviewCard hlsUrl={hlsUrl} mp3Url={mp3Url} statusUrl={statusUrl} icecastMount={icecastMount} />

            <article className="status-card streaming-endpoint-card">
              <span className="status-eyebrow">Ops</span>
              <h2>Health and status</h2>
              <p>
                Use these endpoints to verify the shared audio stack while stage 4 serves HLS and keeps the direct mounts alive.
              </p>
              <CopyableValue label="Audio health URL" value={healthUrl} />
              <CopyableValue label="Icecast status URL" value={statusUrl} />
              <a
                href={statusUrl}
                target="_blank"
                rel="noreferrer"
                className="streaming-embed-link"
                aria-label="Open audio status JSON in a new tab"
              >
                Open status JSON
              </a>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}