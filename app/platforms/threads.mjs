// Threads API (Meta). Docs: https://developers.facebook.com/docs/threads
// The token is a long-lived user token with threads_basic, threads_read_replies, threads_manage_insights
// (and optionally threads_manage_mentions). Only GET endpoints are used.
import { url } from '../http.mjs';
import { shorten, parseSince, num } from './common.mjs';

// Meta's docs now show graph.threads.com; graph.threads.net serves the same API.
const BASE = 'https://graph.threads.net/v1.0';
const POST_FIELDS = 'id,text,timestamp,permalink,media_type,username';
const REPLY_FIELDS = 'id,text,timestamp,permalink,username';
const DAY = 86400;

export function createThreads({ token }, http) {
  const get = (path, params = {}) => http.getJson(url(`${BASE}/${path}`, { ...params, access_token: token }));
  let me; // cached profile: {id, username, ...}

  async function profile() {
    me ??= await get('me', { fields: 'id,username,name,threads_biography,is_verified' });
    return me;
  }

  // Insight "Total Value" metrics have total_value.value; "Time Series" ones (views) have values[] per day.
  function readInsights(data = []) {
    const out = {};
    for (const m of data) {
      out[m.name] = m.total_value ? num(m.total_value.value)
        : (m.values ?? []).reduce((sum, v) => sum + (Number(v.value) || 0), 0);
    }
    return out;
  }

  async function followers(id) {
    const r = await get(`${id}/threads_insights`, { metric: 'followers_count' });
    return readInsights(r.data).followers_count ?? null;
  }

  async function recentPosts(limit = 10) {
    const p = await profile();
    const r = await get(`${p.id}/threads`, { fields: POST_FIELDS, limit });
    return (r.data ?? []).slice(0, limit).map((t) => ({
      id: t.id, date: t.timestamp, text: shorten(t.text || `(${t.media_type ?? 'post'})`), link: t.permalink,
    }));
  }

  return {
    name: 'threads',
    async accounts() {
      const p = await profile();
      return {
        id: p.id, handle: p.username, name: p.name ?? null, bio: shorten(p.threads_biography),
        followers: await followers(p.id), link: `https://www.threads.com/@${p.username}`,
      };
    },
    recentPosts,
    async postStats(id) {
      const r = await get(`${encodeURIComponent(id)}/insights`, { metric: 'views,likes,replies,reposts,quotes,shares' });
      const m = readInsights(r.data);
      return {
        id, views: m.views ?? null, likes: m.likes ?? null, replies: m.replies ?? null,
        reposts: m.reposts ?? null, quotes: m.quotes ?? null, shares: m.shares ?? null,
      };
    },
    async replies(since) {
      const sinceMs = parseSince(since);
      const p = await profile();
      const notes = [];
      const items = [];
      const keep = (r, kind, to) => {
        if (r.username === p.username) return; // our own answers are not "to read"
        if (sinceMs && Date.parse(r.timestamp) < sinceMs) return;
        items.push({ kind, id: r.id, author: r.username ?? null, date: r.timestamp, text: shorten(r.text), link: r.permalink ?? null, to });
      };
      for (const post of await recentPosts(10)) {
        const r = await get(`${post.id}/replies`, { fields: REPLY_FIELDS, reverse: true });
        for (const reply of r.data ?? []) keep(reply, 'reply', post.id);
      }
      try {
        const r = await get(`${p.id}/mentions`, { fields: REPLY_FIELDS });
        for (const m of r.data ?? []) keep(m, 'mention', null);
      } catch (e) {
        notes.push(`mentions not read (${e.status ?? 'error'}): the token needs threads_manage_mentions, see docs/setup.md`);
      }
      items.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
      return { items, notes };
    },
    async totals() {
      const p = await profile();
      const until = Math.floor(Date.now() / 1000);
      const r = await get(`${p.id}/threads_insights`, {
        metric: 'views,likes,replies,reposts,quotes', since: until - 30 * DAY, until,
      });
      return { followers: await followers(p.id), last_30_days: readInsights(r.data) };
    },
  };
}
