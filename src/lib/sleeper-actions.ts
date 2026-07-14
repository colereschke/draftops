'use server';

import {
  fetchSleeperLeague,
  fetchSleeperLeagueUsers,
  fetchSleeperLeagueRosters,
  mapSleeperLeague,
} from '@/lib/sleeper';
import type { SleeperImportResult } from '@/lib/sleeper';

type ImportResponse = { ok: true; data: SleeperImportResult } | { ok: false; error: string };

export async function importFromSleeper(
  leagueId: string,
  ownerUsername?: string,
): Promise<ImportResponse> {
  try {
    const [league, users, rosters] = await Promise.all([
      fetchSleeperLeague(leagueId),
      fetchSleeperLeagueUsers(leagueId),
      fetchSleeperLeagueRosters(leagueId),
    ]);
    const data = mapSleeperLeague(league, users, rosters, ownerUsername, leagueId);
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      return { ok: false, error: 'League not found. Check your Sleeper league ID.' };
    }
    return { ok: false, error: "Couldn't reach Sleeper — try again." };
  }
}
