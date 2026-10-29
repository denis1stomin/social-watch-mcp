// YouTube Data API v3 with an API key (public data only, no OAuth).
// Docs: https://developers.google.com/youtube/v3/docs ; every call here costs 1 quota unit (10,000/day free).
import { url } from '../http.mjs';
import { shorten, parseSince, num } from './common.mjs';

const BASE = 'https://www.googleapis.com/youtube/v3';

export function createYoutube({ key, channelId }, http) {
  const get = (path, params) => http.getJson(url(`${BASE}/${path}`, { ...params, key }));
  let channel, channelAt = 0;

  // Cached for a minute: one tool call often needs it twice, but the server runs for hours.
  async function getChannel() {
    if (!channel || Date.now() - channelAt > 60_000) {
      const r = await get('channels', { part: 'snippet,statistics,contentDetails', id: channelId });
      if (!r.items?.[0]) throw new Error(`YouTube channel ${channelId} not found`);
      [channel, channelAt] = [r.items[0], Date.now()];
    }
    return channel;
  }

  const counts = (s = {}) => ({
    subscribers: s.hiddenSubscriberCount ? null : num(s.subscriberCount),
    views: num(s.viewCount), videos: num(s.videoCount),
  });

  return {
    name: 'youtube',
    async accounts() {
      const c = await getChannel();
      const handle = c.snippet?.customUrl ?? null;
      return {
        id: c.id, handle, name: c.snippet?.title, followers: counts(c.statistics).subscribers,
        link: handle ? `https://www.youtube.com/${handle}` : `https://www.youtube.com/channel/${c.id}`,
      };
    },
    async recentPosts(limit = 10) {
      const uploads = (await getChannel()).contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) return [];
      const r = await get('playlistItems', { part: 'snippet,contentDetails', playlistId: uploads, maxResults: Math.min(limit, 50) });
      return (r.items ?? []).map((it) => {
        const id = it.contentDetails?.videoId ?? it.snippet?.resourceId?.videoId;
        return {
          id, date: it.contentDetails?.videoPublishedAt ?? it.snippet?.publishedAt,
          text: shorten(it.snippet?.title), link: `https://www.youtube.com/watch?v=${id}`,
        };
      });
    },
    async postStats(id) {
      const r = await get('videos', { part: 'snippet,statistics', id });
      const v = r.items?.[0];
      if (!v) throw new Error(`YouTube video ${id} not found`);
      const s = v.statistics ?? {};
      // The API gives no repost/share count for videos.
      return { id, title: v.snippet?.title, views: num(s.viewCount), likes: num(s.likeCount), replies: num(s.commentCount), reposts: null };
    },
    async replies(since) {
      const sinceMs = parseSince(since);
      const r = await get('commentThreads', {
        part: 'snippet', allThreadsRelatedToChannelId: channelId, maxResults: 50, order: 'time', textFormat: 'plainText',
      });
      const items = (r.items ?? []).map((t) => {
        const c = t.snippet?.topLevelComment?.snippet ?? {};
        const videoId = c.videoId ?? t.snippet?.videoId;
        return {
          kind: 'comment', id: t.id, author: c.authorDisplayName ?? null, date: c.publishedAt,
          text: shorten(c.textOriginal ?? c.textDisplay), link: `https://www.youtube.com/watch?v=${videoId}&lc=${t.id}`,
          to: videoId, replies: num(t.snippet?.totalReplyCount),
        };
      }).filter((c) => !sinceMs || Date.parse(c.date) >= sinceMs);
      return { items, notes: [] };
    },
    async totals() {
      return counts((await getChannel()).statistics);
    },
  };
}
