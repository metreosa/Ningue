# 🏆 Ningue — Decentralized World Cup AI Intelligence Hub

> **Injective Global Cup Hackathon Submission** · Built for HackQuest

Ningue is a decentralized World Cup match intelligence platform that combines **real-time football data** with **AI-powered predictive analysis** — leveraging Injective's MCP Agent Skills and x402 micro-payments.

## 🎥 Demo

The app runs at `http://localhost:3000` after starting the server. Navigate through:

1. **Homepage** — Live fixtures and match probability models
2. **Click any odds pill** → AI Match Analysis with probability shift graphs  
3. **"Pay to Unlock" AI Analysis** → x402 micro-payment gate ($0.10 USDC on Injective EVM)  
4. **Deposit modal** → CCTP cross-chain bridge to move USDC from Ethereum/Arbitrum/Base to Injective  
5. **Live Scores** → Real-time match tracking with live badges  
6. **Games** → Score Predictor, Bracket Challenge, Golden Boot picker  

---

## ⚡ Injective Technologies Used

### 1. x402 Payment Protocol
**File:** [`server/server.js`](server/server.js) — Lines 22-40, 115-184

The AI match analysis endpoint (`POST /api/analyse`) is protected by Injective's **x402 payment middleware**. When a user clicks "Unlock AI Analysis," the frontend sends a request that triggers a **402 Payment Required** response. The client then:
- Presents the payment requirement (0.10 USDC on Injective EVM, chain 1776)  
- Signs the payment via Keplr wallet  
- Re-sends the request with the payment header  
- The x402 facilitator verifies on-chain payment before the endpoint returns data

```javascript
app.use(
  injectivePaymentMiddleware({
    'POST /api/analyse': {
      accepts: [{
        network: 'eip155:1776',     // Injective EVM
        asset: '0xa00C59fF...235a', // USDC on Injective
        amount: '100000',            // $0.10
        payTo: process.env.WALLET_ADDRESS,
      }],
    },
  })
);
```

### 2. MCP Server + Agent Skills
**File:** [`server/mcp.js`](server/mcp.js)

A full **Model Context Protocol server** with 5 registered Agent Skills (tools):

| Tool | Purpose |
|------|---------|
| `get_match_info` | Fetch live match data (score, minute, referee, venue) |
| `get_market_odds` | Fetch on-chain prediction market odds from Injective Exchange |
| `get_first_goal_odds` | Fetch "who scores first" market probabilities |
| `get_head_to_head` | Historical H2H stats between two teams |
| `get_squad_info` | Squad formation, key players, recent form |

The MCP server runs as a stdio transport for integration with Claude Desktop / MCP Inspector:
```bash
node server/mcp.js --mcp
```

These same tools are also exposed as HTTP API endpoints and as **OpenAI function-calling tool definitions**, allowing the AI analysis pipeline to autonomously decide which data to fetch before synthesizing a prediction.

### 3. CCTP (Cross-Chain Transfer Protocol)
**File:** [`server/server.js`](server/server.js) — CCTP endpoints

Three endpoints power cross-chain USDC deposits from Ethereum, Arbitrum, Base, and Polygon to Injective:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/cctp/chains` | Returns supported source chains with contract addresses |
| `POST /api/cctp/burn-params` | Generates burn transaction parameters for Circle's TokenMessenger |
| `GET /api/cctp/attestation/:txHash` | Polls Circle's Iris API for attestation after burn |

The frontend deposit modal provides a visual CCTP bridge flow where users:
1. Select source chain (Ethereum, Arbitrum, Base, Polygon)
2. Enter USDC amount  
3. Sign the burn transaction on the source chain  
4. Wait for Circle attestation  
5. Receive USDC on Injective  

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (Vanilla JS)             │
│  index.html · analysis.html · markets.html · etc.   │
│  shared.css · shared.js · main.js                    │
│  Topographic water-flow canvas animation             │
│  Keplr wallet integration                            │
└──────────┬──────────────────────────────┬────────────┘
           │                              │
           ▼                              ▼
┌──────────────────┐         ┌──────────────────────────┐
│  Express Server  │         │  MCP Server (stdio)      │
│  (server.js)     │         │  (mcp.js --mcp)          │
│                  │         │                          │
│  /api/scores     │◄────────┤  get_match_info          │
│  /api/markets    │         │  get_market_odds         │
│  /api/analyse    │◄─x402──►│  get_first_goal_odds     │
│  /api/cctp/*     │         │  get_head_to_head        │
│                  │         │  get_squad_info           │
└──────┬───────────┘         └──────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────┐
│           External APIs                   │
│  football-data.org · Injective Exchange  │
│  OpenAI (GPT-4o-mini) · Circle CCTP     │
│  x402 Facilitator                        │
└──────────────────────────────────────────┘
```

---

## Getting Started

### Prerequisites
- Node.js ≥ 18
- npm

### Installation
```bash
git clone https://github.com/your-repo/hackquest-injective.git
cd hackquest-injective
npm install
```

### Configuration
```bash
cp .env.example .env
# Edit .env with your keys:
#   FOOTBALL_API_KEY    — free from football-data.org (optional, mock fallback)
#   OPENAI_API_KEY      — for AI analysis (optional, demo mode fallback)
#   WALLET_ADDRESS      — your Injective wallet for x402 payments
#   INJECTIVE_NETWORK   — testnet or mainnet
```

### Run
```bash
npm run dev
# Server starts on http://localhost:3001
# Frontend served on http://localhost:3000 (or open index.html directly)
```

### MCP Inspector
```bash
node server/mcp.js --mcp
# Connects via stdio for MCP Inspector / Claude Desktop
```

---

## 📁 Project Structure

```
├── index.html          # Homepage — fixtures, odds, banner
├── analysis.html       # AI match analysis — probability graph, x402 gate
├── markets.html        # Prediction markets overview
├── livescores.html     # Live scores with auto-refresh
├── games.html          # Mini-games (Score Predictor, Bracket, Golden Boot)
├── shared.css          # Full design system (~1100 lines)
├── shared.js           # Shared utilities, wallet, API helpers, animations
├── main.js             # Homepage canvas animation + modal logic
├── style.css           # Homepage-specific styles
├── server/
│   ├── server.js       # Express API — x402, CCTP, scores, markets, analysis
│   ├── mcp.js          # MCP Server + Agent Skills (5 tools)
│   └── football.js     # Football data tools + OpenAI function definitions
├── assets/             # Logos, banners, avatars
└── package.json
```

---





