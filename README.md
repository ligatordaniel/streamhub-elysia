# StreamHub Elysia

Monorepo for a company-scoped audio/video streaming platform with a single root env contract.

## Layout
- `frontend/` React + Vite + Tailwind CSS client.
- `backend/` Bun + Elysia API.
- `database/` shared SQLite schema, UUID seed data, and local data directory.
- `docs/streaming/` streaming architecture and runbook notes.
- `infra/streaming/` MediaMTX, Nginx, and compose config for the media plane.
- `.env.main` root environment contract used by both apps.

## Domain
- Every user belongs to one company.
- Every streaming belongs to one company.
- The seeded `super_admin` user belongs to `scriptdog_limitada`.
- `scriptdog_limitada` starts with 2 audio streamings and 2 video streamings.
- The super admin can manage companies, users, and streamings across company boundaries.

## Auth flow
- The backend seeds the first `super_admin` from `.env.main`.
- The backend returns the logged-in company and that company streamings.
- The frontend stores the signed token in `localStorage`.
- The backend stays stateless and validates the bearer token on each request.

## Local dev
1. Make sure `.env.main` has the local values you want to run.
2. Run `bun run localdeploy` from the repo root.
3. The backend will listen on `http://localhost:3012`, the frontend on `http://localhost:5173`, and the streaming layer will expose RTMP on `rtmp://localhost:1935`.

The backend and frontend each have their own Dockerfile and docker-compose.yml so you can also start them independently from their folders if you need to.

The streaming layer lives under `infra/streaming/` and is intentionally separate so the transmitter PC can carry the encode load while the server stays thin.

The backend database config lives in `backend/src/config/database.ts` and only points at the shared `database/` assets.