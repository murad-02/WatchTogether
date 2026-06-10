'use client';

import type { RoomState } from '@/lib/types';

export function ReadyPanel({
  room,
  currentUserId,
  onToggleReady,
}: {
  room: RoomState;
  currentUserId?: string;
  onToggleReady: (ready: boolean) => void;
}) {
  const me = room.participants.find((p) => p.userId === currentUserId);
  const ready = me?.ready ?? false;
  const everyoneReady =
    room.participants.length >= 2 && room.participants.every((p) => p.ready);

  return (
    <div className="space-y-2">
      <button
        onClick={() => onToggleReady(!ready)}
        className={`w-full rounded-lg py-2.5 font-medium transition ${
          ready
            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
            : 'bg-brand hover:bg-brand-dark'
        }`}
      >
        {ready ? "You're ready ✓" : "I'm ready"}
      </button>
      <p className="text-xs text-center text-slate-400">
        {room.participants.length < 2
          ? 'Waiting for your guest to join…'
          : everyoneReady
            ? 'Everyone is ready — starting!'
            : 'Playback starts when both participants are ready.'}
      </p>
    </div>
  );
}
