import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Room status values (stored as a string column for provider portability).
export type RoomStatus = 'WAITING' | 'PLAYING' | 'ENDED';

// Unambiguous room-code alphabet (no 0/O/1/I)
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  private generateCode(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return code;
  }

  private async uniqueCode(): Promise<string> {
    // Retry on the (extremely unlikely) collision
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.generateCode();
      const exists = await this.prisma.room.findUnique({
        where: { roomCode: code },
      });
      if (!exists) return code;
    }
    throw new Error('Could not generate a unique room code');
  }

  async createRoom(hostId: string) {
    const roomCode = await this.uniqueCode();
    const room = await this.prisma.room.create({
      data: {
        roomCode,
        hostId,
        status: 'WAITING',
        participants: {
          create: { userId: hostId, ready: false },
        },
      },
    });
    return this.getRoomState(room.roomCode);
  }

  async getByCode(roomCode: string) {
    const room = await this.prisma.room.findUnique({
      where: { roomCode: roomCode.toUpperCase() },
    });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    return room;
  }

  /** Adds the user as a participant (idempotent). */
  async joinRoom(roomCode: string, userId: string) {
    const room = await this.getByCode(roomCode);

    await this.prisma.participant.upsert({
      where: { roomId_userId: { roomId: room.id, userId } },
      create: { roomId: room.id, userId, ready: false },
      update: {},
    });

    return this.getRoomState(room.roomCode);
  }

  async leaveRoom(roomCode: string, userId: string) {
    const room = await this.getByCode(roomCode);
    await this.prisma.participant.deleteMany({
      where: { roomId: room.id, userId },
    });

    // If the host leaves, mark the room ended.
    if (room.hostId === userId) {
      await this.prisma.room.update({
        where: { id: room.id },
        data: { status: 'ENDED' },
      });
    }
    return this.getRoomState(room.roomCode);
  }

  async setReady(roomCode: string, userId: string, ready: boolean) {
    const room = await this.getByCode(roomCode);
    await this.prisma.participant.update({
      where: { roomId_userId: { roomId: room.id, userId } },
      data: { ready },
    });
    return this.getRoomState(room.roomCode);
  }

  async setStatus(roomCode: string, status: RoomStatus) {
    const room = await this.getByCode(roomCode);
    await this.prisma.room.update({ where: { id: room.id }, data: { status } });
    return this.getRoomState(room.roomCode);
  }

  async assertParticipant(roomCode: string, userId: string) {
    const room = await this.getByCode(roomCode);
    const participant = await this.prisma.participant.findUnique({
      where: { roomId_userId: { roomId: room.id, userId } },
    });
    if (!participant) {
      throw new ForbiddenException('You are not a participant of this room');
    }
    return room;
  }

  /** Returns a serializable snapshot of the room + participants. */
  async getRoomState(roomCode: string) {
    const room = await this.prisma.room.findUnique({
      where: { roomCode: roomCode.toUpperCase() },
      include: {
        participants: {
          include: {
            user: { select: { id: true, username: true } },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return {
      id: room.id,
      roomCode: room.roomCode,
      hostId: room.hostId,
      status: room.status,
      createdAt: room.createdAt,
      participants: room.participants.map((p) => ({
        userId: p.userId,
        username: p.user.username,
        ready: p.ready,
        isHost: p.userId === room.hostId,
        joinedAt: p.joinedAt,
      })),
    };
  }
}

export type RoomState = Awaited<ReturnType<RoomsService['getRoomState']>>;
