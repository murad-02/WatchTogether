import { create } from 'zustand';
import type {
  ChatMessage,
  ConnectionState,
  RoomState,
  WebRTCState,
} from '@/lib/types';

interface RoomStoreState {
  room: RoomState | null;
  messages: ChatMessage[];
  connection: ConnectionState;
  webrtc: WebRTCState;
  countdownStartAt: number | null;

  setRoom: (room: RoomState) => void;
  addMessage: (message: ChatMessage) => void;
  setConnection: (state: ConnectionState) => void;
  setWebRTC: (state: WebRTCState) => void;
  setCountdown: (startAt: number | null) => void;
  reset: () => void;
}

export const useRoomStore = create<RoomStoreState>((set) => ({
  room: null,
  messages: [],
  connection: 'connecting',
  webrtc: 'new',
  countdownStartAt: null,

  setRoom: (room) => set({ room }),
  addMessage: (message) =>
    set((s) => ({ messages: [...s.messages, message].slice(-200) })),
  setConnection: (connection) => set({ connection }),
  setWebRTC: (webrtc) => set({ webrtc }),
  setCountdown: (countdownStartAt) => set({ countdownStartAt }),
  reset: () =>
    set({
      room: null,
      messages: [],
      connection: 'connecting',
      webrtc: 'new',
      countdownStartAt: null,
    }),
}));
