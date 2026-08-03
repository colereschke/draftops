import type { Prisma, PrismaClient } from '@prisma/client';
import { getGeneratedPickYear, resolveAllPickHolders } from '@/lib/pickOwnership';

type PrismaClientLike = Prisma.TransactionClient | PrismaClient;

export interface KnownPickOption {
  originTeamId: number;
  originHandle: string;
  futurePickYear: number;
  futurePickRound: 1 | 2 | 3;
}

export async function getTradeablePicksForTeam(
  client: PrismaClientLike,
  draftId: number,
  pickTeamId: number,
): Promise<KnownPickOption[]> {
  const generatedPickYear = await getGeneratedPickYear(client, draftId);
  if (generatedPickYear === null) return [];

  const [teams, resolvedPicks] = await Promise.all([
    client.team.findMany({ where: { draftId }, select: { id: true, handle: true } }),
    resolveAllPickHolders(client, draftId),
  ]);
  const teamHandleById = new Map(teams.map((team) => [team.id, team.handle]));
  const touchedHolderByKey = new Map(
    resolvedPicks
      .filter((pick) => pick.futurePickYear === generatedPickYear)
      .map((pick) => [`${pick.originTeamId}:${pick.futurePickRound}`, pick.holderTeamId]),
  );

  const options: KnownPickOption[] = [];
  for (const team of teams) {
    for (const round of [1, 2, 3] as const) {
      const holderTeamId = touchedHolderByKey.get(`${team.id}:${round}`) ?? team.id;
      if (holderTeamId !== pickTeamId) continue;
      options.push({
        originTeamId: team.id,
        originHandle: teamHandleById.get(team.id) ?? '',
        futurePickYear: generatedPickYear,
        futurePickRound: round,
      });
    }
  }
  return options;
}

export async function getTradeablePicksForAllTeams(
  client: PrismaClientLike,
  draftId: number,
): Promise<{
  generatedPickYear: number | null;
  tradeablePicksByTeamId: Record<number, KnownPickOption[]>;
}> {
  const generatedPickYear = await getGeneratedPickYear(client, draftId);
  if (generatedPickYear === null) return { generatedPickYear: null, tradeablePicksByTeamId: {} };

  const [teams, resolvedPicks] = await Promise.all([
    client.team.findMany({ where: { draftId }, select: { id: true, handle: true } }),
    resolveAllPickHolders(client, draftId),
  ]);
  const teamHandleById = new Map(teams.map((team) => [team.id, team.handle]));
  const touchedHolderByKey = new Map(
    resolvedPicks
      .filter((pick) => pick.futurePickYear === generatedPickYear)
      .map((pick) => [`${pick.originTeamId}:${pick.futurePickRound}`, pick.holderTeamId]),
  );

  const tradeablePicksByTeamId: Record<number, KnownPickOption[]> = {};
  for (const team of teams) tradeablePicksByTeamId[team.id] = [];
  for (const team of teams) {
    for (const round of [1, 2, 3] as const) {
      const holderTeamId = touchedHolderByKey.get(`${team.id}:${round}`) ?? team.id;
      tradeablePicksByTeamId[holderTeamId]?.push({
        originTeamId: team.id,
        originHandle: teamHandleById.get(team.id) ?? '',
        futurePickYear: generatedPickYear,
        futurePickRound: round,
      });
    }
  }
  return { generatedPickYear, tradeablePicksByTeamId };
}
