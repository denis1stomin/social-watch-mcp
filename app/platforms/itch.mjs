// itch.io server-side API. Docs: https://itch.io/docs/api/serverside
// The key goes in the Authorization header. Only GET /profile and GET /profile/games are used.
import { shorten, num } from './common.mjs';

const BASE = 'https://api.itch.io';

export function createItch({ key }, http) {
  const get = (path) => http.getJson(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${key}` } });

  async function games() {
    const r = await get('profile/games');
    return (r.games ?? []).sort((a, b) =>
      Date.parse(b.published_at ?? b.created_at) - Date.parse(a.published_at ?? a.created_at));
  }

  const stats = (g) => ({
    id: String(g.id), title: g.title, views: num(g.views_count), downloads: num(g.downloads_count),
    purchases: num(g.purchases_count),
    earnings: (g.earnings ?? []).map((e) => e.amount_formatted ?? `${e.amount} ${e.currency}`),
    published: Boolean(g.published),
  });

  return {
    name: 'itch',
    async accounts() {
      const { user } = await get('profile');
      // The itch.io API has no follower count.
      return { id: String(user.id), handle: user.username, name: user.display_name || user.username, followers: null, link: user.url };
    },
    async recentPosts(limit = 10) {
      return (await games()).slice(0, limit).map((g) => ({
        id: String(g.id), date: g.published_at ?? g.created_at, text: shorten(`${g.title}: ${g.short_text ?? ''}`), link: g.url,
      }));
    },
    async postStats(id) {
      const g = (await games()).find((x) => String(x.id) === String(id));
      if (!g) throw new Error(`No itch.io game with id ${id} on this account (see recent_posts for ids)`);
      return stats(g);
    },
    async replies() {
      return { items: [], notes: ['The itch.io API has no endpoint for comments; read them on the game page.'] };
    },
    async totals() {
      const all = await games();
      const sum = (k) => all.reduce((s, g) => s + (Number(g[k]) || 0), 0);
      return {
        games: all.length, views: sum('views_count'), downloads: sum('downloads_count'),
        purchases: sum('purchases_count'), per_game: all.map(stats),
      };
    },
  };
}
