import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { rateLimit } from './rateLimit';

function fakeRequest(ip: string): Request {
  return { ip } as unknown as Request;
}

function fakeResponse() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as typeof res & Response;
}

describe('rateLimit', () => {
  it('lets requests through up to the limit, then blocks with 429', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 3, name: 'test' });

    for (let i = 0; i < 3; i++) {
      const next = vi.fn();
      limiter(fakeRequest('1.2.3.4'), fakeResponse(), next);
      expect(next).toHaveBeenCalledOnce();
    }

    const res = fakeResponse();
    const next = vi.fn();
    limiter(fakeRequest('1.2.3.4'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBeDefined();
  });

  it('counts each client IP separately', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1, name: 'test' });

    const first = vi.fn();
    limiter(fakeRequest('1.1.1.1'), fakeResponse(), first);
    expect(first).toHaveBeenCalledOnce();

    const other = vi.fn();
    limiter(fakeRequest('2.2.2.2'), fakeResponse(), other);
    expect(other).toHaveBeenCalledOnce();
  });

  it('opens a fresh window after the previous one expires', () => {
    vi.useFakeTimers();
    try {
      const limiter = rateLimit({ windowMs: 1_000, max: 1, name: 'test' });

      limiter(fakeRequest('1.2.3.4'), fakeResponse(), vi.fn());

      const blocked = fakeResponse();
      limiter(fakeRequest('1.2.3.4'), blocked, vi.fn());
      expect(blocked.statusCode).toBe(429);

      vi.advanceTimersByTime(1_001);

      const next = vi.fn();
      limiter(fakeRequest('1.2.3.4'), fakeResponse(), next);
      expect(next).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
