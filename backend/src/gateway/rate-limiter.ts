/**
 * Very small in-memory sliding-window rate limiter, keyed per socket + event.
 * Good enough to protect the signaling/chat channels in an MVP without an
 * external dependency. For a horizontally-scaled deployment this should be
 * backed by Redis.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
  ) {}

  /** Returns true if the action is allowed, false if rate-limited. */
  allow(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const timestamps = (this.hits.get(key) ?? []).filter(
      (t) => t > windowStart,
    );

    if (timestamps.length >= this.max) {
      this.hits.set(key, timestamps);
      return false;
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return true;
  }

  clear(keyPrefix: string) {
    for (const key of this.hits.keys()) {
      if (key.startsWith(keyPrefix)) {
        this.hits.delete(key);
      }
    }
  }
}
