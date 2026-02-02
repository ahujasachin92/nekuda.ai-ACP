import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('Error:', err);

  res.status(500).json({
    error: {
      type: 'internal_error',
      message: err.message || 'An unexpected error occurred'
    }
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      type: 'resource_not_found',
      message: `Route ${req.method} ${req.path} not found`
    }
  });
}
