export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export type RoomStatus = 'WAITING' | 'PLAYING' | 'ENDED';

export interface Participant {
  userId: string;
  username: string;
  ready: boolean;
  isHost: boolean;
  joinedAt: string;
}

export interface RoomState {
  id: string;
  roomCode: string;
  hostId: string;
  status: RoomStatus;
  createdAt: string;
  participants: Participant[];
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
}

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export type WebRTCState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';
