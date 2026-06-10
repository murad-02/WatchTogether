# Hosting WatchTogether Online (Free) + Scaling Plan

This guide has two parts:

1. **[Part 1 — Deploy online for free](#part-1--deploy-online-for-free)** — a step‑by‑step walkthrough to put WatchTogether on the public internet at $0 so friends can use it.
2. **[Part 2 — Scaling plan](#part-2--scaling-plan)** — what to change as more users sign up, organised in phases.

---

## How the app is split (read this first)

WatchTogether is **two apps + a database + a TURN server**. They get hosted in different places:

| Piece | What it is | Where it goes (free) |
| ----- | ---------- | -------------------- |
| **Frontend** | Next.js 15 app (the website) | **Vercel** |
| **Backend** | NestJS REST API **+ Socket.IO** signaling server | **Render** (a real always‑listening server — *not* serverless) |
| **Database** | User accounts, rooms, participants | **Neon** (managed PostgreSQL) |
| **TURN/STUN** | Helps two browsers connect through firewalls/NAT | **Metered Open Relay** (free TURN) |

> ⚠️ **The video itself is never hosted.** It streams browser‑to‑browser over WebRTC. The backend only relays small text "signaling" messages. So you are *not* paying for video bandwidth on the server — that is the key reason this can be free.

Two things that trip people up and are handled below:

- **HTTPS is mandatory.** Browsers block `getUserMedia` / `video.captureStream()` on non‑`localhost` origins unless the page is served over HTTPS. Vercel and Render both give you HTTPS automatically — good. But it means you can't test the deployed version over plain `http://`.
- **SQLite must be replaced with PostgreSQL.** Free hosts have *ephemeral* disks (wiped on every deploy/restart), so the local `dev.db` file would constantly reset. Part 1 includes the switch.

---

# Part 1 — Deploy online for free

### Prerequisites

- A **GitHub** account (free)
- A **Vercel** account (sign up with GitHub)
- A **Render** account (sign up with GitHub)
- A **Neon** account (sign up with GitHub)
- A **Metered** account (free TURN)

Estimated time: **30–45 minutes** the first time.

---

## Step 0 — Put the code on GitHub ✅ DONE

This project isn't a git repo yet. From the project root (`F:\WatchTogether`):

```powershell
git init
git add .
git commit -m "WatchTogether: initial commit"
```

Create an **empty** repo on github.com (no README), then:

```powershell
git branch -M main
git remote add origin https://github.com/<your-username>/watchtogether.git
git push -u origin main
```

> The `.gitignore` already excludes `node_modules`, `.env`, and `*.db`, so secrets and the local database won't be uploaded. Good.

**Done — repo:** `https://github.com/murad-02/WatchTogether.git`

---

## Step 1 — Create the production database (Neon, PostgreSQL) ✅ DONE

1. Go to **neon.tech** → create a project (pick a region near your users).
2. Copy the **connection string**. Neon gives you two:
   - a **pooled** string (host contains `-pooler`) → use this as `DATABASE_URL`
   - a **direct** string (no `-pooler`) → use this as `DIRECT_URL` (used only for running migrations)
3. They look like:
   ```
   postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require
   postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require
   ```

Keep both handy — you'll paste them into Render in Step 3.

> ⚠️ **Security:** the actual strings below contain a live database password and are committed to a (potentially public) repo. **Rotate the Neon password** (Neon console → *Roles* → reset) once deployment is finished, and prefer keeping secrets only in Render/Vercel env vars rather than in this file long‑term.

**Done — this project's values:**

- **Neon project:** `https://console.neon.tech/app/projects/dark-term-53977155`
- **Region:** `ap-southeast-1` (Singapore) · **Database:** `neondb` · **Role:** `neondb_owner`
- **`DATABASE_URL`** (pooled — host has `-pooler`):
  ```
  postgresql://neondb_owner:npg_gdX8WO3axvhe@ep-steep-wildflower-aozj0wmb-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
  ```
- **`DIRECT_URL`** (direct — same host **without** `-pooler`, for migrations):
  ```
  postgresql://neondb_owner:npg_gdX8WO3axvhe@ep-steep-wildflower-aozj0wmb.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
  ```

---

## Step 2 — Switch Prisma from SQLite to PostgreSQL ✅ DONE

Edit `backend/prisma/schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"      // was "sqlite"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")  // for migrations through Neon's pooler
}
```

Then create the first migration **against Neon** from your machine (so the tables exist in production). Put the Neon strings (from Step 1) in `backend/.env` — this file is git‑ignored, so it is **not** pushed:

```env
DATABASE_URL="postgresql://neondb_owner:npg_gdX8WO3axvhe@ep-steep-wildflower-aozj0wmb-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
DIRECT_URL="postgresql://neondb_owner:npg_gdX8WO3axvhe@ep-steep-wildflower-aozj0wmb.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
```

```powershell
cd backend
# Use the project's pinned Prisma (v5) — NOT bare `npx prisma`, see note below.
node_modules/.bin/prisma migrate dev --name init
```

This creates `backend/prisma/migrations/` and the tables in Neon. Commit it:

```powershell
git add backend/prisma
git commit -m "Switch to PostgreSQL + initial migration"
git push
```

> ⚠️ **Prisma version gotcha (hit on this machine):** bare `npx prisma …` downloads **Prisma 7**, which rejects `url`/`directUrl` in `schema.prisma` (`P1012` — config moved to `prisma.config.ts`). This project is pinned to **Prisma 5.22**, so run the local binary `node_modules/.bin/prisma` (or `npm run`‑wrapped scripts) instead. The same applies to Render's build command in Step 3 — `npx prisma` there resolves to the pinned v5 because it's installed as a dependency, so that's fine.

**Done:** migration `20260610184334_init` applied to Neon (tables `users`, `rooms`, `participants` created); committed as `ac80ccd` and pushed to `main`.

> **About local development now:** Prisma's `provider` can't be SQLite and Postgres at the same time. Two sane options:
> - **Recommended:** use Postgres everywhere — create a *second, free* Neon database for local dev and point your local `backend/.env` at it. One database engine, zero drift.
> - **Keep SQLite locally:** keep `provider = "sqlite"` on your machine and only flip it to `postgresql` on the deployed branch. Workable, but you must remember not to commit the SQLite version. The recommended option is less error‑prone.

---

## Step 3 — Deploy the backend (Render)

1. **render.com** → **New** → **Web Service** → connect your GitHub repo.
2. Configure:
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`
   - **Start Command:** `node dist/main.js`
3. Add **Environment Variables**:

   | Key | Value |
   | --- | ----- |
   | `DATABASE_URL` | Neon **pooled** string |
   | `DIRECT_URL` | Neon **direct** string |
   | `JWT_SECRET` | a long random string (e.g. run `openssl rand -hex 32`) |
   | `JWT_EXPIRES_IN` | `7d` |
   | `CORS_ORIGIN` | *(leave blank for now — you fill this in Step 5)* |

   > You do **not** set `PORT` — Render injects it, and the code already reads `process.env.PORT`.

4. Create the service. When it's live you'll get a URL like `https://watchtogether-backend.onrender.com`. **Copy it.**

> **Free‑tier caveat:** Render's free web service **sleeps after ~15 min of inactivity** and takes ~30–50s to wake on the next request. Fine for a hobby/demo. If you want always‑on free, **Fly.io** or **Railway** are alternatives (slightly more setup).

---

## Step 4 — Get a free TURN server (Metered)

WebRTC uses STUN to discover IPs and TURN to *relay* when a direct connection is impossible (common across home routers / mobile networks). The app already supports TURN via env vars — you just need credentials.

1. **metered.ca** → create account → **Open Relay** (free tier).
2. Copy the TURN URL, username, and credential.

You'll paste these into Vercel in the next step. (If you skip TURN, video will work for *some* networks and silently fail for others — don't skip it.)

---

## Step 5 — Deploy the frontend (Vercel)

1. **vercel.com** → **Add New** → **Project** → import your GitHub repo.
2. Configure:
   - **Root Directory:** `frontend`
   - Framework preset: **Next.js** (auto‑detected)
3. Add **Environment Variables** (the `NEXT_PUBLIC_` ones are read by the browser):

   | Key | Value |
   | --- | ----- |
   | `NEXT_PUBLIC_API_URL` | your Render URL, e.g. `https://watchtogether-backend.onrender.com` |
   | `NEXT_PUBLIC_SOCKET_URL` | **same** Render URL (Socket.IO upgrades to `wss://` automatically) |
   | `NEXT_PUBLIC_TURN_URL` | from Metered |
   | `NEXT_PUBLIC_TURN_USERNAME` | from Metered |
   | `NEXT_PUBLIC_TURN_CREDENTIAL` | from Metered |

4. Deploy. You'll get a URL like `https://watchtogether.vercel.app`. **Copy it.**

---

## Step 6 — Connect the two (CORS) and redeploy

The backend must allow your Vercel domain, or every request becomes "Failed to fetch."

1. In **Render** → your backend service → **Environment** → set:
   ```
   CORS_ORIGIN = https://watchtogether.vercel.app
   ```
   (Use your exact Vercel domain, no trailing slash. You can list several comma‑separated, e.g. your `*.vercel.app` preview domains + a custom domain.)
2. Save → Render redeploys automatically.

That `CORS_ORIGIN` value is used by **both** the REST API (`main.ts`) and the Socket.IO gateway, so it covers logins *and* the realtime connection.

---

## Step 7 — Test it

1. Open `https://watchtogether.vercel.app` in **two different browsers/profiles** (e.g. normal + incognito), logged in as **two different accounts**.
2. Host creates a room, picks a video; guest joins with the code; both click **Ready**.
3. After the countdown, the guest should see the host's video.

If the guest doesn't see video, open **DevTools → Console** in both and read the `[WT-RTC]` logs (the diagnostics we added) — they show whether the offer/answer/ICE exchange completed and whether TURN was used.

---

## Deployment cheat‑sheet

| Setting | Local | Production |
| ------- | ----- | ---------- |
| Database | SQLite `file:./dev.db` | Neon PostgreSQL |
| Prisma provider | `sqlite` | `postgresql` |
| Frontend URL | `http://localhost:3000` | `https://...vercel.app` |
| Backend URL | `http://localhost:4000` | `https://...onrender.com` |
| `CORS_ORIGIN` | `http://localhost:3000` | your Vercel domain |
| TURN | optional | **required** |
| HTTPS | not needed (`localhost`) | **required** (automatic) |

Every push to `main` auto‑deploys both Vercel and Render. 🎉

---

# Part 2 — Scaling plan

The good news: **media never touches your servers** (WebRTC P2P), so the expensive part of a "watch party" app scales for free. The parts that *do* need attention as you grow are **the database**, **the Socket.IO server's in‑memory state**, and (only for big rooms) **the WebRTC topology**.

Below is what to do at each stage. Don't do later phases early — it's wasted effort.

---

## Where the current design has limits (be honest about it)

These are in the code today and are fine for now, but cap how far one server goes:

1. **Single backend instance holds all realtime state in memory.** `RoomGateway` tracks sockets/rooms in process memory, `emitToUser()` loops over *local* sockets only, and the rate limiters are in‑memory `Map`s. → You can run **exactly one** backend instance. Adding a second instance breaks cross‑instance messaging.
2. **Database connection limits.** Serverless/pooled Postgres has connection caps; Prisma needs pooling configured to not exhaust them.
3. **WebRTC is a full mesh.** Designed for host → guest (1‑to‑1 or 1‑to‑few). If a room ever needs *many* viewers, the host's upload becomes the bottleneck (it sends one copy per viewer).
4. **TURN bandwidth costs money** once you exceed free relay quotas (only matters for connections that can't go direct).
5. **Auth is minimal.** No email verification, password reset, refresh tokens, or brute‑force protection yet.

---

## Phase 0 — Now (up to ~100s of users, small rooms)

**Action: nothing beyond Part 1.** A single free Render instance + Neon free tier comfortably handles hundreds of registered users and many concurrent small rooms, because the server only relays tiny signaling/chat messages. Just ship it.

Quick wins worth doing immediately:
- Set a strong `JWT_SECRET` (already in Part 1).
- Add **error monitoring**: create a free **Sentry** project, add the SDK to backend and frontend. You'll see real failures instead of guessing.
- Add a **health check** endpoint and point Render's health check at it (helps Render restart a wedged instance).

---

## Phase 1 — Hundreds to a few thousand users

The database and auth become the things to harden.

**Database**
- Move off free tiers when you approach their storage/connection caps (Neon scales up in‑place; or use Render/Supabase Postgres).
- **Connection pooling:** keep using Neon's pooled URL, and set Prisma's `connection_limit` low (e.g. append `?connection_limit=5` for serverless‑style hosts). Use `directUrl` for migrations.
- Indexes: the schema already has unique indexes on `users.username`, `users.email`, `rooms.room_code`. Add an index on `participants.room_id` and on `rooms.created_at` once you add cleanup queries.
- **Background cleanup job:** rooms/participants are never deleted today. Add a scheduled task (NestJS `@nestjs/schedule` cron, or a Render Cron Job) to delete `ENDED`/stale rooms and orphaned participants nightly.

**Auth hardening (more real users = more abuse)**
- Email verification + password reset (needs an email provider — Resend/Postmark have free tiers).
- **Login brute‑force protection** — but note the current rate limiter is in‑memory, so move it to **Redis** (see Phase 2) so limits hold across restarts.
- Consider short‑lived access tokens + refresh tokens instead of a single 7‑day JWT.
- Add `helmet` and request rate limiting (`@nestjs/throttler`) on the REST API.

**Infra**
- Move secrets into the host's secret manager (already the case on Render/Vercel — just don't commit `.env`).
- Add structured logging and uptime monitoring (e.g. UptimeRobot, free).

---

## Phase 2 — Tens of thousands of users / need more than one backend

This is the **horizontal scaling** step. The blocker is the in‑memory Socket.IO state (limit #1 above). To run **multiple backend instances** behind a load balancer:

1. **Add Redis + the Socket.IO Redis adapter** (`@socket.io/redis-adapter`). This lets `server.to(roomCode).emit(...)` reach clients connected to *any* instance. This is the single most important change for horizontal scale.
2. **Replace the per‑instance `emitToUser()` loop** with the adapter's cross‑instance delivery (or look the user up via a Redis presence map).
3. **Move rate limiters and presence into Redis** so they're shared, not per‑process.
4. **Load balancer with sticky sessions** (or rely on the Redis adapter so any instance can serve any client). Socket.IO over a load balancer needs sticky sessions unless you're on pure WebSocket transport — this app already forces `transports: ['websocket']`, which simplifies it.
5. **Autoscaling:** make instances stateless (they will be, after steps 1–3) and let the platform scale them on CPU/connection count. At this point you're on a paid tier (Render/Fly/Railway/Fly Machines, or a small Kubernetes setup).
6. **Managed Redis:** Upstash (serverless Redis, generous free tier) or Render/Railway Redis.
7. **Database:** add read replicas for read‑heavy endpoints, raise connection pool sizing, consider a dedicated PgBouncer if not using a managed pooler.

After this phase the architecture is: `Vercel (frontend/CDN) → Load Balancer → N stateless NestJS instances ↔ Redis (adapter + cache + rate limit) ↔ Postgres (pooled, with replicas)`.

---

## Phase 3 — Large rooms / many viewers per host (architectural change)

Only relevant if you change the product from "a host + a friend" to "a host + a large audience." A full WebRTC mesh can't do that — the host can't upload N copies of the video.

**Introduce an SFU (Selective Forwarding Unit):** the host uploads **one** stream to a media server, which fans it out to all viewers.
- Options: **LiveKit** (open source, also offers managed cloud with a free tier), **mediasoup** (library you self‑host), **Janus**.
- This replaces the P2P `RTCPeerConnection` mesh in `webrtc.ts` with a client that talks to the SFU. The signaling gateway you already have maps cleanly onto an SFU's room model.
- Trade‑off: now you *do* pay for media bandwidth/compute, but you gain unlimited viewers and better reliability. Add a CDN/edge for the SFU egress for global audiences.

---

## TURN scaling (cross‑cutting)

TURN only carries traffic for connections that can't go peer‑to‑peer, but at scale that's still real bandwidth:
- Free Metered Open Relay → paid Metered/Twilio, **or** self‑host **coturn** on a cheap VPS, **or** a coturn cluster behind DNS for high volume.
- Put TURN servers in multiple regions close to users to reduce relay latency.

---

## Summary: what to change, and when

| Stage | Users | Main change | Cost |
| ----- | ----- | ----------- | ---- |
| **0** | up to ~100s | Deploy as in Part 1; add Sentry + health check | $0 |
| **1** | 100s–1000s | Postgres pooling, DB indexes, cleanup cron, auth hardening, throttling | ~$0–$20/mo |
| **2** | 10k+ | **Redis + Socket.IO Redis adapter**, stateless multi‑instance, autoscale, managed Redis | scales with usage |
| **3** | large rooms | Replace P2P mesh with an **SFU** (LiveKit/mediasoup) | media bandwidth |

The headline: you can launch **completely free today**, and the first real engineering investment you'll need is **Redis + the Socket.IO Redis adapter** when one backend instance is no longer enough. Everything before that is configuration, not re‑architecture.
