import { getPrisma, disconnectPrisma } from '@/lib/db';
import { computeDraftTeamStats } from '@/lib/computeDraftTeamStats';
import { getTradeBudgetDeltaByTeamId } from '@/lib/tradeBudget';

const ownerId = `trade-delta-owner-${Date.now()}`;

describe('trade budget delta reaches computeDraftTeamStats', () => {
  let draftId: number;
  let teamAId: number;
  let teamBId: number;

  afterAll(async () => {
    // If the `it` block throws before `draftId` is assigned, `draftId` stays `undefined` — and
    // Prisma treats a `where` field set to `undefined` as "no filter on this field", which would
    // turn `deleteMany({ where: { draftId } })` into "delete every trade/team row in the database."
    // Guard against that instead of trusting the assignment always happened.
    if (draftId === undefined) {
      await disconnectPrisma();
      return;
    }
    await getPrisma().trade.deleteMany({ where: { draftId } });
    await getPrisma().team.deleteMany({ where: { draftId } });
    await getPrisma().draft.delete({ where: { id: draftId } });
    await disconnectPrisma();
  });

  it('reflects a logged trade in remaining budget', async () => {
    const draft = await getPrisma().draft.create({
      data: { name: 'Delta wiring', ownerId, budget: 1000, rosterSize: 2, teamCount: 2 },
    });
    draftId = draft.id;
    const [teamA, teamB] = await Promise.all([
      getPrisma().team.create({ data: { handle: `a-${draft.id}`, budget: 1000, draftId } }),
      getPrisma().team.create({ data: { handle: `b-${draft.id}`, budget: 1000, draftId } }),
    ]);
    teamAId = teamA.id;
    teamBId = teamB.id;
    await getPrisma().trade.create({
      data: { draftId, budgetTeamId: teamAId, pickTeamId: teamBId, budgetAmount: 80 },
    });

    const deltaByTeamId = await getTradeBudgetDeltaByTeamId(getPrisma(), draftId);
    const stats = computeDraftTeamStats({
      teams: [
        { id: teamAId, handle: `a-${draft.id}`, displayName: null, budget: 1000, results: [] },
        { id: teamBId, handle: `b-${draft.id}`, displayName: null, budget: 1000, results: [] },
      ],
      players: [],
      rosterSize: 2,
      budgetDeltaByTeamId: deltaByTeamId,
    });

    expect(stats.find((t) => t.id === teamAId)?.remaining).toBe(920);
    expect(stats.find((t) => t.id === teamBId)?.remaining).toBe(1080);
  });
});
