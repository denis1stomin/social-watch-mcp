# social-watch-mcp

A small, **read-only** [MCP](https://modelcontextprotocol.io) server that lets Claude see your own Threads, itch.io,
YouTube and X numbers and replies through the official APIs, instead of you pasting screenshots.

Ask Claude "how did my posts do this week?" or "any replies I should answer?" and it calls the tools below, reads
the real numbers and answers. It never posts, replies, likes or deletes: the HTTP client refuses everything except
GET, and tests enforce that (details in [SECURITY.md](SECURITY.md)).

| Tool | What it returns |
|---|---|
| `accounts(platform?)` | which platforms are set up; the profile (name, handle, followers where the API gives them) |
| `recent_posts(platform, limit=10)` | latest posts / games / videos: id, date, shortened text, link |
| `post_stats(platform, id)` | views, likes, replies, reposts, downloads, as far as the platform gives them |
| `replies(platform, since?)` | replies, comments and mentions to read: text, author, date, link |
| `totals(platform)` | account-level numbers (followers, total views, downloads...) |

`platform` is one of `threads`, `itch`, `youtube`, `x`. A platform without a key answers `"status": "not set up"`,
never an error, so you can start with just one.

There is also a snapshot command that saves the day's numbers to `stats/YYYY-MM-DD.json` (and a short `.md`), so
you can compare week to week. The APIs give only today's totals; the history exists only in those files.

## Run it locally

You need [Node.js 22 or newer](https://nodejs.org) and, to use it from Claude, [Claude Code](https://claude.com/claude-code)
or Claude Desktop.

```sh
git clone https://github.com/denis1stomin/social-watch-mcp.git
cd social-watch-mcp
npm ci                    # installs the two dependencies from the lockfile
cp .env.example .env      # then fill in the platforms you want
chmod 600 .env            # keys are readable by you only
npm test                  # 24 tests on made-up data: no network, no keys needed
```

### 1. Get your keys

Each platform has its own steps (Meta app, API key, ...), all in [docs/setup.md](docs/setup.md). You can set up one
platform at a time; the others stay "not set up". Free except X, which is pay-per-use (well under $1 a month at
weekly checks).

| Platform | Key in `.env` | Cost |
|---|---|---|
| Threads | `THREADS_TOKEN` (long-lived, renew every 60 days) | free |
| itch.io | `ITCH_API_KEY` | free |
| YouTube | `YOUTUBE_API_KEY` + `YOUTUBE_CHANNEL_ID` | free (quota) |
| X | four `X_*` values of a separate Read-only app | prepaid credits |

### 2. Try it without Claude

```sh
npm run snapshot          # writes ./stats/YYYY-MM-DD.json and .md
```

If it prints your numbers, the keys work. (`--out <dir>` or `SOCIAL_WATCH_OUT_DIR` change where it writes;
`--limit 10` sets how many recent posts per platform.)

### 3. Connect it to Claude

Claude Code (use the full path to `app/server.mjs`):

```sh
claude mcp add --scope user social-watch -- node "$PWD/app/server.mjs"
claude mcp list           # social-watch should show as connected
```

Claude Desktop: add this to `claude_desktop_config.json` (Settings > Developer > Edit Config), with your full path,
then restart the app:

```json
{
  "mcpServers": {
    "social-watch": { "command": "node", "args": ["/full/path/to/social-watch-mcp/app/server.mjs"] }
  }
}
```

The server reads the `.env` next to the code itself, so no keys go into the command or the config file. After
changing `.env`, restart Claude (or reconnect the server with `/mcp`).

Then just ask: "Which of my platforms are set up?", "Take a snapshot and compare it with last week's."

## Layout

`app/http.mjs` the GET-only client, the only code that touches the network · `app/platforms.mjs` config, "not set
up", the five tools · `app/platforms/` one adapter per platform · `app/server.mjs` the MCP server ·
`app/snapshot.mjs` the snapshot command · `tests/` tests and made-up fixtures · `docs/` setup guide and X/TikTok notes.

## Not included (yet)

TikTok (needs OAuth with daily token refresh), anything that writes, automatic Threads token refresh, scheduling
the snapshot.

## Security

See [SECURITY.md](SECURITY.md): what the server guarantees, the CI checks (secret scan, dependency audit, CodeQL)
and how to report a problem.

## License

[MIT](LICENSE)
