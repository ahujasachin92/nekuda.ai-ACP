import { Request, Response, NextFunction } from 'express';
import { IDEMPOTENCY_KEY_HEADER, REQUEST_ID_HEADER } from '../model/requestMetadata';

export function propagateHeaders(req: Request, res: Response, next: NextFunction): void {
  const idempotencyKey = req.headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()] || crypto.randomUUID();
  const requestId      = req.headers[REQUEST_ID_HEADER.toLocaleLowerCase()] || crypto.randomUUID();

  req.headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()] = idempotencyKey;
  req.headers[REQUEST_ID_HEADER.toLowerCase()]      = requestId;

  res.setHeader(IDEMPOTENCY_KEY_HEADER, idempotencyKey);
  res.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}
