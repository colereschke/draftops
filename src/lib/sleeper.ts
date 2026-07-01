import type { StartingSlot, ScoringSettings } from '@/types';

export interface SleeperLeague {
  total_rosters: number;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
}

export interface SleeperUser {
  user_id: string;
  display_name: string; // Sleeper's public username — no separate user_name field in /users response
  metadata?: { team_name?: string };
}

export interface SleeperImportResult {
  teamCount: number;
  rosterSize: number;
  startingLineup: StartingSlot[];
  scoringSettings: ScoringSettings;
  teams: Array<{ handle: string; displayName: string }>;
  ownerIndex: number | null;
}

const SLEEPER_BASE = 'https://api.sleeper.app/v1';

const VALID_SLOTS = new Set<string>(['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX']);

export async function fetchSleeperLeague(leagueId: string): Promise<SleeperLeague> {
  const res = await fetch(`${SLEEPER_BASE}/league/${leagueId}`);
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error(`SLEEPER_ERROR:${res.status}`);
  const data: unknown = await res.json();
  if (!data || typeof data !== 'object' || !('total_rosters' in data)) {
    throw new Error('NOT_FOUND');
  }
  return data as SleeperLeague;
}

export async function fetchSleeperLeagueUsers(leagueId: string): Promise<SleeperUser[]> {
  const res = await fetch(`${SLEEPER_BASE}/league/${leagueId}/users`);
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error(`SLEEPER_ERROR:${res.status}`);
  return res.json() as Promise<SleeperUser[]>;
}

export function mapSleeperLeague(
  league: SleeperLeague,
  users: SleeperUser[],
  ownerUsername?: string,
): SleeperImportResult {
  const s = league.scoring_settings;
  const rec = s.rec ?? 0;
  const passYd = s.pass_yd ?? 0;

  const scoringSettings: ScoringSettings = {
    passYdsPerPoint: passYd === 0 ? 25 : Math.round(1 / passYd),
    passTD: s.pass_td ?? 4,
    passInt: s.pass_int ?? -2,
    rushAtt: s.rush_att ?? 0,
    rushFD: s.rush_fd ?? 0,
    pprRB: rec + (s.bonus_rec_rb ?? 0),
    pprWR: rec + (s.bonus_rec_wr ?? 0),
    pprTE: rec + (s.bonus_rec_te ?? 0),
    recFD: s.rec_fd ?? 0,
    rbFDBonus: s.bonus_fd_rb ?? 0,
    wrFDBonus: s.bonus_fd_wr ?? 0,
    teFDBonus: s.bonus_fd_te ?? 0,
  };

  const startingLineup = league.roster_positions
    .filter((pos) => VALID_SLOTS.has(pos))
    .map((pos) => pos as StartingSlot);

  // Sleeper leagues can have co-owners (extra users sharing a roster), so truncate to total_rosters
  const capped = users.slice(0, league.total_rosters);

  const teams = capped.map((u) => ({
    handle: u.display_name,
    displayName: u.metadata?.team_name || u.display_name,
  }));

  let ownerIndex: number | null = null;
  if (ownerUsername) {
    const lower = ownerUsername.toLowerCase();
    const idx = capped.findIndex((u) => u.display_name.toLowerCase() === lower);
    if (idx !== -1) ownerIndex = idx;
  }

  return {
    teamCount: league.total_rosters,
    rosterSize: league.roster_positions.length,
    startingLineup,
    scoringSettings,
    teams,
    ownerIndex,
  };
}
