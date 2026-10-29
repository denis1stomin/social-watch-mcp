# X and TikTok: what read-only access costs

X is supported (setup in [setup.md](setup.md#x)). TikTok is not; this page explains what supporting it would take.
Figures are from the official docs listed under Sources as of October 2026. Prices change: check the live price
table in the X Developer Console before buying credits.

## X

**Pricing: pay-per-use with prepaid credits.** Since February 2026 new developers are on pay-per-use; the old free
tier is closed to new sign-ups, and Basic/Pro subscriptions remain only for existing subscribers (third-party
summaries). Credits are bought up front in the Developer Console and each request deducts from them.

| What social-watch reads | X endpoint | Price per returned item |
|---|---|---|
| your own recent posts (with `public_metrics`) | `GET /2/users/{id}/tweets` | **$0.001** ("Owned Reads", since 2026-04-20) |
| your profile + follower count | `GET /2/users/me` | $0.010 (User read; may count as owned, unconfirmed) |
| mentions of you | `GET /2/users/{id}/mentions` | $0.005 (standard Post read; not listed as owned) |

- Owned-read pricing applies only when the user in the request is the authenticated user **and** owns the
  developer app, so it needs a user-context token from your own app.
- The same resource is billed once per UTC day (24-hour dedup window, "soft guarantee").
- Cap: 2-3 million post reads per month on pay-per-use (the two official pages disagree); irrelevant at this size.
- `non_public_metrics` (impressions, profile clicks) need a user-context token and only cover posts from the last
  30 days.

**Typical cost:** a weekly check of 20 own posts ($0.02) + 20 mentions ($0.10) + profile ($0.01) is about
**$0.13 per check, roughly $0.60 per month**; daily checks are about $4 per month. Mentions are the main cost;
skipping `replies` for X keeps it near $0.10 per month. In practice the minimum credit purchase is what you pay.

**How social-watch connects:** a separate X app with **Read** permission only, and the app owner's OAuth 1.0a
access token + secret from the console. These tokens don't expire, and requests are signed with `node:crypto`
(no extra dependency). Because the app itself is read-only, X refuses writes too. Set a spend limit in the console.

## TikTok (not supported)

**Display API:** free. It gives your profile and your public videos:
- `GET /v2/user/info/`: `follower_count`, `following_count`, `likes_count`, `video_count` (scope
  `user.info.stats`), plus name/avatar (`user.info.basic`) and username/bio (`user.info.profile`).
- `POST /v2/video/list/` and `POST /v2/video/query/`: per video `view_count`, `like_count`, `comment_count`,
  `share_count`, `create_time`, `title`, `share_url` (scope `video.list`).
- **No comment text and no mentions**: the Display API has no comments endpoint.

**Why it isn't built in:**
- Both video endpoints are **POST** requests (they only read, but the body carries the filter). social-watch's
  client refuses every non-GET method by design, so TikTok would need a narrow, explicitly listed exception for
  those two URLs.
- Login is OAuth (Login Kit) with a registered redirect URI; access tokens last **24 hours**, refresh tokens
  **365 days**, so every run needs a refresh step and a new login once a year.
- **App review:** a production app must pass review, and apps "still in development or testing will not be
  approved". The **sandbox** is enough for reading your own account: up to 10 target users per sandbox, all of
  them accounts you own. No review timeline is promised for production.

## Sources

X (official):
- Pricing and credits: https://docs.x.com/x-api/getting-started/pricing
- Usage and billing (caps, dedup): https://docs.x.com/x-api/fundamentals/post-cap
- Changelog (Owned Reads $0.001, 2026-04-20): https://docs.x.com/changelog
- Announcement: https://devcommunity.x.com/t/x-api-pricing-update-owned-reads-now-0-001-other-changes-effective-april-20-2026/263025
- Metrics (public/non-public): https://docs.x.com/x-api/fundamentals/metrics

X (third-party, for the subscription history only):
- https://postproxy.dev/blog/x-api-pricing-2026/
- https://www.blotato.com/blog/twitter-api-pricing

TikTok (official):
- Display API overview: https://developers.tiktok.com/doc/display-api-overview
- User info fields and scopes: https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info
- Video object: https://developers.tiktok.com/doc/tiktok-api-v2-video-object
- Token lifetimes: https://developers.tiktok.com/doc/oauth-user-access-token-management
- Sandbox: https://developers.tiktok.com/docs/en/add-a-sandbox
- App review: https://developers.tiktok.com/docs/en/app-review-guidelines
