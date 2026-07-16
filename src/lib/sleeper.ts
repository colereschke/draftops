import type { StartingSlot, ScoringSettings } from '@/types';

export interface SleeperLeague {
  name: string;
  total_rosters: number;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
}

export interface SleeperUser {
  user_id: string;
  display_name: string; // Sleeper's public username — no separate user_name field in /users response
  metadata?: { team_name?: string };
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null; // primary owner's user_id; null for an unowned/commissioner-held roster
  co_owners?: string[] | null; // additional user_ids sharing the roster (best-effort; absent in some responses)
  players?: string[] | null;
}

export interface SleeperImportResult {
  leagueId: string;
  leagueName: string;
  teamCount: number;
  rosterSize: number;
  startingLineup: StartingSlot[];
  scoringSettings: ScoringSettings;
  teams: SleeperImportTeam[];
  ownerIndex: number | null;
}

export interface SleeperImportTeam {
  handle: string;
  displayName: string;
  sleeperRosterId: number;
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

export async function fetchSleeperLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
  const res = await fetch(`${SLEEPER_BASE}/league/${leagueId}/rosters`);
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error(`SLEEPER_ERROR:${res.status}`);
  return res.json() as Promise<SleeperRoster[]>;
}

export function mapSleeperLeague(
  league: SleeperLeague,
  users: SleeperUser[],
  rosters: SleeperRoster[],
  ownerUsername?: string,
  leagueId = '',
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

  // Build exactly one team per roster (keyed by roster_id for stable order), resolving each
  // roster's primary owner_id to a user. This is the only reliable one-team-per-roster mapping:
  // /users returns co-owners as extra entries in an unspecified order, so slicing it would drop
  // real managers and duplicate co-owned rosters. Orphan rosters (owner_id null) get a placeholder.
  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const orderedRosters = [...rosters].sort((a, b) => a.roster_id - b.roster_id);

  const teams = orderedRosters.map((roster) => {
    const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
    if (!owner) {
      return {
        handle: `roster-${roster.roster_id}`,
        displayName: `Roster ${roster.roster_id}`,
        sleeperRosterId: roster.roster_id,
      };
    }
    return {
      handle: owner.display_name,
      displayName: owner.metadata?.team_name || owner.display_name,
      sleeperRosterId: roster.roster_id,
    };
  });

  let ownerIndex: number | null = null;
  if (ownerUsername) {
    const lower = ownerUsername.toLowerCase();
    // Match against the full users list (owners and co-owners), then locate the roster the
    // matched user belongs to — as primary owner or co-owner — so co-owned imports resolve too.
    const me = users.find((u) => u.display_name.toLowerCase() === lower);
    if (me) {
      const idx = orderedRosters.findIndex(
        (r) => r.owner_id === me.user_id || (r.co_owners ?? []).includes(me.user_id),
      );
      if (idx !== -1) ownerIndex = idx;
    }
  }

  return {
    leagueId,
    leagueName: league.name ?? '',
    teamCount: teams.length,
    rosterSize: league.roster_positions.length,
    startingLineup,
    scoringSettings,
    teams,
    ownerIndex,
  };
}

export interface SleeperRosterCandidate {
  sleeperRosterId: number;
  ownerDisplayName: string | null;
  ownerTeamName: string | null;
  suggestedTeamId: number | null;
  matchSource: 'existing' | 'handle' | 'none';
}

export function matchSleeperRostersToTeams(
  rosters: SleeperRoster[],
  users: SleeperUser[],
  teams: { id: number; handle: string; sleeperRosterId: number | null }[],
): SleeperRosterCandidate[] {
  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const orderedRosters = [...rosters].sort((a, b) => a.roster_id - b.roster_id);
  const rosterIdSet = new Set(orderedRosters.map((r) => r.roster_id));

  const claimedTeamIds = new Set<number>();
  const claimedRosterIds = new Set<number>();
  const suggestionByRosterId = new Map<
    number,
    { teamId: number; matchSource: 'existing' | 'handle' }
  >();

  // Pass 1: honor an existing saved mapping if its roster is still present in this fetch.
  for (const team of teams) {
    if (
      team.sleeperRosterId !== null &&
      rosterIdSet.has(team.sleeperRosterId) &&
      !claimedRosterIds.has(team.sleeperRosterId)
    ) {
      suggestionByRosterId.set(team.sleeperRosterId, { teamId: team.id, matchSource: 'existing' });
      claimedTeamIds.add(team.id);
      claimedRosterIds.add(team.sleeperRosterId);
    }
  }

  // Pass 2: exact case-insensitive handle match among whatever's left unclaimed.
  for (const roster of orderedRosters) {
    if (claimedRosterIds.has(roster.roster_id)) continue;
    const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
    if (!owner) continue;
    const match = teams.find(
      (team) =>
        !claimedTeamIds.has(team.id) &&
        team.handle.toLowerCase() === owner.display_name.toLowerCase(),
    );
    if (!match) continue;
    suggestionByRosterId.set(roster.roster_id, { teamId: match.id, matchSource: 'handle' });
    claimedTeamIds.add(match.id);
    claimedRosterIds.add(roster.roster_id);
  }

  return orderedRosters.map((roster) => {
    const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
    const suggestion = suggestionByRosterId.get(roster.roster_id);
    return {
      sleeperRosterId: roster.roster_id,
      ownerDisplayName: owner?.display_name ?? null,
      ownerTeamName: owner?.metadata?.team_name ?? null,
      suggestedTeamId: suggestion?.teamId ?? null,
      matchSource: suggestion?.matchSource ?? 'none',
    };
  });
}
