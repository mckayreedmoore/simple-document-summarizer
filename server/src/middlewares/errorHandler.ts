import { Request, Response, NextFunction } from 'express';
import { logger } from '../utilities/logger';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  logger.error('Request error', {
    url: req.originalUrl,
    method: req.method,
    error: err.stack || err.message || err,
  });
  const status = err.status || 500;
  const isDev = process.env.NODE_ENV === 'DEV';
  res.status(status).json({
    error: {
      message: isDev ? (err.message || 'An unexpected error occurred.') : 'An unexpected error occurred.',
      code: err.code || 'INTERNAL_SERVER_ERROR',
      status,
    },
  });
}
