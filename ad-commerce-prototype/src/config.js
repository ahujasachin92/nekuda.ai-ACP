/**
 * Configuration for Ad-Commerce Integration
 */

export const config = {
  // AdCP Sales Agent (Ad Buying Platform)
  adcp: {
    baseUrl: 'http://localhost:8000',
    mcpEndpoint: '/mcp/',
    a2aEndpoint: '/a2a',
    authToken: 'tok_cqJVuka2TUN5BI39CcGOuTAN729fry5Dm6dfU7bX6tk'
  },
  
  // ACP Checkout Gateway (E-commerce)
  acp: {
    baseUrl: 'http://localhost:3000',
    webhookSecret: 'local-dev-secret-key'
  },
  
  // This orchestrator service
  orchestrator: {
    port: 3001,
    baseUrl: 'http://localhost:3001'
  },
  
  // Campaign tracking
  tracking: {
    // UTM parameters for attribution
    utmSource: 'adcp',
    utmMedium: 'display',
    // Cookie/click ID expiry (7 days)
    attributionWindowMs: 7 * 24 * 60 * 60 * 1000
  }
};
