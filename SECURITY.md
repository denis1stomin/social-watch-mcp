# Security

## Reporting a problem

Please don't open a public issue for a security problem. Use GitHub's private vulnerability reporting
(Security → Report a vulnerability) on this repository.

## What social-watch does to stay safe

- **Read-only by construction.** All network access goes through `app/http.mjs`, which refuses every method except
  GET. Tests check that no other source file can reach the network and that no write endpoint is named anywhere.
- **Read-only credentials where the platform allows it.** The setup guide has you create a separate X app with Read
  permission and a Threads token with read scopes only, so the platform itself refuses writes.
- **Secrets stay local.** Keys come only from environment variables or a local `.env` (git-ignored). Errors and logs
  go through a redactor, and the snapshot command refuses to write a file that contains anything token-like.
- **No telemetry, no server.** The MCP server talks to Claude over stdio and to the official platform APIs; nothing
  else. It opens no port.
- **Small supply chain.** Two runtime dependencies (`@modelcontextprotocol/sdk`, `zod`); X request signing uses
  `node:crypto`, not a library.

What you should do: keep `.env` private (`chmod 600 .env`), never paste a token into a chat or an issue, and revoke
a key at once if it leaks (the setup guide says where for each platform).

## Checks on every push and pull request

| Check | Tool | What it catches |
| --- | --- | --- |
| Secrets | gitleaks, over the full git history | tokens, keys and passwords committed by mistake |
| Dependencies | `npm audit` (+ registry signatures), also weekly | known vulnerabilities in the locked packages |
| Code | CodeQL (`security-extended`) | common JavaScript security mistakes; runs on public repositories only |
| Updates | Dependabot | outdated packages and GitHub Actions |

Workflows run with read-only permissions (CodeQL also writes its findings to code scanning) and pin every action to
a commit SHA. Installs use `npm ci --ignore-scripts`.

Optional local check before each commit: `pre-commit install` runs gitleaks (see `.pre-commit-config.yaml`).

## Protecting the default branch

`.github/rulesets/main.json` defines the rules for `main`:
- no deletion and no force pushes, with linear history;
- changes only through pull requests, with all review threads resolved;
- the tests and the three security checks must pass on an up-to-date branch.

Apply it (once the repository is public or the plan allows rulesets) with:

```bash
gh api -X POST repos/OWNER/REPO/rulesets --input .github/rulesets/main.json
```
