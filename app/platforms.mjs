// Reads the config from the environment and builds one adapter per platform that has a token.
// Every tool goes through watch(): an unconfigured platform answers "not set up" instead of failing.
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createHttp } from './http.mjs';
import { createThreads } from './platforms/threads.mjs';
import { createItch } from './platforms/itch.mjs';
import { createYoutube } from './platforms/youtube.mjs';
import { createX } from './platforms/x.mjs';

export const PLATFORMS = ['threads', 'itch', 'youtube', 'x'];
export const PROJECT_DIR = fileURLToPath(new URL('..', import.meta.url));
const X_KEYS = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET'];

// Loads social-watch-mcp/.env into process.env (existing variables win). Tests never call this.
export function loadDotEnv(file = `${PROJECT_DIR}.env`) {
  if (existsSync(file)) process.loadEnvFile(file);
  return process.env;
}

export function readConfig(env) {
  // Empty values and untouched <placeholders> from .env.example count as not set up.
  const v = (k) => { const x = (env[k] ?? '').trim(); return x && !x.startsWith('<') ? x : undefined; };
  return {
    threads: v('THREADS_TOKEN') && { token: v('THREADS_TOKEN') },
    itch: v('ITCH_API_KEY') && { key: v('ITCH_API_KEY') },
    youtube: v('YOUTUBE_API_KEY') && v('YOUTUBE_CHANNEL_ID') && { key: v('YOUTUBE_API_KEY'), channelId: v('YOUTUBE_CHANNEL_ID') },
    // X needs all four OAuth 1.0a values of the read-only app.
    x: X_KEYS.every((k) => v(k)) && {
      key: v('X_API_KEY'), secret: v('X_API_SECRET'), token: v('X_ACCESS_TOKEN'), tokenSecret: v('X_ACCESS_TOKEN_SECRET'),
    },
  };
}

// Every secret value in the config, for redaction and the snapshot check.
export function secretsOf(config) {
  return Object.values(config).filter(Boolean).flatMap((c) => [c.token, c.key, c.secret, c.tokenSecret]).filter(Boolean);
}

export function createWatch({ env, fetchImpl } = {}) {
  const config = readConfig(env);
  const http = createHttp({ fetchImpl, secrets: secretsOf(config) });
  const makers = { threads: createThreads, itch: createItch, youtube: createYoutube, x: createX };
  const adapters = Object.fromEntries(PLATFORMS.filter((p) => config[p]).map((p) => [p, makers[p](config[p], http)]));

  const notSetUp = (platform) => ({
    platform, status: 'not set up',
    how: `Add its key to social-watch-mcp/.env, see social-watch-mcp/docs/setup.md#${platform}`,
  });

  // Runs fn on the platform's adapter; unknown and unconfigured platforms are answered, not thrown.
  async function on(platform, fn) {
    if (!PLATFORMS.includes(platform)) return { platform, status: 'unknown platform', known: PLATFORMS };
    const a = adapters[platform];
    if (!a) return notSetUp(platform);
    return { platform, status: 'ok', ...(await fn(a)) };
  }

  return {
    config,
    secrets: secretsOf(config),
    configured: () => PLATFORMS.filter((p) => adapters[p]),
    async accounts(platform) {
      const list = platform ? [platform] : PLATFORMS;
      const out = [];
      for (const p of list) out.push(await on(p, async (a) => ({ profile: await a.accounts() })));
      return { set_up: PLATFORMS.filter((p) => adapters[p]), accounts: out };
    },
    recentPosts: (platform, limit = 10) => on(platform, async (a) => ({ posts: await a.recentPosts(limit) })),
    postStats: (platform, id) => on(platform, async (a) => ({ stats: await a.postStats(id) })),
    replies: (platform, since) => on(platform, async (a) => a.replies(since)),
    totals: (platform) => on(platform, async (a) => ({ totals: await a.totals() })),
  };
}
