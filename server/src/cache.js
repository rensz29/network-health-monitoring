const entries = new Map();

/**
 * Memoise an async call for `ttlMs`. Concurrent callers share one in-flight request,
 * so several dashboard tabs refreshing together cost the FortiGate a single round trip.
 */
export function cached(key, ttlMs, fn) {
  const hit = entries.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.promise;

  const promise = fn();
  entries.set(key, { at: Date.now(), promise });
  // Never cache failures.
  promise.catch(() => {
    if (entries.get(key)?.promise === promise) entries.delete(key);
  });
  return promise;
}
