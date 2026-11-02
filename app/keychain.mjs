// macOS only: fills keys that are not set in the environment or .env from the login keychain.
// Each key is a generic password with service "social-watch-mcp" and the variable name as account, added with
//   security add-generic-password -s social-watch-mcp -a YOUTUBE_API_KEY -w
// Runs Apple's /usr/bin/security locally; no network.
import { execFileSync } from 'node:child_process';

export const KEYCHAIN_SERVICE = 'social-watch-mcp';

function readKeychain(account) {
  try {
    return execFileSync('/usr/bin/security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim();
  } catch {
    return undefined; // not in the keychain, or access denied
  }
}

// Empty values and untouched <placeholders> from .env.example count as missing.
export const isMissing = (value) => { const x = (value ?? '').trim(); return !x || x.startsWith('<'); };

export function fillFromKeychain(env, keys, { platform = process.platform, read = readKeychain } = {}) {
  if (platform !== 'darwin') return env;
  for (const k of keys) {
    if (!isMissing(env[k])) continue;
    const value = read(k);
    if (value) env[k] = value;
  }
  return env;
}
