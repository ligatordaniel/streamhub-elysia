import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { useParams } from 'react-router-dom';

import { runtime } from '../config/runtime';

type PlaybackState = 'connecting' | 'ready' | 'unsupported' | 'error';

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

function buildFallbackStorageKey(streamPath: string): string {
  return `streamhub:emergency-fallback:path:${streamPath}`;
}

export function PublicHlsPlayerPage(): JSX.Element {
  const { streamingAlias, publishKey } = useParams();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<PlaybackState>('connecting');
  const [statusMessage, setStatusMessage] = useState('Connecting to the live HLS playlist.');
  const [fallbackImageUrl, setFallbackImageUrl] = useState<string | null>(null);

  if (!streamingAlias || !publishKey) {
    return (
      <main className="dashboard-page w-full public-player-page">
        <section className="dashboard-shell w-full public-player-shell">
          <article className="status-card streaming-player-card">
            <span className="status-eyebrow">Public player</span>
            <h1>Invalid stream path</h1>
            <p>This embed URL is missing the stream alias or publish key.</p>
          </article>
        </section>
      </main>
    );
  }

  const streamPath = `live/${streamingAlias}/${publishKey}`;
  const playbackUrl = `${runtime.streamingHlsUrl}/${streamPath}/index.m3u8`;

  useEffect(() => {
    const storageKey = buildFallbackStorageKey(streamPath);

    const hydrateFallbackImage = (): void => {
      const rawValue = localStorage.getItem(storageKey);

      if (!rawValue) {
        setFallbackImageUrl(null);
        return;
      }

      try {
        const parsedValue = JSON.parse(rawValue) as EmergencyFallbackStorage;

        if (!parsedValue.autoplayEnabled || !parsedValue.selectedImageId) {
          setFallbackImageUrl(null);
          return;
        }

        const selectedImage = parsedValue.images.find((image) => image.id === parsedValue.selectedImageId);
        setFallbackImageUrl(selectedImage?.dataUrl ?? null);
      } catch {
        setFallbackImageUrl(null);
      }
    };

    hydrateFallbackImage();

    const handleStorageChange = (event: StorageEvent): void => {
      if (event.key !== storageKey) {
        return;
      }

      hydrateFallbackImage();
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [streamPath]);

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
      setStatusMessage('Live signal connected.');
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
        markUnsupported('Native HLS playback failed.');
      };

      video.src = playbackUrl;
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
        hls?.loadSource(playbackUrl);
      }
    });
    hls.on(Hls.Events.MANIFEST_PARSED, markReady);
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (disposed) {
        return;
      }

      if (!data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          markWaiting('Waiting for live signal.');
        }

        return;
      }

      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        markWaiting('Waiting for live signal.');
        hls?.startLoad();
        return;
      }

      markUnsupported('Playback stopped due to a fatal stream error.');
    });

    return () => {
      disposed = true;
      hls?.destroy();
      resetVideo();
    };
  }, [playbackUrl]);

  const showFallbackImage = status !== 'ready' && Boolean(fallbackImageUrl);

  return (
    <main className="dashboard-page w-full public-player-page">
      <section className="dashboard-shell w-full public-player-shell">
        <article className="status-card streaming-player-card public-player-card">
          <span className="status-eyebrow">Public player</span>
          <div className={`streaming-player-shell streaming-player-shell--${status}`}>
            <video
              ref={videoRef}
              className={`streaming-player ${showFallbackImage ? 'streaming-player--hidden' : ''}`}
              autoPlay
              controls
              muted
              playsInline
              preload="metadata"
              aria-label="Public HLS playback"
            />
            {showFallbackImage ? (
              <div className="streaming-player-fallback">
                <img src={fallbackImageUrl ?? ''} alt="Emergency fallback" className="streaming-player-fallback-image" />
                <span className="streaming-player-fallback-badge">Emergency image</span>
              </div>
            ) : null}
          </div>
          <p className="streaming-player-status">{statusMessage}</p>
        </article>
      </section>
    </main>
  );
}
