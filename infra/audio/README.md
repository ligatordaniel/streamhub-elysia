# Audio Stack

This folder reserves the audio streaming layer without touching the video stack.

## Stage 1 goals

- Keep audio on a separate compose project, network, port, and public entrypoint.
- Reserve the future audio gateway path before wiring Icecast, Liquidsoap, and HLS.
- Prepare folders for music library assets, playlists, state, and audio-specific configs.
- Avoid reusing the MediaMTX or Nginx routes from the video stack.

## Local port

- `8090/tcp` for the isolated audio gateway placeholder and future public audio base URL.

Optional environment values:

- `AUDIO_HTTP_PORT` overrides the local listener port.
- `AUDIO_PUBLIC_URL` documents the public base URL that future audio clients should use.

## Planned inner services

- `Icecast` for source mounts and client delivery.
- `Liquidsoap` for Auto DJ, music rotation, and live source switching.
- `AAC` over `HLS` as the default browser and mobile path.
- `MP3` as the compatibility fallback.

## Folder layout

- `icecast/` for future Icecast config.
- `liquidsoap/` for future Liquidsoap scripts.
- `library/` for music assets.
- `playlists/` for rotation inputs.
- `state/` for runtime state.
- `hls/` for future audio HLS output.
- `nginx/` for the isolated audio gateway config.
- `www/` for the stage-1 placeholder page.

## Start the stack

From this folder:

```bash
docker compose up -d
```

## Stage 1 note

Stage 1 only brings up the isolated audio gateway placeholder.
Stage 2 wires the real audio chain behind this stack.