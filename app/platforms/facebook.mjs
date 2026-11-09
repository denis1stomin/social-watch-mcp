// Facebook Page via the Graph API. Docs: https://developers.facebook.com/docs/pages-api
// The token is a Page access token with pages_show_list, pages_read_engagement, pages_read_user_content and
// read_insights only (never a pages_manage_* permission). Only GET endpoints are used. A Page token answers
// /me with the Page itself, so no Page id has to be configured.
import { url } from '../http.mjs';
import { shorten, parseSince, num } from './common.mjs';

const BASE = 'https://graph.facebook.com/v25.0';
const PAGE_FIELDS = 'id,name,username,about,fan_count,followers_count,link';
const POST_FIELDS = 'id,message,story,created_time,permalink_url';
const COMMENT_FIELDS = 'id,message,created_time,from,permalink_url';

export function createFacebook({ token }, http) {
  const get = (path, params = {}) => http.getJson(url(`${BASE}/${path}`, { ...params, access_token: token }));
  let me; // cached Page: {id, name, ...}

  async function page() {
    me ??= await get('me', { fields: PAGE_FIELDS });
    return me;
  }

  // Insight metrics answer {data: [{name, values: [{value}]}]}; the last value is the newest.
  const insight = (r) => num(r.data?.[0]?.values?.at(-1)?.value);

  async function recentPosts(limit = 10) {
    const p = await page();
    const r = await get(`${p.id}/posts`, { fields: POST_FIELDS, limit });
    return (r.data ?? []).slice(0, limit).map((f) => ({
      id: f.id, date: f.created_time, text: shorten(f.message || f.story || '(post)'), link: f.permalink_url ?? null,
    }));
  }

  return {
    name: 'facebook',
    async accounts() {
      const p = await page();
      return {
        id: p.id, handle: p.username ?? null, name: p.name ?? null, bio: shorten(p.about),
        followers: num(p.followers_count ?? p.fan_count), link: p.username ? `https://www.facebook.com/${p.username}` : p.link ?? null,
      };
    },
    recentPosts,
    async postStats(id) {
      const p = await page();
      const postId = String(id).includes('_') ? String(id) : `${p.id}_${id}`; // Page post ids are pageId_postId
      let post;
      try {
        post = await get(postId, { fields: 'id,reactions.summary(true).limit(0),comments.summary(true).limit(0),shares' });
      } catch (e) {
        if (e.status === 400) throw new Error(`Facebook post ${id} not found or not readable (see recent_posts for ids)`);
        throw e;
      }
      // Views need read_insights; without them (or on a young Page) the other numbers still come back.
      const views = await get(`${postId}/insights`, { metric: 'post_media_view' }).then(insight, () => null);
      return {
        id: post.id, views, likes: num(post.reactions?.summary?.total_count), replies: num(post.comments?.summary?.total_count),
        shares: num(post.shares?.count ?? 0),
      };
    },
    async replies(since) {
      const sinceMs = parseSince(since);
      const p = await page();
      const notes = [];
      const items = [];
      const keep = (c, kind, to) => {
        if (c.from?.id === p.id) return; // our own answers are not "to read"
        if (sinceMs && Date.parse(c.created_time) < sinceMs) return;
        items.push({ kind, id: c.id, author: c.from?.name ?? null, date: c.created_time, text: shorten(c.message), link: c.permalink_url ?? null, to });
      };
      for (const post of await recentPosts(10)) {
        const r = await get(`${post.id}/comments`, { fields: COMMENT_FIELDS, filter: 'stream', order: 'reverse_chronological', limit: 50 });
        for (const c of r.data ?? []) keep(c, 'reply', post.id);
      }
      try {
        const r = await get(`${p.id}/tagged`, { fields: 'id,message,created_time,permalink_url,from', limit: 25 });
        for (const m of r.data ?? []) keep(m, 'mention', null);
      } catch (e) {
        notes.push(`mentions not read (${e.status ?? 'error'}): the token needs pages_read_user_content, see docs/setup.md`);
      }
      items.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
      return { items, notes };
    },
    async totals() {
      const p = await page();
      const views = await get(`${p.id}/insights`, { metric: 'page_media_view', period: 'days_28' }).then(insight, () => null);
      return { followers: num(p.followers_count ?? p.fan_count), page_likes: num(p.fan_count), last_28_days: { views } };
    },
  };
}
