import { useCallback, useEffect, useRef, useState } from 'react';

import { NO_SLEEP_MP4, NO_SLEEP_WEBM } from '@/lib/noSleepMedia';

type WakeLockSentinel = any;


const GESTURE_EVENTS: Array<keyof DocumentEventMap> = ['pointerdown', 'touchstart', 'mousedown', 'keydown', 'click'];
const VIDEO_REFRESH_INTERVAL_MS = 15_000;

export function useWakeLock(enabled: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const gestureHandlerRef = useRef<EventListener | null>(null);
  const videoLoopTimerRef = useRef<number | null>(null);
  const [isActive, setIsActive] = useState(false);

  const ensureVideo = useCallback(() => {
    if (videoRef.current) return videoRef.current;
    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('title', 'No Sleep');
    video.muted = true;
    // Vídeo válido (o anterior era um MP4 sem cabeçalho, que nenhum navegador
    // tocava): WebM no Chrome/Android, MP4 no Safari/iPhone
    for (const [type, src] of [['video/webm', NO_SLEEP_WEBM], ['video/mp4', NO_SLEEP_MP4]] as const) {
      const source = document.createElement('source');
      source.type = type;
      source.src = src;
      video.appendChild(source);
    }
    // Como o NoSleep.js: o WebM (curto) roda em loop; o MP4 volta a um ponto
    // aleatório antes do fim, para o iOS não considerar o vídeo parado
    video.addEventListener('loadedmetadata', () => {
      if (video.duration <= 1) {
        video.loop = true;
      } else {
        video.addEventListener('timeupdate', () => {
          if (video.currentTime > 0.5) video.currentTime = Math.random();
        });
      }
    });
    Object.assign(video.style, {
      position: 'fixed',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
      top: '0',
      left: '0'
    });
    document.body.appendChild(video);
    videoRef.current = video;
    return video;
  }, []);

  const clearGestureRetry = useCallback(() => {
    if (!gestureHandlerRef.current) return;
    GESTURE_EVENTS.forEach((event) =>
      document.removeEventListener(event, gestureHandlerRef.current as EventListener)
    );
    gestureHandlerRef.current = null;
  }, []);

  const stopVideoLoop = useCallback(() => {
    if (videoLoopTimerRef.current !== null) {
      window.clearInterval(videoLoopTimerRef.current);
      videoLoopTimerRef.current = null;
    }
  }, []);

  const startVideoFallback = useCallback(async () => {
    const video = ensureVideo();
    try {
      await video.play();
      stopVideoLoop();
      videoLoopTimerRef.current = window.setInterval(() => {
        const element = videoRef.current;
        if (!element) return;
        element.play().catch(() => undefined);
      }, VIDEO_REFRESH_INTERVAL_MS);
      setIsActive(true);
      clearGestureRetry();
      return true;
    } catch (error) {
      console.warn('wakeLock_video_failed', error);
      return false;
    }
  }, [clearGestureRetry, ensureVideo, stopVideoLoop]);

  const scheduleGestureRetry = useCallback(() => {
    if (gestureHandlerRef.current) return;

    const handler: EventListener = async () => {
      clearGestureRetry();
      const success = await startVideoFallback();
      if (!success) {
        scheduleGestureRetry();
      }
    };

    gestureHandlerRef.current = handler;
    GESTURE_EVENTS.forEach((event) =>
      document.addEventListener(event, handler, { once: true })
    );
  }, [clearGestureRetry, startVideoFallback]);

  const stopVideoFallback = useCallback(() => {
    stopVideoLoop();
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.remove();
      videoRef.current = null;
    }
    clearGestureRetry();
  }, [clearGestureRetry, stopVideoLoop]);

  const requestLock = useCallback(async () => {
    if (!enabled) return;
    // Já segurando o lock: focus/visibilitychange disparam de novo e cada
    // pedido criava um sentinel novo — os antigos nunca eram liberados, e ao
    // desligar o keepAwake a tela continuava presa acordada.
    if (sentinelRef.current && !sentinelRef.current.released) return;
    try {
      if ('wakeLock' in navigator && 'request' in (navigator as any).wakeLock) {
        sentinelRef.current = await (navigator as any).wakeLock.request('screen');
        setIsActive(true);
        sentinelRef.current?.addEventListener?.('release', () => setIsActive(false));
        return;
      }
    } catch (error) {
      console.warn('wakeLock_request_failed', error);
    }

    const success = await startVideoFallback();
    if (!success) {
      scheduleGestureRetry();
    }
  }, [enabled, scheduleGestureRetry, startVideoFallback]);

  const releaseLock = useCallback(async () => {
    try {
      await sentinelRef.current?.release?.();
    } catch (error) {
      console.warn('wakeLock_release_failed', error);
    } finally {
      sentinelRef.current = null;
      stopVideoFallback();
      setIsActive(false);
    }
  }, [stopVideoFallback]);

  useEffect(() => {
    if (!enabled) {
      void releaseLock();
      return;
    }

    void requestLock();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && enabled) {
        void requestLock();
      }
    };

    const handleFocus = () => {
      if (enabled) {
        void requestLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      void releaseLock();
    };
  }, [enabled, releaseLock, requestLock]);

  return isActive;
}
