'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { WebRTCManager } from '@/lib/webrtc';
import { useAuthStore } from '@/store/authStore';
import { useRoomStore } from '@/store/roomStore';
import { useRequireAuth } from '@/lib/useRequireAuth';
import type { ChatMessage, RoomState } from '@/lib/types';
import {
  VideoPlayer,
  type VideoPlayerHandle,
} from '@/components/VideoPlayer';
import { Participants } from '@/components/Participants';
import { Chat } from '@/components/Chat';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { ReadyPanel } from '@/components/ReadyPanel';
import { Countdown } from '@/components/Countdown';

const DRIFT_THRESHOLD = 0.5; // seconds
const SYNC_INTERVAL_MS = 5000;

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ roomCode: string }>();
  const roomCode = (params.roomCode ?? '').toUpperCase();

  const { user, ready: authReady } = useRequireAuth();

  const {
    room,
    messages,
    connection,
    webrtc,
    countdownStartAt,
    setRoom,
    addMessage,
    setConnection,
    setWebRTC,
    setCountdown,
    reset,
  } = useRoomStore();

  const [started, setStarted] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [copied, setCopied] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [micMuted, setMicMuted] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const rtcRef = useRef<WebRTCManager | null>(null);
  const playerRef = useRef<VideoPlayerHandle>(null);
  const driftOffsetRef = useRef<number | null>(null);
  const hostWiredRef = useRef(false);

  const isHost = !!room && !!user && room.hostId === user.id;

  // ── Socket lifecycle ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!authReady || !user) return;

    const socket = connectSocket();
    socketRef.current = socket;

    // Create the WebRTC manager *synchronously*, before `room:join` is emitted,
    // so the offer/answer/ICE signaling handlers are registered before the host
    // can possibly send us an offer. The role is applied later, once the room
    // state tells us whether we are the host. Without this, a guest can drop the
    // host's first offer and never receive the video stream.
    if (!rtcRef.current) {
      rtcRef.current = new WebRTCManager(socket, false, {
        onRemoteStream: (stream) => {
          console.log('[WT-RTC] onRemoteStream -> rendering guest video');
          setRemoteStream(stream);
        },
        onStateChange: (state) => setWebRTC(state),
      });
    }

    const onConnect = () => {
      setConnection('connected');
      socket.emit('room:join', { roomCode });
    };
    const onDisconnect = () => setConnection('disconnected');
    const onReconnectAttempt = () => setConnection('reconnecting');

    const onRoomUpdate = (state: RoomState) => setRoom(state);
    const onChat = (msg: ChatMessage) => addMessage(msg);
    const onAllReady = ({ startAt }: { startAt: number }) =>
      setCountdown(startAt);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.on('room:update', onRoomUpdate);
    socket.on('chat:message', onChat);
    socket.on('room:all_ready', onAllReady);

    if (socket.connected) onConnect();
    else setConnection('connecting');

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.off('room:update', onRoomUpdate);
      socket.off('chat:message', onChat);
      socket.off('room:all_ready', onAllReady);
      socket.emit('room:leave');
      rtcRef.current?.close();
      rtcRef.current = null;
      hostWiredRef.current = false;
      disconnectSocket();
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user, roomCode]);

  // ── Apply remote playback events (guest side) ──────────────────────────────
  const applyRemotePlayback = useCallback(
    (event: string, payload: { currentTime?: number; rate?: number; paused?: boolean }) => {
      const video = playerRef.current?.video;
      if (!video || isHost) return; // host is the authority

      switch (event) {
        case 'playback:play':
          video.play().catch(() => undefined);
          break;
        case 'playback:pause':
          video.pause();
          break;
        case 'playback:seek':
          // The live captured stream follows the host; we re-baseline drift.
          driftOffsetRef.current = null;
          break;
        case 'playback:speed':
          if (typeof payload.rate === 'number') video.playbackRate = payload.rate;
          break;
        case 'playback:sync':
          handleDrift(payload);
          break;
      }
    },
    [isHost],
  );

  /**
   * Drift correction for the live peer stream. We keep an offset between the
   * host's movie clock and the guest's received-stream clock. If the measured
   * drift exceeds the threshold we re-baseline (soft resync) and briefly flag it.
   */
  const handleDrift = (payload: { currentTime?: number; paused?: boolean }) => {
    const video = playerRef.current?.video;
    if (!video || typeof payload.currentTime !== 'number') return;

    const guestTime = video.currentTime;
    const hostTime = payload.currentTime;

    if (driftOffsetRef.current === null) {
      driftOffsetRef.current = hostTime - guestTime;
      return;
    }

    const predictedHostTime = guestTime + driftOffsetRef.current;
    const drift = hostTime - predictedHostTime;

    if (Math.abs(drift) > DRIFT_THRESHOLD) {
      // Re-baseline and surface a transient "reconnecting" state.
      driftOffsetRef.current = hostTime - guestTime;
      setConnection('reconnecting');
      setTimeout(() => setConnection('connected'), 600);
    }

    if (payload.paused) video.pause();
    else video.play().catch(() => undefined);
  };

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const events = [
      'playback:play',
      'playback:pause',
      'playback:seek',
      'playback:speed',
      'playback:sync',
    ];
    const handlers = events.map((ev) => {
      const h = (payload: Record<string, unknown>) =>
        applyRemotePlayback(ev, payload);
      socket.on(ev, h);
      return [ev, h] as const;
    });
    return () => handlers.forEach(([ev, h]) => socket.off(ev, h));
  }, [applyRemotePlayback]);

  // ── WebRTC role wiring (the manager itself is created in the socket effect) ──
  // Once the room state identifies our role, apply it. Host-side offering is
  // wired exactly once. Depends on stable primitives (hostId / userId) — NOT the
  // whole `room` object — so it does not re-run on every participant update.
  useEffect(() => {
    const socket = socketRef.current;
    const manager = rtcRef.current;
    if (!socket || !manager || !room || !user) return;

    console.log(
      '[WT-RTC] role wiring: isHost=',
      isHost,
      'participants=',
      room.participants.map((p) => p.userId),
      'me=',
      user.id,
    );
    manager.setRole(isHost);

    if (isHost && !hostWiredRef.current) {
      hostWiredRef.current = true;

      // Connect to any guests already present…
      room.participants
        .filter((p) => p.userId !== user.id)
        .forEach((p) => manager.connectToPeer(p.userId));

      // …and to anyone who joins later. The socket (and this listener) are
      // disposed together in the main socket-lifecycle effect's cleanup.
      socket.on('presence:joined', ({ userId }: { userId: string }) => {
        rtcRef.current?.connectToPeer(userId);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.hostId, user?.id, isHost]);

  // ── Host: periodic sync broadcast + drift source ───────────────────────────
  useEffect(() => {
    if (!isHost || !started) return;
    const id = setInterval(() => {
      const video = playerRef.current?.video;
      if (!video) return;
      socketRef.current?.emit('playback:sync', {
        currentTime: video.currentTime,
        paused: video.paused,
      });
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isHost, started]);

  // ── Resume already-playing room on late join ───────────────────────────────
  useEffect(() => {
    if (room?.status === 'PLAYING') setStarted(true);
  }, [room?.status]);

  // ── Host playback emitters ─────────────────────────────────────────────────
  const emitPlayback = useCallback(
    (event: string, body: Record<string, unknown>) => {
      if (!started) return; // private preview before the countdown
      socketRef.current?.emit(event, body);
    },
    [started],
  );

  // ── Host: hand the captured stream to WebRTC ───────────────────────────────
  const onStreamReady = useCallback((stream: MediaStream) => {
    console.log('[WT-RTC] host captured stream -> setLocalStream');
    rtcRef.current?.setLocalStream(stream);
  }, []);

  // ── Ready / countdown ──────────────────────────────────────────────────────
  const toggleReady = (next: boolean) => {
    socketRef.current?.emit(next ? 'user:ready' : 'user:unready');
  };

  const onCountdownComplete = useCallback(() => {
    setCountdown(null);
    setStarted(true);
    // Both sides attempt to begin playback in sync.
    playerRef.current?.video?.play().catch(() => undefined);
  }, [setCountdown]);

  // ── Chat ───────────────────────────────────────────────────────────────────
  const sendChat = (text: string) =>
    socketRef.current?.emit('chat:message', { text });

  // ── Leave ──────────────────────────────────────────────────────────────────
  const leaveRoom = () => {
    socketRef.current?.emit('room:leave');
    router.push('/dashboard');
  };

  // ── Invite link ────────────────────────────────────────────────────────────
  const inviteLink = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/room/${roomCode}`;
  }, [roomCode]);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  // ── Voice chat (MVP+) ──────────────────────────────────────────────────────
  const toggleVoice = async () => {
    const mgr = rtcRef.current;
    if (!mgr) return;
    if (voiceOn) {
      mgr.disableVoice();
      setVoiceOn(false);
      setMicMuted(false);
    } else {
      try {
        await mgr.enableVoice();
        setVoiceOn(true);
      } catch {
        alert('Could not access microphone.');
      }
    }
  };

  const toggleMute = () => {
    const next = !micMuted;
    rtcRef.current?.setMicMuted(next);
    setMicMuted(next);
  };

  if (!authReady) {
    return (
      <main className="min-h-screen flex items-center justify-center text-slate-400">
        Loading…
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-800 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-bold text-lg hidden sm:inline">
            Watch<span className="text-brand">Together</span>
          </span>
          <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-1.5">
            <span className="text-xs text-slate-400">Room</span>
            <span className="font-mono font-semibold tracking-widest">
              {roomCode}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyInvite}
            className="text-sm rounded-lg border border-slate-700 hover:border-slate-500 px-3 py-1.5 transition"
          >
            {copied ? 'Copied!' : 'Copy invite link'}
          </button>
          <button
            onClick={leaveRoom}
            className="text-sm rounded-lg bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30 px-3 py-1.5 transition"
          >
            Leave
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 min-h-0">
        {/* Left: video */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="relative">
            <VideoPlayer
              ref={playerRef}
              isHost={isHost}
              canControl={isHost && started}
              remoteStream={remoteStream}
              onStreamReady={onStreamReady}
              onPlay={(t) => emitPlayback('playback:play', { currentTime: t })}
              onPause={(t) => emitPlayback('playback:pause', { currentTime: t })}
              onSeek={(t) => emitPlayback('playback:seek', { currentTime: t })}
              onSpeed={(r) => emitPlayback('playback:speed', { rate: r })}
            />
            {countdownStartAt && (
              <Countdown
                startAt={countdownStartAt}
                onComplete={onCountdownComplete}
              />
            )}
          </div>

          {isHost && (
            <p className="text-xs text-slate-500">
              You are the host. Your video is streamed peer-to-peer — the file
              is never uploaded.
            </p>
          )}

          {/* Voice chat (optional / off by default) */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleVoice}
              className={`text-xs rounded-lg px-3 py-1.5 border transition ${
                voiceOn
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'border-slate-700 hover:border-slate-500 text-slate-300'
              }`}
            >
              {voiceOn ? '🎙 Voice on' : '🎙 Enable voice (beta)'}
            </button>
            {voiceOn && (
              <button
                onClick={toggleMute}
                className="text-xs rounded-lg px-3 py-1.5 border border-slate-700 hover:border-slate-500 text-slate-300 transition"
              >
                {micMuted ? 'Unmute' : 'Mute'}
              </button>
            )}
          </div>
        </div>

        {/* Right: sidebar */}
        <aside className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-4 bg-slate-900 border border-slate-800 rounded-xl p-4 min-h-0">
          {room && (
            <>
              <ReadyPanel
                room={room}
                currentUserId={user?.id}
                onToggleReady={toggleReady}
              />
              <Participants
                participants={room.participants}
                currentUserId={user?.id}
              />
              <ConnectionStatus connection={connection} webrtc={webrtc} />
            </>
          )}
          <div className="flex-1 min-h-[240px]">
            <Chat
              messages={messages}
              currentUserId={user?.id}
              onSend={sendChat}
            />
          </div>
        </aside>
      </div>
    </main>
  );
}
