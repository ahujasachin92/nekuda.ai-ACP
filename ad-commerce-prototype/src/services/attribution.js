/**
 * Attribution Service
 * 
 * Tracks the full funnel from ad impression → click → purchase
 * Calculates ROAS (Return on Ad Spend)
 */

import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';

// In-memory storage (use Redis/DB in production)
const clicks = new Map();           // clickId → click data
const conversions = new Map();      // orderId → conversion data  
const campaignStats = new Map();    // campaignId → aggregated stats

export class AttributionService {
  
  /**
   * Record an ad click (when user clicks ad creative)
   */
  recordClick({ campaignId, productId, creativeId, userId }) {
    const clickId = uuidv4();
    const clickData = {
      clickId,
      campaignId,
      productId,
      creativeId,
      userId,
      timestamp: new Date().toISOString(),
      expiresAt: Date.now() + config.tracking.attributionWindowMs,
      converted: false
    };
    
    clicks.set(clickId, clickData);
    
    // Update campaign stats
    this.updateCampaignStats(campaignId, 'clicks', 1);
    
    console.log(`[Attribution] Click recorded: ${clickId} for campaign ${campaignId}`);
    return clickData;
  }

  /**
   * Record a conversion (when purchase is completed)
   */
  recordConversion({ clickId, orderId, orderAmount, currency = 'usd' }) {
    const click = clicks.get(clickId);
    
    if (!click) {
      console.log(`[Attribution] Click not found: ${clickId}`);
      return null;
    }
    
    if (click.expiresAt < Date.now()) {
      console.log(`[Attribution] Click expired: ${clickId}`);
      return null;
    }
    
    const conversionData = {
      conversionId: uuidv4(),
      clickId,
      orderId,
      orderAmount,
      currency,
      campaignId: click.campaignId,
      productId: click.productId,
      userId: click.userId,
      clickTimestamp: click.timestamp,
      conversionTimestamp: new Date().toISOString(),
      // Time from click to conversion
      conversionTimeMs: Date.now() - new Date(click.timestamp).getTime()
    };
    
    conversions.set(orderId, conversionData);
    click.converted = true;
    
    // Update campaign stats
    this.updateCampaignStats(click.campaignId, 'conversions', 1);
    this.updateCampaignStats(click.campaignId, 'revenue', orderAmount);
    
    console.log(`[Attribution] Conversion recorded: ${orderId} = $${orderAmount / 100} for campaign ${click.campaignId}`);
    return conversionData;
  }

  /**
   * Update campaign statistics
   */
  updateCampaignStats(campaignId, metric, value) {
    if (!campaignStats.has(campaignId)) {
      campaignStats.set(campaignId, {
        campaignId,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,   // in cents
        spend: 0,     // in cents (from AdCP)
        createdAt: new Date().toISOString()
      });
    }
    
    const stats = campaignStats.get(campaignId);
    stats[metric] += value;
    stats.updatedAt = new Date().toISOString();
  }

  /**
   * Set campaign spend (from AdCP delivery reports)
   */
  setCampaignSpend(campaignId, spend) {
    this.updateCampaignStats(campaignId, 'spend', 0); // Ensure exists
    const stats = campaignStats.get(campaignId);
    stats.spend = spend;
  }

  /**
   * Calculate ROAS for a campaign
   */
  calculateROAS(campaignId) {
    const stats = campaignStats.get(campaignId);
    if (!stats || stats.spend === 0) {
      return null;
    }
    
    return {
      ...stats,
      ctr: stats.impressions > 0 ? (stats.clicks / stats.impressions * 100).toFixed(2) + '%' : '0%',
      conversionRate: stats.clicks > 0 ? (stats.conversions / stats.clicks * 100).toFixed(2) + '%' : '0%',
      revenueFormatted: '$' + (stats.revenue / 100).toFixed(2),
      spendFormatted: '$' + (stats.spend / 100).toFixed(2),
      roas: (stats.revenue / stats.spend).toFixed(2) + 'x',
      profit: '$' + ((stats.revenue - stats.spend) / 100).toFixed(2)
    };
  }

  /**
   * Get all campaign stats
   */
  getAllCampaignStats() {
    const results = [];
    for (const [campaignId] of campaignStats) {
      results.push(this.calculateROAS(campaignId));
    }
    return results;
  }

  /**
   * Get click by ID
   */
  getClick(clickId) {
    return clicks.get(clickId);
  }

  /**
   * Get conversion by order ID
   */
  getConversion(orderId) {
    return conversions.get(orderId);
  }

  /**
   * Get all conversions for a campaign
   */
  getCampaignConversions(campaignId) {
    const results = [];
    for (const [, conversion] of conversions) {
      if (conversion.campaignId === campaignId) {
        results.push(conversion);
      }
    }
    return results;
  }
}

export const attributionService = new AttributionService();
