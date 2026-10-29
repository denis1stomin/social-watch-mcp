// Read-only by construction: the client refuses non-GET, and nothing else in app/ can reach the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHttp, redact } from '../app/http.mjs';
import { createWatch } from '../app/platforms.mjs';
import { oauth1Header } from '../app/platforms/x.mjs';
import { fakeFetch, FAKE_ENV } from './helpers.mjs';

const SRC = fileURLToPath(new URL('../app/', import.meta.url));
const sources = (dir = SRC) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith('.mjs') ? [join(dir, e.name)] : []);

test('the HTTP client throws on every non-GET method and never calls fetch for it', async () => {
  let called = 0;
  const http = createHttp({ fetchImpl: async () => { called++; return new Response('{}'); } });
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'get']) {
    await assert.rejects(http.request(m, 'https://example.com/'), /read-only/);
  }
  assert.equal(called, 0);
  assert.deepEqual(await http.getJson('https://example.com/'), {});
  assert.equal(called, 1);
});

test('every request made by every tool is a GET', async () => {
  const { fetchImpl, calls } = fakeFetch();
  const w = createWatch({ env: FAKE_ENV, fetchImpl });
  await w.accounts();
  for (const p of ['threads', 'itch', 'youtube', 'x']) {
    const posts = (await w.recentPosts(p)).posts;
    await w.postStats(p, posts[0].id);
    await w.replies(p);
    await w.totals(p);
  }
  assert.ok(calls.length > 10);
  assert.ok(calls.every((c) => c.method === 'GET'), 'a non-GET request was sent');
});

test('no source file calls fetch except the guarded client', () => {
  const files = sources();
  assert.ok(files.length >= 6);
  for (const f of files) {
    const code = readFileSync(f, 'utf8');
    if (f.endsWith(`${'/'}http.mjs`)) {
      assert.match(code, /method !== 'GET'/);
      assert.equal((code.match(/\bfetch\b/g) ?? []).length, 1, 'http.mjs should only take globalThis.fetch as the default');
      continue;
    }
    assert.doesNotMatch(code, /\bfetch\b|node:https?|node:net|XMLHttpRequest|WebSocket|undici/, `${f} reaches the network itself`);
  }
});

test('no write method or write endpoint anywhere in the code', () => {
  for (const f of sources()) {
    const code = readFileSync(f, 'utf8');
    assert.doesNotMatch(code, /['"`](POST|PUT|PATCH|DELETE)['"`]/, `${f} names a write method`);
    assert.doesNotMatch(code, /threads_publish|media_publish|threads_content_publish|threads_manage_replies|\/(delete|add-game|remove-game|collections|manage_reply|hide|rate)\b|\.insert\b/,
      `${f} names a write endpoint`);
  }
});

test('errors never contain a token', async () => {
  const http = createHttp({
    fetchImpl: async () => new Response('bad token fake-threads-token-for-tests', { status: 400 }),
    secrets: [FAKE_ENV.THREADS_TOKEN],
  });
  await assert.rejects(http.getJson('https://graph.threads.net/v1.0/me?access_token=fake-threads-token-for-tests'),
    (e) => !e.message.includes(FAKE_ENV.THREADS_TOKEN) && /HTTP 400/.test(e.message));
  assert.equal(redact('x?key=abc&access_token=def'), 'x?key=<redacted>&access_token=<redacted>');
});

test('X: the OAuth 1.0a signature matches the example in X\'s docs', () => {
  // https://docs.x.com/resources/fundamentals/authentication/oauth-1-0a/creating-a-signature (their sample keys)
  const h = oauth1Header({
    method: 'POST', url: 'https://api.twitter.com/1.1/statuses/update.json?include_entities=true',
    extra: { status: 'Hello Ladies + Gentlemen, a signed OAuth request!' },
    key: 'xvz1evFS4wEEPTGEFPHBog', secret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw', // gitleaks:allow
    token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb', tokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE', // gitleaks:allow
    nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg', timestamp: 1318622958,
  });
  assert.match(h, /oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"/); // gitleaks:allow
});

test('X: errors never contain any of its four keys', async () => {
  const w = createWatch({ env: { ...FAKE_ENV, X_ACCESS_TOKEN: 'fake-x-wrong-token-for-tests' }, fetchImpl: async (u, init) =>
    new Response(`denied ${init.headers.Authorization}`, { status: 401 }) });
  const r = await w.totals('x').catch((e) => e);
  assert.match(r.message, /HTTP 401/);
  for (const k of ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN_SECRET']) assert.ok(!r.message.includes(FAKE_ENV[k]), k);
  assert.ok(!r.message.includes('fake-x-wrong-token-for-tests'));
});
