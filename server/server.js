// ── server/server.js ──────────────────────────────────────────────────────────
// Main Express backend for Injective World Cup app.
// Routes: /api/scores, /api/analyse (x402), /api/markets, /api/cctp/*
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config';
import express from 'express';
import cors    from 'cors';
import OpenAI  from 'openai';

import { injectivePaymentMiddleware } from '@injectivelabs/x402/middleware';
import { footballTools, openAITools } from './football.js';
import { mcpTools } from './mcp.js';

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'demo' });

app.use(
  injectivePaymentMiddleware(
    {
      'POST /api/analyse': {
        accepts: [{
          // Injective EVM (chain ID 1776)
          network: 'eip155:1776',
          // USDC on Injective EVM
          asset: '0xa00C59fF5a080D2b954d0c75e46E22a0c371235a',
          // $0.10 (USDC uses 6 decimal places, so 100000)
          amount: '100000',
          // Recipient address
          payTo: process.env.WALLET_ADDRESS || 'inj1demo_recipient_address',
        }],
      },
    },
    { facilitatorUrl: process.env.X402_FACILITATOR_URL || 'https://facilitator.x402.org/injective' }
  )
);

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/scores  — Live scores, upcoming fixtures, past results
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/scores', async (req, res) => {
  const { status = 'all' } = req.query;

  // Try real API first
  if (process.env.FOOTBALL_API_KEY) {
    try {
      const apiRes = await fetch(
        'https://api.football-data.org/v4/competitions/WC/matches',
        { headers: { 'X-Auth-Token': process.env.FOOTBALL_API_KEY } }
      );
      if (apiRes.ok) {
        const data = await apiRes.json();
        let matches = data.matches || [];
        if (status === 'LIVE') {
          matches = matches.filter(m => m.status === 'IN_PLAY' || m.status === 'LIVE' || m.status === 'PAUSED');
        } else if (status === 'SCHEDULED') {
          matches = matches.filter(m => m.status === 'SCHEDULED' || m.status === 'TIMED');
        } else if (status === 'FINISHED') {
          matches = matches.filter(m => m.status === 'FINISHED');
        }
        return res.json({ source: 'live', matches });
      }
    } catch (_) {}
  }

  // Fallback: realistic mock World Cup 2026 data
  res.json({ source: 'mock', matches: getMockMatches(status) });
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/markets  — Probability model data from Injective Exchange
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/markets', async (req, res) => {
  res.json({ markets: getMockMarkets() });
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/markets/:matchId/odds  — Moneyline odds from Injective
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/markets/:matchId/odds', async (req, res) => {
  const { matchId } = req.params;
  try {
    const data = await mcpTools.get_market_odds(matchId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch market odds', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/markets/:matchId/first-goal-odds  — First goal odds from Injective
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/markets/:matchId/first-goal-odds', async (req, res) => {
  const { matchId } = req.params;
  try {
    const data = await mcpTools.get_first_goal_odds(matchId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch first goal odds', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/analyse  — AI match analysis (PROTECTED by x402)
//
//  This is the key integration point:
//   1. x402Middleware checks for payment header → returns 402 if missing
//   2. If paid → MCP tools fetch real match data
//   3. OpenAI synthesises a prediction from that data
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/analyse', async (req, res) => {
  const { matchId, homeTeamId, awayTeamId } = req.body;

  if (!matchId) return res.status(400).json({ error: 'matchId required' });

  try {
    // ── Step 1: Gather data via Football API tools ─────────────────────────
    const [matchInfo, h2h, homeSquad, awaySquad] = await Promise.all([
      footballTools.get_match_info(matchId),
      footballTools.get_head_to_head(homeTeamId || 'br', awayTeamId || 'ar'),
      footballTools.get_squad_info(homeTeamId || 'br'),
      footballTools.get_squad_info(awayTeamId || 'ar'),
    ]);

    // ── Step 2: AI synthesises prediction from real data ─────────────────────
    const systemPrompt = `You are an expert football analyst for the FIFA World Cup 2026.
You have access to real match data, on-chain probability model data, and historical statistics.
Provide concise, data-driven match predictions. Structure your response as JSON.`;

    const userPrompt = `Analyse this match and provide a prediction:

MATCH DATA: ${JSON.stringify(matchInfo, null, 2)}
HEAD-TO-HEAD: ${JSON.stringify(h2h, null, 2)}
HOME SQUAD: ${JSON.stringify(homeSquad, null, 2)}
AWAY SQUAD: ${JSON.stringify(awaySquad, null, 2)}

Return a JSON object with:
{
  "summary": "2-3 sentence overview",
  "prediction": { "winner": "HomeTeam|Draw|AwayTeam", "score": "X-Y", "confidence": 0-100 },
  "keyFactors": ["factor1", "factor2", "factor3"],
  "marketInsight": "How the Injective market odds compare to your assessment",
  "riskLevel": "Low|Medium|High",
  "keyPlayers": [{ "name": "...", "team": "...", "impact": "..." }]
}`;

    // Use OpenAI if key available, otherwise return structured mock analysis
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'demo') {
      const completion = await openai.chat.completions.create({
        model:    'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 800,
      });

      const analysis = JSON.parse(completion.choices[0].message.content);
      return res.json({
        analysis,
        paymentVerified: req.payment,
        dataSources: ['football-data.org', 'injective-exchange', 'historical-h2h'],
        generatedBy: 'gpt-4o-mini + MCP Agent Skills',
      });
    }

    // Demo analysis (when no OpenAI key)
    return res.json({
      analysis: getMockAnalysis(matchId, matchInfo, {}),
      paymentVerified: req.payment,
      dataSources: ['mock-data'],
      generatedBy: 'demo-mode',
    });

  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: 'Analysis failed', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  CCTP — Cross-Chain Transfer Protocol (USDC bridge to Injective)
// ─────────────────────────────────────────────────────────────────────────────
const CCTP_CHAINS = [
  { chainId: 1, name: 'Ethereum', logo: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg', domain: 0, tokenMessenger: '0xbd3fa81b58ba92a82136038b25adec7066af3155', usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
  { chainId: 42161, name: 'Arbitrum', logo: 'https://cryptologos.cc/logos/arbitrum-arb-logo.svg', domain: 3, tokenMessenger: '0x19330d10d9cc8751218eaf51e8885d058642e08a', usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
  { chainId: 8453, name: 'Base', logo: 'https://raw.githubusercontent.com/base-org/brand-kit/main/logo/symbol/Base_Symbol_Blue.svg', domain: 6, tokenMessenger: '0x1682ae6375c4e4a97e4b583bc394c861a46d8962', usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  { chainId: 137, name: 'Polygon', logo: 'https://cryptologos.cc/logos/polygon-matic-logo.svg', domain: 7, tokenMessenger: '0x9daF8c91AEFAE50b9c0E69629D3F6Ca40cA3B3FE', usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' },
];
const INJ_CCTP_DOMAIN = 9; // Injective domain in Circle's CCTP

app.get('/api/cctp/chains', (req, res) => {
  res.json({ chains: CCTP_CHAINS, destinationDomain: INJ_CCTP_DOMAIN });
});

app.post('/api/cctp/burn-params', (req, res) => {
  const { sourceChainId, amount, recipientAddress } = req.body;
  const chain = CCTP_CHAINS.find(c => c.chainId === Number(sourceChainId));
  if (!chain) return res.status(400).json({ error: 'Unsupported source chain' });

  // Generate the burn parameters the frontend needs to call TokenMessenger.depositForBurn
  const burnParams = {
    tokenMessengerAddress: chain.tokenMessenger,
    usdcAddress: chain.usdc,
    amount: String(amount),
    destinationDomain: INJ_CCTP_DOMAIN,
    mintRecipient: recipientAddress || process.env.WALLET_ADDRESS || '0x0000000000000000000000000000000000000000',
    chainId: chain.chainId,
    chainName: chain.name,
  };
  res.json(burnParams);
});

app.get('/api/cctp/attestation/:txHash', async (req, res) => {
  const { txHash } = req.params;
  try {
    // Poll Circle's Iris API for attestation
    const irisRes = await fetch(`https://iris-api.circle.com/attestations/${txHash}`);
    if (irisRes.ok) {
      const data = await irisRes.json();
      return res.json(data);
    }
    // Attestation not ready yet
    res.json({ status: 'pending', message: 'Attestation not yet available. Keep polling.' });
  } catch {
    res.json({ status: 'pending', message: 'Waiting for Circle attestation...' });
  }
});


//  Start
// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏆 Injective World Cup API running on http://localhost:${PORT}`);
  console.log(`   GET  /api/scores          → Live scores & fixtures`);
  console.log(`   GET  /api/markets         → Probability model data`);
  console.log(`   POST /api/analyse         → AI match analysis (x402 protected)`);
  console.log(`   GET  /api/cctp/chains     → Supported source chains`);
  console.log(`   POST /api/cctp/burn-params → CCTP burn parameters`);
  console.log(`   GET  /api/cctp/attestation/:txHash → Circle attestation`);
  console.log(`\n   OpenAI: ${process.env.OPENAI_API_KEY ? '✅ configured' : '⚠️  demo mode'}`);
  console.log(`   Football API: ${process.env.FOOTBALL_API_KEY ? '✅ configured' : '⚠️  using mock data'}\n`);
});

// ─────────────────────────────────────────────────────────────────────────────
//  Mock data helpers
// ─────────────────────────────────────────────────────────────────────────────
function getMockMatches(status) {
  const all = [
    {
      id: 'm001',
      status: 'SCHEDULED',
      utcDate: '2026-07-19T19:00:00Z',
      homeTeam: { id: 'es', name: 'Spain', shortName: 'ESP', crest: 'https://flagcdn.com/w40/es.png' },
      awayTeam: { id: 'ar', name: 'Argentina', shortName: 'ARG', crest: 'https://flagcdn.com/w40/ar.png' },
      score: { home: null, away: null },
      stage: 'FINAL',
      venue: 'MetLife Stadium, New Jersey'
    },
    { id: 'm005', status: 'FINISHED',  homeTeam: { id:'nl', name:'Netherlands', shortName:'NED', crest:'https://flagcdn.com/w40/nl.png' }, awayTeam: { id:'pt', name:'Portugal',  shortName:'POR', crest:'https://flagcdn.com/w40/pt.png' }, score: { home:3, away:2 }, stage:'ROUND_OF_16', venue:'Levi\'s Stadium', utcDate:'2026-07-13T19:00:00Z' },
    { id: 'm006', status: 'FINISHED',  homeTeam: { id:'jp', name:'Japan',       shortName:'JPN', crest:'https://flagcdn.com/w40/jp.png' }, awayTeam: { id:'hr', name:'Croatia',   shortName:'CRO', crest:'https://flagcdn.com/w40/hr.png' }, score: { home:2, away:0 }, stage:'ROUND_OF_16', venue:'Gillette Stadium', utcDate:'2026-07-12T15:00:00Z' },
    { id: 'm007', status: 'FINISHED',  homeTeam: { id:'co', name:'Colombia',    shortName:'COL', crest:'https://flagcdn.com/w40/co.png' }, awayTeam: { id:'mg', name:'Senegal',   shortName:'SEN', crest:'https://flagcdn.com/w40/sn.png' }, score: { home:1, away:2 }, stage:'ROUND_OF_16', venue:'Mercedes-Benz Stadium', utcDate:'2026-07-11T19:00:00Z' },
  ];

  if (status === 'LIVE')      return all.filter(m => m.status === 'IN_PLAY');
  if (status === 'SCHEDULED') return all.filter(m => m.status === 'SCHEDULED');
  if (status === 'FINISHED')  return all.filter(m => m.status === 'FINISHED');
  return all;
}

function getMockMarkets() {
  return [
    { id: 'mk001', matchId: 'm001', homeTeam: 'Spain',    awayTeam: 'Argentina', status: 'OPEN',     odds: { home: 1.92, draw: 4.54, away: 3.85 }, totalPool: '35,500 USDC', endsAt: '2026-07-19T19:00:00Z' }
  ];
}

function getMockAnalysis(matchId, matchInfo, marketOdds) {
  const home = matchInfo.homeTeam?.name || 'Home Team';
  const away = matchInfo.awayTeam?.name || 'Away Team';
  return {
    summary: `${home} holds a slight edge based on recent form and tournament performance. The Injective probability model currently prices ${home} as the favourite. Historical H2H data and current squad strength both support this assessment, though ${away} are never to be underestimated.`,
    prediction: { winner: home, score: '2-1', confidence: 62 },
    keyFactors: [
      `${home} have scored in every match of this tournament`,
      `${away} have a strong defensive record but struggled in transition`,
      `Market odds on Injective reflect 52% implied probability for ${home}`,
      'Neutral venue slightly disadvantages the "away" side tactically',
    ],
    marketInsight: `The Injective market (${marketOdds.totalPool} total pool) prices ${home} at ${marketOdds.homeWin?.impliedOdds}x — slightly tighter than our model suggests, indicating slight overvaluing of the favourite.`,
    riskLevel: 'Medium',
    keyPlayers: [
      { name: 'Vinicius Jr.', team: home, impact: 'Pace and dribbling key for counter-attacks' },
      { name: 'Lionel Messi', team: away, impact: 'Set-piece specialist and playmaker' },
    ],
  };
}
