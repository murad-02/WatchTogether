# WatchTogether 🎬

Watch a local movie file together with a friend in another location — **peer‑to‑peer**, with synchronized playback, chat and presence.

The host picks a video file from their own computer. The video is streamed **directly host‑browser → guest‑browser over WebRTC**. The backend is only used for authentication, room management and signaling. **No video data ever touches the server.**

---

## Features

- **Auth** — register / login, JWT, protected routes, user profile
- **Rooms** — create room with a unique code, join by code, participant list, host designation, leave
- **Ready system** — per‑participant ready button, "start when both ready", synchronized 3‑second countdown
- **Local file hosting** — host selects an MP4 / MKV / WebM file, previews it, and shares it over WebRTC
- **Peer‑to‑peer streaming** — guest receives the stream automatically and watches without downloading
- **Playback sync** — play / pause / seek / position / playback speed
- **Drift correction** — every 5s the guest compares its clock to the host and resyncs if drift > 500ms
- **Realtime chat** — sender name + timestamps
- **Connection status** — socket + WebRTC connection state
- **Voice chat (MVP+)** — architecture implemented, **disabled by default** (toggle in room)

---

## Tech stack

| Layer     | Tech                                                                 |
| --------- | ------------------------------------------------------------------- |
| Frontend  | Next.js 15 (App Router), TypeScript, Tailwind CSS, Zustand, Socket.IO client, WebRTC |
| Backend   | NestJS, Socket.IO, Prisma ORM, SQLite, JWT                          |

> Runs entirely locally with zero external services — the database is a single SQLite file (`backend/prisma/dev.db`).

---

## Repository layout

```
WatchTogether/
├── package.json         # root scripts: install + run both apps together
├── backend/             # NestJS API + Socket.IO signaling server
│   ├── prisma/          # Prisma schema + dev.db (SQLite)
│   └── src/
│       ├── auth/        # JWT auth (register/login)
│       ├── users/       # User profile
│       ├── rooms/       # Room CRUD + access control
│       └── gateway/     # Socket.IO gateway (signaling, sync, chat)
├── frontend/            # Next.js 15 app
│   └── src/
│       ├── app/         # Routes: /auth, /dashboard, /room/[roomCode]
│       ├── components/  # Video player, chat, participants, etc.
│       ├── lib/         # api / socket / webrtc helpers
│       └── store/       # Zustand stores
└── README.md
```

---

## Quick start

Requirements: **Node.js 20+** and npm. No database server, no Docker — the backend uses a local SQLite file.

### 1. Create env files

```bash
# backend
cp backend/.env.example backend/.env

# frontend (optional — defaults already point at http://localhost:4000)
cp frontend/.env.example frontend/.env.local
```

### 2. Install everything + create the database

From the project root:

```bash
npm run setup
```

This installs the root, backend and frontend dependencies and runs `prisma db push` to create `backend/prisma/dev.db`.

### 3. Run both apps

```bash
npm run dev
```

- Frontend → http://localhost:3000
- Backend  → http://localhost:4000

> `npm run dev` launches the NestJS backend and Next.js frontend together (via `concurrently`). To run them separately use `npm run dev:backend` and `npm run dev:frontend`, or run `npm run start:dev` / `npm run dev` inside `backend/` and `frontend/`.

**Open `http://localhost:3000` in your browser** (use `localhost`, not `127.0.0.1` — the backend's CORS allows the `localhost` origin).

---

## Deploying online

To host WatchTogether on the public internet **for free** (Vercel + Render + Neon + a free TURN server), and for a phased plan on scaling to many users, see **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

---

## How peer‑to‑peer streaming works

1. Host opens a room and selects a local video file.
2. The file is loaded into a hidden `<video>` element; the host calls `video.captureStream()` to obtain a live `MediaStream`.
3. The tracks are added to an `RTCPeerConnection`. The host creates an SDP **offer**.
4. The offer / answer and ICE candidates are relayed **only as signaling messages** through the Socket.IO server (`webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`).
5. The guest receives the remote `MediaStream` via `ontrack` and sets it as the `srcObject` of its video element.
6. Playback control stays with the host. Play / pause / seek / speed events are broadcast over Socket.IO so the guest's UI and clock stay in sync; the captured media stream itself follows the host's video element in real time.

> The backend never receives, processes or stores video data — it only relays small JSON signaling messages.

### TURN / NAT note

The default config uses public Google STUN servers, which is enough for many networks (and for two browsers on the same machine/LAN). For restrictive NATs across the internet you should add a TURN server via `NEXT_PUBLIC_TURN_URL` / `NEXT_PUBLIC_TURN_USERNAME` / `NEXT_PUBLIC_TURN_CREDENTIAL`.

---

## Environment variables

See [`backend/.env.example`](./backend/.env.example) and [`frontend/.env.example`](./frontend/.env.example).

| Variable                     | Where     | Description                                  |
| ---------------------------- | --------- | -------------------------------------------- |
| `DATABASE_URL`               | backend   | SQLite file URL (`file:./dev.db`)            |
| `JWT_SECRET`                 | backend   | Secret used to sign JWTs                     |
| `JWT_EXPIRES_IN`             | backend   | Token lifetime (e.g. `7d`)                   |
| `PORT`                       | backend   | API port (default 4000)                      |
| `CORS_ORIGIN`                | backend   | Allowed frontend origin                      |
| `NEXT_PUBLIC_API_URL`        | frontend  | Base URL of the REST API                     |
| `NEXT_PUBLIC_SOCKET_URL`     | frontend  | Base URL of the Socket.IO server             |
| `NEXT_PUBLIC_TURN_URL`       | frontend  | (optional) TURN server URL                   |

---

## Socket events

| Category | Events |
| -------- | ------ |
| Room     | `room:create`, `room:join`, `room:leave`, `room:update` |
| Ready    | `user:ready`, `user:unready`, `room:all_ready` |
| Playback | `playback:play`, `playback:pause`, `playback:seek`, `playback:sync`, `playback:speed` |
| Chat     | `chat:message` |
| WebRTC   | `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate` |

---

## Security

- JWT authentication for both REST and the Socket.IO handshake
- Protected frontend routes (redirect to login when unauthenticated)
- Input validation with `class-validator` DTOs
- Basic per‑socket rate limiting on chat / playback events
- Room access control — only participants may emit room events

---

## License

MIT — for educational / demonstration purposes.
