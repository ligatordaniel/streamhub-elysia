# Streaming Architecture

This document starts the video streaming layer implementation around a simple rule: the transmitter PC does the expensive work, and the server only relays, packages, and serves.

## Core decision

- OBS or vMix encodes on the transmitter PC.
- MediaMTX is the streaming core.
- RTMP is used for ingest.
- HLS is the default playback path.
- WebRTC is optional for low-latency browser playback.
- FFmpeg stays optional and should run on the transmitter PC or a separate worker only when recording or remuxing is needed.
- The live server must not transcode by default.

## 1. Streaming architecture

- Transmitter PC: OBS or vMix, hardware encoder, RTMP publish.
- MediaMTX node: receive RTMP, expose HLS, optionally expose WebRTC.
- Nginx: reverse proxy for HTTP delivery and TLS termination.
- Recording: transmitter-local by default; optional worker only when business rules require centralized archives.
- Multi-tenant separation: every stream lives under a tenant-scoped opaque path.

Recommended path contract:

- `live/<streamingAlias>/<publishKey>`

The same opaque path is reused across the media layer so the transmitter and playback endpoints stay simple.
The control page derives short publish aliases from the streaming id and stored ingest key, and only super_admin can rotate the stored ingest key.

## 2. MediaMTX configuration

- Enable RTMP ingest.
- Enable HLS playback.
- Enable WebRTC only as an optional low-latency path.
- Keep recording off in the live node by default.
- Keep the server stateless and do not enable live transcoding.
- Use a path namespace that is hard to guess and isolated per tenant.

MediaMTX is configured to accept publisher-backed paths and generate HLS from the same live stream.

## 3. FFmpeg workflow

- Default path: no FFmpeg on the live server.
- If recording is required, do it on the transmitter PC first.
- Use FFmpeg on the server only for rare remux or batch archive jobs.
- Avoid FFmpeg for live transcoding.
- Keep CPU and RAM pressure on the transmitter, not the server.

## 4. Docker Compose setup

- `mediamtx` service runs the media server.
- `nginx` service proxies HTTP delivery.
- `mediamtx` exposes RTMP directly for ingest.
- `nginx` fronts HLS and the WebRTC HTTP handshake.
- WebRTC media still needs the MediaMTX UDP path to be reachable.
- Recordings should live in a separate persistent volume if they are enabled later.

## 5. Stream lifecycle flow

1. A company creates a streaming record.
2. The backend generates an opaque ingest key.
3. The control page shows the RTMP ingest URL and the HLS playback URL.
4. OBS or vMix publishes from the transmitter PC.
5. MediaMTX accepts the live publisher.
6. Viewers consume the HLS URL, or WebRTC if low latency is required.
7. If recording is enabled, it runs outside the live media node.
8. When the stream ends, the key remains unique and the path stays tenant-scoped.

## 6. HLS and WebRTC delivery strategy

- HLS is the default delivery path because it is simpler and scales better.
- Low-latency HLS is the first browser delivery mode to prefer.
- WebRTC is optional and should be used only when latency matters more than simplicity.
- HLS should stay behind Nginx so the public surface stays small.
- WebRTC should remain opt-in because it adds more network and client complexity.

## 7. Resource optimization recommendations

- Use hardware encoding on the transmitter PC.
- Target H.264 video and AAC audio as the baseline.
- Keep GOP and HLS segmentation aligned.
- Avoid server-side live transcoding.
- Avoid duplicate recording jobs.
- Keep MediaMTX configuration lean.
- Prefer a small number of stable ingest and playback paths.

## 8. Scaling approach

- Add MediaMTX nodes when one node is no longer enough.
- Split tenants across nodes before trying to make one node do everything.
- Keep Nginx as the stable front door.
- Keep archives and recordings out of the live node.
- Add centralized storage only when the archive requirement becomes real.

## 9. Recommended folder structure

- `infra/streaming/mediamtx/` for MediaMTX configuration.
- `infra/streaming/nginx/` for the reverse proxy config.
- `infra/streaming/recordings/` for optional archives or future FFmpeg output.
- `infra/streaming/docker-compose.yml` for the streaming stack.
- `docs/streaming/` for architecture notes and runbooks.

## 10. Best practices for low-latency streaming

- Put encode work on the transmitter PC.
- Keep the live server as a relay, not a transcoder.
- Use opaque tenant-scoped paths and keys.
- Keep RTMP for ingest and HLS for browser playback.
- Use WebRTC only when the delay target demands it.
- Measure end-to-end latency, dropped frames, CPU, RAM, and reconnect time.
- Keep the first implementation boring and small.

## Current implementation status

- The control page already shows the stream container and will be wired to the live URLs.
- MediaMTX and Nginx configs live under `infra/streaming/`.
- The current implementation is designed to keep the transmitter PC responsible for encoding and optional recording.
