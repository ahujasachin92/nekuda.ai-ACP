/**
 * Local Webhook Service
 * 
 * Sends HMAC-signed webhooks to configured agent endpoints without AWS SNS/SQS.
 * 
 * Usage:
 * 1. Set AGENT_WEBHOOK_URL and AGENT_WEBHOOK_SECRET in .env.local
 * 2. Import and use webhookService.send() after checkout events
 */

import { createHmac } from 'crypto';
import { components } from '../api';

type CheckoutSession = components['schemas']['CheckoutSession'];
type CheckoutSessionWithOrder = components['schemas']['CheckoutSessionWithOrder'];

export type WebhookEventType = 
  | 'checkout.session.created'
  | 'checkout.session.updated' 
  | 'checkout.session.completed'
  | 'checkout.session.cancelled'
  | 'order.created'
  | 'order.updated';

export interface WebhookPayload {
  type: WebhookEventType;
  timestamp: string;
  data: {
    checkout_session_id: string;
    status: string;
    session?: CheckoutSession | CheckoutSessionWithOrder;
    order?: {
      id: string;
      permalink_url: string;
      status: string;
    };
  };
}

export interface WebhookConfig {
  url: string;
  secretKey: string;
  merchantName: string;
  enabled: boolean;
}

export class WebhookService {
  private config: WebhookConfig;
  private retryAttempts: number = 3;
  private retryDelayMs: number = 1000;

  constructor(config?: Partial<WebhookConfig>) {
    this.config = {
      url: config?.url || process.env.AGENT_WEBHOOK_URL || '',
      secretKey: config?.secretKey || process.env.AGENT_WEBHOOK_SECRET || 'local-dev-secret',
      merchantName: config?.merchantName || process.env.STORE_NAME || 'LocalMerchant',
      enabled: config?.enabled ?? (!!process.env.AGENT_WEBHOOK_URL)
    };

    if (this.config.enabled) {
      console.log(`Webhook service enabled: ${this.config.url}`);
    } else {
      console.log('Webhook service disabled (no AGENT_WEBHOOK_URL configured)');
    }
  }

  /**
   * Sign payload with HMAC-SHA256
   */
  private sign(payload: string): string {
    const hmac = createHmac('sha256', this.config.secretKey);
    hmac.update(payload);
    return hmac.digest('hex');
  }

  /**
   * Send webhook for checkout session event
   */
  async sendSessionEvent(
    eventType: WebhookEventType,
    session: CheckoutSession | CheckoutSessionWithOrder
  ): Promise<boolean> {
    const payload: WebhookPayload = {
      type: eventType,
      timestamp: new Date().toISOString(),
      data: {
        checkout_session_id: session.id,
        status: session.status,
        session
      }
    };

    return this.send(payload);
  }

  /**
   * Send webhook for order event
   */
  async sendOrderEvent(
    eventType: 'order.created' | 'order.updated',
    checkoutSessionId: string,
    order: { id: string; permalink_url: string; status: string }
  ): Promise<boolean> {
    const payload: WebhookPayload = {
      type: eventType,
      timestamp: new Date().toISOString(),
      data: {
        checkout_session_id: checkoutSessionId,
        status: order.status,
        order
      }
    };

    return this.send(payload);
  }

  /**
   * Send webhook with retry logic
   */
  async send(payload: WebhookPayload): Promise<boolean> {
    if (!this.config.enabled || !this.config.url) {
      console.log(`[Webhook] Skipped (disabled): ${payload.type}`);
      return false;
    }

    const payloadJson = JSON.stringify(payload);
    const signature = this.sign(payloadJson);
    const requestId = crypto.randomUUID();

    console.log(`[Webhook] Sending ${payload.type} to ${this.config.url}`);

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await fetch(this.config.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Merchant-Signature': `${this.config.merchantName}-${signature}`,
            'X-Request-Id': requestId,
            'X-Timestamp': payload.timestamp,
            'X-Event-Type': payload.type
          },
          body: payloadJson
        });

        if (response.ok) {
          console.log(`[Webhook] ✓ Delivered: ${payload.type} (attempt ${attempt})`);
          return true;
        }

        const errorText = await response.text();
        console.error(`[Webhook] Failed (${response.status}): ${errorText}`);

        if (response.status >= 400 && response.status < 500) {
          // Client error - don't retry
          break;
        }

      } catch (error) {
        console.error(`[Webhook] Error (attempt ${attempt}):`, error);
      }

      if (attempt < this.retryAttempts) {
        await this.delay(this.retryDelayMs * attempt);
      }
    }

    console.error(`[Webhook] ✗ Failed after ${this.retryAttempts} attempts: ${payload.type}`);
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Verify incoming webhook signature (for testing)
   */
  verifySignature(payload: string, signature: string): boolean {
    const expected = this.sign(payload);
    return signature === expected;
  }
}

// Singleton instance
export const webhookService = new WebhookService();

// ============================================================================
// TEST WEBHOOK RECEIVER
// ============================================================================

/**
 * Simple Express handler to receive and log webhooks (for testing)
 * 
 * Add this route to your test server:
 * app.post('/webhook', webhookReceiver);
 */
export function createWebhookReceiver(secretKey: string) {
  return (req: any, res: any) => {
    const signature = req.headers['x-webhook-signature'];
    const eventType = req.headers['x-event-type'];
    const payload = JSON.stringify(req.body);

    // Verify signature
    const hmac = createHmac('sha256', secretKey);
    hmac.update(payload);
    const expected = hmac.digest('hex');

    if (signature !== expected) {
      console.error('[Webhook Receiver] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    console.log('=== WEBHOOK RECEIVED ===');
    console.log('Event:', eventType);
    console.log('Session:', req.body.data?.checkout_session_id);
    console.log('Status:', req.body.data?.status);
    console.log('========================');

    res.json({ received: true, request_id: req.headers['x-request-id'] });
  };
}
