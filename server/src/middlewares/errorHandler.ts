import { Request, Response, NextFunction } from 'express';
import { logger } from '../utilities/logger';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  logger.error('Request error', {
    url: req.originalUrl,
    method: req.method,
    error: err.stack || err.message || err,
  });
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
}
