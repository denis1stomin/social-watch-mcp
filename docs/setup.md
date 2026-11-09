# social-watch setup: keys and tokens (your steps)

social-watch only reads. Every key below is created by you, in your own accounts; nobody else logs in for you.
All values go into one file, `.env` in the social-watch-mcp folder (git-ignored). Start it
from the example:

```sh
cd social-watch-mcp
cp .env.example .env     # then replace each <placeholder> you set up; leave the others as they are
```

A platform whose value is empty or still a `<placeholder>` is reported as "not set up". You can set up one platform
at a time. Never paste a token into a chat, a task file or a commit.

### Where the keys can live

Each key is looked up in this order; the first real value wins:

1. **Environment variables** with the same names (`YOUTUBE_API_KEY=...`), for example from your shell profile, a
   secret manager, or the `env` block of the MCP config. With `claude mcp add`, pass them as
   `-e YOUTUBE_API_KEY=...` (note: that stores the value in Claude's config file in plain text).
2. **`.env`** in the social-watch-mcp folder, as above.
3. **macOS Keychain** (macOS only): a generic password with service `social-watch-mcp` and the variable name as
   account. Add or change one with (`-w` at the end makes it ask for the value, so it stays out of shell history):

   ```sh
   security add-generic-password -U -s social-watch-mcp -a YOUTUBE_API_KEY -w
   security add-generic-password -U -s social-watch-mcp -a YOUTUBE_CHANNEL_ID -w
   ```

   The `-w` prompt silently cuts the input at 128 characters. That is enough for most keys but not for a long token
   such as `THREADS_TOKEN` (a cut token is rejected, for example by Meta with "Failed to decrypt"). For those, read the
   value yourself (nothing is echoed or kept in history):

   ```sh
   read -rs "T?Paste token: "; echo; security add-generic-password -U -s social-watch-mcp -a THREADS_TOKEN -w "$T"; unset T
   ```

   Check one: `security find-generic-password -s social-watch-mcp -a YOUTUBE_API_KEY` (prints the entry, not the
   value). To check a saved value's length: `security find-generic-password -s social-watch-mcp -a THREADS_TOKEN -w | tr -d '\n' | wc -c`. Remove one: `security delete-generic-password -s social-watch-mcp -a YOUTUBE_API_KEY`. With keys in the
   keychain you don't need a `.env` at all; if you keep one, leave those lines as `<placeholders>` or delete them.

After changing `.env`, restart Claude Code (or run `/mcp` and reconnect social-watch) so the server reads it again.
Check what is set up with the `accounts` tool, or from the terminal: `npm run snapshot -- --out /tmp/sw-check`.

| Platform | What you create | Lasts | Cost |
|---|---|---|---|
| Threads | Meta app + long-lived user token | 60 days, renewable | free |
| itch.io | API key | until you revoke it | free |
| YouTube | Google Cloud API key | until you delete it | free (10,000 quota units/day) |
| X | a separate X app with Read permission, its 4 OAuth 1.0a keys | until you regenerate them | pay-per-use credits, well under $1/month at weekly checks |
| Bluesky | nothing: just your handle | - | free |
| Facebook Page | Meta app + Page access token | no expiry, until the app is removed, you lose the Page role or change your password | free |

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
3. **APIs & Services > Credentials > Create credentials**. If a wizard asks "Which API are you using?", pick
   **YouTube Data API v3** and **Public data** (that creates an API key; **User data** would create an OAuth
   client, which social-watch doesn't use). Otherwise pick **API key** directly.
4. In the key's settings, **API restrictions**: select only **YouTube Data API v3**. **Application restrictions**:
   **None** is fine for a key that reads only public data; **IP addresses** works only if your IP never changes.
   Save. (A "Service account required" note on that page is about Gemini/Agent Platform keys; ignore it.)
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

<a id="bluesky"></a>
## Bluesky

Nothing to create: social-watch reads Bluesky through the public API (`public.api.bsky.app`) without logging in,
so there is no key and no token that could post. Only your handle is needed:

```
BLUESKY_HANDLE=yourname.bsky.social
```

(A leading `@` is fine. A handle is public, so it can live in `.env`; the keychain works too.) Never put an app
password here: social-watch does not need one.

What you get: profile and followers; recent posts (reposts of other people's posts are skipped); likes, replies,
reposts, quotes and bookmarks per post; replies to your last 10 posts, including answers further down the thread;
totals (followers, following, posts). Not available without a login: view counts (Bluesky has none) and mentions.

Limits: the public API allows about 3,000 requests per 5 minutes per IP; one `replies` call makes about 12.

Sources: [API directory](https://docs.bsky.app/docs/advanced-guides/api-directory),
[getProfile](https://docs.bsky.app/docs/api/app-bsky-actor-get-profile),
[getAuthorFeed](https://docs.bsky.app/docs/api/app-bsky-feed-get-author-feed),
[getPostThread](https://docs.bsky.app/docs/api/app-bsky-feed-get-post-thread),
[Rate limits](https://docs.bsky.app/docs/advanced-guides/rate-limits).

---

<a id="facebook"></a>
## Facebook Page

social-watch reads a Facebook **Page**, not a personal profile: Meta's API gives almost nothing for profiles. If you
only have a profile, create a Page first (Menu > Pages > Create). An app in development mode is enough for a Page you
admin, so no app review is needed.

1. Open https://developers.facebook.com/apps and click **Create app**. Name it something like
   `social-watch-fb-readonly` (a separate app from the Threads one and from any posting bot, so this token can never post).
   Use case: **Manage everything on your Page** (Meta renames these; pick the one that lists the Page permissions).
2. In the app, open the use case **Customize > Permissions** and add only:
   - `pages_show_list` (find your Page)
   - `pages_read_engagement` (posts, reactions, followers)
   - `pages_read_user_content` (comments and posts that tag the Page)
   - `read_insights` (views)

   Do **not** add `pages_manage_posts`, `pages_manage_engagement`, `pages_messaging` or anything else with "manage" in it.
   The use case itself may list a few more (for example `business_management` or `email`, marked "Required for use
   case", so they can't be removed). That is fine: a permission on the app's list only says what the app may ask
   for. What counts is what you tick in step 3, because the token carries only those.
3. Open the Graph API Explorer (https://developers.facebook.com/tools/explorer), choose your app, click
   **Generate Access Token**, tick the four permissions above and choose your Page when asked. This gives a short-lived
   **user** token (about 1 hour).
4. Turn it into a token that does not expire, in two calls (run them in your own terminal; `<APP_ID>` and
   `<APP_SECRET>` are on the app's Settings > Basic page):

   ```sh
   curl -s "https://graph.facebook.com/v25.0/oauth/access_token?grant_type=fb_exchange_token&client_id=<APP_ID>&client_secret=<APP_SECRET>&fb_exchange_token=<SHORT_LIVED_USER_TOKEN>"
   curl -s "https://graph.facebook.com/v25.0/me/accounts?fields=id,name,access_token&access_token=<LONG_LIVED_USER_TOKEN>"
   ```

   The first answer's `access_token` is the long-lived user token (60 days); the second lists your Pages, each with its
   own `access_token`. That **Page token** (starts with `EAA`) has no expiry date: it is the one to keep. Check it in
   the Access Token Debugger (https://developers.facebook.com/tools/debug/accesstoken): it should say it never
   expires and list only the four permissions (if it shows any other, regenerate the token without it).
5. Save it. A Page token is longer than 128 characters, so use the `read` form from
   [where the keys can live](#where-the-keys-can-live) (the plain `-w` prompt would cut it):

   ```sh
   read -rs "T?Paste token: "; echo; security add-generic-password -U -s social-watch-mcp -a FACEBOOK_PAGE_TOKEN -w "$T"; unset T
   ```

   Or in `.env`: `FACEBOOK_PAGE_TOKEN=<the Page token>`. Nothing else is needed: the token tells social-watch which Page.

The token stops working if you lose your role on the Page, change your Facebook password or remove the app; repeat steps
3-5 then.

What you get: Page name, username, about, followers; recent posts; reactions, comments, shares and views per post;
comments on your last 10 posts (and replies under them), posts that tag the Page as mentions; totals (followers, Page
likes, views in the last 28 days). Views come from Meta's `post_media_view` and `page_media_view` insights; if Meta
refuses them (missing `read_insights`, or a Page too small to have insights) they show as `null` and everything else still
answers. A comment's author name only comes back with `pages_read_user_content`.

Sources: [Pages API](https://developers.facebook.com/docs/pages-api),
[Page access tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived),
[Deprecated Page insights metrics](https://developers.facebook.com/documentation/pages-api/platforminsights/page/deprecated-metrics).

---


## TikTok

Not built yet; see `docs/x-and-tiktok.md` for what it would need.
