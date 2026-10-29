// Snapshots: dated JSON + Markdown, never overwritten, never containing anything token-like.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWatch } from '../app/platforms.mjs';
import { collect, writeSnapshot, findSecretLike, DEFAULT_OUT } from '../app/snapshot.mjs';
import { fakeFetch, FAKE_ENV } from './helpers.mjs';

const now = new Date('2026-10-29T12:00:00');
const tmp = () => mkdtempSync(join(tmpdir(), 'social-watch-test-'));

async function snap() {
  const w = createWatch({ env: FAKE_ENV, fetchImpl: fakeFetch().fetchImpl });
  return { w, s: await collect(w, { now }) };
}

test('default output is ./stats', () => {
  assert.match(DEFAULT_OUT, /\/stats$/);
});

test('collects every platform with post numbers', async () => {
  const { s } = await snap();
  assert.equal(s.date, '2026-10-29');
  assert.deepEqual(Object.keys(s.platforms), ['threads', 'itch', 'youtube', 'x']);
  assert.equal(s.platforms.threads.profile.followers, 42);
  assert.equal(s.platforms.threads.posts[0].stats.views, 321);
  assert.equal(s.platforms.itch.posts[0].stats.downloads, 109);
  assert.equal(s.platforms.youtube.totals.subscribers, 37);
  assert.equal(s.platforms.x.totals.followers, 58);
  assert.equal(s.platforms.x.posts[0].stats.views, 512);
});

test('writes JSON + Markdown and never overwrites a day', async () => {
  const dir = tmp();
  try {
    const { w, s } = await snap();
    writeFileSync(join(dir, '2026-10-29.md'), 'my own notes'); // even a lone .md blocks the name
    const a = writeSnapshot(s, dir, w.secrets);
    const b = writeSnapshot(s, dir, w.secrets);
    assert.match(a.json, /2026-10-29-2\.json$/);
    assert.match(b.json, /2026-10-29-3\.json$/);
    assert.equal(readFileSync(join(dir, '2026-10-29.md'), 'utf8'), 'my own notes');
    assert.deepEqual(readdirSync(dir).sort(),
      ['2026-10-29-2.json', '2026-10-29-2.md', '2026-10-29-3.json', '2026-10-29-3.md', '2026-10-29.md']);
    const md = readFileSync(a.md, 'utf8');
    assert.match(md, /## threads/);
    assert.match(md, /Followers: 42/);
    assert.match(md, /views 321/);
    assert.deepEqual(JSON.parse(readFileSync(a.json, 'utf8')), JSON.parse(JSON.stringify(s)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('snapshot files contain no token and nothing token-like', async () => {
  const dir = tmp();
  try {
    const { w, s } = await snap();
    const out = writeSnapshot(s, dir, w.secrets);
    for (const f of [out.json, out.md]) {
      const text = readFileSync(f, 'utf8');
      for (const [k, secret] of Object.entries(FAKE_ENV)) if (k !== 'YOUTUBE_CHANNEL_ID') assert.ok(!text.includes(secret));
      assert.deepEqual(findSecretLike(text), []);
      assert.doesNotMatch(text, /access_token|api[_-]?key|Bearer/i);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('refuses to write when a token or a token-like string got in', async () => {
  const dir = tmp();
  try {
    const { w, s } = await snap();
    const leaked = structuredClone(s);
    leaked.platforms.itch.posts[0].text = `oops ${FAKE_ENV.ITCH_API_KEY}`;
    assert.throws(() => writeSnapshot(leaked, dir, w.secrets), /not written/);
    const tokenish = structuredClone(s);
    tokenish.platforms.threads.posts[0].text = 'THAA' + 'x1'.repeat(30);
    assert.throws(() => writeSnapshot(tokenish, dir, []), /not written/);
    assert.deepEqual(readdirSync(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
