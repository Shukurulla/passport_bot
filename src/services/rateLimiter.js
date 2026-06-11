// Simple in-memory sliding-window rate limiter, per Telegram user.
// Guards the (paid) AI path against spam / flooding. Resets on restart, which
// is fine for abuse mitigation. For multi-instance deployments move this to
// Redis.

const hits = new Map(); // telegramId -> number[] (timestamps, ms)

/**
 * @returns {boolean} true if the action is allowed, false if rate-limited.
 */
export function allowRequest(telegramId, maxPerMinute, windowMs = 60_000) {
  const now = Date.now();
  const arr = (hits.get(telegramId) || []).filter((t) => now - t < windowMs);

  if (arr.length >= maxPerMinute) {
    hits.set(telegramId, arr);
    return false;
  }

  arr.push(now);
  hits.set(telegramId, arr);
  return true;
}

// Periodically drop stale buckets so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [id, arr] of hits) {
    const fresh = arr.filter((t) => now - t < 60_000);
    if (fresh.length) hits.set(id, fresh);
    else hits.delete(id);
  }
}, 5 * 60_000).unref();
