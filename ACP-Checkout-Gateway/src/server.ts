import express, { Express } from 'express';
import { createHmac } from 'crypto';
import checkoutRoutes from './routes/checkout';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { propagateHeaders } from './middleware/headerPropagation';

// Store received webhooks for inspection
const receivedWebhooks: any[] = [];

export function createApp(): Express {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, API-Version, Idempotency-Key');

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(propagateHeaders);

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ============================================================================
  // TEST WEBHOOK RECEIVER - For local development/testing
  // ============================================================================
  
  app.post('/webhooks/test', (req, res) => {
    const signature = req.headers['x-webhook-signature'] as string;
    const eventType = req.headers['x-event-type'] as string;
    const requestId = req.headers['x-request-id'] as string;
    const timestamp = req.headers['x-timestamp'] as string;
    
    // Verify signature
    const secretKey = process.env.AGENT_WEBHOOK_SECRET || 'local-dev-secret-key';
    const payload = JSON.stringify(req.body);
    const hmac = createHmac('sha256', secretKey);
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');
    
    const isValid = signature === expectedSignature;
    
    console.log('\n' + '='.repeat(60));
    console.log('WEBHOOK RECEIVED');
    console.log('='.repeat(60));
    console.log('Event Type:', eventType);
    console.log('Request ID:', requestId);
    console.log('Timestamp:', timestamp);
    console.log('Signature Valid:', isValid ? '✓ YES' : '✗ NO');
    console.log('Session ID:', req.body.data?.checkout_session_id);
    console.log('Status:', req.body.data?.status);
    if (req.body.data?.order) {
      console.log('Order ID:', req.body.data.order.id);
      console.log('Order URL:', req.body.data.order.permalink_url);
    }
    console.log('='.repeat(60) + '\n');
    
    // Store for inspection
    receivedWebhooks.push({
      received_at: new Date().toISOString(),
      event_type: eventType,
      request_id: requestId,
      signature_valid: isValid,
      payload: req.body
    });
    
    // Keep only last 100 webhooks
    if (receivedWebhooks.length > 100) {
      receivedWebhooks.shift();
    }
    
    if (!isValid) {
      return res.status(401).json({ 
        error: 'Invalid signature',
        received: false 
      });
    }
    
    res.json({ 
      received: true, 
      request_id: requestId 
    });
  });
  
  // View received webhooks
  app.get('/webhooks/test', (req, res) => {
    res.json({
      count: receivedWebhooks.length,
      webhooks: receivedWebhooks.slice(-10).reverse() // Last 10, newest first
    });
  });

  app.use('/', checkoutRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
