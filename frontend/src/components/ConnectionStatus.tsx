'use client';

import type { ConnectionState, WebRTCState } from '@/lib/types';

const socketLabels: Record<ConnectionState, { text: string; color: string }> = {
  connecting: { text: 'Connecting', color: 'bg-amber-400' },
  connected: { text: 'Connected', color: 'bg-emerald-400' },
  reconnecting: { text: 'Reconnecting', color: 'bg-amber-400' },
  disconnected: { text: 'Disconnected', color: 'bg-red-500' },
};

const rtcLabels: Record<WebRTCState, { text: string; color: string }> = {
  new: { text: 'Idle', color: 'bg-slate-500' },
  connecting: { text: 'Connecting', color: 'bg-amber-400' },
  connected: { text: 'Streaming', color: 'bg-emerald-400' },
  disconnected: { text: 'Disconnected', color: 'bg-red-500' },
  failed: { text: 'Failed', color: 'bg-red-500' },
  closed: { text: 'Closed', color: 'bg-slate-500' },
};

function Dot({ color }: { color: string }) {
  return <span className={`h-2 w-2 rounded-full ${color}`} />;
}

export function ConnectionStatus({
  connection,
  webrtc,
}: {
  connection: ConnectionState;
  webrtc: WebRTCState;
}) {
  const s = socketLabels[connection];
  const r = rtcLabels[webrtc];
  return (
    <div className="flex flex-col gap-2 text-sm">
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
        Connection
      </h3>
      <div className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2">
        <span className="text-slate-400">Server</span>
        <span className="flex items-center gap-2">
          <Dot color={s.color} />
          {s.text}
        </span>
      </div>
      <div className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2">
        <span className="text-slate-400">Peer (WebRTC)</span>
        <span className="flex items-center gap-2">
          <Dot color={r.color} />
          {r.text}
        </span>
      </div>
    </div>
  );
}
