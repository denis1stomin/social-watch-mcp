#!/usr/bin/env node
// social-watch MCP server (stdio). Five read-only tools over Threads, itch.io, YouTube and X.
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { PLATFORMS, createWatch, loadDotEnv } from './platforms.mjs';
import { redact } from './http.mjs';

const platform = z.enum(PLATFORMS).describe('One of: ' + PLATFORMS.join(', '));
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };

export function createServer(watch) {
  const server = new McpServer({ name: 'social-watch', version: '0.1.0' });

  // Wraps a tool body: JSON text out, errors as tool errors (with any secret removed).
  const tool = (name, description, inputSchema, run) =>
    server.registerTool(name, { description, inputSchema, annotations: readOnly }, async (args) => {
      try {
        return { content: [{ type: 'text', text: JSON.stringify(await run(args), null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: redact(e.message, watch.secrets) }] };
      }
    });

  tool('accounts', 'Which platforms are set up, and each profile (name, handle, followers/subscribers where the API gives them).',
    { platform: platform.optional() }, ({ platform: p }) => watch.accounts(p));
  tool('recent_posts', 'Latest posts (Threads, X), games (itch.io) or videos (YouTube): id, date, shortened text, link. On X every returned post costs credits, so keep limit small.',
    { platform, limit: z.number().int().min(1).max(50).default(10) }, ({ platform: p, limit }) => watch.recentPosts(p, limit));
  tool('post_stats', 'Numbers for one post/game/video by id: views, likes, replies, reposts/shares, downloads, as far as the platform gives them.',
    { platform, id: z.string().min(1) }, ({ platform: p, id }) => watch.postStats(p, id));
  tool('replies', 'Replies, comments and mentions to read: text, author handle, date, link. since = ISO date or Unix seconds.',
    { platform, since: z.string().optional() }, ({ platform: p, since }) => watch.replies(p, since));
  tool('totals', 'Account-level numbers: followers, total views, downloads, purchases...',
    { platform }, ({ platform: p }) => watch.totals(p));

  return server;
}

async function main() {
  const watch = createWatch({ env: loadDotEnv() });
  await createServer(watch).connect(new StdioServerTransport());
  // stderr only: stdout is the MCP channel. Never print a token.
  console.error(`social-watch ready; set up: ${watch.configured().join(', ') || 'none (see docs/setup.md)'}`);
}

// Run only when started directly (tests import createServer).
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
