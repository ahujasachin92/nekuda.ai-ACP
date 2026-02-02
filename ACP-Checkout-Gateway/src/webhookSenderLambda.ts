import { SQSEvent, SQSHandler } from 'aws-lambda';
import { createHmac } from 'crypto';
import { components, operations } from './webhooks';

type WebhookEvent = components['schemas']['WebhookEvent'];
type WebhookResponse = operations['postOrderEvents']['responses']['200']['content']['application/json'];

/**
 * Sign the webhook payload with HMAC-SHA256
 */
function signPayload(payload: string, secretKey: string): string {
  const hmac = createHmac('sha256', secretKey);
  hmac.update(payload);
  return hmac.digest('hex');
}

/**
 * Send a webhook event to the configured endpoint
 */
async function sendWebhook(
  event: WebhookEvent,
  webhookUrl: string,
  secretKey: string,
  merchantName: string
): Promise<WebhookResponse> {
  const payload = JSON.stringify(event);
  const signature = signPayload(payload, secretKey);
  const timestamp = new Date().toISOString();
  const requestId = crypto.randomUUID();

  console.log('Sending webhook', {
    webhookUrl,
    merchantName,
    requestId,
    eventType: event.type,
  });

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Merchant-Signature': `${merchantName}-${signature}`,
        'Request-Id': requestId,
        'Timestamp': timestamp,
      },
      body: payload,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Webhook delivery failed: ${response.status} ${response.statusText}\n${errorBody}`
      );
    }

    const result = await response.json() as WebhookResponse;
    return result;
  } catch (error) {
    console.error('Webhook fetch failed', {
      webhookUrl,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Lambda handler for processing SQS messages and sending webhooks
 *
 * Environment variables required:
 * - WEBHOOK_URL: OpenAI webhook endpoint URL
 * - WEBHOOK_SECRET_KEY: HMAC signing key
 * - MERCHANT_NAME: Merchant name for signature header
 */
export const handler: SQSHandler = async (event: SQSEvent) => {
  const webhookUrl = process.env.WEBHOOK_URL;
  const secretKey = process.env.WEBHOOK_SECRET_KEY;
  const merchantName = process.env.MERCHANT_NAME;

  if (!webhookUrl || !secretKey || !merchantName) {
    throw new Error('Missing required environment variables: WEBHOOK_URL, WEBHOOK_SECRET_KEY, MERCHANT_NAME');
  }

  const results = await Promise.allSettled(
    event.Records.map(async (record) => {
      try {
        const webhookEvent = JSON.parse(record.body) as WebhookEvent;

        console.log('Processing webhook event from SQS', {
          messageId: record.messageId,
          eventType: webhookEvent.type,
          checkoutSessionId: webhookEvent.data.checkout_session_id,
        });

        const response = await sendWebhook(webhookEvent, webhookUrl, secretKey, merchantName);

        console.log('Webhook delivered successfully', {
          messageId: record.messageId,
          received: response.received,
          requestId: response.request_id,
        });

        return { messageId: record.messageId, success: true };
      } catch (error) {
        console.error('Failed to process webhook message', {
          messageId: record.messageId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    })
  );

  // Check for failures
  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    console.error(`${failures.length} out of ${results.length} webhooks failed`);
    throw new Error(`Failed to process ${failures.length} webhook(s)`);
  }

  console.log(`Successfully processed ${results.length} webhook(s)`);
};
