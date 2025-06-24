// Helper to wrap async controllers and catch errors
import express from 'express';

export function asyncHandler(fn: any) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
