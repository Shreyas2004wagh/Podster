# Podster

Podster is a browser-based remote podcast recording app. It gives a host a recording room, lets guests join from their browsers, records each participant locally, stores chunks in IndexedDB while the session is running, and uploads the saved media only after recording stops.

The main idea is simple: the live call and the recorded take should not depend on the same path. WebRTC handles the conversation. MediaRecorder handles local capture. The upload worker handles resumable transfer after the take is complete.

## What It Does

- Create a host-led recording session.
- Let guests join with a session link.
- Capture local audio/video tracks in each participant's browser.
- Store recording chunks in IndexedDB during the session.
- Upload chunks after recording stops instead of during the live call.
- Use resumable multipart uploads through signed URLs.
- Keep WebRTC signaling separate from the recording pipeline.
- Track sessions, participants, uploaded tracks, and upload targets in PostgreSQL.

## Tech Stack

- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend:** Fastify, TypeScript, Socket.IO, Prisma
- **Database:** PostgreSQL
- **Storage:** S3-compatible object storage, including AWS S3, Cloudflare R2, or MinIO
- **Shared package:** workspace types and constants used by frontend and backend
- **Tooling:** pnpm workspaces, ESLint, Playwright, Prisma migrations

## Repository Structure

```text
Podster/
  frontend/   Next.js app, recording UI, IndexedDB chunk storage, upload worker
  backend/    Fastify API, auth, session service, Socket.IO signaling, storage signing
  shared/     Shared TypeScript types/constants
  infra/      Dockerfiles, compose file, environment example
```

## How It Works

1. A host creates a session from the frontend.
2. The backend creates a session record and issues a host token.
3. Guests join the session and receive guest tokens.
4. Socket.IO handles room membership and WebRTC signaling events.
5. MediaRecorder captures local media in each browser.
6. Chunks are saved to IndexedDB while recording is active.
7. After recording stops, a web worker uploads chunks through signed multipart upload URLs.
8. The backend records track metadata and upload status in PostgreSQL.

## Prerequisites

- Node.js 20+
- pnpm 10+
- Docker Desktop, or another PostgreSQL instance
- S3-compatible storage for real uploads

Install dependencies:

```bash
pnpm install
```

## Environment Setup

The repo includes a combined example file at `infra/env.example`.

For local development, create these files:

```bash
cp infra/env.example backend/.env
```

Optional frontend override:

```bash
echo NEXT_PUBLIC_API_URL=http://localhost:4000 > frontend/.env.local
```

Important variables:

| Variable | Used by | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Frontend | Backend API URL |
| `PORT` | Backend | API port, defaults to `4000` |
| `FRONTEND_ORIGIN` | Backend | Allowed frontend origin for CORS and Socket.IO |
| `HOST_JWT_SECRET` | Backend | Host auth token signing secret |
| `GUEST_JWT_SECRET` | Backend | Guest auth token signing secret |
| `COOKIE_SECRET` | Backend | Signed cookie secret |
| `DATABASE_URL` | Backend/Prisma | PostgreSQL connection string |
| `STORAGE_PROVIDER` | Backend | `s3` or `r2`; local storage is not implemented |
| `STORAGE_BUCKET` | Backend | Object-storage bucket name |
| `STORAGE_REGION` | Backend | S3/R2 region |
| `STORAGE_ACCESS_KEY` | Backend | Storage access key |
| `STORAGE_SECRET_KEY` | Backend | Storage secret key |
| `STORAGE_ENDPOINT` | Backend | Required for R2/MinIO or other custom S3 endpoints |
| `STORAGE_FORCE_PATH_STYLE` | Backend | Set to `true` for MinIO/local S3-compatible endpoints when needed |

Use long random values for all secrets outside disposable local development.

## Database Setup

Start a local PostgreSQL container:

```bash
docker compose -f backend/docker-compose.dev.yml up -d
```

The compose file starts PostgreSQL with:

- database: `podster`
- user: `podster`
- password: `podster`
- port: `5432`

Make sure `backend/.env` points to the same database:

```env
DATABASE_URL=postgresql://podster:podster@localhost:5432/podster
```

Generate the Prisma client and apply migrations:

```bash
pnpm --filter @podster/backend db:generate
pnpm --filter @podster/backend db:migrate:deploy
```

For local schema changes during development, use:

```bash
pnpm --filter @podster/backend db:migrate
```

## Storage Setup

Podster signs multipart upload URLs from the backend, so uploads need S3-compatible storage.

Supported modes:

- `STORAGE_PROVIDER=s3` for AWS S3 or MinIO
- `STORAGE_PROVIDER=r2` for Cloudflare R2

For MinIO-style local storage, run the full infra compose stack:

```bash
docker compose -f infra/docker-compose.yaml up -d postgres minio createbuckets
```

Example MinIO-style backend values:

```env
STORAGE_PROVIDER=s3
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_BUCKET=podster
STORAGE_FORCE_PATH_STYLE=true
```

For production buckets, configure CORS so browsers can upload multipart parts and read the `ETag` response header.

## Running Locally

Start the whole workspace:

```bash
pnpm dev
```

This command:

1. Builds `shared`.
2. Starts the shared package in watch mode.
3. Starts the backend on `http://localhost:4000`.
4. Starts the frontend on `http://localhost:3000`.

Local URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`
- Health check: `http://localhost:4000/live`
- Readiness check: `http://localhost:4000/ready`
- Metrics: `http://localhost:4000/metrics`

If port `3000` is already in use, run the frontend on another port:

```bash
pnpm -C frontend exec next dev -p 3001
```

Then set the backend origin for that port:

```bash
FRONTEND_ORIGIN=http://localhost:3001 pnpm -C backend dev
```

On Windows PowerShell, use:

```powershell
$env:FRONTEND_ORIGIN="http://localhost:3001"; pnpm -C backend dev
```

## Useful Commands

Run all workspace checks:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Frontend:

```bash
pnpm -C frontend dev
pnpm -C frontend lint
pnpm -C frontend typecheck
pnpm -C frontend build
pnpm --filter frontend exec playwright test
```

Backend:

```bash
pnpm -C backend dev
pnpm -C backend lint
pnpm -C backend typecheck
pnpm -C backend build
pnpm --filter @podster/backend test
```

Database:

```bash
pnpm --filter @podster/backend db:generate
pnpm --filter @podster/backend db:migrate
pnpm --filter @podster/backend db:migrate:deploy
pnpm --filter @podster/backend db:studio
```

## API Overview

Core backend endpoints:

- `POST /sessions` - create a host session
- `GET /sessions/:id` - fetch session details
- `POST /sessions/:id/join` - join a session as a guest
- `POST /sessions/:id/start` - mark a host session live
- `POST /sessions/:id/upload-urls` - request signed multipart upload URLs
- `POST /sessions/:id/complete-upload` - complete an uploaded track
- `GET /sessions/:id/tracks/:trackId/download` - get a signed track download URL
- `GET /sessions/:id/recording` - get a signed URL for the latest completed video recording
- `GET /api/sessions/:id/recording` - alternate latest-recording URL route
- `GET /health`, `GET /ready`, `GET /live` - service health checks

Socket.IO handles:

- `join-room`
- `leave-room`
- `offer`
- `answer`
- `ice-candidate`

## Frontend Notes

- Recording chunks are stored in IndexedDB under the `podster-recordings` database.
- Uploads are dispatched through `frontend/workers/upload-worker.ts`.
- Viewer/session state is saved in browser storage so reloads can recover context.
- `frontend/scripts/ensure-next-types.mjs` creates placeholder App Router type files before typecheck, so `pnpm -C frontend typecheck` works on clean checkouts.

## Backend Notes

- Prisma models live in `backend/prisma/schema.prisma`.
- Migrations live in `backend/prisma/migrations`.
- Authentication uses separate host and guest JWT secrets.
- The backend intentionally keeps signaling and recording/storage logic separate.
- `STORAGE_PROVIDER=local` is not implemented; use `s3` or `r2`.

## Deployment Notes

For a Render backend service:

- Root directory: repo root
- Build command:

```bash
pnpm install --frozen-lockfile && pnpm --filter @podster/shared build && pnpm --filter @podster/backend db:generate && pnpm --filter @podster/backend build
```

- Pre-deploy command:

```bash
pnpm --filter @podster/backend db:migrate:deploy
```

- Start command:

```bash
pnpm --filter @podster/backend start
```

Required production backend variables:

- `NODE_ENV=production`
- `DATABASE_URL`
- `FRONTEND_ORIGIN`
- `HOST_JWT_SECRET`
- `GUEST_JWT_SECRET`
- `COOKIE_SECRET`
- `STORAGE_PROVIDER`
- `STORAGE_BUCKET`
- `STORAGE_REGION`
- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`
- `STORAGE_ENDPOINT` for R2 or custom S3-compatible storage

When frontend and backend are deployed on different sites, review cookie settings:

- `COOKIE_SAME_SITE=none`
- `COOKIE_DOMAIN` when sharing cookies across subdomains

## Troubleshooting

**Backend starts but `/ready` is not ready**

- Check `DATABASE_URL`.
- Confirm PostgreSQL is running.
- Run `pnpm --filter @podster/backend db:migrate:deploy`.
- Confirm storage credentials are valid.

**Frontend cannot reach the backend**

- Check `NEXT_PUBLIC_API_URL`.
- Check backend `FRONTEND_ORIGIN`.
- Confirm backend is listening on `http://localhost:4000`.

**Uploads fail in the browser**

- Confirm storage bucket CORS allows browser PUT requests.
- Expose the `ETag` response header for multipart uploads.
- For MinIO, set `STORAGE_FORCE_PATH_STYLE=true`.

**Port is already in use**

- Run frontend on another port with `pnpm -C frontend exec next dev -p 3001`.
- Update backend `FRONTEND_ORIGIN` to match that port.

## Current Scope

Podster is an MVP focused on the recording-room flow, local-first capture, resumable upload plumbing, and clean separation between live communication and recorded media. Media processing and post-production automation can be added on top of the uploaded track metadata.
