// Test helpers: a fake fetch that answers from tests/fixtures and records every call.
import { readFileSync } from 'node:fs';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');

// Obviously fake values: tests never see a real token.
export const FAKE_ENV = {
  THREADS_TOKEN: 'fake-threads-token-for-tests',
  ITCH_API_KEY: 'fake-itch-key-for-tests',
  YOUTUBE_API_KEY: 'fake-youtube-key-for-tests',
  YOUTUBE_CHANNEL_ID: 'UCexampleexampleexample00',
  X_API_KEY: 'fake-x-api-key-for-tests',
  X_API_SECRET: 'fake-x-api-secret-for-tests',
  X_ACCESS_TOKEN: 'fake-x-access-token-for-tests',
  X_ACCESS_TOKEN_SECRET: 'fake-x-access-secret-for-tests',
};

function route(u, headers) {
  const p = u.pathname;
  if (u.host === 'graph.threads.net') {
    if (u.searchParams.get('access_token') !== FAKE_ENV.THREADS_TOKEN) return [401, '{"error":{"message":"bad token"}}'];
    if (p === '/v1.0/me') return [200, fixture('threads-me')];
    if (p.endsWith('/threads_insights'))
      return [200, fixture(u.searchParams.get('metric') === 'followers_count' ? 'threads-followers' : 'threads-user-insights')];
    if (p.endsWith('/threads')) return [200, fixture('threads-threads')];
    if (p.endsWith('/insights')) return [200, fixture('threads-media-insights')];
    if (p === '/v1.0/2000000000000002/replies') return [200, fixture('threads-replies')];
    if (p.endsWith('/replies')) return [200, '{"data":[]}'];
    if (p.endsWith('/mentions')) return [403, fixture('threads-mentions-denied')];
  }
  if (u.host === 'api.itch.io') {
    if (headers.Authorization !== `Bearer ${FAKE_ENV.ITCH_API_KEY}`) return [401, '{"errors":["invalid key"]}'];
    if (p === '/profile') return [200, fixture('itch-profile')];
    if (p === '/profile/games') return [200, fixture('itch-games')];
  }
  if (u.host === 'www.googleapis.com') {
    if (u.searchParams.get('key') !== FAKE_ENV.YOUTUBE_API_KEY) return [400, '{"error":{"message":"API key not valid"}}'];
    const name = { channels: 'youtube-channels', playlistItems: 'youtube-playlistitems', videos: 'youtube-videos', commentThreads: 'youtube-commentthreads' }[p.split('/').pop()];
    if (name) return [200, fixture(name)];
  }
  if (u.host === 'api.x.com') {
    const auth = headers.Authorization ?? '';
    if (!auth.startsWith('OAuth ') || !auth.includes(`oauth_consumer_key="${FAKE_ENV.X_API_KEY}"`)
      || !auth.includes(`oauth_token="${FAKE_ENV.X_ACCESS_TOKEN}"`) || !/oauth_signature="[^"]+"/.test(auth)) return [401, '{"title":"Unauthorized"}'];
    if (p === '/2/users/me') return [200, fixture('x-me')];
    if (p.endsWith('/tweets')) return [200, fixture('x-tweets')];
    if (p.endsWith('/mentions')) {
      // the API filters by start_time itself
      const since = Date.parse(u.searchParams.get('start_time') ?? '') || 0;
      const r = JSON.parse(fixture('x-mentions'));
      r.data = r.data.filter((t) => Date.parse(t.created_at) >= since);
      return [200, JSON.stringify(r)];
    }
    if (p === '/2/tweets/1900000000000000002') return [200, fixture('x-tweet')];
    if (p.startsWith('/2/tweets/')) return [200, '{"errors":[{"title":"Not Found Error"}]}'];
  }
  return [404, '{"error":"no fixture"}'];
}

export function fakeFetch() {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const u = new URL(input);
    calls.push({ method: init.method ?? 'GET', url: u });
    const [status, body] = route(u, init.headers ?? {});
    return new Response(body, { status, headers: { 'content-type': 'application/json' } });
  };
  return { fetchImpl, calls };
}
