# Streaming Stack

This folder starts the video streaming layer around MediaMTX and Nginx.

## Goals

- Keep encode work on the transmitter PC.
- Keep the live server thin.
- Use RTMP for ingest.
- Use HLS for default playback.
- Keep WebRTC optional for low latency.
- Avoid live transcoding on the server.

## Local ports

- `1935/tcp` for RTMP ingest from OBS or vMix.
- `8189/udp` for WebRTC media paths.
- `8080/tcp` for HLS through Nginx at `/hls/`.
- `8082/tcp` for the WebRTC HTTP handshake through Nginx at `/webrtc/`.

## Path contract

Use opaque tenant-scoped paths with the shape:

`tenants/<companyId>/streamings/<streamingId>/<ingestKey>`

The ingest URL and the playback URL share the same path so the stack stays simple.
Stream keys are generated as `<company-slug>-<5 safe chars>` and can be changed only by a super_admin from the admin console.

Public URL prefixes:

- HLS: `http://localhost:8080/hls`
- WebRTC: `http://localhost:8082/webrtc`

## Start the stack

From this folder:

```bash
docker compose up -d
```

## What runs where

- `mediamtx` receives RTMP, exposes HLS, and can expose WebRTC.
- `nginx` proxies browser-facing HTTP traffic.
- FFmpeg is not part of the live server by default.

## Notes

- Keep recordings off the live node unless you really need them.
- If you need HTTPS, terminate it at Nginx.
- If you need more than one tenant group, add another MediaMTX node instead of adding heavy work to the existing one.
