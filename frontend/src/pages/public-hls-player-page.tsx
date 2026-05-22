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
  const searchParams = new URLSearchParams(window.location.search);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<PlaybackState>('connecting');
  const [statusMessage, setStatusMessage] = useState('Connecting to the live HLS playlist.');
  const [fallbackImageUrl, setFallbackImageUrl] = useState<string | null>(null);
  const [hasLiveSignal, setHasLiveSignal] = useState(false);
  const hasLiveSignalRef = useRef(false);
  const isChromeless = searchParams.get('chrome') !== '1';
  const fitMode = searchParams.get('fit') === 'cover' ? 'cover' : 'contain';
  const showStatusText = !isChromeless || searchParams.get('status') === '1';

  useEffect(() => {
    document.documentElement.classList.toggle('public-player-root--chromeless', isChromeless);
    document.body.classList.toggle('public-player-body--chromeless', isChromeless);

    return () => {
      document.documentElement.classList.remove('public-player-root--chromeless');
      document.body.classList.remove('public-player-body--chromeless');
    };
  }, [isChromeless]);

  function updateLiveSignal(nextValue: boolean): void {
    hasLiveSignalRef.current = nextValue;
    setHasLiveSignal(nextValue);
  }

  function renderPlayerShell(): JSX.Element {
    return (
      <div
        className={`streaming-player-shell streaming-player-shell--${status} ${
          isChromeless && !showStatusText ? 'streaming-player-shell--chromeless' : ''
        }`}
      >
        <video
          ref={videoRef}
          className={`streaming-player public-player-media public-player-media--${fitMode} ${showFallbackImage ? 'streaming-player--hidden' : ''}`}
          autoPlay
          controls
          muted
          playsInline
          preload="metadata"
          aria-label="Public HLS playback"
        />
        {showFallbackImage ? (
          <div className="streaming-player-fallback">
            <img
              src={fallbackImageUrl ?? ''}
              alt="Emergency fallback"
              className={`streaming-player-fallback-image public-player-media public-player-media--${fitMode}`}
            />
            <span className="streaming-player-fallback-badge">Emergency image</span>
          </div>
        ) : null}
      </div>
    );
  }

  if (!streamingAlias || !publishKey) {
    if (isChromeless) {
      return (
        <div className="public-player-empty">
          <p>This embed URL is missing the stream alias or publish key.</p>
        </div>
      );
    }

    return (
      <main className="dashboard-page w-full public-player-page">
        <section className="dashboard-shell w-full public-player-shell">
          <article className="status-card streaming-player-card public-player-card">
            <span className="status-eyebrow">Public player</span>
            <h1>Invalid stream path</h1>
            <p>This embed URL is missing the stream alias or publish key.</p>
          </article>
        </section>
      </main>
    );
  }

  const streamPath = `live/${streamingAlias}/${publishKey}`;
  const playbackUrl = `${runtime.streamingHlsUrl}/${streamPath}/index.m3u8?cookieCheck=1`;

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
    if (window.parent === window) {
      return;
    }

    window.parent.postMessage(
      {
        source: 'streamhub-public-player',
        hasLiveSignal,
      },
      '*',
    );
  }, [hasLiveSignal]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    let hls: Hls | null = null;
    let disposed = false;
    let disconnectTimeoutId: number | null = null;

    const clearDisconnectTimeout = (): void => {
      if (disconnectTimeoutId !== null) {
        window.clearTimeout(disconnectTimeoutId);
        disconnectTimeoutId = null;
      }
    };

    const scheduleDisconnect = (message: string): void => {
      clearDisconnectTimeout();
      disconnectTimeoutId = window.setTimeout(() => {
        if (disposed) {
          return;
        }

        updateLiveSignal(false);
        setStatus('connecting');
        setStatusMessage(message);
      }, 2500);
    };

    const resetVideo = (): void => {
      clearDisconnectTimeout();
      updateLiveSignal(false);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };

    const markReady = (): void => {
      if (disposed) {
        return;
      }

      clearDisconnectTimeout();
      updateLiveSignal(true);
      setStatus('ready');
      setStatusMessage('Live signal connected.');
    };

    const markWaiting = (message: string): void => {
      if (disposed) {
        return;
      }

      if (!hasLiveSignalRef.current) {
        setStatus('connecting');
        setStatusMessage(message);
        return;
      }

      scheduleDisconnect(message);
    };

    const markUnsupported = (message: string): void => {
      if (disposed) {
        return;
      }

      updateLiveSignal(false);
      setStatus('unsupported');
      setStatusMessage(message);
    };

    const handlePlayableSignal = (): void => {
      markReady();
    };

    const handleVideoEmptied = (): void => {
      if (!disposed) {
        clearDisconnectTimeout();
        updateLiveSignal(false);
      }
    };

    const handleVideoStalled = (): void => {
      markWaiting('Waiting for live signal.');
    };

    setStatus('connecting');
    setStatusMessage('Connecting to the live HLS playlist.');
    resetVideo();

    video.addEventListener('playing', handlePlayableSignal);
    video.addEventListener('canplay', handlePlayableSignal);
    video.addEventListener('loadeddata', handlePlayableSignal);
    video.addEventListener('timeupdate', handlePlayableSignal);
    video.addEventListener('emptied', handleVideoEmptied);
    video.addEventListener('stalled', handleVideoStalled);

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
        video.removeEventListener('playing', handlePlayableSignal);
        video.removeEventListener('canplay', handlePlayableSignal);
        video.removeEventListener('loadeddata', handlePlayableSignal);
        video.removeEventListener('timeupdate', handlePlayableSignal);
        video.removeEventListener('emptied', handleVideoEmptied);
        video.removeEventListener('stalled', handleVideoStalled);
        video.removeEventListener('error', handleError);
        clearDisconnectTimeout();
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
      video.removeEventListener('playing', handlePlayableSignal);
      video.removeEventListener('canplay', handlePlayableSignal);
      video.removeEventListener('loadeddata', handlePlayableSignal);
      video.removeEventListener('timeupdate', handlePlayableSignal);
      video.removeEventListener('emptied', handleVideoEmptied);
      video.removeEventListener('stalled', handleVideoStalled);
      clearDisconnectTimeout();
      hls?.destroy();
      resetVideo();
    };
  }, [playbackUrl]);

  const showFallbackImage = !hasLiveSignal && Boolean(fallbackImageUrl);

  if (isChromeless && !showStatusText) {
    return renderPlayerShell();
  }

  return (
    <main className={`dashboard-page w-full public-player-page ${isChromeless ? 'public-player-page--chromeless' : ''}`}>
      <section className={`dashboard-shell w-full public-player-shell ${isChromeless ? 'public-player-shell--chromeless' : ''}`}>
        <article className={`status-card streaming-player-card public-player-card ${isChromeless ? 'public-player-card--chromeless' : ''}`}>
          {isChromeless ? null : <span className="status-eyebrow">Public player</span>}
          {renderPlayerShell()}
          {showStatusText ? <p className="streaming-player-status">{statusMessage}</p> : null}
        </article>
      </section>
    </main>
  );
}
