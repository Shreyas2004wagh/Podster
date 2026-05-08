# Podster

Riverside-style remote podcast recording MVP with local MediaRecorder capture, chunk persistence via IndexedDB, and resumable uploads. Live comms (WebRTC) stay isolated from recording.

## Project layout

- `frontend/` - Next.js 14 (App Router, TS, Tailwind, shadcn-inspired UI), MediaRecorder + IndexedDB + worker upload scaffolding
- `backend/` - Fastify + TS, JWT auth (host + guest), in-memory session/track store, S3-compatible upload stubs
- `shared/` - Types and constants shared across services
- `infra/` - Dockerfiles, docker-compose, env examples

## Quickstart

```bash
pnpm install
pnpm dev
```

Frontend: http://localhost:3000
Backend API: http://localhost:4000

## Validation

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm --filter @podster/backend test
pnpm --filter frontend exec playwright test
```

The frontend `typecheck` command bootstraps placeholder App Router type files before `tsc` runs so clean checkouts do not depend on an existing `.next` build artifact.

## Environment

Copy `infra/env.example` to `.env` files as needed. Key vars:

- `NEXT_PUBLIC_API_URL` - backend URL for the frontend
- `HOST_JWT_SECRET`, `GUEST_JWT_SECRET` - JWT signing secrets
- `STORAGE_*` - S3/R2-compatible settings for signed URLs

## Render backend deployment

For a Render web service that runs the backend:

- Root directory: repo root
- Build command: `pnpm install --frozen-lockfile && pnpm --filter @podster/shared build && pnpm --filter @podster/backend db:generate && pnpm --filter @podster/backend build`
- Pre-deploy command: `pnpm --filter @podster/backend db:migrate:deploy`
- Start command: `pnpm --filter @podster/backend start`

Set these backend env vars explicitly in Render production:

- `NODE_ENV=production`
- `PORT` supplied by Render
- `DATABASE_URL`
- `FRONTEND_ORIGIN`
  Use a comma-separated list if you need both a production frontend URL and a preview/local URL.
- `HOST_JWT_SECRET`
- `GUEST_JWT_SECRET`
- `COOKIE_SECRET`
- `COOKIE_SAME_SITE`
  Use `none` if the frontend and backend are on different sites.
- `COOKIE_DOMAIN`
  Set this when you need cookies shared across subdomains.
- `STORAGE_PROVIDER`
- `STORAGE_BUCKET`
- `STORAGE_REGION`
- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`
- `STORAGE_ENDPOINT`
  Required for R2 or any non-AWS S3-compatible target.

### Storage notes

- Multipart uploads require the bucket CORS policy to expose the `ETag` response header.
- Use `backend/scripts/configure-cors.ts` to apply a matching bucket CORS rule for the configured `FRONTEND_ORIGIN`.
- `STORAGE_FORCE_PATH_STYLE` should usually stay empty unless you are targeting a local S3-compatible endpoint such as MinIO.

## Architecture notes

- **Separation of concerns**: WebRTC signaling/client kept in its own module; recording pipeline is local-only.
- **Local-first recording**: MediaRecorder slices every second, persists to IndexedDB; uploads happen only after stop.
- **Resumable uploads**: Worker fans out PUTs to signed URLs; chunk metadata stays locally until completion.
- **Processing hook**: Placeholder FFmpeg service ready to be wired to object-storage events.
