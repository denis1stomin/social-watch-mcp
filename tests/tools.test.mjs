// Every tool, on every platform, against the recorded fixtures (no network, fake tokens).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWatch } from '../app/platforms.mjs';
import { fakeFetch, FAKE_ENV } from './helpers.mjs';

const setup = (env = FAKE_ENV) => { const f = fakeFetch(); return { watch: createWatch({ env, fetchImpl: f.fetchImpl }), calls: f.calls }; };

test('accounts lists all four platforms with profiles', async () => {
  const { watch } = setup();
  const r = await watch.accounts();
  assert.deepEqual(r.set_up, ['threads', 'itch', 'youtube', 'x']);
  const by = Object.fromEntries(r.accounts.map((a) => [a.platform, a]));
  assert.equal(by.threads.profile.handle, 'exampleuser');
  assert.equal(by.threads.profile.followers, 42);
  assert.equal(by.itch.profile.name, 'Example User');
  assert.equal(by.itch.profile.followers, null);
  assert.equal(by.youtube.profile.followers, 37);
  assert.equal(by.youtube.profile.link, 'https://www.youtube.com/@exampleuser');
  assert.equal(by.x.profile.handle, 'exampleuser');
  assert.equal(by.x.profile.followers, 58);
  assert.equal(by.x.profile.link, 'https://x.com/exampleuser');
});

test('recent_posts: newest first, shortened text, links', async () => {
  const { watch } = setup();
  const t = await watch.recentPosts('threads', 10);
  assert.equal(t.posts.length, 2);
  assert.deepEqual(Object.keys(t.posts[0]), ['id', 'date', 'text', 'link']);
  assert.equal(t.posts[0].id, '2000000000000002');
  assert.equal((await watch.recentPosts('threads', 1)).posts.length, 1);

  const i = await watch.recentPosts('itch');
  assert.equal(i.posts[0].text, 'Sample Game: A small puzzle game');
  assert.equal(i.posts[0].link, 'https://exampleuser.itch.io/sample-game');

  const y = await watch.recentPosts('youtube');
  assert.equal(y.posts[0].id, 'FAKEvid0002');
  assert.equal(y.posts[0].link, 'https://www.youtube.com/watch?v=FAKEvid0002');

  const x = await watch.recentPosts('x', 1);
  assert.deepEqual(x.posts, [{ id: '1900000000000000002', date: '2026-10-28T18:05:00.000Z',
    text: 'Sample Game: the new level art is done.', link: 'https://x.com/exampleuser/status/1900000000000000002' }]);
});

test('post_stats per platform', async () => {
  const { watch } = setup();
  assert.deepEqual((await watch.postStats('threads', '2000000000000002')).stats,
    { id: '2000000000000002', views: 321, likes: 12, replies: 3, reposts: 1, quotes: 0, shares: 4 });
  const i = (await watch.postStats('itch', '222')).stats;
  assert.equal(i.views, 2682); assert.equal(i.downloads, 109); assert.equal(i.purchases, 4);
  assert.deepEqual(i.earnings, ['$12.00']);
  const y = (await watch.postStats('youtube', 'FAKEvid0002')).stats;
  assert.equal(y.views, 980); assert.equal(y.likes, 55); assert.equal(y.replies, 7); assert.equal(y.reposts, null);
  assert.deepEqual((await watch.postStats('x', '1900000000000000002')).stats,
    { id: '1900000000000000002', views: 512, likes: 14, replies: 3, reposts: 2, quotes: 0, bookmarks: 1 });
  await assert.rejects(watch.postStats('itch', '999'), /No itch.io game/);
  await assert.rejects(watch.postStats('x', '1'), /X post 1 not found/);
});

test('replies: others only, since filter, mentions note when the scope is missing', async () => {
  const { watch } = setup();
  const t = await watch.replies('threads');
  assert.deepEqual(t.items.map((x) => x.author), ['some_reader', 'old_reader']); // own reply skipped
  assert.match(t.notes[0], /threads_manage_mentions/);
  assert.deepEqual((await watch.replies('threads', '2026-10-01')).items.map((x) => x.author), ['some_reader']);

  const y = await watch.replies('youtube', '2026-10-20T00:00:00Z');
  assert.equal(y.items.length, 1);
  assert.equal(y.items[0].author, '@viewer_one');
  assert.match(y.items[0].link, /lc=FAKEcomment02/);

  const i = await watch.replies('itch');
  assert.deepEqual(i.items, []);
  assert.match(i.notes[0], /no endpoint for comments/);
  const x = await watch.replies('x');
  assert.deepEqual(x.items.map((m) => [m.kind, m.author, m.to]), [['reply', 'some_reader', '1900000000000000002'], ['mention', 'old_reader', null]]); // own post skipped
  assert.equal(x.items[0].link, 'https://x.com/some_reader/status/1900000000000000012');
  assert.deepEqual((await watch.replies('x', '2026-10-20')).items.map((m) => m.author), ['some_reader']);
  await assert.rejects(watch.replies('youtube', 'not a date'), /Cannot read "since"/);
});

test('totals per platform', async () => {
  const { watch } = setup();
  const t = (await watch.totals('threads')).totals;
  assert.equal(t.followers, 42);
  assert.deepEqual(t.last_30_days, { views: 123, likes: 17, replies: 5, reposts: 2, quotes: 1 });
  const i = (await watch.totals('itch')).totals;
  assert.equal(i.games, 2); assert.equal(i.views, 2692); assert.equal(i.downloads, 110);
  assert.deepEqual((await watch.totals('youtube')).totals, { subscribers: 37, views: 1500, videos: 2 });
  assert.deepEqual((await watch.totals('x')).totals, { followers: 58, following: 120, posts: 31, likes_given: 204, listed: 1 });
});

test('platforms without a token are "not set up", not errors, and make no requests', async () => {
  const { watch, calls } = setup({ ITCH_API_KEY: FAKE_ENV.ITCH_API_KEY, THREADS_TOKEN: '  ' });
  assert.deepEqual(watch.configured(), ['itch']);
  for (const p of ['threads', 'youtube', 'x']) {
    for (const r of [await watch.recentPosts(p), await watch.postStats(p, 'x'), await watch.replies(p), await watch.totals(p)]) {
      assert.equal(r.status, 'not set up');
      assert.match(r.how, /docs\/setup\.md/);
    }
  }
  const acc = await watch.accounts();
  assert.deepEqual(acc.accounts.map((a) => a.status), ['not set up', 'ok', 'not set up', 'not set up']);
  assert.ok(calls.every((c) => c.url.host === 'api.itch.io'));
  assert.equal((await watch.totals('tiktok')).status, 'unknown platform');
});

test('placeholders copied from .env.example count as not set up', async () => {
  const { watch } = setup({ THREADS_TOKEN: '<THREADS_TOKEN from https://developers.facebook.com/apps>', YOUTUBE_CHANNEL_ID: 'UCexampleexampleexample00' });
  assert.deepEqual(watch.configured(), []);
});

test('X counts as set up only with all four keys', async () => {
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN } = FAKE_ENV;
  assert.deepEqual(setup({ X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN }).watch.configured(), []);
  assert.deepEqual(setup({ X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET: '<X_ACCESS_TOKEN_SECRET from ...>' }).watch.configured(), []);
});

test('nothing set up at all still answers', async () => {
  const { watch, calls } = setup({});
  const r = await watch.accounts();
  assert.deepEqual(r.set_up, []);
  assert.ok(r.accounts.every((a) => a.status === 'not set up'));
  assert.equal(calls.length, 0);
});
