import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RoomsService } from '../rooms/rooms.service';
import { RateLimiter } from './rate-limiter';

interface SocketUser {
  id: string;
  username: string;
}

/** Authenticated socket — `data.user` is populated during the handshake. */
type AuthSocket = Socket & { data: { user?: SocketUser; roomCode?: string } };

const corsOrigin = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

@WebSocketGateway({
  cors: { origin: corsOrigin, credentials: true },
})
export class RoomGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RoomGateway.name);

  // Rate limiters protect chatty / abusable events.
  private readonly chatLimiter = new RateLimiter(10_000, 20); // 20 msgs / 10s
  private readonly playbackLimiter = new RateLimiter(1_000, 15); // 15 ev / 1s
  private readonly signalLimiter = new RateLimiter(10_000, 100); // ICE bursts

  constructor(
    private readonly jwt: JwtService,
    private readonly rooms: RoomsService,
  ) {}

  // ── Connection lifecycle ────────────────────────────────────────────────
  async handleConnection(client: AuthSocket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers?.authorization as string)?.replace(
          /^Bearer\s+/i,
          '',
        );

      if (!token) {
        throw new Error('Missing token');
      }

      const payload = this.jwt.verify<{ sub: string; username: string }>(token);
      client.data.user = { id: payload.sub, username: payload.username };
      this.logger.log(`Socket connected: ${payload.username} (${client.id})`);
    } catch {
      this.logger.warn(`Rejected unauthenticated socket ${client.id}`);
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthSocket) {
    const { user, roomCode } = client.data;
    if (user && roomCode) {
      // Mark not-ready and notify peers; keep participant row so they can rejoin.
      try {
        await this.rooms.setReady(roomCode, user.id, false).catch(() => null);
        const state = await this.rooms.getRoomState(roomCode).catch(() => null);
        if (state) {
          this.server.to(roomCode).emit('room:update', state);
        }
        client.to(roomCode).emit('presence:left', { userId: user.id });
      } catch {
        /* room may already be gone */
      }
    }
    this.logger.log(`Socket disconnected: ${client.id}`);
  }

  private requireUser(client: AuthSocket): SocketUser {
    if (!client.data.user) {
      throw new Error('Unauthorized');
    }
    return client.data.user;
  }

  // ── Room events ─────────────────────────────────────────────────────────
  @SubscribeMessage('room:join')
  async onJoin(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { roomCode: string },
  ) {
    const user = this.requireUser(client);
    const roomCode = String(body?.roomCode ?? '').toUpperCase();
    if (!roomCode) return { error: 'roomCode required' };

    // Ensure the user is registered as a participant (access control).
    await this.rooms.joinRoom(roomCode, user.id);

    client.join(roomCode);
    client.data.roomCode = roomCode;

    const state = await this.rooms.getRoomState(roomCode);
    this.server.to(roomCode).emit('room:update', state);

    // Tell existing peers a new participant arrived (used to kick off WebRTC).
    client.to(roomCode).emit('presence:joined', {
      userId: user.id,
      username: user.username,
    });

    return { ok: true, state };
  }

  @SubscribeMessage('room:leave')
  async onLeave(@ConnectedSocket() client: AuthSocket) {
    const user = this.requireUser(client);
    const roomCode = client.data.roomCode;
    if (!roomCode) return { ok: true };

    await this.rooms.leaveRoom(roomCode, user.id).catch(() => null);
    client.to(roomCode).emit('presence:left', { userId: user.id });
    client.leave(roomCode);
    client.data.roomCode = undefined;

    const state = await this.rooms.getRoomState(roomCode).catch(() => null);
    if (state) this.server.to(roomCode).emit('room:update', state);
    return { ok: true };
  }

  // ── Ready events ────────────────────────────────────────────────────────
  @SubscribeMessage('user:ready')
  async onReady(@ConnectedSocket() client: AuthSocket) {
    return this.setReady(client, true);
  }

  @SubscribeMessage('user:unready')
  async onUnready(@ConnectedSocket() client: AuthSocket) {
    return this.setReady(client, false);
  }

  private async setReady(client: AuthSocket, ready: boolean) {
    const user = this.requireUser(client);
    const roomCode = client.data.roomCode;
    if (!roomCode) return { error: 'Not in a room' };

    const state = await this.rooms.setReady(roomCode, user.id, ready);
    this.server.to(roomCode).emit('room:update', state);

    // "Start only when both users are ready" → require >= 2 participants all ready.
    const allReady =
      state.participants.length >= 2 &&
      state.participants.every((p) => p.ready);

    if (allReady) {
      await this.rooms.setStatus(roomCode, 'PLAYING').catch(() => null);
      // Synchronized 3-second countdown: broadcast a shared start timestamp.
      const startAt = Date.now() + 3000;
      this.server.to(roomCode).emit('room:all_ready', { startAt });
    }
    return { ok: true };
  }

  // ── Playback sync events ─────────────────────────────────────────────────
  @SubscribeMessage('playback:play')
  onPlay(client: AuthSocket, body: { currentTime: number }) {
    return this.relayPlayback(client, 'playback:play', body);
  }

  @SubscribeMessage('playback:pause')
  onPause(client: AuthSocket, body: { currentTime: number }) {
    return this.relayPlayback(client, 'playback:pause', body);
  }

  @SubscribeMessage('playback:seek')
  onSeek(client: AuthSocket, body: { currentTime: number }) {
    return this.relayPlayback(client, 'playback:seek', body);
  }

  @SubscribeMessage('playback:sync')
  onSync(client: AuthSocket, body: { currentTime: number; paused: boolean }) {
    return this.relayPlayback(client, 'playback:sync', body);
  }

  @SubscribeMessage('playback:speed')
  onSpeed(client: AuthSocket, body: { rate: number }) {
    return this.relayPlayback(client, 'playback:speed', body);
  }

  private relayPlayback(
    client: AuthSocket,
    event: string,
    body: Record<string, unknown>,
  ) {
    const user = this.requireUser(client);
    const roomCode = client.data.roomCode;
    if (!roomCode) return;
    if (!this.playbackLimiter.allow(`${client.id}:pb`)) return;

    // Broadcast to everyone else in the room. Host authority is enforced
    // client-side (only the host renders controls / the source stream).
    client.to(roomCode).emit(event, {
      ...body,
      from: user.id,
      serverTime: Date.now(),
    });
  }

  // ── Chat ─────────────────────────────────────────────────────────────────
  @SubscribeMessage('chat:message')
  async onChat(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { text: string },
  ) {
    const user = this.requireUser(client);
    const roomCode = client.data.roomCode;
    if (!roomCode) return { error: 'Not in a room' };

    if (!this.chatLimiter.allow(`${client.id}:chat`)) {
      return { error: 'You are sending messages too quickly' };
    }

    const text = String(body?.text ?? '').trim().slice(0, 1000);
    if (!text) return { error: 'Empty message' };

    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: user.id,
      username: user.username,
      text,
      timestamp: Date.now(),
    };

    this.server.to(roomCode).emit('chat:message', message);
    return { ok: true };
  }

  // ── WebRTC signaling (offer / answer / ICE) ──────────────────────────────
  @SubscribeMessage('webrtc:offer')
  onOffer(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { target?: string; sdp: unknown },
  ) {
    return this.relaySignal(client, 'webrtc:offer', body);
  }

  @SubscribeMessage('webrtc:answer')
  onAnswer(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { target?: string; sdp: unknown },
  ) {
    return this.relaySignal(client, 'webrtc:answer', body);
  }

  @SubscribeMessage('webrtc:ice-candidate')
  onIce(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { target?: string; candidate: unknown },
  ) {
    return this.relaySignal(client, 'webrtc:ice-candidate', body);
  }

  private relaySignal(
    client: AuthSocket,
    event: string,
    body: { target?: string } & Record<string, unknown>,
  ) {
    const user = this.requireUser(client);
    const roomCode = client.data.roomCode;
    if (!roomCode) return;
    if (!this.signalLimiter.allow(`${client.id}:sig`)) return;

    const payload = { ...body, from: user.id };

    // The server only relays small JSON signaling blobs — never media.
    if (body.target) {
      // Direct to a specific peer by user id (look up their socket).
      this.emitToUser(roomCode, body.target, event, payload);
    } else {
      client.to(roomCode).emit(event, payload);
    }
  }

  private emitToUser(
    roomCode: string,
    targetUserId: string,
    event: string,
    payload: unknown,
  ) {
    const room = this.server.sockets.adapter.rooms.get(roomCode);
    if (!room) return;
    for (const socketId of room) {
      const s = this.server.sockets.sockets.get(socketId) as
        | AuthSocket
        | undefined;
      if (s?.data.user?.id === targetUserId) {
        s.emit(event, payload);
      }
    }
  }
}
