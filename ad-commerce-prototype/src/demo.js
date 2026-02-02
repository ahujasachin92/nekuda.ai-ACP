/**
 * Demo Script - Full Funnel Simulation
 * 
 * Demonstrates:
 * 1. Create ad campaign promoting products
 * 2. Simulate ad clicks
 * 3. Complete purchases
 * 4. Calculate ROAS
 */

import { config } from './config.js';

const ORCHESTRATOR_URL = `http://localhost:${config.orchestrator.port}`;
const ACP_URL = config.acp.baseUrl;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDemo() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║          AD-COMMERCE FULL FUNNEL DEMO                        ║');
  console.log('║  AdCP (Ad Buying) → Orchestrator → ACP (Checkout)           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\n');

  // ========================================================================
  // STEP 1: Create Ad Campaign
  // ========================================================================
  console.log('━'.repeat(60));
  console.log('STEP 1: CREATE AD CAMPAIGN');
  console.log('━'.repeat(60));
  console.log('Advertiser wants to promote products with $500 ad budget\n');

  const campaignResponse = await fetch(`${ORCHESTRATOR_URL}/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Summer Sale Campaign',
      products: ['SKU-TSHIRT-BLK-M', 'SKU-HOODIE-GRY-M', 'SKU-CAP-RED'],
      budget: 50000,  // $500 in cents
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      targeting: {
        geo: ['US'],
        interests: ['fashion', 'streetwear']
      }
    })
  });

  const campaign = await campaignResponse.json();
  console.log('✓ Campaign Created:', campaign.id);
  console.log('  Budget:', campaign.budgetFormatted);
  console.log('  Products:', campaign.products.join(', '));
  console.log('\n  Tracking URLs generated:');
  campaign.trackingUrls.forEach(url => {
    console.log(`    ${url.sku}: ${url.clickUrl}`);
  });

  await sleep(1000);

  // ========================================================================
  // STEP 2: Simulate Multiple Ad Clicks
  // ========================================================================
  console.log('\n' + '━'.repeat(60));
  console.log('STEP 2: SIMULATE AD IMPRESSIONS & CLICKS');
  console.log('━'.repeat(60));
  console.log('Users see ads and some click through...\n');

  const clicks = [];
  const products = ['SKU-TSHIRT-BLK-M', 'SKU-HOODIE-GRY-M', 'SKU-CAP-RED'];
  
  // Simulate 5 clicks
  for (let i = 0; i < 5; i++) {
    const product = products[i % products.length];
    const clickUrl = `${ORCHESTRATOR_URL}/click/${campaign.id}/${product}?format=json&uid=user_${i}`;
    
    const clickResponse = await fetch(clickUrl);
    const clickData = await clickResponse.json();
    clicks.push(clickData);
    
    console.log(`✓ Click ${i + 1}: User clicked ad for ${product}`);
    console.log(`  Click ID: ${clickData.click.clickId}`);
    console.log(`  Session: ${clickData.session.id}`);
    
    await sleep(500);
  }

  // ========================================================================
  // STEP 3: Some Users Complete Purchase
  // ========================================================================
  console.log('\n' + '━'.repeat(60));
  console.log('STEP 3: USERS COMPLETE PURCHASES');
  console.log('━'.repeat(60));
  console.log('Some users who clicked complete their purchase...\n');

  // Complete 3 out of 5 purchases (60% conversion rate)
  for (let i = 0; i < 3; i++) {
    const click = clicks[i];
    
    // Complete checkout
    const completeResponse = await fetch(
      `${ACP_URL}/checkout_sessions/${click.session.id}/complete`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `complete-${Date.now()}-${i}`
        },
        body: JSON.stringify({
          payment_data: {
            type: 'card',
            card: { token: 'tok_visa', last4: '4242' }
          },
          buyer: {
            name: `Customer ${i + 1}`,
            email: `customer${i + 1}@example.com`
          }
        })
      }
    );

    const order = await completeResponse.json();
    console.log(`✓ Purchase ${i + 1}: Order completed!`);
    console.log(`  Order ID: ${order.order?.id || 'N/A'}`);
    console.log(`  Total: $${(order.totals?.find(t => t.type === 'total')?.amount / 100 || 0).toFixed(2)}`);
    
    await sleep(500);
  }

  // ========================================================================
  // STEP 4: Calculate ROAS
  // ========================================================================
  console.log('\n' + '━'.repeat(60));
  console.log('STEP 4: CAMPAIGN PERFORMANCE & ROAS');
  console.log('━'.repeat(60));

  // Simulate some stats for demo
  const statsResponse = await fetch(`${ORCHESTRATOR_URL}/campaigns/${campaign.id}/stats`);
  
  if (statsResponse.ok) {
    const stats = await statsResponse.json();
    console.log('\n📊 CAMPAIGN PERFORMANCE REPORT');
    console.log('┌─────────────────────────────────────┐');
    console.log(`│ Campaign: ${campaign.id.slice(0, 20)}...│`);
    console.log('├─────────────────────────────────────┤');
    console.log(`│ Clicks:        ${String(stats.clicks || 0).padStart(18)} │`);
    console.log(`│ Conversions:   ${String(stats.conversions || 0).padStart(18)} │`);
    console.log(`│ Conv. Rate:    ${String(stats.conversionRate || '0%').padStart(18)} │`);
    console.log('├─────────────────────────────────────┤');
    console.log(`│ Ad Spend:      ${String(stats.spendFormatted || '$0').padStart(18)} │`);
    console.log(`│ Revenue:       ${String(stats.revenueFormatted || '$0').padStart(18)} │`);
    console.log(`│ Profit:        ${String(stats.profit || '$0').padStart(18)} │`);
    console.log('├─────────────────────────────────────┤');
    console.log(`│ ROAS:          ${String(stats.roas || '0x').padStart(18)} │`);
    console.log('└─────────────────────────────────────┘');
  }

  // ========================================================================
  // SUMMARY
  // ========================================================================
  console.log('\n' + '━'.repeat(60));
  console.log('DEMO COMPLETE!');
  console.log('━'.repeat(60));
  console.log('\nWhat happened:');
  console.log('1. ✓ Created ad campaign with $500 budget');
  console.log('2. ✓ Generated tracking URLs for 3 products');
  console.log('3. ✓ Simulated 5 ad clicks');
  console.log('4. ✓ 3 users completed purchases');
  console.log('5. ✓ Calculated ROAS and attribution');
  console.log('\nThe orchestrator connected:');
  console.log('  • AdCP (port 8000) - Ad inventory & media buying');
  console.log('  • ACP (port 3000)  - E-commerce checkout');
  console.log('  • Attribution      - Click → Purchase tracking');
  console.log('\n');
}

// Check services before running
async function checkServices() {
  console.log('Checking services...\n');
  
  // Check ACP
  try {
    const acpHealth = await fetch(`${ACP_URL}/health`);
    if (acpHealth.ok) {
      console.log('✓ ACP Checkout Gateway (port 3000): OK');
    }
  } catch (e) {
    console.log('✗ ACP Checkout Gateway (port 3000): NOT RUNNING');
    console.log('  Run: cd ACP-Checkout-Gateway && npm run dev:local');
    process.exit(1);
  }

  // Check Orchestrator
  try {
    const orchHealth = await fetch(`${ORCHESTRATOR_URL}/health`);
    if (orchHealth.ok) {
      console.log('✓ Orchestrator (port 3001): OK');
    }
  } catch (e) {
    console.log('✗ Orchestrator (port 3001): NOT RUNNING');
    console.log('  Run: npm start');
    process.exit(1);
  }

  console.log('');
}

// Run
checkServices()
  .then(() => runDemo())
  .catch(err => {
    console.error('Demo failed:', err.message);
    process.exit(1);
  });
