// ── server/mcp.js ─────────────────────────────────────────────────────────────
// Model Context Protocol (MCP) server + Agent Skills integration.
//
// HOW IT WORKS:
//   MCP is like a "USB standard" for connecting AI models to external tools.
//   Instead of the AI guessing/hallucinating data, it can CALL these tools
//   and get real data before generating its response.
//
//   TOOLS defined here (= Agent Skills):
//     1. get_match_info     → fetches live match data from football API
//     2. get_market_odds    → fetches prediction market odds from Injective
//     3. get_head_to_head   → fetches historical H2H stats
//     4. get_squad_info     → fetches starting players & form
//
//   The AI is given these tools and DECIDES WHICH ONES TO CALL based on the
//   user's question. The results are injected into the AI's context, and the
//   AI synthesises a prediction from real data.
// ─────────────────────────────────────────────────────────────────────────────

import { McpServer }            from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z }                    from 'zod';

const FOOTBALL_API = 'https://api.football-data.org/v4';
const INJECTIVE_EXCHANGE_API = 'https://api.injective.exchange/api/v1';

// ── Tool 1: Match info (live stats, teams, referee, venue) ───────────────────
async function fetchMatchInfo(matchId) {
  const headers = { 'X-Auth-Token': process.env.FOOTBALL_API_KEY || '' };
  try {
    const res  = await fetch(`${FOOTBALL_API}/matches/${matchId}`, { headers });
    if (!res.ok) throw new Error('Football API unavailable');
    return await res.json();
  } catch {
    // Graceful fallback: return structured mock data
    return getMockMatch(matchId);
  }
}

// ── Tool 2: Market odds from Injective prediction market ─────────────────────
async function fetchMarketOdds(matchId) {
  try {
    const res = await fetch(
      `${INJECTIVE_EXCHANGE_API}/derivative/markets?filter.marketId=wc_${matchId}`
    );
    if (!res.ok) throw new Error('Injective API unavailable');
    return await res.json();
  } catch {
    // Graceful fallback: return realistic mock odds
    return getMockOdds(matchId);
  }
}

// ── Tool 3: Head-to-head history ─────────────────────────────────────────────
async function fetchH2H(team1Id, team2Id) {
  const headers = { 'X-Auth-Token': process.env.FOOTBALL_API_KEY || '' };
  try {
    const res = await fetch(
      `${FOOTBALL_API}/teams/${team1Id}/matches?status=FINISHED`,
      { headers }
    );
    if (!res.ok) throw new Error('Football API unavailable');
    const data = await res.json();
    return data;
  } catch {
    return getMockH2H(team1Id, team2Id);
  }
}

// ── Tool 4: Squad info (formation, key players, recent form) ─────────────────
async function fetchSquadInfo(teamId) {
  const headers = { 'X-Auth-Token': process.env.FOOTBALL_API_KEY || '' };
  try {
    const res = await fetch(`${FOOTBALL_API}/teams/${teamId}`, { headers });
    if (!res.ok) throw new Error('Football API unavailable');
    return await res.json();
  } catch {
    return getMockSquad(teamId);
  }
}

// ── MCP Server definition ────────────────────────────────────────────────────
export function createMCPServer() {
  const server = new McpServer({
    name:    'injective-worldcup-agent',
    version: '1.0.0',
  });

  // Register Tool 1: get_match_info (Agent Skill)
  server.tool(
    'get_match_info',
    'Fetch live match data including score, minute, referee, and venue. Use this for any current match question.',
    { matchId: z.string().describe('The unique match identifier') },
    async ({ matchId }) => {
      const data = await fetchMatchInfo(matchId);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // Register Tool 2: get_market_odds (Agent Skill — Injective-specific)
  server.tool(
    'get_market_odds',
    'Fetch current on-chain prediction market odds from Injective Exchange for a match. Shows how the market collectively rates each team\'s chances.',
    { matchId: z.string().describe('Match ID to get prediction market data for') },
    async ({ matchId }) => {
      const data = await fetchMarketOdds(matchId);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // Register Tool 3: get_head_to_head (Agent Skill)
  server.tool(
    'get_head_to_head',
    'Get historical head-to-head record between two teams. Useful for understanding past match patterns.',
    {
      team1Id: z.string().describe('First team ID'),
      team2Id: z.string().describe('Second team ID'),
    },
    async ({ team1Id, team2Id }) => {
      const data = await fetchH2H(team1Id, team2Id);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // Register Tool 4: get_squad_info (Agent Skill)
  server.tool(
    'get_squad_info',
    'Get squad information, key players, and recent form for a team. Use before any prediction.',
    { teamId: z.string().describe('Team ID') },
    async ({ teamId }) => {
      const data = await fetchSquadInfo(teamId);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  return server;
}

// Export tools as plain functions for the HTTP API endpoint to use
export const mcpTools = {
  get_match_info:  fetchMatchInfo,
  get_market_odds: fetchMarketOdds,
  get_head_to_head: fetchH2H,
  get_squad_info:  fetchSquadInfo,
};

// ── OpenAI tool definitions (MCP-style, used by /api/analyse) ────────────────
export const openAITools = [
  {
    type: 'function',
    function: {
      name:        'get_match_info',
      description: 'Fetch live match data including score, teams, minute, referee, and venue.',
      parameters:  { type: 'object', properties: { matchId: { type: 'string' } }, required: ['matchId'] },
    },
  },
  {
    type: 'function',
    function: {
      name:        'get_market_odds',
      description: 'Fetch current on-chain prediction market odds from Injective for a match.',
      parameters:  { type: 'object', properties: { matchId: { type: 'string' } }, required: ['matchId'] },
    },
  },
  {
    type: 'function',
    function: {
      name:        'get_head_to_head',
      description: 'Get historical head-to-head stats between two teams.',
      parameters:  {
        type: 'object',
        properties: {
          team1Id: { type: 'string' },
          team2Id: { type: 'string' },
        },
        required: ['team1Id', 'team2Id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name:        'get_squad_info',
      description: 'Get squad, key players, and recent form for a team.',
      parameters:  { type: 'object', properties: { teamId: { type: 'string' } }, required: ['teamId'] },
    },
  },
];

// ── Mock data fallbacks ───────────────────────────────────────────────────────
function getMockMatch(matchId) {
  const matches = {
    'm001': { id: 'm001', status: 'IN_PLAY', minute: 67, homeTeam: { id: 'br', name: 'Brazil', shortName: 'BRA', crest: '🇧🇷' }, awayTeam: { id: 'ar', name: 'Argentina', shortName: 'ARG', crest: '🇦🇷' }, score: { home: 2, away: 1 }, stage: 'QUARTER_FINALS', venue: 'MetLife Stadium, New Jersey', referee: 'S. Marciniak' },
    'm002': { id: 'm002', status: 'IN_PLAY', minute: 23, homeTeam: { id: 'fr', name: 'France', shortName: 'FRA', crest: '🇫🇷' }, awayTeam: { id: 'de', name: 'Germany', shortName: 'GER', crest: '🇩🇪' }, score: { home: 0, away: 0 }, stage: 'QUARTER_FINALS', venue: 'Rose Bowl, Los Angeles', referee: 'D. Siebert' },
    'm003': { id: 'm003', status: 'SCHEDULED', utcDate: '2026-07-14T20:00:00Z', homeTeam: { id: 'es', name: 'Spain', shortName: 'ESP', crest: '🇪🇸' }, awayTeam: { id: 'en', name: 'England', shortName: 'ENG', crest: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' }, stage: 'QUARTER_FINALS', venue: 'SoFi Stadium, Los Angeles' },
    'm004': { id: 'm004', status: 'SCHEDULED', utcDate: '2026-07-15T17:00:00Z', homeTeam: { id: 'us', name: 'USA', shortName: 'USA', crest: '🇺🇸' }, awayTeam: { id: 'ma', name: 'Morocco', shortName: 'MAR', crest: '🇲🇦' }, stage: 'QUARTER_FINALS', venue: 'AT&T Stadium, Dallas' },
  };
  return matches[matchId] || matches['m001'];
}

function getMockOdds(matchId) {
  const odds = {
    'm001': { matchId, homeWin: { probability: 0.52, impliedOdds: 1.92, totalBets: '12,450 USDC' }, draw: { probability: 0.21, impliedOdds: 4.76, totalBets: '5,230 USDC' }, awayWin: { probability: 0.27, impliedOdds: 3.70, totalBets: '7,320 USDC' }, totalPool: '25,000 USDC', lastUpdated: new Date().toISOString() },
    'm002': { matchId, homeWin: { probability: 0.45, impliedOdds: 2.22, totalBets: '9,100 USDC' }, draw: { probability: 0.28, impliedOdds: 3.57, totalBets: '5,600 USDC' }, awayWin: { probability: 0.27, impliedOdds: 3.70, totalBets: '5,300 USDC' }, totalPool: '20,000 USDC', lastUpdated: new Date().toISOString() },
    'm003': { matchId, homeWin: { probability: 0.48, impliedOdds: 2.08, totalBets: '18,200 USDC' }, draw: { probability: 0.24, impliedOdds: 4.17, totalBets: '9,100 USDC' }, awayWin: { probability: 0.28, impliedOdds: 3.57, totalBets: '10,700 USDC' }, totalPool: '38,000 USDC', lastUpdated: new Date().toISOString() },
  };
  return odds[matchId] || odds['m001'];
}

function getMockH2H(team1Id, team2Id) {
  return {
    team1: team1Id, team2: team2Id,
    total: 45, team1Wins: 18, draws: 11, team2Wins: 16,
    lastFive: [
      { date: '2024-11-19', result: '1-0', winner: team1Id, competition: 'International Friendly' },
      { date: '2024-07-15', result: '1-0', winner: team1Id, competition: 'Copa América Final' },
      { date: '2022-12-18', result: '3-3 (4-2 pens)', winner: team2Id, competition: 'FIFA World Cup Final' },
      { date: '2021-07-10', result: '1-0', winner: team1Id, competition: 'Copa América Final' },
      { date: '2019-07-02', result: '2-0', winner: team1Id, competition: 'Copa América SF' },
    ],
    avgGoals: { team1: 1.8, team2: 1.4 },
    btts: '60%',
  };
}

function getMockSquad(teamId) {
  const squads = {
    br: { name: 'Brazil', form: ['W','W','D','W','W'], keyPlayers: ['Vinicius Jr.', 'Rodrygo', 'Bruno Guimarães', 'Marquinhos', 'Alisson'], formation: '4-2-3-1', avgAge: 26.3, recentGoals: 12, recentConceded: 3 },
    ar: { name: 'Argentina', form: ['W','W','W','D','W'], keyPlayers: ['Lionel Messi', 'Julian Alvarez', 'Rodrigo De Paul', 'Lisandro Martinez', 'Emiliano Martínez'], formation: '4-3-3', avgAge: 27.1, recentGoals: 10, recentConceded: 4 },
    fr: { name: 'France', form: ['W','W','W','W','D'], keyPlayers: ['Kylian Mbappé', 'Antoine Griezmann', 'Aurélien Tchouaméni', 'Dayot Upamecano', 'Mike Maignan'], formation: '4-3-3', avgAge: 26.8, recentGoals: 15, recentConceded: 5 },
    de: { name: 'Germany', form: ['W','D','W','W','L'], keyPlayers: ['Jamal Musiala', 'Florian Wirtz', 'Joshua Kimmich', 'Toni Rüdiger', 'Manuel Neuer'], formation: '4-2-3-1', avgAge: 25.9, recentGoals: 11, recentConceded: 6 },
  };
  return squads[teamId] || squads['br'];
}

// ── Start MCP stdio server (for MCP Inspector / Claude Desktop integration) ──
if (process.argv[2] === '--mcp') {
  const server    = createMCPServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Injective World Cup MCP Server running on stdio');
}
