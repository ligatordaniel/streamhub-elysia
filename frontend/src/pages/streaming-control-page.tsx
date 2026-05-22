import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { runtime } from '../config/runtime';
import {
  getStreamingEmergencyFallback,
  updateStreamingEmergencyFallback,
} from '../streaming/api';
import {
  MAX_EMERGENCY_IMAGES,
  type CompanyEmergencyFallback,
  type EmergencyImage,
} from '../streaming/types';

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

type CopyState = 'idle' | 'copied' | 'error';

function getEmptyEmergencyFallback(): CompanyEmergencyFallback {
  return {
    autoplayEnabled: false,
    selectedImageId: null,
    images: [],
  };
}

function buildEmergencyFallbackHelperMessage(
  selectedImageId: string | null,
  images: EmergencyImage[]
): string {
  if (!selectedImageId) {
    return 'No image selected yet.';
  }

  return `Selected image: ${images.find((image) => image.id === selectedImageId)?.name ?? 'Unknown image'}`;
}

function parseStoredEmergencyFallback(rawValue: string | null): CompanyEmergencyFallback | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as {
      autoplayEnabled?: unknown;
      selectedImageId?: unknown;
      images?: unknown[];
    };

    if (!Array.isArray(parsedValue.images)) {
      return null;
    }

    const images: EmergencyImage[] = [];

    for (const image of parsedValue.images) {
      if (typeof image !== 'object' || image === null) {
        continue;
      }

      const record = image as Record<string, unknown>;
      const id = typeof record.id === 'string' ? record.id.trim() : '';
      const name = typeof record.name === 'string' ? record.name.trim() : '';
      const dataUrl = typeof record.dataUrl === 'string' ? record.dataUrl.trim() : '';

      if (!id || !name || !dataUrl.startsWith('data:image/')) {
        continue;
      }

      images.push({ id, name, dataUrl });

      if (images.length >= MAX_EMERGENCY_IMAGES) {
        break;
      }
    }

    const rawSelectedImageId = typeof parsedValue.selectedImageId === 'string'
      ? parsedValue.selectedImageId.trim()
      : null;
    const selectedImageId =
      rawSelectedImageId && images.some((image) => image.id === rawSelectedImageId)
        ? rawSelectedImageId
        : images[0]?.id ?? null;

    return {
      autoplayEnabled: Boolean(parsedValue.autoplayEnabled),
      selectedImageId,
      images,
    };
  } catch {
    return null;
  }
}

function readLegacyEmergencyFallback(storageKeys: string[]): CompanyEmergencyFallback | null {
  for (const storageKey of storageKeys) {
    const parsedValue = parseStoredEmergencyFallback(window.localStorage.getItem(storageKey));

    if (parsedValue && parsedValue.images.length > 0) {
      return parsedValue;
    }
  }

  return null;
}

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
  isBusy,
  autoplayEnabled,
  images,
  selectedImageId,
  helperMessage,
  onAutoplayChange,
  onImageSelect,
  onSelectImage,
  onRemoveImage,
}: {
  isBusy: boolean;
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
      <h2>Emergency image</h2>
      <p>
        These emergency images are shared across the whole company. If OBS/vMix stops sending video,
        the selected image can stay visible while the live source reconnects.
      </p>

      <label className="streaming-switch-row" htmlFor="emergency-autoplay-switch">
        <span>Autoplay on/off</span>
        <input
          id="emergency-autoplay-switch"
          className="streaming-switch"
          type="checkbox"
          checked={autoplayEnabled}
          disabled={isBusy}
          onChange={(event) => onAutoplayChange(event.target.checked)}
        />
      </label>

      <label className="field">
        <span>Emergency image</span>
        <input
          type="file"
          accept="image/*"
          disabled={isBusy}
          onChange={(event) => {
            const [file] = Array.from(event.target.files ?? []);
            onImageSelect(file ?? null);
            event.currentTarget.value = '';
          }}
        />
      </label>

      <p className="field-hint">{helperMessage}</p>

      <div className="streaming-fallback-gallery-head">
        <span>Saved company images</span>
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
                disabled={isBusy}
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
                  disabled={isBusy}
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
      <div className="streaming-air-head" aria-live="polite">
        <span className="streaming-player-overlay-label">ON AIR</span>
        <span
          className={`streaming-air-pill ${
            hasLiveSignal ? 'streaming-air-pill--connected' : 'streaming-air-pill--disconnected'
          }`}
        >
          {hasLiveSignal ? 'Connected' : 'Disconnected'}
        </span>
      </div>
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
        {hasLiveSignal
          ? 'Live signal connected in the public player.'
          : 'Waiting for the public player signal. Auto retry every 60 seconds.'}
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
  const [fallbackHelperMessage, setFallbackHelperMessage] = useState('Loading company images...');
  const [isFallbackBusy, setIsFallbackBusy] = useState(true);

  if (!session || !streamingId) {
    return <Navigate to="/" replace />;
  }

  const streaming = session.streamings.find((entry) => entry.id === streamingId);

  if (!streaming) {
    return <Navigate to="/" replace />;
  }

  const activeSession = session;
  const activeStreaming = streaming;
  const streamPath = buildStreamPath(activeStreaming.id, activeStreaming.ingestKey);
  const publishKey = buildPublishKey(activeStreaming.id, activeStreaming.ingestKey);
  const rtmpServerUrl = `${runtime.streamingIngestUrl}/${buildPublishServerPath(activeStreaming.id)}`;
  const rtmpIngestUrl = `${rtmpServerUrl}/${publishKey}`;
  const hlsPlaybackUrl = `${runtime.streamingHlsUrl}/${streamPath}/index.m3u8`;
  const webRtcUrl = `${runtime.streamingWebrtcUrl}/${streamPath}`;
  const publicEmbedUrl = `${window.location.origin}/embed/hls/${streamPath}`;
  const fallbackStorageKey = `streamhub:emergency-fallback:path:${streamPath}`;
  const legacyFallbackStorageKey = `streamhub:emergency-fallback:${activeStreaming.id}`;

  function applyFallbackState(nextFallback: CompanyEmergencyFallback): void {
    setAutoplayFallbackEnabled(nextFallback.autoplayEnabled);
    setFallbackImages(nextFallback.images);
    setSelectedFallbackImageId(nextFallback.selectedImageId);
    setFallbackHelperMessage(
      buildEmergencyFallbackHelperMessage(nextFallback.selectedImageId, nextFallback.images),
    );
  }

  useEffect(() => {
    let isDisposed = false;

    async function hydrateFallback(): Promise<void> {
      setIsFallbackBusy(true);

      try {
        const companyFallback = await getStreamingEmergencyFallback(activeSession.token, activeStreaming.id);

        if (isDisposed) {
          return;
        }

        if (companyFallback.images.length === 0) {
          const legacyFallback = readLegacyEmergencyFallback([
            fallbackStorageKey,
            legacyFallbackStorageKey,
          ]);

          if (legacyFallback) {
            try {
              const migratedFallback = await updateStreamingEmergencyFallback(
                activeSession.token,
                activeStreaming.id,
                legacyFallback,
              );

              if (isDisposed) {
                return;
              }

              applyFallbackState(migratedFallback);
              window.localStorage.removeItem(fallbackStorageKey);
              window.localStorage.removeItem(legacyFallbackStorageKey);
              return;
            } catch (error) {
              if (isDisposed) {
                return;
              }

              applyFallbackState(companyFallback);
              setFallbackHelperMessage(
                error instanceof Error
                  ? `Could not migrate previous images: ${error.message}`
                  : 'Could not migrate previous images.',
              );
              return;
            }
          }
        }

        applyFallbackState(companyFallback);
      } catch (error) {
        if (isDisposed) {
          return;
        }

        const emptyFallback = getEmptyEmergencyFallback();
        applyFallbackState(emptyFallback);
        setFallbackHelperMessage(
          error instanceof Error ? error.message : 'Could not load company emergency images.',
        );
      } finally {
        if (!isDisposed) {
          setIsFallbackBusy(false);
        }
      }
    }

    void hydrateFallback();

    return () => {
      isDisposed = true;
    };
  }, [activeSession.token, activeStreaming.id, fallbackStorageKey, legacyFallbackStorageKey]);

  async function persistEmergencyFallback(nextFallback: CompanyEmergencyFallback): Promise<void> {
    setIsFallbackBusy(true);
    setFallbackHelperMessage('Saving company images...');

    try {
      const savedFallback = await updateStreamingEmergencyFallback(
        activeSession.token,
        activeStreaming.id,
        nextFallback,
      );

      applyFallbackState(savedFallback);
      window.localStorage.removeItem(fallbackStorageKey);
      window.localStorage.removeItem(legacyFallbackStorageKey);
    } catch (error) {
      setFallbackHelperMessage(
        error instanceof Error ? error.message : 'Could not save company emergency images.',
      );
    } finally {
      setIsFallbackBusy(false);
    }
  }

  function handleAutoplayFallbackChange(nextValue: boolean): void {
    if (nextValue === autoplayFallbackEnabled) {
      return;
    }

    void persistEmergencyFallback({
      autoplayEnabled: nextValue,
      selectedImageId: selectedFallbackImageId,
      images: fallbackImages,
    });
  }

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

      await persistEmergencyFallback({
        autoplayEnabled: autoplayFallbackEnabled,
        selectedImageId: newImage.id,
        images: [...fallbackImages, newImage],
      });
    } catch {
      setFallbackHelperMessage('Could not load this image. Try another file.');
    }
  }

  function handleSelectFallbackImage(imageId: string): void {
    if (imageId === selectedFallbackImageId) {
      return;
    }

    void persistEmergencyFallback({
      autoplayEnabled: autoplayFallbackEnabled,
      selectedImageId: imageId,
      images: fallbackImages,
    });
  }

  function handleRemoveFallbackImage(imageId: string): void {
    const nextImages = fallbackImages.filter((image) => image.id !== imageId);

    let nextSelectedId = selectedFallbackImageId;

    if (nextSelectedId === imageId || !nextImages.some((image) => image.id === nextSelectedId)) {
      nextSelectedId = nextImages[0]?.id ?? null;
    }

    void persistEmergencyFallback({
      autoplayEnabled: autoplayFallbackEnabled,
      selectedImageId: nextSelectedId,
      images: nextImages,
    });
  }

  return (
    <main className="dashboard-page w-full">
      <section className="dashboard-shell w-full">
        <header className="dashboard-topbar">
          <div>
            <span className="status-eyebrow">Streaming control</span>
            <h1>{activeStreaming.name}</h1>
            <p>{getStreamingSummary(activeStreaming.type, activeSession.company.name, activeStreaming.id)}</p>
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
              isBusy={isFallbackBusy}
              autoplayEnabled={autoplayFallbackEnabled}
              images={fallbackImages}
              selectedImageId={selectedFallbackImageId}
              helperMessage={fallbackHelperMessage}
              onAutoplayChange={handleAutoplayFallbackChange}
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
