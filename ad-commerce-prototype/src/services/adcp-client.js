/**
 * AdCP Client - Interface with Ad Context Protocol Sales Agent
 * 
 * Uses A2A (Agent-to-Agent) JSON-RPC 2.0 protocol for programmatic access.
 */

import { config } from '../config.js';

export class AdCPClient {
  constructor() {
    this.baseUrl = config.adcp.baseUrl;
    this.authToken = config.adcp.authToken;
    this.a2aEndpoint = `${this.baseUrl}/a2a`;
  }

  async callA2A(skill, parameters = {}) {
    const requestId = Date.now();
    const payload = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'message/send',
      params: {
        message: {
          message_id: `msg_${requestId}`,
          role: 'user',
          parts: [{ kind: 'data', data: { skill, input: parameters } }]
        }
      }
    };

    console.log(`[AdCP A2A] Calling: ${skill}`);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      // Send auth header for all skills (we have a real token now)
      const headers = { 'Content-Type': 'application/json' };
      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }
      
      const response = await fetch(this.a2aEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) throw new Error(`A2A error ${response.status}`);
      const result = await response.json();
      if (result.error) throw new Error(`A2A: ${result.error.message}`);

      // First check artifacts for data (success or error details)
      if (result.result?.artifacts) {
        for (const artifact of result.result.artifacts) {
          for (const part of artifact.parts || []) {
            const data = part.data || part.root?.data;
            if (data) {
              // Check if this is an error response
              if (data.status === 'failed' || data.errors) {
                console.log(`[AdCP A2A] Error: ${skill} - ${data.errors?.[0]?.message || 'Failed'}`);
                throw new Error(data.errors?.[0]?.message || 'AdCP operation failed');
              }
              console.log(`[AdCP A2A] Success: ${skill}`);
              return data;
            }
          }
        }
      }

      // Handle task responses without artifacts (e.g., initial submission)
      if (result.result?.status?.state) {
        console.log(`[AdCP A2A] Task ${skill}: ${result.result.status.state}`);
        return {
          status: result.result.status.state,
          task_id: result.result.id,
          context_id: result.result.contextId
        };
      }

      return result.result;
    } catch (error) {
      console.log(`[AdCP A2A] ${error.message}, using mock`);
      return this.getMockResponse(skill, parameters);
    }
  }

  async getProducts(brief = '') {
    return this.callA2A('get_products', { brief });
  }

  async createMediaBuy({ productIds, totalBudget, flightStartDate, flightEndDate, targeting = {}, brandName = 'Demo Brand', buyerRef = null }) {
    // AdCP create_media_buy requires specific schema per v2.2.0 spec
    const ref = buyerRef || `buyer_${Date.now()}`;

    // Format dates - use "asap" if start date is today or in the past
    const today = new Date().toISOString().split('T')[0];
    const startTime = (!flightStartDate || flightStartDate <= today) ? 'asap' : `${flightStartDate}T00:00:00Z`;
    const endTime = flightEndDate ? `${flightEndDate}T23:59:59Z` : new Date(Date.now() + 30*24*60*60*1000).toISOString();
    
    return this.callA2A('create_media_buy', {
      brand_manifest: {
        name: brandName,
        url: 'https://example.com'
      },
      buyer_ref: ref,
      packages: productIds.map((productId, idx) => ({
        product_id: productId,
        buyer_ref: `${ref}_pkg_${idx + 1}`,
        pricing_option_id: 'cpm_usd_fixed',  // CPM pricing in USD
        budget: Math.round(totalBudget / productIds.length),
        targeting_overlay: targeting
      })),
      start_time: startTime,
      end_time: endTime
    });
  }

  async getDeliveryReport(mediaBuyId) {
    return this.callA2A('get_media_buy_delivery', { media_buy_id: mediaBuyId });
  }

  getMockResponse(skill, params) {
    const mocks = {
      'get_products': {
        products: [
          { id: 'display_standard', name: 'Standard Display', pricing: { model: 'CPM', rate: 5.00 }, formats: ['300x250', '728x90'] },
          { id: 'video_preroll', name: 'Video Pre-roll', pricing: { model: 'CPCV', rate: 0.02 } }
        ]
      },
      'create_media_buy': {
        media_buy_id: `mb_${Date.now()}`, status: 'pending_approval',
        estimated_impressions: Math.round((params.total_budget || 500) * 200),
        budget: { total: params.total_budget, spent: 0, remaining: params.total_budget }
      },
      'get_media_buy_delivery': {
        media_buy_id: params.media_buy_id, status: 'delivering',
        metrics: { impressions: 50000, clicks: 1250, ctr: '2.5%', spend: 250.00 }
      }
    };
    return mocks[skill] || { error: `No mock for ${skill}` };
  }
}

export const adcpClient = new AdCPClient();
