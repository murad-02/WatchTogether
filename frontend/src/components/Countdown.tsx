'use client';

import { useEffect, useState } from 'react';

/**
 * Full-screen synchronized countdown. `startAt` is a shared epoch timestamp
 * (ms) sent by the server so both peers count down to the same instant.
 */
export function Countdown({
  startAt,
  onComplete,
}: {
  startAt: number;
  onComplete: () => void;
}) {
  const [remaining, setRemaining] = useState(() =>
    Math.ceil((startAt - Date.now()) / 1000),
  );

  useEffect(() => {
    const tick = () => {
      const secs = Math.ceil((startAt - Date.now()) / 1000);
      setRemaining(secs);
      if (secs <= 0) {
        clearInterval(id);
        onComplete();
      }
    };
    const id = setInterval(tick, 100);
    tick();
    return () => clearInterval(id);
  }, [startAt, onComplete]);

  if (remaining <= 0) return null;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="text-center">
        <div className="text-8xl font-bold text-brand animate-pulse">
          {remaining}
        </div>
        <p className="mt-4 text-slate-300">Get ready…</p>
      </div>
    </div>
  );
}
