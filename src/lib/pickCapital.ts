import type { Prisma, PrismaClient } from '@prisma/client';
import type { ResolvedPick } from '@/lib/pickOwnership';
import { groupResolvedPicks } from '@/lib/pickOwnership';
import { PACKAGE_BASELINE, ROUND_BASELINES } from '@/lib/futurePickAssets';
import { scaleWholeDollar } from '@/lib/valuationBudget';

type PrismaClientLike = Prisma.TransactionClient | PrismaClient;

export interface RoundBaselineLookup {
  packageBaselineByOrigin: ReadonlyMap<number, number>;
  roundBaselineByOriginRound: ReadonlyMap<string, number>;
}

export async function loadGeneratedYearBaselines(
  client: PrismaClientLike,
  draftId: number,
  generatedPickYear: number,
  teams: Array<{ id: number; handle: string }>,
): Promise<RoundBaselineLookup> {
  const rows = await client.player.findMany({
    where: {
      draftId,
      futurePickYear: generatedPickYear,
      futurePickAssetKind: { in: ['package', 'pick'] },
    },
    select: {
      futurePickOriginHandle: true,
      futurePickAssetKind: true,
      futurePickRound: true,
      budget: true,
    },
  });
  const teamIdByHandle = new Map(teams.map((team) => [team.handle, team.id]));
  const packageBaselineByOrigin = new Map<number, number>();
  const roundBaselineByOriginRound = new Map<string, number>();

  for (const row of rows) {
    const originTeamId = teamIdByHandle.get(row.futurePickOriginHandle ?? '');
    if (originTeamId === undefined) continue;
    if (row.futurePickAssetKind === 'package') {
      packageBaselineByOrigin.set(originTeamId, row.budget);
    } else if (row.futurePickAssetKind === 'pick' && row.futurePickRound !== null) {
      roundBaselineByOriginRound.set(`${originTeamId}:${row.futurePickRound}`, row.budget);
    }
  }
  return { packageBaselineByOrigin, roundBaselineByOriginRound };
}

export interface ComputeFutureCapitalInput {
  resolvedPicks: ResolvedPick[];
  teamHandleById: ReadonlyMap<number, string>;
  baselines: RoundBaselineLookup;
  fallbackScale: number;
}

export function computeFutureCapitalByHandle(
  input: ComputeFutureCapitalInput,
): Map<string, number> {
  const groups = groupResolvedPicks(input.resolvedPicks);
  const capitalByHandle = new Map<string, number>();

  for (const group of groups) {
    const handle = input.teamHandleById.get(group.holderTeamId);
    if (!handle) continue;

    const value = group.isIntactPackage
      ? (input.baselines.packageBaselineByOrigin.get(group.originTeamId) ??
        scaleWholeDollar(PACKAGE_BASELINE.budget, input.fallbackScale))
      : group.rounds.reduce((sum, round) => {
          const key = `${round.originTeamId}:${round.futurePickRound}`;
          const roundValue =
            input.baselines.roundBaselineByOriginRound.get(key) ??
            scaleWholeDollar(ROUND_BASELINES[round.futurePickRound].budget, input.fallbackScale);
          return sum + roundValue;
        }, 0);

    capitalByHandle.set(handle, (capitalByHandle.get(handle) ?? 0) + value);
  }

  return capitalByHandle;
}
