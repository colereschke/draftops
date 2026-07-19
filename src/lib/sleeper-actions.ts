'use server';

import { auth } from '@/auth';
import {
  fetchSleeperLeague,
  fetchSleeperLeagueUsers,
  fetchSleeperLeagueRosters,
  mapSleeperLeague,
  SleeperClientError,
  validateSleeperLeagueId,
} from '@/lib/sleeper';
import type { SleeperImportResult } from '@/lib/sleeper';

type ImportResponse = { ok: true; data: SleeperImportResult } | { ok: false; error: string };

export async function importFromSleeper(
  leagueId: string,
  ownerUsername?: string,
): Promise<ImportResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { ok: false, error: 'Sign in to import a Sleeper league.' };
    }

    const validLeagueId = validateSleeperLeagueId(leagueId);
    const [league, users, rosters] = await Promise.all([
      fetchSleeperLeague(validLeagueId),
      fetchSleeperLeagueUsers(validLeagueId),
      fetchSleeperLeagueRosters(validLeagueId),
    ]);
    const data = mapSleeperLeague(league, users, rosters, ownerUsername, validLeagueId);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof SleeperClientError) {
      const errors = {
        INVALID_LEAGUE_ID: 'Enter a valid Sleeper league ID.',
        NOT_FOUND: 'League not found. Check your Sleeper league ID.',
        TIMEOUT: 'Sleeper timed out. Try again in a moment.',
        RATE_LIMITED: 'Sleeper is rate-limiting requests. Try again shortly.',
        MALFORMED_RESPONSE: 'Sleeper returned unexpected league data. Try again later.',
        UNAVAILABLE: 'Sleeper is unavailable — try again.',
      } as const;
      return { ok: false, error: errors[err.code] };
    }
    return { ok: false, error: "Couldn't reach Sleeper — try again." };
  }
}
