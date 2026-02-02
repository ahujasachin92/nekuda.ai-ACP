import { Request } from 'express';

export const AUTHORIZATION_HEADER    = 'Authorization';
export const ACCEPT_LANGUAGE_HEADER  = 'Accept-Language';
export const USER_AGENT_HEADER       = 'User-Agent';
export const IDEMPOTENCY_KEY_HEADER  = 'Idempotency-Key';
export const REQUEST_ID_HEADER       = 'Request-Id';
export const CONTENT_TYPE_HEADER     = 'Content-Type';
export const SIGNATURE_HEADER        = 'Signature';
export const TIMESTAMP_HEADER        = 'Timestamp';
export const API_VERSION_HEADER      = 'API-Version';

export class RequestMetadata {
    constructor(
      public readonly idempotencyKey: string,
      public readonly signature: string,
      public readonly requestId: string,
      public readonly apiVersion: string,
      public readonly timestamp: string,
      public readonly userAgent: string,
      public readonly acceptLanguage: string
    ) { }

    public static from(req: Request): RequestMetadata {
      return new RequestMetadata(
        req.headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()] as string || '',
        req.headers[SIGNATURE_HEADER.toLowerCase()] as string || '',
        req.headers[REQUEST_ID_HEADER.toLowerCase()] as string || '',
        req.headers[API_VERSION_HEADER.toLowerCase()] as string || '',
        req.headers[TIMESTAMP_HEADER.toLowerCase()] as string || '',
        req.headers[USER_AGENT_HEADER.toLowerCase()] as string || '',
        req.headers[ACCEPT_LANGUAGE_HEADER.toLowerCase()] as string || ''
      );
    }
  }