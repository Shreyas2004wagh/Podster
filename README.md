# Podster

Riverside-style remote podcast recording MVP with local MediaRecorder capture, chunk persistence via IndexedDB, and resumable uploads. Live comms (WebRTC) stay isolated from recording.

## Project layout

- `frontend/` – Next.js 14 (App Router, TS, Tailwind, shadcn-inspired UI), MediaRecorder + IndexedDB + worker upload scaffolding
- `backend/` – Fastify + TS, JWT auth (host + guest), in-memory session/track store, S3-compatible upload stubs
- `shared/` – Types and constants shared across services
- `infra/` – Dockerfiles, docker-compose, env examples

## Quickstart

```bash
pnpm install
pnpm dev
```

Frontend: http://localhost:3000  
Backend API: http://localhost:4000

## Environment

Copy `infra/env.example` to `.env` files as needed. Key vars:

- `NEXT_PUBLIC_API_URL` – backend URL for the frontend
- `HOST_JWT_SECRET`, `GUEST_JWT_SECRET` – JWT signing secrets
- `STORAGE_*` – S3/R2-compatible settings for signed URLs

## Architecture notes

- **Separation of concerns**: WebRTC signaling/client kept in its own module; recording pipeline is local-only.
- **Local-first recording**: MediaRecorder slices every second, persists to IndexedDB; uploads happen only after stop.
- **Resumable uploads**: Worker fans out PUTs to signed URLs; chunk metadata stays locally until completion.
- **Processing hook**: Placeholder FFmpeg service ready to be wired to object-storage events.