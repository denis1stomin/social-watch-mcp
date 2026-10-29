// X API v2, pay-per-use. Docs: https://docs.x.com/x-api
// Signed with the app owner's OAuth 1.0a keys from a separate app with Read permission only, so X itself refuses
// any write; reads of your own posts are billed as "Owned Reads". Every returned item costs credits, so the
// adapter asks for as few items as the tool needs. Only GET endpoints are used.
import { createHmac, randomBytes } from 'node:crypto';
import { url } from '../http.mjs';
import { shorten, parseSince, num } from './common.mjs';

const BASE = 'https://api.x.com/2';
const POST_FIELDS = 'created_at,public_metrics';
const MENTIONS = 20; // mentions are the expensive part (standard reads), so a fixed small page

// RFC 3986 encoding, as OAuth 1.0a wants it.
const enc = (s) => encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// The OAuth 1.0a Authorization header (HMAC-SHA1). extra = body params (none for GET); nonce/timestamp for tests.
export function oauth1Header({ method, url: href, key, secret, token, tokenSecret, extra = {}, nonce, timestamp }) {
  const u = new URL(href);
  const oauth = {
    oauth_consumer_key: key,
    oauth_nonce: nonce ?? randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(timestamp ?? Math.floor(Date.now() / 1000)),
    oauth_token: token,
    oauth_version: '1.0',
  };
  const params = [...u.searchParams, ...Object.entries(extra), ...Object.entries(oauth)]
    .map(([k, v]) => [enc(k), enc(v)])
    .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`).join('&');
  const base = [method.toUpperCase(), enc(`${u.origin}${u.pathname}`), enc(params)].join('&');
  oauth.oauth_signature = createHmac('sha1', `${enc(secret)}&${enc(tokenSecret)}`).update(base).digest('base64');
  return 'OAuth ' + Object.entries(oauth).map(([k, v]) => `${enc(k)}="${enc(v)}"`).join(', ');
}

export function createX(keys, http) {
  const get = (path, params = {}) => {
    const href = url(`${BASE}/${path}`, params);
    return http.getJson(href, { headers: { Authorization: oauth1Header({ method: 'GET', url: href, ...keys }) } });
  };
  let me, meAt = 0; // profile {id, username, public_metrics, ...}

  // Cached for a minute: one tool call often needs it twice, but the server runs for hours.
  async function profile() {
    if (!me || Date.now() - meAt > 60_000) {
      const r = await get('users/me', { 'user.fields': 'public_metrics,description' });
      if (!r.data) throw new Error('X did not return your profile (check the keys in .env)');
      [me, meAt] = [r.data, Date.now()];
    }
    return me;
  }

  const stats = (t) => {
    const m = t.public_metrics ?? {};
    return {
      views: num(m.impression_count), likes: num(m.like_count), replies: num(m.reply_count),
      reposts: num(m.retweet_count), quotes: num(m.quote_count), bookmarks: num(m.bookmark_count),
    };
  };
  const link = (handle, id) => `https://x.com/${handle}/status/${id}`;

  return {
    name: 'x',
    async accounts() {
      const p = await profile();
      return {
        id: p.id, handle: p.username, name: p.name ?? null, bio: shorten(p.description),
        followers: num(p.public_metrics?.followers_count), link: `https://x.com/${p.username}`,
      };
    },
    async recentPosts(limit = 10) {
      const p = await profile();
      // max_results is 5..100; own posts only, no reposts or replies.
      const r = await get(`users/${p.id}/tweets`, {
        max_results: Math.min(Math.max(limit, 5), 100), exclude: 'retweets,replies', 'tweet.fields': POST_FIELDS,
      });
      return (r.data ?? []).slice(0, limit).map((t) => ({
        id: t.id, date: t.created_at, text: shorten(t.text), link: link(p.username, t.id),
      }));
    },
    async postStats(id) {
      const r = await get(`tweets/${encodeURIComponent(id)}`, { 'tweet.fields': POST_FIELDS });
      if (!r.data) throw new Error(`X post ${id} not found`);
      return { id, ...stats(r.data) };
    },
    // Replies to your posts mention you, so the mentions timeline covers both.
    async replies(since) {
      const sinceMs = parseSince(since);
      const p = await profile();
      const r = await get(`users/${p.id}/mentions`, {
        max_results: MENTIONS, start_time: sinceMs ? new Date(sinceMs).toISOString() : undefined,
        'tweet.fields': 'created_at,author_id,in_reply_to_user_id,referenced_tweets', expansions: 'author_id', 'user.fields': 'username',
      });
      const handles = Object.fromEntries((r.includes?.users ?? []).map((u) => [u.id, u.username]));
      const items = (r.data ?? []).filter((t) => t.author_id !== p.id).map((t) => {
        const author = handles[t.author_id] ?? null;
        const to = t.referenced_tweets?.find((x) => x.type === 'replied_to')?.id ?? null;
        return {
          kind: t.in_reply_to_user_id === p.id ? 'reply' : 'mention', id: t.id, author, date: t.created_at,
          text: shorten(t.text), link: author ? link(author, t.id) : `https://x.com/i/status/${t.id}`, to,
        };
      });
      return { items, notes: [`at most ${MENTIONS} newest mentions per call (each one costs X credits)`] };
    },
    async totals() {
      const m = (await profile()).public_metrics ?? {};
      return {
        followers: num(m.followers_count), following: num(m.following_count), posts: num(m.tweet_count),
        likes_given: num(m.like_count), listed: num(m.listed_count),
      };
    },
  };
}
