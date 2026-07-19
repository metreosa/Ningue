// ── server/football.js ────────────────────────────────────────────────────────
// Pure football data fetching functions.
// We use the official Injective MCP server for blockchain interactions,
// so this file only contains the Web2 sports data integrations.
// ─────────────────────────────────────────────────────────────────────────────

const FOOTBALL_API = 'https://api.football-data.org/v4';

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

// ── Tool 2: Head-to-head history ─────────────────────────────────────────────
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

// ── Tool 3: Squad info (formation, key players, recent form) ─────────────────
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

export const footballTools = {
  get_match_info:  fetchMatchInfo,
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


