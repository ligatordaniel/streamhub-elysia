import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

function parseEnvFile(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf('=');

    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    let value = trimmedLine.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

function readWorkspaceEnv(): Record<string, string> {
  const configDirectory = dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = resolve(configDirectory, '..');
  const envFilePath = resolve(workspaceRoot, '.env.main');

  return parseEnvFile(readFileSync(envFilePath, 'utf8'));
}

const env = readWorkspaceEnv();

export default defineConfig({
  plugins: [react()],
  define: {
    __STREAMHUB_APP_NAME__: JSON.stringify(env.APP_NAME ?? 'StreamHub'),
    __STREAMHUB_API_URL__: JSON.stringify(env.VITE_API_URL ?? 'http://localhost:3012'),
    __STREAMHUB_STREAMING_INGEST_URL__: JSON.stringify(
      env.STREAMING_INGEST_URL ?? 'rtmp://localhost:1935'
    ),
    __STREAMHUB_STREAMING_HLS_URL__: JSON.stringify(env.STREAMING_HLS_URL ?? 'http://localhost:8080/hls'),
    __STREAMHUB_STREAMING_WEBRTC_URL__: JSON.stringify(
      env.STREAMING_WEBRTC_URL ?? 'http://localhost:8082/webrtc'
    ),
  },
  server: {
    host: '0.0.0.0',
    port: Number.parseInt(env.VITE_PORT ?? '5173', 10),
  },
  preview: {
    host: '0.0.0.0',
    port: Number.parseInt(env.VITE_PORT ?? '4173', 10),
  },
});