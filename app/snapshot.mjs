#!/usr/bin/env node
// Snapshot CLI: saves today's numbers per platform to stats/YYYY-MM-DD.json and .md.
// Never overwrites a day: a second run the same day writes YYYY-MM-DD-2, then -3...
// Usage: node app/snapshot.mjs [--out <dir>] (default: ./stats; SOCIAL_WATCH_OUT_DIR in .env also works) [--limit 10]
import { writeFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROJECT_DIR, createWatch, loadDotEnv } from './platforms.mjs';
import { redact } from './http.mjs';

export const DEFAULT_OUT = join(PROJECT_DIR, 'stats');

export async function collect(watch, { limit = 10, now = new Date() } = {}) {
  const snap = { date: now.toLocaleDateString('sv-SE'), generated_at: now.toISOString(), platforms: {} };
  for (const p of watch.configured()) {
    try {
      const acc = (await watch.accounts(p)).accounts[0];
      const totals = (await watch.totals(p)).totals;
      const posts = [];
      for (const post of (await watch.recentPosts(p, limit)).posts) {
        try {
          posts.push({ ...post, stats: (await watch.postStats(p, post.id)).stats });
        } catch (e) {
          posts.push({ ...post, error: redact(e.message, watch.secrets) });
        }
      }
      snap.platforms[p] = { profile: acc.profile, totals, posts };
    } catch (e) {
      snap.platforms[p] = { error: redact(e.message, watch.secrets) };
    }
  }
  return snap;
}

const fmt = (v) => (v === null || v === undefined ? '-' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export function toMarkdown(snap) {
  const lines = [`# Social stats ${snap.date}`, '', `Generated ${snap.generated_at} by social-watch.`, ''];
  for (const [p, d] of Object.entries(snap.platforms)) {
    lines.push(`## ${p}`, '');
    if (d.error) { lines.push(`Error: ${d.error}`, ''); continue; }
    lines.push(`Followers: ${fmt(d.profile?.followers)}`);
    const t = Object.entries(d.totals ?? {}).filter(([k]) => k !== 'per_game' && k !== 'followers');
    if (t.length) lines.push(`Totals: ${t.map(([k, v]) => `${k} ${fmt(v)}`).join(', ')}`);
    lines.push('');
    for (const post of d.posts ?? []) {
      const s = post.stats ? Object.entries(post.stats).filter(([k]) => !['id', 'title', 'published'].includes(k))
        .map(([k, v]) => `${k} ${fmt(v)}`).join(', ') : `error: ${post.error}`;
      lines.push(`- ${(post.date ?? '').slice(0, 10)} [${post.text}](${post.link}): ${s}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// Anything that looks like an access token or API key (Meta, Google, long random strings).
const TOKEN_LIKE = [/\b(?:EAA|THAA|THQ|IGQ)[A-Za-z0-9_-]{20,}/, /\bAIza[0-9A-Za-z_-]{30,}/, /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{40,}\b/];

export function findSecretLike(text, secrets = []) {
  const hits = secrets.filter((s) => s && text.includes(s)).map(() => 'a configured token');
  for (const re of TOKEN_LIKE) if (re.test(text)) hits.push(`text matching ${re}`);
  return hits;
}

// Picks the first free name for the day and writes both files; refuses if anything looks secret.
export function writeSnapshot(snap, dir = DEFAULT_OUT, secrets = []) {
  const json = JSON.stringify(snap, null, 2) + '\n';
  const md = toMarkdown(snap) + '\n';
  const hits = findSecretLike(json + md, secrets);
  if (hits.length) throw new Error(`Snapshot not written: it contains ${hits.join(', ')}`);
  mkdirSync(dir, { recursive: true });
  for (let n = 1; ; n++) {
    const base = join(dir, n === 1 ? snap.date : `${snap.date}-${n}`);
    if (existsSync(`${base}.json`) || existsSync(`${base}.md`)) continue;
    writeFileSync(`${base}.json`, json, { flag: 'wx' }); // wx: fail rather than overwrite
    writeFileSync(`${base}.md`, md, { flag: 'wx' });
    return { json: `${base}.json`, md: `${base}.md` };
  }
}

async function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const watch = createWatch({ env: loadDotEnv() });
  if (!watch.configured().length) {
    console.error('Nothing set up yet: add keys to .env (see docs/setup.md). No snapshot written.');
    process.exitCode = 1;
    return;
  }
  const snap = await collect(watch, { limit: Number(arg('--limit') ?? 10) });
  const out = writeSnapshot(snap, resolve(arg('--out') ?? process.env.SOCIAL_WATCH_OUT_DIR ?? DEFAULT_OUT), watch.secrets);
  console.log(`Wrote ${out.json}\nWrote ${out.md}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exitCode = 1; });
}
