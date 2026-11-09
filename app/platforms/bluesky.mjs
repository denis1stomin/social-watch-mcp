// Bluesky public AppView API. Docs: https://docs.bsky.app/docs/advanced-guides/api-directory
// No login at all: only the handle is configured, and only public GET endpoints are used, so there is no token
// that could post. Never put an app password here. Mentions need a login (search and notifications), so they
// are not read.
import { url } from '../http.mjs';
import { shorten, parseSince, num } from './common.mjs';

const BASE = 'https://public.api.bsky.app/xrpc';
const POST = 'app.bsky.feed.post';

// The rkey (last part of the at:// URI) is the post id; a full at:// URI or bsky.app link also works.
const rkeyOf = (uri) => String(uri).split('/').pop();

export function createBluesky({ handle }, http) {
  const get = (method, params) => http.getJson(url(`${BASE}/${method}`, params));
  const actor = handle.replace(/^@/, '');
  let me; // cached profile: {did, handle, ...}

  async function profile() {
    me ??= await get('app.bsky.actor.getProfile', { actor });
    return me;
  }

  const link = (p) => `https://bsky.app/profile/${p.author.handle}/post/${rkeyOf(p.uri)}`;
  const dateOf = (p) => p.record?.createdAt ?? p.indexedAt;

  async function recentPosts(limit = 10) {
    const pr = await profile();
    // The feed also holds reposts of other people's posts; ask for a few more and keep only our own.
    const r = await get('app.bsky.feed.getAuthorFeed', { actor: pr.did, filter: 'posts_no_replies', limit: Math.min(100, limit + 20) });
    return (r.feed ?? []).filter((f) => !f.reason && f.post.author.did === pr.did).slice(0, limit).map(({ post }) => ({
      id: rkeyOf(post.uri), date: dateOf(post), text: shorten(post.record?.text || '(post)'), link: link(post),
    }));
  }

  async function uriOf(id) {
    const s = String(id);
    if (s.startsWith('at://')) return s;
    const m = s.match(/bsky\.app\/profile\/([^/]+)\/post\/([^/?#]+)/);
    if (m) return `at://${m[1] === actor ? (await profile()).did : m[1]}/${POST}/${m[2]}`;
    return `at://${(await profile()).did}/${POST}/${s}`;
  }

  return {
    name: 'bluesky',
    async accounts() {
      const p = await profile();
      return {
        id: p.did, handle: p.handle, name: p.displayName || p.handle, bio: shorten(p.description),
        followers: num(p.followersCount), link: `https://bsky.app/profile/${p.handle}`,
      };
    },
    recentPosts,
    async postStats(id) {
      const r = await get('app.bsky.feed.getPosts', { uris: await uriOf(id) });
      const p = r.posts?.[0];
      if (!p) throw new Error(`Bluesky post ${id} not found (see recent_posts for ids)`);
      // Bluesky does not publish view counts.
      return {
        id: rkeyOf(p.uri), views: null, likes: num(p.likeCount), replies: num(p.replyCount),
        reposts: num(p.repostCount), quotes: num(p.quoteCount), bookmarks: num(p.bookmarkCount),
      };
    },
    async replies(since) {
      const sinceMs = parseSince(since);
      const pr = await profile();
      const items = [];
      // Walks the reply tree, so answers to our own replies count too.
      const walk = (node, to) => {
        for (const n of node.replies ?? []) {
          if (!n.post) continue; // blocked or deleted replies
          const p = n.post;
          if (p.author.did !== pr.did && !(sinceMs && Date.parse(dateOf(p)) < sinceMs)) {
            items.push({ kind: 'reply', id: rkeyOf(p.uri), author: p.author.handle, date: dateOf(p), text: shorten(p.record?.text), link: link(p), to });
          }
          walk(n, to);
        }
      };
      for (const post of await recentPosts(10)) {
        const r = await get('app.bsky.feed.getPostThread', { uri: await uriOf(post.id), depth: 3, parentHeight: 0 });
        walk(r.thread ?? {}, post.id);
      }
      items.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
      return { items, notes: ['Mentions are not read: the public Bluesky API needs a login for them.'] };
    },
    async totals() {
      const p = await profile();
      return { followers: num(p.followersCount), following: num(p.followsCount), posts: num(p.postsCount) };
    },
  };
}
