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
- Audio stage 5 runs Icecast as the isolated audio server, Liquidsoap as the isolated live-switch worker, and FFmpeg as the isolated HLS packager.
- Audio stage 5 exposes the default HLS playback path through opaque per-stream routes at `/hls/<streamingAlias>/<publishKey>/live.m3u8`.
- Audio stage 5 keeps direct Icecast-backed playback through opaque per-stream routes at `/listen/<streamingAlias>/<publishKey>/radio.aac` and `/listen/<streamingAlias>/<publishKey>/radio.mp3`.
- Audio stage 5 accepts an optional BUTT-style live source through opaque per-stream routes at `/publish/<streamingAlias>/<publishKey>/live` and automatically falls back to music when that live source disconnects.
- BUTT is treated as the optional live publisher for audio.
- Planned audio baseline remains Icecast plus Liquidsoap, with AAC over HLS as the default playback path and MP3 as the compatibility fallback when live is available.
- Audio stage 6 replaces the shared inner audio chain with per-stream source mounts on Icecast, per-stream `input.http` readers on Liquidsoap, and per-stream HLS worker outputs derived from the audio streamings table.
- Audio stage 6 accepts source connections directly on the Icecast port (`AUDIO_LIVE_SOURCE_PORT`) so the nginx gateway is not in the source path; the `/mount/` route on the gateway returns 410.
- Audio stage 6 live publish mount is `/live/<publishMountToken>` on Icecast, derived from the streaming id and ingest key; Liquidsoap reads from that mount via `input.http` and outputs both MP3 and AAC to the listener mounts for playback and the HLS pipeline.
- Audio stage 6 keeps opaque per-stream playback routes at `/listen/<streamingAlias>/<publishKey>/radio.aac`, `/listen/<streamingAlias>/<publishKey>/radio.mp3`, and `/hls/<streamingAlias>/<publishKey>/live.m3u8`.
- Audio stage 6 source codec must be MP3 at 192 kbps, 44.1 kHz, stereo; OGG is not supported on this path.
- Audio stage 6 listener mounts can return `404` while no valid live source is connected; the AAC and HLS paths become available only after Liquidsoap receives a valid MP3 source stream on the Icecast mount.
- Audio stage 7 adds a company-scoped AutoDJ layer on top of stage 6 so live audio still keeps per-stream mounts while music playback is shared by company.
- Audio stage 7 stores uploaded music on disk under `infra/audio/library/companies/<companyId>/` and keeps folder, track, playlist, and schedule metadata in SQLite.
- Audio stage 7 keeps one default company playlist running as priority 3 and allows custom company playlists as priority 2 when one of their weekly schedules is active and the playlist is enabled.
- Audio stage 7 rejects overlapping custom weekly schedules inside the same company because two active priority-2 playlists would make source selection ambiguous.
- Audio stage 7 keeps the live source at priority 1: if a valid live publisher is connected on a streaming, that live source wins immediately; Liquidsoap falls back to the company AutoDJ source with `track_sensitive=false` so the switch is mid-frame, not at track boundaries.
- Audio stage 7 materializes two M3U files per company: `default.m3u` (always populated with the default playlist tracks) and `custom.m3u` (populated with the currently active custom playlist tracks, or empty when no custom playlist is active or the active playlist is disabled).
- Audio stage 7 generates a Liquidsoap `switch(track_sensitive=false)` that reads `custom.m3u` via `process.test("test -s ...")` at every frame to switch sources immediately when a scheduled window starts or ends, without waiting for the current track to finish.
- Audio stage 7 shuffle is stable: the same shuffled order is reused until the track list actually changes; M3U files are only rewritten when their content changes to avoid spurious Liquidsoap reloads.
- Audio stage 7 exposes `GET /audio/autodj/tracks/:trackId/preview` on the backend to stream individual audio files directly for in-browser preview; the endpoint requires a valid bearer token.
- `render-audio-streams.mjs` is baked into the liquidsoap Docker image at `/usr/local/bin/render-audio-streams.mjs`. After any change to that script, rebuild and recreate the container: `docker compose build liquidsoap && docker compose up -d --force-recreate liquidsoap`.
- Liquidsoap playlist sources use `mode="loop"` so playback continues indefinitely without operator intervention.
- Stream paths are short opaque aliases: `live/<streamingAlias>/<publishKey>`.
- Nginx fronts HLS and the WebRTC HTTP handshake; RTMP ingest stays direct to MediaMTX.
- The streaming control page renders a real HLS player and falls back to hls.js when the browser lacks native HLS support.
- The streaming control page shows a shortened RTMP publish URL prefix and shortened publish key separately for OBS or vMix, plus the combined ingest URL for convenience.
- Stored ingest keys are editable only by super_admin in the admin console, and the control page derives short opaque publish aliases from the streaming id and ingest key.
- The frontend exposes a company-scoped AutoDJ page for uploads, folders, playlists, schedules, and drag-and-drop track assignment.
- Emergency fallback images are shared at the company level, not per streaming path or browser session.
- Each company can store up to 10 emergency fallback images, with one selected image and one autoplay flag used by both the control page and the public embed player.

## Repository layout
- frontend/ contains the React + Vite client and its Tailwind CSS styling layer.
- backend/ contains the Bun + Elysia API and the backend-local database config.
- database/ contains shared schema, seed material, and SQLite artifacts.
- infra/audio/ contains the isolated audio compose stack and its future live audio assets.
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
- AUDIO_ICECAST_SOURCE_PASSWORD defines the source credential used by Liquidsoap and future audio publishers.
- AUDIO_ICECAST_ADMIN_PASSWORD defines the admin credential for the isolated audio stack.
- AUDIO_ICECAST_RELAY_PASSWORD defines the relay credential for future audio relays.
- AUDIO_ICECAST_HOSTNAME defines the hostname Icecast publishes in its generated metadata and playlists.
- AUDIO_STATION_NAME defines the public station name used by the stage-2 audio outputs.
- AUDIO_LIVE_SOURCE_PORT defines the public TCP port where Icecast is exposed directly so any Icecast-compatible live source can publish without going through the nginx gateway.
- AUDIO_LIVE_SOURCE_PASSWORD defines the source credential for direct Icecast publish connections; defaults to the same value as AUDIO_ICECAST_SOURCE_PASSWORD.
- Audio stage 6 derives the live publish mount from the streaming alias and publish key, so no shared mount env var is required.
- AUDIO_AUTODJ_SYNC_INTERVAL_SECONDS defines how often the Liquidsoap sidecar refreshes active AutoDJ playlist files from SQLite and the shared library volume.

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
- The root package.json exposes a `localdeploy` script that starts the backend, frontend, video streaming, and audio compose stacks, and a `stopdeploy` script that stops all stacks in reverse order.
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
