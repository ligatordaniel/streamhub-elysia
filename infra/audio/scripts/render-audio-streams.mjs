#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const mode = process.argv[2] ?? 'json';
const databasePath = process.env.AUDIO_DATABASE_PATH ?? '/srv/database/data/streamhub.sqlite3';
const stationName = process.env.AUDIO_STATION_NAME ?? 'Streamhub Live';
const publicUrl = process.env.AUDIO_PUBLIC_URL ?? 'http://localhost:8090';
const icecastHost = process.env.AUDIO_ICECAST_HOST ?? 'icecast';
const icecastPort = Number.parseInt(process.env.AUDIO_ICECAST_PORT ?? '8000', 10);
const liveSourcePassword = process.env.AUDIO_LIVE_SOURCE_PASSWORD ?? 'Q7mLp2Xv9RtK';
const icecastPassword = process.env.AUDIO_ICECAST_SOURCE_PASSWORD ?? liveSourcePassword;
const opaqueAlphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function hashOpaqueToken(value) {
  let firstHash = 0x811c9dc5;
  let secondHash = 0x9e3779b9;

  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);

    firstHash ^= codePoint;
    firstHash = Math.imul(firstHash, 0x01000193);
    secondHash ^= codePoint;
    secondHash = Math.imul(secondHash, 0x85ebca6b);
  }

  return `${(firstHash >>> 0).toString(16).padStart(8, '0')}${(secondHash >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}

function encodeBase62FromHex(hexValue, minimumLength = 12) {
  const base = BigInt(opaqueAlphabet.length);
  let numericValue = BigInt(`0x${hexValue}`);
  let encodedValue = '';

  if (numericValue === 0n) {
    return opaqueAlphabet[0].repeat(minimumLength);
  }

  while (numericValue > 0n) {
    encodedValue = opaqueAlphabet[Number(numericValue % base)] + encodedValue;
    numericValue /= base;
  }

  return encodedValue.padStart(minimumLength, opaqueAlphabet[0]).slice(-minimumLength);
}

function buildPublishMountToken(streamingId, ingestKey) {
  return encodeBase62FromHex(hashOpaqueToken(`mount:${streamingId}:${ingestKey}`), 12);
}

function escapeLiquidsoap(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function loadAudioStreams() {
  const query = [
    'SELECT id, ingest_key AS ingestKey, name',
    'FROM streamings',
    "WHERE type = 'audio'",
    'ORDER BY name ASC, id ASC',
  ].join(' ');

  const rawOutput = execFileSync('sqlite3', ['-readonly', '-json', databasePath, query], {
    encoding: 'utf8',
  }).trim();

  if (!rawOutput) {
    return [];
  }

  const rows = JSON.parse(rawOutput);

  if (!Array.isArray(rows)) {
    throw new Error(`Unexpected sqlite3 output for ${databasePath}`);
  }

  return rows.map((row) => {
    if (typeof row !== 'object' || row === null) {
      throw new Error('Invalid audio streaming row');
    }

    const record = row;
    const streamingId = typeof record.id === 'string' ? record.id : '';
    const ingestKey = typeof record.ingestKey === 'string' ? record.ingestKey : '';
    const name = typeof record.name === 'string' ? record.name.trim() : '';

    if (!streamingId || !ingestKey) {
      throw new Error('Audio streaming row is missing id or ingest key');
    }

    const streamingAlias = hashOpaqueToken(`streaming:${streamingId}`);
    const publishKey = hashOpaqueToken(`publish:${streamingId}:${ingestKey}`);
    const publishMountToken = buildPublishMountToken(streamingId, ingestKey);

    return {
      id: streamingId,
      ingestKey,
      name: name || `audio-${streamingAlias}`,
      streamingAlias,
      publishKey,
      publishMountToken,
      liveMount: `/live/${publishMountToken}`,
      mp3Mount: `/streams/${streamingAlias}/${publishKey}/radio.mp3`,
      aacMount: `/streams/${streamingAlias}/${publishKey}/radio.aac`,
      hlsPath: `${streamingAlias}/${publishKey}`,
    };
  });
}

function renderLiquidsoap(streams) {
  if (streams.length === 0) {
    throw new Error(`No audio streamings found in ${databasePath}`);
  }

  const lines = [
    'set("init.allow_root", true)',
    'set("log.stdout", true)',
    'set("server.telnet", false)',
    '',
  ];

  streams.forEach((stream, index) => {
    const suffix = `${index + 1}`;
    const streamLabel = escapeLiquidsoap(stream.name);
    const escapedStationName = escapeLiquidsoap(stationName);
    const escapedPublicUrl = escapeLiquidsoap(publicUrl);
    const escapedIcecastHost = escapeLiquidsoap(icecastHost);
    const escapedIcecastPassword = escapeLiquidsoap(icecastPassword);
    const escapedLiveMount = escapeLiquidsoap(stream.liveMount);
    const escapedMp3Mount = escapeLiquidsoap(stream.mp3Mount);
    const escapedAacMount = escapeLiquidsoap(stream.aacMount);

    lines.push(`live_source_${suffix} = input.http(`);
    lines.push(`  "http://${escapedIcecastHost}:${icecastPort}${escapedLiveMount}",`);
    lines.push('  max_buffer=30.');
    lines.push(')');
    lines.push('');
    lines.push('output.icecast(');
    lines.push('  %mp3(bitrate=192, samplerate=44100, stereo=true),');
    lines.push('  fallible=true,');
    lines.push(`  host="${escapedIcecastHost}",`);
    lines.push(`  port=${icecastPort},`);
    lines.push(`  password="${escapedIcecastPassword}",`);
    lines.push(`  mount="${escapedMp3Mount}",`);
    lines.push(`  name="${escapedStationName} - ${streamLabel} MP3",`);
    lines.push('  description="Streamhub live audio",');
    lines.push('  genre="Mixed",');
    lines.push(`  url="${escapedPublicUrl}",`);
    lines.push(`  live_source_${suffix}`);
    lines.push(')');
    lines.push('');
    lines.push('output.icecast(');
    lines.push('  %ffmpeg(format="adts", %audio(codec="aac", b="128k")),');
    lines.push('  fallible=true,');
    lines.push(`  host="${escapedIcecastHost}",`);
    lines.push(`  port=${icecastPort},`);
    lines.push(`  password="${escapedIcecastPassword}",`);
    lines.push(`  mount="${escapedAacMount}",`);
    lines.push(`  name="${escapedStationName} - ${streamLabel} AAC",`);
    lines.push('  description="Streamhub live audio",');
    lines.push('  genre="Mixed",');
    lines.push(`  url="${escapedPublicUrl}",`);
    lines.push(`  live_source_${suffix}`);
    lines.push(')');
    lines.push('');
  });

  return `${lines.join('\n').trim()}\n`;
}

function renderList(streams) {
  if (streams.length === 0) {
    return '';
  }

  return `${streams
    .map((stream) => [stream.streamingAlias, stream.publishKey, stream.liveMount, stream.mp3Mount, stream.aacMount].join('\t'))
    .join('\n')}\n`;
}

function renderJson(streams) {
  return `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      databasePath,
      streams,
    },
    null,
    2
  )}\n`;
}

const streams = loadAudioStreams();

switch (mode) {
  case 'json':
    process.stdout.write(renderJson(streams));
    break;
  case 'list':
    process.stdout.write(renderList(streams));
    break;
  case 'liquidsoap':
    process.stdout.write(renderLiquidsoap(streams));
    break;
  default:
    throw new Error(`Unsupported render mode: ${mode}`);
}