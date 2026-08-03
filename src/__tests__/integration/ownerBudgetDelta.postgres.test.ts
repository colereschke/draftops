import { getPrisma, disconnectPrisma } from '@/lib/db';
import { getTradeBudgetDeltaByTeamId } from '@/lib/tradeBudget';

const ownerId = `owner-delta-${Date.now()}`;

describe('owner budget delta available for the value sheet', () => {
  let draftId: number;

  afterAll(async () => {
    // `Draft.ownerTeamId` FKs to `Team` with `onDelete: Restrict` — this test sets it (line below),
    // so it must be nulled before the team can be deleted. Use `$transaction([...])` (the array
    // form), not `Promise.all` — `bidRecovery.postgres.test.ts:59-67`,
    // `draft-integrity.postgres.test.ts:71-79`, and `draft-creation.postgres.test.ts:110-118` all
    // use this exact pattern because it runs its operations *sequentially* within one transaction;
    // `Promise.all` fires both queries concurrently with no ordering guarantee across pool
    // connections, so the team delete could reach Postgres before the ownerTeamId nulling commits
    // and hit the FK restriction anyway.
    // Guard `draftId === undefined` (the `it` block throwing before assignment) — a `deleteMany`
    // `where` with an `undefined` field means "no filter on this field," which would otherwise
    // delete every trade/team row in the database instead of just this test's rows.
    if (draftId === undefined) {
      await disconnectPrisma();
      return;
    }
    await getPrisma().$transaction([
      getPrisma().trade.deleteMany({ where: { draftId } }),
      getPrisma().draft.update({ where: { id: draftId }, data: { ownerTeamId: null } }),
      getPrisma().team.deleteMany({ where: { draftId } }),
      getPrisma().draft.delete({ where: { id: draftId } }),
    ]);
    await disconnectPrisma();
  });

  it('computes the owner team net delta from a logged trade', async () => {
    const draft = await getPrisma().draft.create({
      data: { name: 'Owner delta', ownerId, budget: 1000, rosterSize: 2, teamCount: 2 },
    });
    draftId = draft.id;
    const [ownerTeam, otherTeam] = await Promise.all([
      getPrisma().team.create({ data: { handle: `owner-${draft.id}`, budget: 1000, draftId } }),
      getPrisma().team.create({ data: { handle: `other-${draft.id}`, budget: 1000, draftId } }),
    ]);
    await getPrisma().draft.update({ where: { id: draftId }, data: { ownerTeamId: ownerTeam.id } });
    await getPrisma().trade.create({
      data: { draftId, budgetTeamId: otherTeam.id, pickTeamId: ownerTeam.id, budgetAmount: 80 },
    });

    const deltaByTeamId = await getTradeBudgetDeltaByTeamId(getPrisma(), draftId);
    expect(deltaByTeamId.get(ownerTeam.id)).toBe(80);
  });
});
