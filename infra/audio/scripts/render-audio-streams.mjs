#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mode = process.argv[2] ?? 'json';
const databasePath = process.env.AUDIO_DATABASE_PATH ?? '/srv/database/data/streamhub.sqlite3';
const stationName = process.env.AUDIO_STATION_NAME ?? 'Streamhub Live';
const publicUrl = process.env.AUDIO_PUBLIC_URL ?? 'http://localhost:8090';
const icecastHost = process.env.AUDIO_ICECAST_HOST ?? 'icecast';
const icecastPort = Number.parseInt(process.env.AUDIO_ICECAST_PORT ?? '8000', 10);
const audioLibraryRoot = process.env.AUDIO_LIBRARY_PATH ?? '/srv/audio/library/companies';
const audioPlaylistsRoot = process.env.AUDIO_PLAYLISTS_PATH ?? '/srv/audio/playlists/companies';
const liveSourcePassword = process.env.AUDIO_LIVE_SOURCE_PASSWORD ?? 'Q7mLp2Xv9RtK';
const icecastPassword = process.env.AUDIO_ICECAST_SOURCE_PASSWORD ?? liveSourcePassword;
const opaqueAlphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const minutesPerDay = 24 * 60;

function runSqlJson(query) {
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

  return rows;
}

function quoteSqlString(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function tableExists(tableName) {
  return runSqlJson(
    [
      'SELECT name',
      'FROM sqlite_master',
      "WHERE type = 'table'",
      `AND name = ${quoteSqlString(tableName)}`,
      'LIMIT 1',
    ].join(' ')
  ).length > 0;
}

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

function getMinuteOfWeek(dateValue) {
  return dateValue.getDay() * minutesPerDay + dateValue.getHours() * 60 + dateValue.getMinutes();
}

function loadAudioStreams() {
  const query = [
    'SELECT id, company_id AS companyId, ingest_key AS ingestKey, name',
    'FROM streamings',
    "WHERE type = 'audio'",
    'ORDER BY name ASC, id ASC',
  ].join(' ');

  const rows = runSqlJson(query);

  return rows.map((row) => {
    if (typeof row !== 'object' || row === null) {
      throw new Error('Invalid audio streaming row');
    }

    const record = row;
    const streamingId = typeof record.id === 'string' ? record.id : '';
    const companyId = typeof record.companyId === 'string' ? record.companyId : '';
    const ingestKey = typeof record.ingestKey === 'string' ? record.ingestKey : '';
    const name = typeof record.name === 'string' ? record.name.trim() : '';

    if (!streamingId || !companyId || !ingestKey) {
      throw new Error('Audio streaming row is missing company id, id, or ingest key');
    }

    const streamingAlias = hashOpaqueToken(`streaming:${streamingId}`);
    const publishKey = hashOpaqueToken(`publish:${streamingId}:${ingestKey}`);
    const publishMountToken = buildPublishMountToken(streamingId, ingestKey);

    return {
      id: streamingId,
      companyId,
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

function loadCompanyAutodjState(companyIds) {
  if (companyIds.length === 0) {
    return new Map();
  }

  const companyIdList = companyIds.map(quoteSqlString).join(', ');
  const hasAutodjSettingsTable = tableExists('company_audio_autodj_settings');
  const settingsRows = hasAutodjSettingsTable
    ? runSqlJson(
        [
          'SELECT company_id AS companyId, enabled',
          'FROM company_audio_autodj_settings',
          `WHERE company_id IN (${companyIdList})`,
        ].join(' ')
      )
    : [];
  const playlistRows = runSqlJson(
    [
      'SELECT company_id AS companyId, id, name, kind',
      'FROM company_audio_playlists',
      `WHERE company_id IN (${companyIdList})`,
      'ORDER BY kind ASC, name ASC, id ASC',
    ].join(' ')
  );
  const scheduleRows = runSqlJson(
    [
      'SELECT company_id AS companyId, playlist_id AS playlistId,',
      'start_minute_of_week AS startMinuteOfWeek, end_minute_of_week AS endMinuteOfWeek',
      'FROM company_audio_playlist_schedules',
      `WHERE company_id IN (${companyIdList})`,
      'ORDER BY start_minute_of_week ASC, end_minute_of_week ASC, playlist_id ASC',
    ].join(' ')
  );
  const itemRows = runSqlJson(
    [
      'SELECT items.company_id AS companyId, items.playlist_id AS playlistId,',
      'tracks.storage_path AS storagePath, items.position AS position',
      'FROM company_audio_playlist_items AS items',
      'INNER JOIN company_audio_library_tracks AS tracks',
      'ON tracks.company_id = items.company_id',
      'AND tracks.id = items.track_id',
      `WHERE items.company_id IN (${companyIdList})`,
      'ORDER BY items.playlist_id ASC, items.position ASC, items.id ASC',
    ].join(' ')
  );
  const companies = new Map();

  for (const companyId of companyIds) {
    companies.set(companyId, {
      defaultPlaylistId: null,
      enabled: true,
      playlists: new Map(),
    });
  }

  for (const row of settingsRows) {
    if (typeof row !== 'object' || row === null) {
      continue;
    }

    const companyId = typeof row.companyId === 'string' ? row.companyId : '';
    const company = companies.get(companyId);

    if (!company) {
      continue;
    }

    company.enabled = row.enabled === 0 ? false : true;
  }

  for (const row of playlistRows) {
    if (typeof row !== 'object' || row === null) {
      continue;
    }

    const companyId = typeof row.companyId === 'string' ? row.companyId : '';
    const playlistId = typeof row.id === 'string' ? row.id : '';
    const playlistName = typeof row.name === 'string' ? row.name : '';
    const kind = row.kind === 'custom' ? 'custom' : row.kind === 'default' ? 'default' : '';
    const company = companies.get(companyId);

    if (!company || !playlistId || !kind) {
      continue;
    }

    company.playlists.set(playlistId, {
      id: playlistId,
      name: playlistName,
      kind,
      schedules: [],
      tracks: [],
    });

    if (kind === 'default' && company.defaultPlaylistId === null) {
      company.defaultPlaylistId = playlistId;
    }
  }

  for (const row of scheduleRows) {
    if (typeof row !== 'object' || row === null) {
      continue;
    }

    const companyId = typeof row.companyId === 'string' ? row.companyId : '';
    const playlistId = typeof row.playlistId === 'string' ? row.playlistId : '';
    const startMinuteOfWeek = Number.isInteger(row.startMinuteOfWeek) ? row.startMinuteOfWeek : -1;
    const endMinuteOfWeek = Number.isInteger(row.endMinuteOfWeek) ? row.endMinuteOfWeek : -1;
    const playlist = companies.get(companyId)?.playlists.get(playlistId);

    if (!playlist || startMinuteOfWeek < 0 || endMinuteOfWeek <= startMinuteOfWeek) {
      continue;
    }

    playlist.schedules.push({ startMinuteOfWeek, endMinuteOfWeek });
  }

  for (const row of itemRows) {
    if (typeof row !== 'object' || row === null) {
      continue;
    }

    const companyId = typeof row.companyId === 'string' ? row.companyId : '';
    const playlistId = typeof row.playlistId === 'string' ? row.playlistId : '';
    const storagePath = typeof row.storagePath === 'string' ? row.storagePath : '';
    const playlist = companies.get(companyId)?.playlists.get(playlistId);

    if (!playlist || !storagePath) {
      continue;
    }

    playlist.tracks.push(storagePath);
  }

  return companies;
}

function getActivePlaylistForCompany(companyState, minuteOfWeek) {
  if (!companyState || !companyState.enabled) {
    return null;
  }

  for (const playlist of companyState.playlists.values()) {
    if (playlist.kind !== 'custom') {
      continue;
    }

    const hasActiveSchedule = playlist.schedules.some(
      (schedule) => schedule.startMinuteOfWeek <= minuteOfWeek && minuteOfWeek < schedule.endMinuteOfWeek
    );

    if (hasActiveSchedule) {
      return playlist;
    }
  }

  if (!companyState.defaultPlaylistId) {
    return null;
  }

  return companyState.playlists.get(companyState.defaultPlaylistId) ?? null;
}

function writeCompanyAutodjFiles(streams) {
  const companyIds = Array.from(new Set(streams.map((stream) => stream.companyId)));
  const companyAutodjState = loadCompanyAutodjState(companyIds);
  const minuteOfWeek = getMinuteOfWeek(new Date());

  mkdirSync(audioPlaylistsRoot, { recursive: true });

  const activePlaylists = [];

  companyIds.forEach((companyId) => {
    const companyDirectory = resolve(audioPlaylistsRoot, companyId);
    const companyState = companyAutodjState.get(companyId) ?? { defaultPlaylistId: null, playlists: new Map() };
    const activePlaylist = getActivePlaylistForCompany(companyState, minuteOfWeek);

    mkdirSync(companyDirectory, { recursive: true });

    for (const playlist of companyState.playlists.values()) {
      const playlistFilePath = resolve(companyDirectory, `playlist-${playlist.id}.m3u`);
      const playlistContents = playlist.tracks
        .map((storagePath) => resolve(audioLibraryRoot, storagePath))
        .join('\n');

      writeFileSync(playlistFilePath, playlistContents ? `${playlistContents}\n` : '');
    }

    const activePlaylistLines = activePlaylist
      ? activePlaylist.tracks.map((storagePath) => resolve(audioLibraryRoot, storagePath))
      : [];
    const activePlaylistPath = resolve(companyDirectory, 'active.m3u');
    const activePlaylistMetaPath = resolve(companyDirectory, 'active.json');

    writeFileSync(activePlaylistPath, activePlaylistLines.length > 0 ? `${activePlaylistLines.join('\n')}\n` : '');
    writeFileSync(
      activePlaylistMetaPath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          companyId,
          autodjEnabled: companyState.enabled,
          activePlaylistId: activePlaylist?.id ?? null,
          activePlaylistName: activePlaylist?.name ?? null,
          activePlaylistKind: activePlaylist?.kind ?? null,
          trackCount: activePlaylistLines.length,
        },
        null,
        2
      )}\n`
    );

    activePlaylists.push({
      companyId,
      autodjEnabled: companyState.enabled,
      activePlaylistId: activePlaylist?.id ?? null,
      activePlaylistName: activePlaylist?.name ?? null,
      activePlaylistKind: activePlaylist?.kind ?? null,
      trackCount: activePlaylistLines.length,
      activePlaylistPath,
    });
  });

  return activePlaylists;
}

function renderLiquidsoap(streams) {
  if (streams.length === 0) {
    throw new Error(`No audio streamings found in ${databasePath}`);
  }

  writeCompanyAutodjFiles(streams);

  const lines = [
    'set("init.allow_root", true)',
    'set("log.stdout", true)',
    'set("server.telnet", false)',
    '',
  ];
  const companySourceNames = new Map();
  const uniqueCompanyIds = Array.from(new Set(streams.map((stream) => stream.companyId)));

  uniqueCompanyIds.forEach((companyId, companyIndex) => {
    const sourceName = `autodj_source_${companyIndex + 1}`;
    const escapedActivePlaylistPath = escapeLiquidsoap(resolve(audioPlaylistsRoot, companyId, 'active.m3u'));

    companySourceNames.set(companyId, sourceName);
    lines.push(`${sourceName} = playlist(`);
    lines.push('  reload_mode="watch",');
    lines.push('  mode="normal",');
    lines.push(`  "${escapedActivePlaylistPath}"`);
    lines.push(')');
    lines.push('');
  });

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
    const companySourceName = companySourceNames.get(stream.companyId);

    if (!companySourceName) {
      throw new Error(`Missing AutoDJ source for company ${stream.companyId}`);
    }

    lines.push(`live_source_${suffix} = input.http(`);
    lines.push(`  "http://${escapedIcecastHost}:${icecastPort}${escapedLiveMount}",`);
    lines.push('  max_buffer=30.');
    lines.push(')');
    lines.push('');
    lines.push(`program_source_${suffix} = fallback(track_sensitive=false, [live_source_${suffix}, ${companySourceName}])`);
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
    lines.push(`  program_source_${suffix}`);
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
    lines.push(`  program_source_${suffix}`);
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
  const activePlaylists = writeCompanyAutodjFiles(streams);

  return `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      databasePath,
      activePlaylists,
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
  case 'sync-autodj':
    process.stdout.write(`${JSON.stringify({ activePlaylists: writeCompanyAutodjFiles(streams) }, null, 2)}\n`);
    break;
  default:
    throw new Error(`Unsupported render mode: ${mode}`);
}