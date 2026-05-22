import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

export type PlaybackState = 'connecting' | 'ready' | 'unsupported' | 'error';

export interface UseHlsPlaybackOptions {
  src: string;
  fallbackImageUrl: string | null;
  reloadNonce?: number;
  onStatusChange?: (status: PlaybackState) => void;
  onSignalChange?: (hasSignal: boolean) => void;
}

export interface UseHlsPlaybackResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: PlaybackState;
  statusMessage: string;
  hasLiveSignal: boolean;
  showFallbackImage: boolean;
}

export function useHlsPlayback({
  src,
  fallbackImageUrl,
  reloadNonce = 0,
  onStatusChange,
  onSignalChange,
}: UseHlsPlaybackOptions): UseHlsPlaybackResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<PlaybackState>('connecting');
  const [statusMessage, setStatusMessage] = useState('Connecting to the live HLS playlist.');
  const [hasLiveSignal, setHasLiveSignal] = useState(false);
  const hasLiveSignalRef = useRef(false);
  const playbackUrl =
    reloadNonce > 0 ? `${src}${src.includes('?') ? '&' : '?'}reload=${reloadNonce}` : src;

  function updateLiveSignal(nextValue: boolean): void {
    hasLiveSignalRef.current = nextValue;
    setHasLiveSignal(nextValue);
  }

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  useEffect(() => {
    onSignalChange?.(hasLiveSignal);
  }, [hasLiveSignal, onSignalChange]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    let hls: Hls | null = null;
    let disposed = false;
    let autoplayAttempted = false;
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

    const attemptAutoplay = async (): Promise<void> => {
      if (disposed || autoplayAttempted) {
        return;
      }

      autoplayAttempted = true;
      video.muted = true;

      try {
        await video.play();

        if (!disposed) {
          setStatusMessage('Live signal is playing muted for preview. Use the player controls to enable audio.');
        }
      } catch {
        if (!disposed) {
          setStatusMessage('Live signal is ready. Press play to start the preview.');
        }
      }
    };

    const markReady = (): void => {
      if (disposed) {
        return;
      }

      clearDisconnectTimeout();
      updateLiveSignal(true);
      setStatus('ready');
      setStatusMessage('Live signal is ready. Starting the muted preview.');
      void attemptAutoplay();
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
      markWaiting('Waiting for the transmitter PC to publish the live stream.');
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
        markUnsupported('Native HLS playback failed. Verify that the transmitter is publishing.');
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

  return {
    videoRef,
    status,
    statusMessage,
    hasLiveSignal,
    showFallbackImage,
  };
}
