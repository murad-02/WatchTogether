import type { Socket } from 'socket.io-client';
import type { WebRTCState } from './types';

/**
 * Peer-to-peer media transport for WatchTogether.
 *
 * The host captures its local <video> element as a MediaStream and sends the
 * tracks to each guest over an RTCPeerConnection. The signaling messages
 * (offer / answer / ICE) are relayed through Socket.IO — the server NEVER sees
 * the media itself.
 *
 * We use a "perfect-negotiation-lite" scheme: the host is always the offerer,
 * the guest is always the answerer, so there is no glare to resolve.
 */

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

interface WebRTCCallbacks {
  /** Fired (guest side) when a remote media stream is received. */
  onRemoteStream?: (stream: MediaStream) => void;
  /** Fired whenever the aggregate connection state changes. */
  onStateChange?: (state: WebRTCState) => void;
}

interface SignalPayload {
  from: string;
  target?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export class WebRTCManager {
  private readonly peers = new Map<string, RTCPeerConnection>();
  private readonly pendingCandidates = new Map<string, RTCIceCandidateInit[]>();

  private localStream: MediaStream | null = null;
  private micStream: MediaStream | null = null;

  constructor(
    private readonly socket: Socket,
    private isHost: boolean,
    private readonly callbacks: WebRTCCallbacks = {},
  ) {
    this.registerSocketHandlers();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Set/update our role once it is known. The manager is constructed early
   * (before the room state loads) so the answer-side signaling handlers are
   * registered before the host's offer can arrive — this avoids a race where a
   * guest would silently drop the very first offer. The host's offering logic
   * is gated on `isHost`, so we flip it here once the room identifies us.
   */
  setRole(isHost: boolean) {
    this.isHost = isHost;
  }

  /** Host: set/replace the captured media stream and (re)negotiate. */
  setLocalStream(stream: MediaStream) {
    console.log(
      '[WT-RTC] setLocalStream tracks=',
      stream.getTracks().map((t) => t.kind),
      'existingPeers=',
      this.peers.size,
    );
    this.localStream = stream;
    for (const [peerId, pc] of this.peers) {
      this.attachLocalTracks(pc);
      void this.makeOffer(peerId);
    }
  }

  /** Host: open a connection to a newly-arrived guest. */
  connectToPeer(peerId: string) {
    console.log(
      '[WT-RTC] connectToPeer',
      peerId,
      'isHost=',
      this.isHost,
      'hasStream=',
      !!this.localStream,
    );
    if (!this.isHost) return;
    const pc = this.ensurePeer(peerId);
    if (this.localStream) {
      this.attachLocalTracks(pc);
      void this.makeOffer(peerId);
    }
  }

  /** Optional voice chat — add/remove a local microphone track (MVP+). */
  async enableVoice(): Promise<void> {
    if (this.micStream) return;
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const [peerId, pc] of this.peers) {
      for (const track of this.micStream.getAudioTracks()) {
        pc.addTrack(track, this.micStream);
      }
      // Host renegotiates; guest will get a fresh offer when host does so.
      if (this.isHost) void this.makeOffer(peerId);
    }
  }

  disableVoice() {
    if (!this.micStream) return;
    this.micStream.getTracks().forEach((t) => t.stop());
    this.micStream = null;
  }

  setMicMuted(muted: boolean) {
    this.micStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  close() {
    this.socket.off('webrtc:offer', this.handleOffer);
    this.socket.off('webrtc:answer', this.handleAnswer);
    this.socket.off('webrtc:ice-candidate', this.handleIce);
    this.disableVoice();
    for (const pc of this.peers.values()) pc.close();
    this.peers.clear();
    this.pendingCandidates.clear();
  }

  // ── Peer connection management ────────────────────────────────────────────

  private ensurePeer(peerId: string): RTCPeerConnection {
    const existing = this.peers.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: buildIceServers() });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.socket.emit('webrtc:ice-candidate', {
          target: peerId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (e) => {
      console.log(
        '[WT-RTC] ontrack from',
        peerId,
        '- kind:',
        e.track.kind,
        'streams:',
        e.streams.length,
      );
      const [stream] = e.streams;
      if (stream) this.callbacks.onRemoteStream?.(stream);
      else console.warn('[WT-RTC] ontrack had NO associated stream');
    };

    pc.onconnectionstatechange = () => {
      console.log('[WT-RTC] connectionState', peerId, '=', pc.connectionState);
      this.callbacks.onStateChange?.(pc.connectionState as WebRTCState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log(
        '[WT-RTC] iceConnectionState',
        peerId,
        '=',
        pc.iceConnectionState,
      );
    };

    this.peers.set(peerId, pc);
    return pc;
  }

  private attachLocalTracks(pc: RTCPeerConnection) {
    if (!this.localStream) return;
    const senders = pc.getSenders();
    for (const track of this.localStream.getTracks()) {
      const alreadySending = senders.some((s) => s.track === track);
      if (!alreadySending) pc.addTrack(track, this.localStream);
    }
  }

  private async makeOffer(peerId: string) {
    const pc = this.peers.get(peerId);
    if (!pc) return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('[WT-RTC] sending offer to', peerId);
      this.socket.emit('webrtc:offer', { target: peerId, sdp: offer });
    } catch (err) {
      console.error('Failed to create offer', err);
    }
  }

  // ── Socket signaling handlers ─────────────────────────────────────────────

  private registerSocketHandlers() {
    this.socket.on('webrtc:offer', this.handleOffer);
    this.socket.on('webrtc:answer', this.handleAnswer);
    this.socket.on('webrtc:ice-candidate', this.handleIce);
  }

  private handleOffer = async (payload: SignalPayload) => {
    console.log('[WT-RTC] received offer from', payload.from);
    if (!payload.sdp) return;
    const peerId = payload.from;
    const pc = this.ensurePeer(peerId);

    // Guest attaches its mic (if any) before answering.
    if (this.micStream) {
      for (const track of this.micStream.getAudioTracks()) {
        const sending = pc.getSenders().some((s) => s.track === track);
        if (!sending) pc.addTrack(track, this.micStream);
      }
    }

    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    await this.flushCandidates(peerId, pc);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.socket.emit('webrtc:answer', { target: peerId, sdp: answer });
  };

  private handleAnswer = async (payload: SignalPayload) => {
    console.log('[WT-RTC] received answer from', payload.from);
    if (!payload.sdp) return;
    const pc = this.peers.get(payload.from);
    if (!pc) {
      console.warn('[WT-RTC] answer for unknown peer', payload.from);
      return;
    }
    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    await this.flushCandidates(payload.from, pc);
  };

  private handleIce = async (payload: SignalPayload) => {
    if (!payload.candidate) return;
    const pc = this.peers.get(payload.from);
    if (!pc || !pc.remoteDescription) {
      // Buffer until the remote description is set.
      const queue = this.pendingCandidates.get(payload.from) ?? [];
      queue.push(payload.candidate);
      this.pendingCandidates.set(payload.from, queue);
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
    } catch (err) {
      console.error('Failed to add ICE candidate', err);
    }
  };

  private async flushCandidates(peerId: string, pc: RTCPeerConnection) {
    const queue = this.pendingCandidates.get(peerId);
    if (!queue) return;
    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Failed to flush ICE candidate', err);
      }
    }
    this.pendingCandidates.delete(peerId);
  }
}
