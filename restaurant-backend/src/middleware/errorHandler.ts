import type { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  // Postgres constraint violations are caused by the request, not by the server:
  // a reference to a row that doesn't exist (23503) or a duplicate (23505).
  if (err.code === '23503') {
    res.status(400).json({ success: false, message: 'Referenced record does not exist' });
    return;
  }
  if (err.code === '23505') {
    res.status(409).json({ success: false, message: 'A record with this value already exists' });
    return;
  }

  const statusCode = err.statusCode || 500;

  // Always log the real error server-side.
  if (statusCode >= 500) {
    console.error('[Error]', err);
  }

  // Never leak internals (SQL text, file paths, driver messages) to the client on a 500.
  const message =
    statusCode >= 500 ? 'Internal Server Error' : err.message || 'Request failed';

  res.status(statusCode).json({ success: false, message });
};
