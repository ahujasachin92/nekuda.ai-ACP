/**
 * ACP Client - Interface with Agentic Commerce Protocol Checkout Gateway
 * 
 * Capabilities:
 * - Get product catalog
 * - Create checkout sessions
 * - Track order completions
 */

import { config } from '../config.js';

export class ACPClient {
  constructor() {
    this.baseUrl = config.acp.baseUrl;
  }

  async request(method, path, body = null) {
    const url = `${this.baseUrl}${path}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `acp-${Date.now()}-${Math.random().toString(36).slice(2)}`
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      return await response.json();
    } catch (error) {
      console.error(`[ACP] Error ${method} ${path}:`, error.message);
      throw error;
    }
  }

  /**
   * Check if ACP is healthy
   */
  async health() {
    return this.request('GET', '/health');
  }

  /**
   * Create a checkout session with tracking
   * @param {Object} params
   * @param {Array} params.items - Products to add
   * @param {string} params.campaignId - AdCP campaign ID for attribution
   * @param {string} params.clickId - Unique click identifier
   */
  async createCheckoutSession({ items, campaignId, clickId }) {
    console.log(`[ACP] Creating checkout session: ${items.length} items, campaign: ${campaignId}`);
    
    const session = await this.request('POST', '/checkout_sessions', {
      items,
      // Store attribution data in session metadata (extend ACP if needed)
      metadata: {
        attribution: {
          campaign_id: campaignId,
          click_id: clickId,
          source: config.tracking.utmSource,
          medium: config.tracking.utmMedium
        }
      }
    });

    return session;
  }

  /**
   * Get checkout session details
   */
  async getCheckoutSession(sessionId) {
    return this.request('GET', `/checkout_sessions/${sessionId}`);
  }

  /**
   * Complete a checkout with payment
   */
  async completeCheckout(sessionId, paymentData, buyer) {
    console.log(`[ACP] Completing checkout: ${sessionId}`);
    return this.request('POST', `/checkout_sessions/${sessionId}/complete`, {
      payment_data: paymentData,
      buyer
    });
  }

  /**
   * Get received webhooks (for testing)
   */
  async getWebhooks() {
    return this.request('GET', '/webhooks/test');
  }
}

export const acpClient = new ACPClient();
