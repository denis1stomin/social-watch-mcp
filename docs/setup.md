# social-watch setup: keys and tokens (your steps)

social-watch only reads. Every key below is created by you, in your own accounts; nobody else logs in for you.
All values go into one file, `.env` in the social-watch-mcp folder (git-ignored). Start it
from the example:

```sh
cd social-watch-mcp
cp .env.example .env     # then replace each <placeholder> you set up; leave the others as they are
```

A platform whose value is empty or still a `<placeholder>` is reported as "not set up". You can set up one platform
at a time. Never paste a token into a chat, a task file or a commit; only into `.env`.

After changing `.env`, restart Claude Code (or run `/mcp` and reconnect social-watch) so the server reads it again.
Check what is set up with the `accounts` tool, or from the terminal: `npm run snapshot -- --out /tmp/sw-check`.

| Platform | What you create | Lasts | Cost |
|---|---|---|---|
| Threads | Meta app + long-lived user token | 60 days, renewable | free |
| itch.io | API key | until you revoke it | free |
| YouTube | Google Cloud API key | until you delete it | free (10,000 quota units/day) |
| X | a separate X app with Read permission, its 4 OAuth 1.0a keys | until you regenerate them | pay-per-use credits, well under $1/month at weekly checks |

---

<a id="threads"></a>
## Threads

The Threads API is part of Meta for Developers. An app in development mode is enough for your own account: you add
yourself as a tester, so no app review is needed.

1. Open https://developers.facebook.com/apps and log in with the Meta/Instagram account that owns your Threads account.
   Click **Create app**. Name it something like `social-watch-readonly` (keep it separate from the posting bot's
   app, so this token can never post).
2. Use case: choose **Access the Threads API**. Skip business portfolio if asked (not needed).
3. In the app, open **Use cases > Access the Threads API > Customize > Permissions** and add only:
   - `threads_basic` (required for everything)
   - `threads_read_replies` (read replies to your posts)
   - `threads_manage_insights` (views, likes, followers; read-only despite the name)
   - optional: `threads_manage_mentions` (read posts that mention you; without it the `replies` tool just notes
     that mentions were skipped). Until the app has advanced access, Meta returns only mentions made by app testers.

   Do **not** add `threads_content_publish`, `threads_manage_replies`, `threads_delete` or any other permission.
4. **App roles > Roles > Add people > Threads Tester**, enter your Threads username. Then accept the invite on Threads:
   https://www.threads.com > Settings > Account > Website permissions > Invites > Accept.
5. Get a token. In **Use cases > Access the Threads API > Settings**, use the **User Token Generator** to generate
   a token for your account. If the page says the token is short-lived (1 hour), exchange it for a long-lived one
   within that hour (needs the **Threads app secret** from the same Settings page; run it in your own terminal):

   ```sh
   curl -s "https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=<THREADS_APP_SECRET>&access_token=<SHORT_LIVED_TOKEN>"
   ```

   The answer has `access_token` (the long-lived token) and `expires_in` (about 5,184,000 s = 60 days).
   Tip: start the line with a space so zsh doesn't keep it in history (needs `setopt HIST_IGNORE_SPACE`).
6. Paste it into `.env`: `THREADS_TOKEN=<the long-lived token>`.
7. **Renew before day 60** (the token must be at least 24 hours old and not expired; the new one lasts 60 days
   from the refresh). Put a reminder in your calendar, then:

   ```sh
   curl -s "https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=<CURRENT_LONG_LIVED_TOKEN>"
   ```

   and replace `THREADS_TOKEN` in `.env` with the new `access_token`. If it expired, repeat steps 5 and 6.

Sources: [Get started / permissions](https://developers.facebook.com/docs/threads/get-started),
[Long-lived tokens](https://developers.facebook.com/docs/threads/get-started/long-lived-tokens),
[Insights](https://developers.facebook.com/docs/threads/insights),
[Replies](https://developers.facebook.com/docs/threads/retrieve-and-manage-replies/replies-and-conversations),
[Mentions](https://developers.facebook.com/docs/threads/threads-mentions). Meta's docs now show the host
`graph.threads.com`; `graph.threads.net` (used here) serves the same API.

---

<a id="itch"></a>
## itch.io

1. Log in to itch.io and open https://itch.io/user/settings/api-keys.
2. Click **Generate new API key**. (itch.io keys can't be limited to read-only; social-watch only ever calls
   `GET /profile` and `GET /profile/games`. You can revoke the key on the same page at any time.)
3. Paste it into `.env`: `ITCH_API_KEY=<the key>`.

It lasts until you revoke it. If it ever leaks, revoke it there and generate a new one.

What you get: your games with views, downloads, purchases and earnings. The itch.io API has no followers and no
comments, so `accounts` shows followers as `null` and `replies` returns an explanatory note.

Source: [itch.io server-side API](https://itch.io/docs/api/serverside).

---

<a id="youtube"></a>
## YouTube

Public numbers (subscribers, views, videos, comments) need only an API key, no OAuth and no billing.

1. Open https://console.cloud.google.com/ with the Google account you like (it doesn't have to own the channel).
   Create a project, for example `social-watch`.
2. **APIs & Services > Library**, search **YouTube Data API v3**, click **Enable**.
3. **APIs & Services > Credentials > Create credentials > API key**.
4. Click the new key > **API restrictions > Restrict key** > tick only **YouTube Data API v3** > Save.
   (Optional: Application restrictions > IP addresses, your home IP.)
5. Paste it into `.env`: `YOUTUBE_API_KEY=<the key>`. Also set `YOUTUBE_CHANNEL_ID=UC...`: your channel id, shown at https://www.youtube.com/account_advanced
   (YouTube Studio > Settings > Channel > Advanced settings).

It lasts until you delete it; rotate it from the same page if it leaks. Quota: 10,000 units per day free; every
call social-watch makes costs 1 unit (a snapshot uses about 13).

Notes: subscriber counts from the API are rounded by YouTube (3 significant figures). `replies` reads the newest
top-level comments on your videos (up to 50).

Sources: [Getting started](https://developers.google.com/youtube/v3/getting-started),
[Quota costs](https://developers.google.com/youtube/v3/determine_quota_cost),
[commentThreads.list](https://developers.google.com/youtube/v3/docs/commentThreads/list).

---

<a id="x"></a>
## X

X has no free reads any more: you buy prepaid credits and every returned item costs a little (own posts are
"Owned Reads", $0.001 each; mentions $0.005 each; the profile about $0.01; the same item is billed once per UTC
day). Prices and how they were found: `docs/x-and-tiktok.md`. Check the live table in the console first.

1. Open the X Developer Console (https://developer.x.com, signed in as your account) and create a **new app**,
   for example `social-watch`. Don't reuse the posting bot's app: that one can write.
2. In the app's **User authentication settings**, set **App permissions** to **Read** (not "Read and write", not
   "Direct messages"). Do this **before** step 3: an access token keeps the permission it was created with.
3. **Keys and tokens**:
   - **API Key and Secret** (the consumer keys): Regenerate/Reveal and copy both.
   - **Access Token and Secret**: Generate. The page must say it was created with **Read** permissions; if it
     says Read and write, change step 2 and regenerate.
4. Paste the four values into `.env`:
   ```
   X_API_KEY=<API Key>
   X_API_SECRET=<API Key Secret>
   X_ACCESS_TOKEN=<Access Token>
   X_ACCESS_TOKEN_SECRET=<Access Token Secret>
   ```
   All four are needed; with any one missing X is "not set up".
5. **Billing**: buy the smallest credit pack, and set a **spend limit** (a few dollars a month is plenty).

They last until you regenerate them (do that at once if one leaks: the old ones stop working).

What one use costs, roughly: `accounts`/`totals` 1 profile read; `recent_posts` one read per post returned (keep
`limit` small); `post_stats` one read; `replies` one read per mention returned, at most 20 per call. A snapshot with
10 posts is about $0.02-0.03; a weekly check with replies about $0.13 at most.

Sources: [OAuth 1.0a user tokens](https://docs.x.com/resources/fundamentals/authentication/oauth-1-0a/obtaining-user-access-tokens),
[App permissions](https://docs.x.com/resources/fundamentals/developer-apps),
[Pricing](https://docs.x.com/x-api/getting-started/pricing),
[Users me](https://docs.x.com/x-api/users/user-lookup-me), [User posts](https://docs.x.com/x-api/posts/user-posts-timeline-by-user-id),
[Mentions](https://docs.x.com/x-api/posts/user-mention-timeline-by-user-id), [Metrics](https://docs.x.com/x-api/fundamentals/metrics).

---

## TikTok

Not built yet; see `docs/x-and-tiktok.md` for what it would need.
