import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { runtime } from '../config/runtime';

function getStreamingSummary(type: string, companyName: string, streamingId: string): string {
  return `${type} · ${companyName} · ${streamingId}`;
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

function buildPublishServerPath(streamingId: string): string {
  return `live/${buildStreamingAlias(streamingId)}`;
}

function buildStreamPath(streamingId: string, ingestKey: string): string {
  return `${buildPublishServerPath(streamingId)}/${buildPublishKey(streamingId, ingestKey)}`;
}

type EmergencyImage = {
  id: string;
  name: string;
  dataUrl: string;
};

type EmergencyFallbackStorage = {
  autoplayEnabled: boolean;
  selectedImageId: string | null;
  images: EmergencyImage[];
};

type CopyState = 'idle' | 'copied' | 'error';

const MAX_EMERGENCY_IMAGES = 10;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result !== 'string') {
        reject(new Error('Failed to load image'));
        return;
      }

      resolve(result);
    };

    reader.onerror = () => {
      reject(new Error('Failed to read image file'));
    };

    reader.readAsDataURL(file);
  });
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

function PublicEmbedCard({ embedUrl }: { embedUrl: string }): JSX.Element {
  return (
    <article className="status-card streaming-endpoint-card streaming-embed-card">
      <span className="status-eyebrow">Public embed</span>
      <h2>Iframe player URL</h2>
      <p>
        Use this URL for external websites, mobile browsers, and apps. Open it directly or load it inside
        an iframe.
      </p>
      <CopyableValue label="Embed page URL" value={embedUrl} />
      <a
        href={embedUrl}
        target="_blank"
        rel="noreferrer"
        className="streaming-embed-link"
        aria-label="Open public embed player in a new tab"
      >
        Open iframe page
      </a>
    </article>
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
      <h2>OBS / vMix publish settings</h2>
      <p className="streaming-publish-lead">
        These shorter publish values keep OBS setup cleaner while preserving the same live path.
      </p>
      <div className="streaming-publish-list" role="list">
        <div className="streaming-publish-row" role="listitem">
          <CopyableValue label="RTMP server URL" value={serverUrl} />
        </div>
        <div className="streaming-publish-row" role="listitem">
          <CopyableValue label="Publish key" value={streamKey} />
        </div>
        <div className="streaming-publish-row" role="listitem">
          <CopyableValue label="Combined ingest URL" value={ingestUrl} />
        </div>
      </div>
    </article>
  );
}

function EmergencyFallbackCard({
  isConnected,
  autoplayEnabled,
  images,
  selectedImageId,
  helperMessage,
  onAutoplayChange,
  onImageSelect,
  onSelectImage,
  onRemoveImage,
}: {
  isConnected: boolean;
  autoplayEnabled: boolean;
  images: EmergencyImage[];
  selectedImageId: string | null;
  helperMessage: string;
  onAutoplayChange: (nextValue: boolean) => void;
  onImageSelect: (file: File | null) => void;
  onSelectImage: (imageId: string) => void;
  onRemoveImage: (imageId: string) => void;
}): JSX.Element {
  return (
    <article className="status-card streaming-emergency-card">
      <span className="status-eyebrow">Emergency fallback</span>
      <div className="streaming-air-head">
        <h2>ON AIR</h2>
        <span
          className={`streaming-air-pill ${
            isConnected ? 'streaming-air-pill--connected' : 'streaming-air-pill--disconnected'
          }`}
        >
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      <p>
        If OBS/vMix stops sending video, this fallback can keep a static emergency image visible in the
        preview while the live source reconnects.
      </p>

      <label className="streaming-switch-row" htmlFor="emergency-autoplay-switch">
        <span>Autoplay on/off</span>
        <input
          id="emergency-autoplay-switch"
          className="streaming-switch"
          type="checkbox"
          checked={autoplayEnabled}
          onChange={(event) => onAutoplayChange(event.target.checked)}
        />
      </label>

      <label className="field">
        <span>Emergency image</span>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            const [file] = Array.from(event.target.files ?? []);
            onImageSelect(file ?? null);
            event.currentTarget.value = '';
          }}
        />
      </label>

      <p className="field-hint">{helperMessage}</p>

      <div className="streaming-fallback-gallery-head">
        <span>Saved images</span>
        <span>{images.length}/{MAX_EMERGENCY_IMAGES}</span>
      </div>

      <div className="streaming-fallback-gallery" role="list">
        {images.map((image) => {
          const isSelected = image.id === selectedImageId;

          return (
            <div
              key={image.id}
              className={`streaming-fallback-thumb ${isSelected ? 'streaming-fallback-thumb--selected' : ''}`}
              role="listitem"
            >
              <button
                type="button"
                className="streaming-fallback-select"
                onClick={() => onSelectImage(image.id)}
                aria-pressed={isSelected}
              >
                <img src={image.dataUrl} alt={image.name} />
                <span className="streaming-fallback-tick">{isSelected ? 'Ticked' : 'Use'}</span>
              </button>
              <div className="streaming-fallback-meta">
                <span>{image.name}</span>
                <button
                  type="button"
                  className="secondary-button streaming-inline-button"
                  onClick={() => onRemoveImage(image.id)}
                  aria-label={`Remove ${image.name}`}
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function HlsPlayer({
  embedUrl,
  onSignalChange,
}: {
  embedUrl: string;
  onSignalChange?: (hasSignal: boolean) => void;
}): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [hasLiveSignal, setHasLiveSignal] = useState(false);
  const frameUrl =
    reloadVersion > 0 ? `${embedUrl}${embedUrl.includes('?') ? '&' : '?'}reload=${reloadVersion}` : embedUrl;

  function handleReload(): void {
    setHasLiveSignal(false);
    onSignalChange?.(false);
    setReloadVersion((currentVersion) => currentVersion + 1);
  }

  useEffect(() => {
    onSignalChange?.(hasLiveSignal);
  }, [hasLiveSignal, onSignalChange]);

  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      const iframeWindow = iframeRef.current?.contentWindow;

      if (!iframeWindow || event.source !== iframeWindow) {
        return;
      }

      if (event.origin !== window.location.origin) {
        return;
      }

      const data = event.data as { source?: string; hasLiveSignal?: boolean } | undefined;

      if (!data || data.source !== 'streamhub-public-player') {
        return;
      }

      setHasLiveSignal(Boolean(data.hasLiveSignal));
    }

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  return (
    <article className="status-card streaming-player-card">
      <div className="streaming-player-head">
        <div className="streaming-player-head-copy">
          <span className="status-eyebrow">Playback preview</span>
          <h2>Live HLS player</h2>
        </div>
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
      </div>
      <p>
        This preview uses the same public embed player that already works outside the dashboard. Reload only
        refreshes the preview iframe.
      </p>
      <div className={`streaming-player-shell streaming-player-shell--${hasLiveSignal ? 'ready' : 'connecting'}`}>
        <iframe
          ref={iframeRef}
          className="streaming-preview-frame"
          src={frameUrl}
          title="Public HLS playback preview"
          loading="lazy"
          allow="autoplay; fullscreen; picture-in-picture"
          referrerPolicy="no-referrer"
        />
      </div>
      <p className="streaming-player-status">
        {hasLiveSignal ? 'Live signal connected in the public player.' : 'Waiting for the public player signal.'}
      </p>
    </article>
  );
}

export function StreamingControlPage(): JSX.Element {
  const navigate = useNavigate();
  const { streamingId } = useParams();
  const { session } = useAuth();
  const [hasLiveSignal, setHasLiveSignal] = useState(false);
  const [autoplayFallbackEnabled, setAutoplayFallbackEnabled] = useState(false);
  const [fallbackImages, setFallbackImages] = useState<EmergencyImage[]>([]);
  const [selectedFallbackImageId, setSelectedFallbackImageId] = useState<string | null>(null);
  const [fallbackHelperMessage, setFallbackHelperMessage] = useState('No image selected yet.');
  const [hasHydratedFallback, setHasHydratedFallback] = useState(false);

  if (!session || !streamingId) {
    return <Navigate to="/" replace />;
  }

  const streaming = session.streamings.find((entry) => entry.id === streamingId);

  if (!streaming) {
    return <Navigate to="/" replace />;
  }

  const streamPath = buildStreamPath(streaming.id, streaming.ingestKey);
  const publishKey = buildPublishKey(streaming.id, streaming.ingestKey);
  const rtmpServerUrl = `${runtime.streamingIngestUrl}/${buildPublishServerPath(streaming.id)}`;
  const rtmpIngestUrl = `${rtmpServerUrl}/${publishKey}`;
  const hlsPlaybackUrl = `${runtime.streamingHlsUrl}/${streamPath}/index.m3u8`;
  const webRtcUrl = `${runtime.streamingWebrtcUrl}/${streamPath}`;
  const publicEmbedUrl = `${window.location.origin}/embed/hls/${streamPath}`;
  const fallbackStorageKey = `streamhub:emergency-fallback:path:${streamPath}`;
  const legacyFallbackStorageKey = `streamhub:emergency-fallback:${streaming.id}`;

  useEffect(() => {
    setHasHydratedFallback(false);

    const rawValue = localStorage.getItem(fallbackStorageKey) ?? localStorage.getItem(legacyFallbackStorageKey);

    if (!rawValue) {
      setAutoplayFallbackEnabled(false);
      setFallbackImages([]);
      setSelectedFallbackImageId(null);
      setFallbackHelperMessage('No image selected yet.');
      setHasHydratedFallback(true);
      return;
    }

    try {
      const parsedValue = JSON.parse(rawValue) as EmergencyFallbackStorage;
      const safeImages = Array.isArray(parsedValue.images) ? parsedValue.images.slice(0, MAX_EMERGENCY_IMAGES) : [];
      const safeSelectedId = safeImages.some((image) => image.id === parsedValue.selectedImageId)
        ? parsedValue.selectedImageId
        : safeImages[0]?.id ?? null;

      setAutoplayFallbackEnabled(Boolean(parsedValue.autoplayEnabled));
      setFallbackImages(safeImages);
      setSelectedFallbackImageId(safeSelectedId);
      setFallbackHelperMessage(
        safeSelectedId
          ? `Selected image: ${safeImages.find((image) => image.id === safeSelectedId)?.name ?? 'Unknown image'}`
          : 'No image selected yet.',
      );
    } catch {
      setAutoplayFallbackEnabled(false);
      setFallbackImages([]);
      setSelectedFallbackImageId(null);
      setFallbackHelperMessage('No image selected yet.');
    }

    setHasHydratedFallback(true);
  }, [fallbackStorageKey, legacyFallbackStorageKey]);

  useEffect(() => {
    if (!hasHydratedFallback) {
      return;
    }

    const payload: EmergencyFallbackStorage = {
      autoplayEnabled: autoplayFallbackEnabled,
      selectedImageId: selectedFallbackImageId,
      images: fallbackImages,
    };

    localStorage.setItem(fallbackStorageKey, JSON.stringify(payload));
  }, [autoplayFallbackEnabled, fallbackImages, fallbackStorageKey, hasHydratedFallback, selectedFallbackImageId]);

  async function handleEmergencyImageSelection(file: File | null): Promise<void> {
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setFallbackHelperMessage('Only image files are allowed.');
      return;
    }

    if (fallbackImages.length >= MAX_EMERGENCY_IMAGES) {
      setFallbackHelperMessage('Maximum reached. Remove one image before uploading a new one.');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const newImage: EmergencyImage = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        name: file.name,
        dataUrl,
      };

      setFallbackImages((previous) => [...previous, newImage]);
      setSelectedFallbackImageId(newImage.id);
      setFallbackHelperMessage(`Selected image: ${newImage.name}`);
    } catch {
      setFallbackHelperMessage('Could not load this image. Try another file.');
    }
  }

  function handleSelectFallbackImage(imageId: string): void {
    const selectedImage = fallbackImages.find((image) => image.id === imageId);
    setSelectedFallbackImageId(imageId);
    setFallbackHelperMessage(
      selectedImage ? `Selected image: ${selectedImage.name}` : 'No image selected yet.',
    );
  }

  function handleRemoveFallbackImage(imageId: string): void {
    setFallbackImages((previous) => {
      const nextImages = previous.filter((image) => image.id !== imageId);

      let nextSelectedId = selectedFallbackImageId;

      if (nextSelectedId === imageId || !nextImages.some((image) => image.id === nextSelectedId)) {
        nextSelectedId = nextImages[0]?.id ?? null;
      }

      const nextSelectedImage = nextImages.find((image) => image.id === nextSelectedId);

      setSelectedFallbackImageId(nextSelectedId);
      setFallbackHelperMessage(
        nextSelectedImage ? `Selected image: ${nextSelectedImage.name}` : 'No image selected yet.',
      );

      return nextImages;
    });
  }

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
            <PublishSettingsCard serverUrl={rtmpServerUrl} streamKey={publishKey} ingestUrl={rtmpIngestUrl} />

            <EndpointCard
              eyebrow="Playback"
              title="HLS viewer URL"
              description="This is the default browser playback path. Keep it on the reverse proxy."
              label="HLS playlist"
              value={hlsPlaybackUrl}
            />

            <PublicEmbedCard embedUrl={publicEmbedUrl} />

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

          <div className="streaming-control-column">
            <HlsPlayer embedUrl={publicEmbedUrl} onSignalChange={setHasLiveSignal} />

            <EmergencyFallbackCard
              isConnected={hasLiveSignal}
              autoplayEnabled={autoplayFallbackEnabled}
              images={fallbackImages}
              selectedImageId={selectedFallbackImageId}
              helperMessage={fallbackHelperMessage}
              onAutoplayChange={setAutoplayFallbackEnabled}
              onImageSelect={(file) => {
                void handleEmergencyImageSelection(file);
              }}
              onSelectImage={handleSelectFallbackImage}
              onRemoveImage={handleRemoveFallbackImage}
            />
          </div>
        </section>
      </section>
    </main>
  );
}
