// The only place in social-watch that talks to the network. It does GET and nothing else:
// a read-only tool must not be able to post, like, delete or change settings, even by mistake.

export class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Replaces every secret (and any key=/access_token= query value) so errors never leak a token.
export function redact(text, secrets = []) {
  let out = String(text).replace(/((?:access_token|key|client_secret)=)[^&\s"']+/gi, '$1<redacted>');
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join('<redacted>');
  return out;
}

// fetchImpl is injectable so tests run on fixtures, never on the network.
export function createHttp({ fetchImpl = globalThis.fetch, secrets = [] } = {}) {
  async function request(method, url, { headers = {} } = {}) {
    if (method !== 'GET') throw new Error(`social-watch is read-only: ${method} requests are not allowed`);
    const res = await fetchImpl(String(url), { method: 'GET', headers, redirect: 'follow' });
    const body = await res.text();
    if (!res.ok) {
      const where = redact(String(url).split('?')[0], secrets);
      throw new HttpError(`HTTP ${res.status} from ${where}: ${redact(body, secrets).slice(0, 300)}`, res.status);
    }
    try {
      return JSON.parse(body);
    } catch {
      throw new HttpError(`Not JSON from ${redact(String(url).split('?')[0], secrets)}`, res.status);
    }
  }
  return {
    request,
    getJson: (url, opts) => request('GET', url, opts),
  };
}

// Builds a URL with query params, skipping empty values.
export function url(base, params = {}) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  return u.toString();
}
