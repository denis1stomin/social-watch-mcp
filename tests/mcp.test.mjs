// The real MCP server over an in-memory transport: five tools, read-only hints, "not set up" answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../app/server.mjs';
import { createWatch } from '../app/platforms.mjs';
import { fakeFetch, FAKE_ENV } from './helpers.mjs';

async function connect(env) {
  const server = createServer(createWatch({ env, fetchImpl: fakeFetch().fetchImpl }));
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}
const json = (r) => JSON.parse(r.content[0].text);

test('lists the five read-only tools', async () => {
  const client = await connect({});
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['accounts', 'post_stats', 'recent_posts', 'replies', 'totals']);
  assert.ok(tools.every((t) => t.annotations?.readOnlyHint === true));
  await client.close();
});

test('unconfigured platform answers "not set up"', async () => {
  const client = await connect({});
  const r = await client.callTool({ name: 'totals', arguments: { platform: 'threads' } });
  assert.ok(!r.isError);
  assert.equal(json(r).status, 'not set up');
  await client.close();
});

test('tools work over MCP with fixtures; failures are tool errors without tokens', async () => {
  const client = await connect(FAKE_ENV);
  const r = await client.callTool({ name: 'recent_posts', arguments: { platform: 'youtube', limit: 1 } });
  assert.equal(json(r).posts[0].id, 'FAKEvid0002');
  const bad = await client.callTool({ name: 'post_stats', arguments: { platform: 'itch', id: '999' } });
  assert.equal(bad.isError, true);
  const leaky = await connect({ YOUTUBE_API_KEY: 'wrong-key-value', YOUTUBE_CHANNEL_ID: 'UCx' });
  const e = await leaky.callTool({ name: 'totals', arguments: { platform: 'youtube' } });
  assert.equal(e.isError, true);
  assert.ok(!e.content[0].text.includes('wrong-key-value'));
  await client.close(); await leaky.close();
});
