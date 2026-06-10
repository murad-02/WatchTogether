'use client';

import type { Participant } from '@/lib/types';

export function Participants({
  participants,
  currentUserId,
}: {
  participants: Participant[];
  currentUserId?: string;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
        Participants ({participants.length})
      </h3>
      <ul className="space-y-1.5">
        {participants.map((p) => (
          <li
            key={p.userId}
            className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`h-2 w-2 rounded-full flex-shrink-0 ${
                  p.ready ? 'bg-emerald-400' : 'bg-slate-500'
                }`}
                title={p.ready ? 'Ready' : 'Not ready'}
              />
              <span className="truncate">
                {p.username}
                {p.userId === currentUserId && (
                  <span className="text-slate-500"> (you)</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {p.isHost && (
                <span className="px-2 py-0.5 rounded bg-brand/20 text-brand">
                  Host
                </span>
              )}
              <span
                className={p.ready ? 'text-emerald-400' : 'text-slate-500'}
              >
                {p.ready ? 'Ready' : 'Waiting'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
