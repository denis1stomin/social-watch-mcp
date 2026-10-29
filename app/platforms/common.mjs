// Small helpers shared by the platform adapters.

export function shorten(text, max = 200) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

// Accepts an ISO date/time or Unix seconds; returns epoch ms or undefined.
export function parseSince(since) {
  if (since === undefined || since === null || since === '') return undefined;
  const n = Number(since);
  const ms = Number.isFinite(n) ? n * 1000 : Date.parse(since);
  if (!Number.isFinite(ms)) throw new Error(`Cannot read "since": ${since} (use an ISO date like 2026-10-01)`);
  return ms;
}

export const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
