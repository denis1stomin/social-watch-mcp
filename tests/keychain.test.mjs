// The macOS keychain fallback, with a fake reader: no real keychain is touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillFromKeychain } from '../app/keychain.mjs';

const store = { YOUTUBE_API_KEY: 'from-keychain', ITCH_API_KEY: 'itch-from-keychain' };
const fakeRead = (asked) => (k) => { asked.push(k); return store[k]; };

test('keychain fills only missing or placeholder values; env and .env win', () => {
  const asked = [];
  const env = { YOUTUBE_API_KEY: '<YOUTUBE_API_KEY from ...>', ITCH_API_KEY: 'from-env', THREADS_TOKEN: '' };
  fillFromKeychain(env, ['YOUTUBE_API_KEY', 'ITCH_API_KEY', 'THREADS_TOKEN'], { platform: 'darwin', read: fakeRead(asked) });
  assert.equal(env.YOUTUBE_API_KEY, 'from-keychain');
  assert.equal(env.ITCH_API_KEY, 'from-env');
  assert.equal(env.THREADS_TOKEN, '');
  assert.deepEqual(asked, ['YOUTUBE_API_KEY', 'THREADS_TOKEN']);
});

test('keychain is not used outside macOS', () => {
  const asked = [];
  const env = {};
  fillFromKeychain(env, ['YOUTUBE_API_KEY'], { platform: 'linux', read: fakeRead(asked) });
  assert.deepEqual(env, {});
  assert.deepEqual(asked, []);
});
