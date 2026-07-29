'use client';

import { useEffect, useRef } from 'react';
import { HEARTBEAT_INTERVAL_SECONDS } from '@/lib/learning-time';

/**
 * Reports real time-on-task for the lesson currently open.
 *
 * Ticks every HEARTBEAT_INTERVAL_SECONDS, but only while the tab is VISIBLE —
 * a lesson left open in a background tab must not accrue study time, which is
 * the single biggest way a naive timer poisons cohort averages.
 *
 * On unmount, lesson change, or page unload the accrued remainder is flushed
 * with sendBeacon, which survives navigation where fetch() would be cancelled.
 *
 * The server clamps every delta (see src/lib/learning-time.ts), so the worst a
 * broken clock or a stuck timer here can do is over-report by one interval.
 */
export function useLessonHeartbeat(lessonId: string | undefined, courseId: string) {
  // Refs, not state: these change twice a minute and must never re-render the
  // lesson body — a re-render mid-video would reload the Vimeo iframe.
  const unsentSeconds = useRef(0);
  const lastTickAt = useRef<number | null>(null);

  useEffect(() => {
    if (!lessonId) return;

    unsentSeconds.current = 0;
    lastTickAt.current = document.visibilityState === 'visible' ? Date.now() : null;

    const send = (useBeacon: boolean) => {
      const delta = Math.floor(unsentSeconds.current);
      if (delta <= 0) return;
      unsentSeconds.current -= delta;

      const payload = JSON.stringify({ lessonId, courseId, deltaSeconds: delta });

      // sendBeacon is the only transport the browser guarantees during unload.
      if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon('/api/progress/heartbeat', new Blob([payload], { type: 'application/json' }));
        return;
      }

      fetch('/api/progress/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {
        // Losing a heartbeat is not worth surfacing to the learner; the next
        // tick re-accrues from the wall clock.
      });
    };

    // Accrue from the wall clock rather than counting ticks: a throttled
    // background timer fires late, and counting ticks would under-report by
    // exactly the amount the browser throttled.
    const accrue = () => {
      if (lastTickAt.current === null) return;
      const now = Date.now();
      unsentSeconds.current += (now - lastTickAt.current) / 1000;
      lastTickAt.current = now;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        lastTickAt.current = Date.now();
      } else {
        accrue();
        lastTickAt.current = null; // stop the clock while hidden
        send(true);
      }
    };

    const interval = setInterval(() => {
      accrue();
      send(false);
    }, HEARTBEAT_INTERVAL_SECONDS * 1000);

    const onPageHide = () => {
      accrue();
      send(true);
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      accrue();
      send(true);
    };
  }, [lessonId, courseId]);
}
