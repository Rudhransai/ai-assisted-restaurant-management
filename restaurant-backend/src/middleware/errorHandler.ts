import type { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
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
