# Shared Project Context

This file is the single source of truth for Copilot and Claude Code.

## Project
Build a streaming platform for audio and video with a focus on low latency, strong typing, and mobile-first UX.
Audio and video live delivery must stay isolated by stack so one media flow does not break the other.

## Non-negotiable defaults
- Use TypeScript and strict types whenever possible.
- Prefer small, testable changes over broad refactors.
- Keep APIs, media flows, and UX decisions explicit.
- Do not guess about codecs, providers, or deployment details; confirm them in code or docs.
- Favor accessibility, performance, and observability.

## Streaming rules
- Live video and live audio must stay on separate infrastructure stacks, compose files, ports, and public URL prefixes.
- Prefer WebRTC for live interactive flows that need low latency.
- Prefer HLS or LL-HLS for broadcast or VOD style delivery when latency can be higher.
- Keep ingest, transcoding, delivery, auth, and playback concerns separated.
- Document any transport, codec, or storage decision in this file before using it broadly.
- Baseline live video uses H.264 plus AAC from the transmitter PC.
- MediaMTX is the core streaming server for RTMP ingest, HLS playback, and optional WebRTC.
- The live server must not transcode by default; encoding stays on the transmitter PC.
- `infra/streaming/` remains the isolated video stack backed by MediaMTX.
- `infra/audio/` is the isolated audio stack and must not reuse the video ingest or playback routes.
- Audio stage 1 only reserves the isolated stack, gateway, folders, and deploy path; the audio delivery chain is wired in later stages.
- Planned audio baseline is Icecast plus Liquidsoap, with AAC over HLS as the default playback path and MP3 as the compatibility fallback.
- Stream paths are short opaque aliases: `live/<streamingAlias>/<publishKey>`.
- Nginx fronts HLS and the WebRTC HTTP handshake; RTMP ingest stays direct to MediaMTX.
- The streaming control page renders a real HLS player and falls back to hls.js when the browser lacks native HLS support.
- The streaming control page shows a shortened RTMP publish URL prefix and shortened publish key separately for OBS or vMix, plus the combined ingest URL for convenience.
- Stored ingest keys are editable only by super_admin in the admin console, and the control page derives short opaque publish aliases from the streaming id and ingest key.
- Emergency fallback images are shared at the company level, not per streaming path or browser session.
- Each company can store up to 10 emergency fallback images, with one selected image and one autoplay flag used by both the control page and the public embed player.

## Repository layout
- frontend/ contains the React + Vite client and its Tailwind CSS styling layer.
- backend/ contains the Bun + Elysia API and the backend-local database config.
- database/ contains shared schema, seed material, and SQLite artifacts.
- infra/audio/ contains the isolated audio compose stack and its future Auto DJ assets.
- .env.main lives at the repository root and is the single environment contract for both apps.
- The backend database config stays inside backend/ and only points to assets stored in database/.

## Domain model
- Every user belongs to exactly one company.
- Every streaming service belongs to exactly one company.
- Companies, users, and streamings are all identified by UUIDs.
- The seeded super_admin user belongs to scriptdog_limitada.
- scriptdog_limitada starts with 2 audio streamings and 2 video streamings.
- The super_admin can manage companies, users, and streamings across company boundaries.
- A regular user only sees the streamings attached to their company.
- The initial seed is insert-only so later admin edits survive restarts.

## Environment contract
- APP_NAME names the app in logs and UI metadata.
- API_HOST and API_PORT define the backend listener (default port: 3012).
- CORS_ORIGIN defines the frontend origin allowed to call the API.
- DATABASE_PATH points to the SQLite file under database/.
- JWT_SECRET, JWT_ISSUER, JWT_AUDIENCE, and JWT_TTL_SECONDS define the auth token contract.
- SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, and SUPER_ADMIN_NAME seed the first admin account.
- VITE_API_URL is the frontend build-time API base URL (default: http://localhost:3012).
- STREAMING_INGEST_URL is the public RTMP base URL used with a separate stream key.
- STREAMING_HLS_URL and STREAMING_WEBRTC_URL define the browser playback endpoints used by the control page.
- AUDIO_HTTP_PORT defines the isolated audio gateway listener used by the audio compose stack (default: 8090).
- AUDIO_PUBLIC_URL defines the public base URL reserved for future audio playback and status endpoints (default: http://localhost:8090).

## Frontend styling contract
- The frontend styling system is Tailwind CSS on top of Vite.
- Existing semantic component class names may stay in the JSX, but their implementation should be expressed through Tailwind utilities or Tailwind layers.
- Mobile-first layout remains the default for all frontend work.

## Auth contract
- Login uses email and password for the whole app.
- The first super_admin is seeded from the root env file, not hardcoded in source.
- The backend returns a signed bearer token, the user company, and the user's company streamings.
- The frontend stores the bearer token in localStorage.
- Logout clears the stored token on the client and remains stateless on the server.

## Local deployment
- frontend/ and backend/ each own a Dockerfile and a docker-compose.yml file.
- The root package.json exposes a localdeploy script that starts the backend, frontend, video streaming, and audio compose stacks.
- The compose files mount the workspace root so both apps can read the shared .env.main and database/ assets.
- The compose services install workspace dependencies on startup so mounted node_modules volumes stay in sync with package changes.

## Custom skills
- Caveman is the shared style skill for simple explanations.
- Use it when the user asks for a basic, easy, or caveman-style answer.
- Keep it mirrored in both .github/skills/caveman/SKILL.md and .claude/skills/caveman/SKILL.md.
- Guard Clauses is the shared refactoring skill for nested conditionals and validation-heavy code.
- Use it when the user asks to simplify branching or reduce nesting in functions.
- Keep it mirrored in both .github/skills/guard-clauses/SKILL.md and .claude/skills/guard-clauses/SKILL.md.
- Sync Contract is the shared workflow skill for keeping Copilot and Claude instructions aligned.
- Use it when editing shared docs, mirrored skills, or entry instructions that must stay identical.
- Keep it mirrored in both .github/skills/sync-contract/SKILL.md and .claude/skills/sync-contract/SKILL.md.

## Sync contract
- Any assistant change must start here.
- Update this file first, then keep .github/copilot-instructions.md, AGENTS.md, and CLAUDE.md aligned.
- If a rule or shared skill changes, update all three entry files and the mirrored skill files in the same change.
- Use the Sync Contract skill for those updates so the mirrored files do not drift.
