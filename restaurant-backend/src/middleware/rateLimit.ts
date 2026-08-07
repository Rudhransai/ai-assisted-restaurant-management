import type { Request, Response, NextFunction } from 'express';

/**
 * In-memory fixed-window rate limiter.
 *
 * Deliberately dependency-free and per-process: this app runs as a single Node process,
 * so a Map is enough. If the app is ever scaled to multiple processes or machines the
 * counters stop being shared and this must move to Redis or the database.
 *
 * Counting is per client IP. Behind a reverse proxy, set Express's `trust proxy` so
 * req.ip reflects X-Forwarded-For — otherwise every client shares the proxy's IP and
 * legitimate users lock each other out.
 */

interface WindowEntry {
  count: number;
  resetAt: number;
}

export function rateLimit(options: { windowMs: number; max: number; name: string }) {
  const { windowMs, max, name } = options;
  const hits = new Map<string, WindowEntry>();

  // Drop expired windows so the map cannot grow without bound under scanning traffic.
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  // Never keep the process alive just for the cleanup timer.
  cleanup.unref?.();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      console.warn(`[RateLimit] ${name}: blocked ${key} (${entry.count} requests in window)`);
      res.status(429).json({
        success: false,
        message: `Too many attempts. Try again in ${retryAfterSeconds} seconds.`,
      });
      return;
    }

    next();
  };
}
