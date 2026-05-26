import { bootstrapSuperAdmin } from './bootstrap/super-admin';
import { seedStaticData } from './bootstrap/static-seed';
import { createApp } from './app';
import { createDatabase } from './config/database';
import { loadAppEnv } from './config/env';
import { ensureDefaultAudioPlaylists } from './services/audio-autodj';

async function main(): Promise<void> {
  const env = loadAppEnv();
  const db = createDatabase(env);

  seedStaticData(db);
  ensureDefaultAudioPlaylists(db);
  await bootstrapSuperAdmin(db, env);

  const app = createApp({ env, db });

  app.listen({
    hostname: env.host,
    port: env.port,
  });

  console.log(`${env.appName} listening on http://${env.host}:${env.port}`);
}

void main();