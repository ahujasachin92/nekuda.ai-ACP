# Ad Commerce Nexus

A Unified AI Agent for Full-Funnel Commerce Attribution - connecting advertising spend to actual purchases with real-time ROAS tracking.

## Overview

This project demonstrates an end-to-end ad commerce solution that integrates:
- **AdCP (Ad Commerce Protocol)** - For media buying and ad placement
- **ACP (Agent Commerce Protocol)** - For checkout and payment processing
- **AI-Powered Agent** - Natural language campaign planning with multi-LLM support

## Architecture

![Architecture](docs/architecture.html)

The system consists of three main components:

### 1. Unified Agent (Port 3001)
- **AI Reasoning Layer**: Understands marketing goals in natural language, creates campaign strategies
- **Orchestration Layer**: Manages campaigns, tracks clicks, receives webhooks, provides stats
- **Attribution Service**: Records clicks, tracks conversions, calculates ROAS/CPA/profit

### 2. AdCP Sales Agent (Port 8000)
- Media buy management
- Creative management with approval workflow
- PostgreSQL database for persistence
- Admin UI for campaign management

### 3. ACP Gateway (Port 3000)
- Product catalog with SKUs and pricing
- Checkout session management
- Payment processing
- Webhook notifications (checkout.completed, order.created)

## End-to-End Flow

```
1. PLAN   → Agent analyzes products & budget
2. BUY    → AdCP creates media buy
3. SERVE  → Ads display creative
4. CLICK  → Agent records click
5. BUY    → ACP checkout session
6. PAY    → User completes purchase
7. HOOK   → ACP notifies agent
8. ATTR   → Record conversion
9. ROAS   → Calculate revenue/spend
10.REPORT → Campaign results
```

## Demo Results

| Campaign     | Budget | Clicks | Converts | Revenue | ROAS    |
|--------------|--------|--------|----------|---------|---------|
| Quick Win    | $50    | 91     | 40       | $1,144  | 22.88x  |
| Value Bundle | $30    | 56     | 25       | $472    | 15.75x  |
| Premium Push | $20    | 36     | 15       | $257    | 12.88x  |
| **TOTAL**    | $100   | 183    | 80       | $1,874  | **18.74x** |

## Project Structure

```
├── ACP-Checkout-Gateway/    # ACP implementation
│   ├── src/                 # Source code
│   └── infra/               # Infrastructure (CDK)
├── ad-commerce-prototype/   # Unified agent + AdCP integration
│   └── src/
│       ├── server.js        # Main server
│       └── demo.js          # Demo runner
└── docs/
    └── architecture.html    # Solution architecture diagram
```

## Getting Started

### Prerequisites
- Node.js 20+
- Docker (for local development)
- PostgreSQL (for AdCP)

### Running Locally

1. Start the ACP Gateway:
```bash
cd ACP-Checkout-Gateway
npm install
npm run dev:local
```

2. Start the Unified Agent:
```bash
cd ad-commerce-prototype
npm install
npm start
```

3. Run the demo:
```bash
cd ad-commerce-prototype
npm run demo
```

## Multi-LLM Support

The agent supports multiple LLM providers:
- Claude (Anthropic)
- GPT (OpenAI)
- Gemini (Google)
- Ollama (Local)

## Protocols

- **A2A (Agent-to-Agent)**: JSON-RPC 2.0 for inter-agent communication
- **ACP**: Agent Commerce Protocol for checkout sessions
- **AdCP**: Ad Commerce Protocol for media buying

## Presentation

View the full presentation: [Ad Commerce Nexus on Gamma](https://ad-commerce-nexus-xvg88qm.gamma.site/)

## Author

**Sachin Ahuja**

## License

ISC
