/**
 * Ad-Commerce Orchestrator Server
 * 
 * Connects AdCP (ad buying) with ACP (checkout) for full-funnel tracking
 * 
 * Endpoints:
 * - POST /campaigns - Create ad campaign with commerce products
 * - GET /campaigns/:id/stats - Get campaign performance + ROAS
 * - GET /click/:campaignId/:productId - Track ad click, redirect to checkout
 * - POST /webhooks/acp - Receive order webhooks for attribution
 */

import express from 'express';
import { createHmac } from 'crypto';
import { config } from './config.js';
import { adcpClient } from './services/adcp-client.js';
import { acpClient } from './services/acp-client.js';
import { attributionService } from './services/attribution.js';

const app = express();
app.use(express.json());

// ============================================================================
// CORS
// ============================================================================
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ============================================================================
// HEALTH CHECK
// ============================================================================
app.get('/health', async (req, res) => {
  const acpHealth = await acpClient.health().catch(() => ({ status: 'error' }));
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      orchestrator: 'ok',
      acp: acpHealth.status || 'error',
      adcp: 'check /adcp/status'
    }
  });
});

// ============================================================================
// GET AD PRODUCTS FROM AdCP
// ============================================================================
app.get('/adcp/products', async (req, res) => {
  try {
    const brief = req.query.brief || 'display advertising';
    console.log('\n' + '='.repeat(60));
    console.log('FETCHING AD PRODUCTS FROM AdCP');
    console.log('='.repeat(60));
    
    const products = await adcpClient.getProducts(brief);
    console.log('Products received:', products?.products?.length || 0);
    console.log('='.repeat(60) + '\n');
    
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// CREATE CAMPAIGN - Combines AdCP media buy with ACP products
// ============================================================================
app.post('/campaigns', async (req, res) => {
  try {
    const {
      name,
      products,           // ACP product SKUs to promote
      adcpProductIds,     // AdCP ad product IDs (optional, defaults to display_standard)
      budget,             // Total budget in cents
      startDate,
      endDate,
      targeting = {}
    } = req.body;

    console.log('\n' + '='.repeat(60));
    console.log('CREATING AD CAMPAIGN');
    console.log('='.repeat(60));
    
    // 1. Generate campaign ID
    const campaignId = `camp_${Date.now()}`;
    
    // 2. Create media buy in AdCP
    console.log('[AdCP] Creating media buy...');
    const mediaBuy = await adcpClient.createMediaBuy({
      productIds: adcpProductIds || ['test'],  // Use 'test' product from AdCP
      totalBudget: budget / 100,  // cents to dollars
      flightStartDate: startDate,
      flightEndDate: endDate,
      targeting,
      brandName: name
    });
    // AdCP returns status: "submitted" when awaiting approval, or media_buy_id when auto-approved
    const mediaBuyStatus = mediaBuy.status || 'submitted';
    const mediaBuyId = mediaBuy.media_buy_id || `pending_${Date.now()}`;
    console.log('[AdCP] Media buy status:', mediaBuyStatus, mediaBuyId);
    
    // 3. Create tracking URLs for each ACP product
    const trackingUrls = products.map(sku => ({
      sku,
      clickUrl: `${config.orchestrator.baseUrl}/click/${campaignId}/${sku}`,
      checkoutUrl: `${config.acp.baseUrl}/checkout?campaign=${campaignId}&product=${sku}`
    }));

    // 4. Initialize attribution tracking with AdCP media buy ID
    attributionService.setCampaignSpend(campaignId, budget);

    const campaign = {
      id: campaignId,
      name,
      products,
      budget,
      budgetFormatted: `$${(budget / 100).toFixed(2)}`,
      startDate,
      endDate,
      targeting,
      trackingUrls,
      adcp: {
        media_buy_id: mediaBuyId,
        status: mediaBuyStatus,
        estimated_impressions: mediaBuy.estimated_impressions || Math.round(budget * 2)  // Estimate ~$5 CPM
      },
      createdAt: new Date().toISOString()
    };

    console.log('Campaign created:', campaignId);
    console.log('AdCP Media Buy:', mediaBuyId, '- Status:', mediaBuyStatus);
    console.log('='.repeat(60) + '\n');

    res.status(201).json(campaign);

  } catch (error) {
    console.error('Campaign creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// GET AdCP DELIVERY REPORT
// ============================================================================
app.get('/campaigns/:campaignId/delivery', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { mediaBuyId } = req.query;
    
    if (!mediaBuyId) {
      return res.status(400).json({ error: 'mediaBuyId query param required' });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('FETCHING AdCP DELIVERY REPORT');
    console.log('='.repeat(60));
    
    const delivery = await adcpClient.getDeliveryReport(mediaBuyId);
    
    // Update attribution with actual spend from AdCP
    if (delivery?.metrics?.spend) {
      attributionService.setCampaignSpend(campaignId, delivery.metrics.spend * 100);
    }
    
    console.log('Delivery:', delivery);
    console.log('='.repeat(60) + '\n');
    
    res.json(delivery);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// AD CLICK TRACKING - Records click and redirects to checkout
// ============================================================================
app.get('/click/:campaignId/:productId', async (req, res) => {
  const { campaignId, productId } = req.params;
  const userId = req.query.uid || 'anonymous';

  console.log('\n' + '='.repeat(60));
  console.log('AD CLICK TRACKED');
  console.log('='.repeat(60));

  // 1. Record the click
  const click = attributionService.recordClick({
    campaignId,
    productId,
    creativeId: req.query.creative || 'default',
    userId
  });

  // 2. Create checkout session with attribution
  try {
    const session = await acpClient.createCheckoutSession({
      items: [{ id: productId, quantity: 1 }],
      campaignId,
      clickId: click.clickId
    });

    console.log('Click ID:', click.clickId);
    console.log('Checkout Session:', session.id);
    console.log('='.repeat(60) + '\n');

    // 3. Return checkout URL (or redirect)
    const checkoutUrl = `${config.acp.baseUrl}/checkout_sessions/${session.id}`;
    
    // For API testing, return JSON
    if (req.query.format === 'json') {
      return res.json({
        click,
        session,
        checkoutUrl
      });
    }

    // For browser, redirect
    res.redirect(checkoutUrl);

  } catch (error) {
    console.error('Click tracking error:', error);
    res.status(500).json({ error: error.message, click });
  }
});

// ============================================================================
// ACP WEBHOOK RECEIVER - Attribution on purchase
// ============================================================================
app.post('/webhooks/acp', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const eventType = req.headers['x-event-type'];
  
  console.log('\n' + '='.repeat(60));
  console.log('ACP WEBHOOK RECEIVED');
  console.log('='.repeat(60));
  console.log('Event:', eventType);

  // Verify signature
  const payload = JSON.stringify(req.body);
  const hmac = createHmac('sha256', config.acp.webhookSecret);
  hmac.update(payload);
  const expectedSig = hmac.digest('hex');

  if (signature !== expectedSig) {
    console.log('Invalid signature!');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Handle order completion
  if (eventType === 'checkout.session.completed' || eventType === 'order.created') {
    const { checkout_session_id, session, order } = req.body.data;
    
    // Extract attribution data (if stored in session)
    const metadata = session?.metadata?.attribution || {};
    const clickId = metadata.click_id;
    const orderAmount = session?.totals?.find(t => t.type === 'total')?.amount || 0;
    
    if (clickId) {
      const conversion = attributionService.recordConversion({
        clickId,
        orderId: order?.id || checkout_session_id,
        orderAmount
      });
      
      if (conversion) {
        console.log('CONVERSION ATTRIBUTED!');
        console.log('Campaign:', conversion.campaignId);
        console.log('Revenue:', `$${(orderAmount / 100).toFixed(2)}`);
      }
    } else {
      console.log('No click ID found - organic conversion');
    }
  }

  console.log('='.repeat(60) + '\n');
  res.json({ received: true });
});

// ============================================================================
// CAMPAIGN STATS - Get performance + ROAS
// ============================================================================
app.get('/campaigns/:campaignId/stats', (req, res) => {
  const { campaignId } = req.params;
  const stats = attributionService.calculateROAS(campaignId);
  
  if (!stats) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  res.json(stats);
});

// ============================================================================
// ALL CAMPAIGNS STATS
// ============================================================================
app.get('/stats', (req, res) => {
  const stats = attributionService.getAllCampaignStats();
  res.json({
    campaigns: stats,
    summary: {
      totalCampaigns: stats.length,
      totalRevenue: stats.reduce((sum, s) => sum + (s?.revenue || 0), 0),
      totalSpend: stats.reduce((sum, s) => sum + (s?.spend || 0), 0)
    }
  });
});

// ============================================================================
// SIMULATE AD CLICK + PURCHASE (for testing)
// ============================================================================
app.post('/simulate', async (req, res) => {
  try {
    const { campaignId, productId, completeCheckout = true, adSpend = 10000 } = req.body;

    console.log('\n' + '='.repeat(60));
    console.log('SIMULATING FULL FUNNEL');
    console.log('='.repeat(60));

    const cid = campaignId || `camp_${Date.now()}`;
    const pid = productId || 'SKU-TSHIRT-BLK-M';

    // Initialize campaign with ad spend if not exists
    attributionService.setCampaignSpend(cid, adSpend);

    // 1. Simulate ad click
    const click = attributionService.recordClick({
      campaignId: cid,
      productId: pid,
      creativeId: 'banner_300x250',
      userId: `user_${Math.random().toString(36).slice(2)}`
    });

    // 2. Create checkout session
    const session = await acpClient.createCheckoutSession({
      items: [{ id: pid, quantity: 1 }],
      campaignId: cid,
      clickId: click.clickId
    });

    // Get order amount from session creation response
    const orderAmount = session.totals?.find(t => t.type === 'total')?.amount || 0;
    console.log(`Order amount: $${(orderAmount / 100).toFixed(2)}`);

    let order = null;
    let conversion = null;

    // 3. Complete checkout if requested
    if (completeCheckout && session.id) {
      order = await acpClient.completeCheckout(
        session.id,
        { type: 'card', card: { token: 'tok_visa' } },
        { name: 'Test User', email: 'test@example.com' }
      );

      // 4. Record conversion with amount from session
      conversion = attributionService.recordConversion({
        clickId: click.clickId,
        orderId: order.order?.id || session.id,
        orderAmount
      });
    }

    // 5. Get updated stats
    const stats = attributionService.calculateROAS(cid);

    console.log('Simulation complete!');
    console.log('='.repeat(60) + '\n');

    res.json({
      click,
      session: { id: session.id, status: session.status, total: orderAmount },
      order: order?.order,
      conversion,
      stats
    });

  } catch (error) {
    console.error('Simulation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// START SERVER
// ============================================================================
const PORT = config.orchestrator.port;
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('AD-COMMERCE ORCHESTRATOR');
  console.log('='.repeat(60));
  console.log(`Server:      http://localhost:${PORT}`);
  console.log(`AdCP:        ${config.adcp.baseUrl}`);
  console.log(`ACP:         ${config.acp.baseUrl}`);
  console.log('='.repeat(60));
  console.log('\nEndpoints:');
  console.log('  POST /campaigns              - Create ad campaign');
  console.log('  GET  /click/:campaign/:sku   - Track click → checkout');
  console.log('  POST /webhooks/acp           - Receive order webhooks');
  console.log('  GET  /campaigns/:id/stats    - Campaign ROAS');
  console.log('  GET  /stats                  - All campaign stats');
  console.log('  POST /simulate               - Test full funnel');
  console.log('='.repeat(60) + '\n');
});
