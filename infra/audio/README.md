# Audio Stack

This folder runs the isolated audio streaming layer without touching the video stack.

## Stage 7 goals

- Keep audio on a separate compose project, network, port, and public entrypoint.
- Run `Icecast` and `Liquidsoap` behind the isolated audio gateway.
- Run `FFmpeg` as a lightweight HLS packager for each dedicated AAC mount.
- Publish `HLS` as the default browser and mobile playback path.
- Keep direct `MP3` and `AAC` mounts available for fallback and diagnostics.
- Accept an optional live source from any Icecast-compatible encoder and keep the stack quiet when that source is disconnected.
- Generate dedicated internal Liquidsoap, Icecast, and HLS paths for every audio streaming.
- Expose opaque per-stream playback routes and a shorter per-stream live publish mount without relying on a shared fallback chain.
- Add a company-scoped AutoDJ library with uploaded music stored on disk and metadata kept in SQLite.
- Keep one default company playlist active as the 24/7 fallback with priority 2.
- Let custom company playlists take priority 1 during weekly scheduled windows.
- Reject overlapping custom schedule windows inside the same company because two active priority-1 playlists would make playback ambiguous.
- Keep live source input above AutoDJ priority so a valid live publisher always wins for that streaming.
- Avoid reusing the MediaMTX or Nginx routes from the video stack.

## Local port

- `8090/tcp` for the isolated audio gateway and public audio base URL.

Optional environment values:

- `AUDIO_HTTP_PORT` overrides the local listener port.
- `AUDIO_PUBLIC_URL` documents the public base URL that audio clients should use.
- `AUDIO_ICECAST_SOURCE_PASSWORD` changes the source password used by Liquidsoap.
- `AUDIO_ICECAST_ADMIN_PASSWORD` changes the Icecast admin password.
- `AUDIO_ICECAST_RELAY_PASSWORD` changes the Icecast relay password.
- `AUDIO_ICECAST_HOSTNAME` changes the hostname Icecast publishes in metadata.
- `AUDIO_STATION_NAME` changes the station name shown by the stage-3 outputs.
- `AUDIO_LIVE_SOURCE_PORT` changes the public live publish port used by the live source encoder.
- `AUDIO_LIVE_SOURCE_PASSWORD` changes the publish password used by the live source encoder.
- `AUDIO_AUTODJ_SYNC_INTERVAL_SECONDS` changes how often Liquidsoap refreshes the company AutoDJ `active.m3u` files from SQLite.

## Services

- `Icecast` for source mounts and client delivery; the source port (`AUDIO_LIVE_SOURCE_PORT`) is exposed directly on the host so live encoders connect without going through nginx.
- `Liquidsoap` for live-plus-AutoDJ routing; reads each MP3 source mount from Icecast via `input.http`, falls back to the company `active.m3u` AutoDJ file, and transcodes to AAC for the HLS pipeline.
- `FFmpeg` for one lightweight AAC-to-HLS worker per audio streaming.
- `HLS` at `/hls/<streamingAlias>/<publishKey>/live.m3u8` as the default browser and mobile playback path.
- `MP3` at `/listen/<streamingAlias>/<publishKey>/radio.mp3` as the compatibility fallback.
- `AAC` at `/listen/<streamingAlias>/<publishKey>/radio.aac` as the lighter modern direct stream.
- Opaque per-stream gateway routes that map each audio streaming to its own inner chain.
- AutoDJ playlists rendered under `playlists/companies/<companyId>/` with an `active.m3u` file watched by Liquidsoap.

## Folder layout

- `icecast/` for Icecast image, startup script, and config template.
- `ffmpeg/` for the HLS packager image and startup script.
- `liquidsoap/` for Liquidsoap image, startup script, and live input script template.
- `library/` for uploaded music assets, including `library/companies/<companyId>/`.
- `playlists/` for rendered company playlist files, including `playlists/companies/<companyId>/active.m3u`.
- `state/` for runtime state.
- `hls/` for future audio HLS output.
- `nginx/` for the isolated audio gateway config.
- `www/` for the public audio stack status page.

## Public endpoints

- `GET /healthz` returns the audio stack health marker for stage 6.
- `GET /status` proxies the Icecast JSON status page.
- `GET /hls/<streamingAlias>/<publishKey>/live.m3u8` serves the per-stream HLS playlist path.
- `GET /listen/<streamingAlias>/<publishKey>/radio.mp3` proxies the per-stream MP3 listener path.
- `GET /listen/<streamingAlias>/<publishKey>/radio.aac` proxies the per-stream AAC listener path.
- `GET /hls/live.m3u8`, `GET /listen/radio.mp3`, `GET /listen/radio.aac`, and `GET /mount/<token>` return `410`.

## Live publish input

- Any Icecast-compatible source client must connect **directly** to the Icecast port (`AUDIO_LIVE_SOURCE_PORT`, default 8010), not to the nginx gateway port.
- The publish mount is `/live/<publishMountToken>`, derived from the streaming id and ingest key. The `publishMountToken` is shown on the audio control page.
- Username stays `source`.
- Password comes from `AUDIO_LIVE_SOURCE_PASSWORD` (same value as `AUDIO_ICECAST_SOURCE_PASSWORD` by default).
- Required codec: `MP3`, `192 kbps`, `44.1 kHz`, stereo. OGG is not supported.
- Liquidsoap reads from `/live/<publishMountToken>` via `input.http` and outputs MP3 and AAC to the listener mounts.
- If `/listen/<streamingAlias>/<publishKey>/radio.aac` returns `404` while publishing, Liquidsoap has not yet received valid frames; verify codec, bitrate, and sample rate in the encoder.

When the live publisher connects, Liquidsoap reads the Icecast MP3 mount and exposes AAC and HLS.
When it disconnects, those outputs fall back to the company AutoDJ source.

## AutoDJ note

The company AutoDJ page manages uploads, folders, playlists, and weekly schedules through the backend API.
The default playlist is the always-on fallback with priority 2.
Custom playlists are priority 1 while their schedule window is active.
If two custom schedules would overlap, the backend rejects the change and returns the reason.

## HLS note

Each HLS worker reads one dedicated AAC mount and repackages it with stream copy.
That keeps CPU use low while giving web, iOS, and Android clients a stable default path per streaming.

## Live source note

Any IceCast-compatible source client can publish through the stage-6 live mount.
If no live source is connected, the stack stays quiet.

## Start the stack

From this folder:

```bash
docker compose up -d
```

## Stage 7 note

Stage 7 keeps the same opaque public URLs from stage 6, but now each company also gets a shared AutoDJ library,
playlist set, and rendered `active.m3u` file watched by Liquidsoap.
Source clients still connect directly to Icecast; nginx is not in the source path.
Live source stays above AutoDJ priority for each streaming.