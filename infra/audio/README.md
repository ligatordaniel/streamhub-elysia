# Audio Stack

This folder runs the isolated audio streaming layer without touching the video stack.

## Stage 6 goals

- Keep audio on a separate compose project, network, port, and public entrypoint.
- Run `Icecast` and `Liquidsoap` behind the isolated audio gateway.
- Run `FFmpeg` as a lightweight HLS packager for each dedicated AAC mount.
- Publish `HLS` as the default browser and mobile playback path.
- Keep direct `MP3` and `AAC` mounts available for fallback and diagnostics.
- Accept an optional live source from any Icecast-compatible encoder and keep the stack quiet when that source is disconnected.
- Generate dedicated internal Liquidsoap, Icecast, and HLS paths for every audio streaming.
- Expose opaque per-stream playback routes and a shorter per-stream live publish mount without relying on a shared fallback chain.
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

## Services

- `Icecast` for source mounts and client delivery.
- `Liquidsoap` for live-only routing from the live source.
- `Liquidsoap harbor` for one optional Icecast-compatible live source input per audio streaming.
- Stage 6 currently runs on Liquidsoap 2.1.x with `input.harbor` and `icy=true` for source compatibility.
- `FFmpeg` for one lightweight AAC-to-HLS worker per audio streaming.
- `HLS` at `/hls/<streamingAlias>/<publishKey>/live.m3u8` as the default browser and mobile playback path.
- `MP3` at `/listen/<streamingAlias>/<publishKey>/radio.mp3` as the compatibility fallback.
- `AAC` at `/listen/<streamingAlias>/<publishKey>/radio.aac` as the lighter modern direct stream.
- Opaque per-stream gateway routes that now map each audio streaming to its own inner chain.

## Folder layout

- `icecast/` for Icecast image, startup script, and config template.
- `ffmpeg/` for the HLS packager image and startup script.
- `liquidsoap/` for Liquidsoap image, startup script, and live input script template.
- `library/` for music assets.
- `playlists/` for rotation inputs.
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
- `GET /hls/live.m3u8`, `GET /listen/radio.mp3`, and `GET /listen/radio.aac` now return `410` so clients move to the per-stream contract.

## Live publish input

- Any IceCast-compatible source client should publish in `IceCast` mode to the same server host and port used by `AUDIO_PUBLIC_URL`.
- The stage-6 publish mount is `/mount/<publishMountToken>`.
- Username stays `source`.
- Password comes from `AUDIO_LIVE_SOURCE_PASSWORD`.
- `publishMountToken` is derived from the streaming id and ingest key.
- The inner harbor mount is generated from that short publish token.
- Live source connections now stay open longer before timing out, so brief silence or pauses do not disconnect the live input as quickly.
- Recommended first profile: `MP3`, `192 kbps`, `44.1 kHz`, stereo.
- If the mount connects but you still hear nothing, check that the source meter moves and that the source is not muted.
- If `/listen/<streamingAlias>/<publishKey>/radio.mp3` or `/listen/<streamingAlias>/<publishKey>/radio.aac` returns `404` while publishing, Liquidsoap is not exposing a valid decoded source yet; verify encoder mode, codec, bitrate, sample rate, and source signal.

When the live publisher connects through its opaque per-stream route, `Liquidsoap` exposes the live stream.
When it disconnects, the listeners go quiet until the next connection.

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

## Stage 6 note

Stage 6 keeps the same opaque public URLs from stage 5, but now each audio streaming gets its own inner live input,
its own Icecast mounts, and its own HLS output directory.
There is no Auto DJ or music upload path in this stage.