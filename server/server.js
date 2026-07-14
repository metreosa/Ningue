// ── server/server.js ──────────────────────────────────────────────────────────
// Main Express backend for Injective World Cup app.
// Routes: /api/scores, /api/analyse (x402), /api/markets, /api/cctp/*
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config';
import express from 'express';
import cors    from 'cors';
import OpenAI  from 'openai';

import { x402Middleware }       from './x402.js';
import { mcpTools, openAITools } from './mcp.js';
import { pollAttestation, getBurnParams, CCTP_DOMAINS } from './cctp.js';

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'demo' });

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
        return res.json({ source: 'live', matches: data.matches });
      }
    } catch (_) {}
  }

  // Fallback: realistic mock World Cup 2026 data
  res.json({ source: 'mock', matches: getMockMatches(status) });
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/markets  — Prediction market data from Injective Exchange
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/markets', async (req, res) => {
  res.json({ markets: getMockMarkets() });
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/analyse  — AI match analysis (PROTECTED by x402)
//
//  This is the key integration point:
//   1. x402Middleware checks for payment header → returns 402 if missing
//   2. If paid → MCP tools fetch real match data
//   3. OpenAI synthesises a prediction from that data
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/analyse', x402Middleware, async (req, res) => {
  const { matchId, homeTeamId, awayTeamId } = req.body;

  if (!matchId) return res.status(400).json({ error: 'matchId required' });

  try {
    // ── Step 1: Gather data via MCP tools (Agent Skills) ────────────────────
    const [matchInfo, marketOdds, h2h, homeSquad, awaySquad] = await Promise.all([
      mcpTools.get_match_info(matchId),
      mcpTools.get_market_odds(matchId),
      mcpTools.get_head_to_head(homeTeamId || 'br', awayTeamId || 'ar'),
      mcpTools.get_squad_info(homeTeamId || 'br'),
      mcpTools.get_squad_info(awayTeamId || 'ar'),
    ]);

    // ── Step 2: AI synthesises prediction from real data ─────────────────────
    const systemPrompt = `You are an expert football analyst for the FIFA World Cup 2026.
You have access to real match data, on-chain prediction market odds, and historical statistics.
Provide concise, data-driven match predictions. Structure your response as JSON.`;

    const userPrompt = `Analyse this match and provide a prediction:

MATCH DATA: ${JSON.stringify(matchInfo, null, 2)}
MARKET ODDS (on Injective): ${JSON.stringify(marketOdds, null, 2)}
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
      analysis: getMockAnalysis(matchId, matchInfo, marketOdds),
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
//  CCTP Routes — Cross-chain USDC deposit flow
// ─────────────────────────────────────────────────────────────────────────────

// Get supported source chains for CCTP
app.get('/api/cctp/chains', (_req, res) => {
  const chains = Object.entries(CCTP_DOMAINS)
    .filter(([k]) => k !== 'injective')
    .map(([key, val]) => ({ key, ...val }));
  res.json({ chains });
});

// Get parameters for burning USDC on source chain
app.post('/api/cctp/burn-params', (req, res) => {
  const { sourceChain, amount, recipient } = req.body;
  try {
    const params = getBurnParams(sourceChain, amount, recipient);
    res.json({ success: true, burnParams: params });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Poll attestation status from Circle IRIS API
app.get('/api/cctp/attestation/:txHash', async (req, res) => {
  const { txHash } = req.params;
  const { sourceDomain = 0 } = req.query;

  const result = await pollAttestation(txHash, parseInt(sourceDomain));
  res.json(result);
});

// ─────────────────────────────────────────────────────────────────────────────
//  Start
// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏆 Injective World Cup API running on http://localhost:${PORT}`);
  console.log(`   GET  /api/scores          → Live scores & fixtures`);
  console.log(`   GET  /api/markets         → Prediction market data`);
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
    { id: 'm001', status: 'IN_PLAY',   minute: 67, homeTeam: { id:'br', name:'Brazil',      shortName:'BRA', crest:'🇧🇷' }, awayTeam: { id:'ar', name:'Argentina',  shortName:'ARG', crest:'🇦🇷' }, score: { home:2, away:1 }, stage:'QUARTER_FINALS', venue:'MetLife Stadium' },
    { id: 'm002', status: 'IN_PLAY',   minute: 23, homeTeam: { id:'fr', name:'France',       shortName:'FRA', crest:'🇫🇷' }, awayTeam: { id:'de', name:'Germany',    shortName:'GER', crest:'🇩🇪' }, score: { home:0, away:0 }, stage:'QUARTER_FINALS', venue:'Rose Bowl, LA' },
    { id: 'm003', status: 'SCHEDULED', utcDate: new Date(Date.now() + 3*60*60*1000).toISOString(), homeTeam: { id:'es', name:'Spain',        shortName:'ESP', crest:'🇪🇸' }, awayTeam: { id:'en', name:'England',   shortName:'ENG', crest:'🏴󠁧󠁢󠁥󠁮󠁧󠁿' }, stage:'QUARTER_FINALS', venue:'SoFi Stadium, LA' },
    { id: 'm004', status: 'SCHEDULED', utcDate: new Date(Date.now() + 26*60*60*1000).toISOString(), homeTeam: { id:'us', name:'USA',         shortName:'USA', crest:'🇺🇸' }, awayTeam: { id:'ma', name:'Morocco',   shortName:'MAR', crest:'🇲🇦' }, stage:'QUARTER_FINALS', venue:'AT&T Stadium, Dallas' },
    { id: 'm005', status: 'FINISHED',  homeTeam: { id:'nl', name:'Netherlands', shortName:'NED', crest:'🇳🇱' }, awayTeam: { id:'pt', name:'Portugal',  shortName:'POR', crest:'🇵🇹' }, score: { home:3, away:2 }, stage:'ROUND_OF_16', venue:'Levi\'s Stadium', utcDate:'2026-07-13T19:00:00Z' },
    { id: 'm006', status: 'FINISHED',  homeTeam: { id:'jp', name:'Japan',       shortName:'JPN', crest:'🇯🇵' }, awayTeam: { id:'hr', name:'Croatia',   shortName:'CRO', crest:'🇭🇷' }, score: { home:2, away:0 }, stage:'ROUND_OF_16', venue:'Gillette Stadium', utcDate:'2026-07-12T15:00:00Z' },
    { id: 'm007', status: 'FINISHED',  homeTeam: { id:'co', name:'Colombia',    shortName:'COL', crest:'🇨🇴' }, awayTeam: { id:'mg', name:'Senegal',   shortName:'SEN', crest:'🇸🇳' }, score: { home:1, away:2 }, stage:'ROUND_OF_16', venue:'Mercedes-Benz Stadium', utcDate:'2026-07-11T19:00:00Z' },
  ];

  if (status === 'LIVE')      return all.filter(m => m.status === 'IN_PLAY');
  if (status === 'SCHEDULED') return all.filter(m => m.status === 'SCHEDULED');
  if (status === 'FINISHED')  return all.filter(m => m.status === 'FINISHED');
  return all;
}

function getMockMarkets() {
  return [
    { id: 'mk001', matchId: 'm001', homeTeam: 'Brazil',   awayTeam: 'Argentina', status: 'LIVE',     odds: { home: 1.92, draw: 4.76, away: 3.70 }, totalPool: '25,000 USDC', endsAt: new Date(Date.now() + 90*60*1000).toISOString() },
    { id: 'mk002', matchId: 'm002', homeTeam: 'France',   awayTeam: 'Germany',   status: 'LIVE',     odds: { home: 2.22, draw: 3.57, away: 3.70 }, totalPool: '20,000 USDC', endsAt: new Date(Date.now() + 90*60*1000).toISOString() },
    { id: 'mk003', matchId: 'm003', homeTeam: 'Spain',    awayTeam: 'England',   status: 'OPEN',     odds: { home: 2.08, draw: 4.17, away: 3.57 }, totalPool: '38,000 USDC', endsAt: new Date(Date.now() + 3*60*60*1000).toISOString() },
    { id: 'mk004', matchId: 'm004', homeTeam: 'USA',      awayTeam: 'Morocco',   status: 'OPEN',     odds: { home: 2.50, draw: 3.20, away: 2.85 }, totalPool: '15,000 USDC', endsAt: new Date(Date.now() + 26*60*60*1000).toISOString() },
  ];
}

function getMockAnalysis(matchId, matchInfo, marketOdds) {
  const home = matchInfo.homeTeam?.name || 'Home Team';
  const away = matchInfo.awayTeam?.name || 'Away Team';
  return {
    summary: `${home} holds a slight edge based on recent form and tournament performance. The Injective prediction market currently prices ${home} as the favourite. Historical H2H data and current squad strength both support this assessment, though ${away} are never to be underestimated.`,
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
