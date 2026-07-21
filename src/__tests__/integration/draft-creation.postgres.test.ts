import { disconnectPrisma, getPrisma } from '@/lib/db';
import { createDraft } from '@/lib/actions';
import { players as BASE_PLAYERS } from '@/data/players';
import { normalizeName } from '@/lib/sleeperNormalize';
import type { StartingSlot } from '@/types';

jest.mock('@/auth', () => ({ auth: () => Promise.resolve(mockSession) }));

const ownerId = `integration-owner-${Date.now()}`;
const mockSession = { user: { id: ownerId, name: 'Integration Owner' } };
const FIXTURE_PREFIX = `draft-creation-integration-${process.pid}`;

interface ProjectionFixture {
  sleeperPlayerId: string;
  projectionSourceId: number;
}

async function seedProjectionFixture(): Promise<ProjectionFixture> {
  const anchorPlayer = BASE_PLAYERS[0]; // Drake Maye / NE / QB
  const sleeperPlayer = await getPrisma().sleeperPlayer.create({
    data: {
      id: `${FIXTURE_PREFIX}-sleeper`,
      name: anchorPlayer.player,
      normalizedName: normalizeName(anchorPlayer.player),
      team: anchorPlayer.team,
      pos: anchorPlayer.pos,
    },
  });
  const projectionSource = await getPrisma().projectionSource.create({
    data: {
      name: FIXTURE_PREFIX,
      season: 2026,
      projectionDate: new Date('2026-07-01T00:00:00.000Z'),
    },
  });
  await getPrisma().playerProjection.create({
    data: {
      sleeperId: sleeperPlayer.id,
      position: 'QB',
      games: 17,
      passAtt: 550,
      passCmp: 360,
      passYds: 4000,
      passTd: 28,
      passInt: 10,
      passSacks: 30,
      rushAtt: 70,
      rushYds: 350,
      rushTd: 4,
      targets: 0,
      receptions: 0,
      recYds: 0,
      recTd: 0,
      baseFantasyPoints: 276,
      projectionSourceId: projectionSource.id,
    },
  });
  return { sleeperPlayerId: sleeperPlayer.id, projectionSourceId: projectionSource.id };
}

async function deleteProjectionFixture(fixture: ProjectionFixture): Promise<void> {
  await getPrisma().playerProjection.deleteMany({ where: { sleeperId: fixture.sleeperPlayerId } });
  await getPrisma().projectionSource.delete({ where: { id: fixture.projectionSourceId } });
  await getPrisma().sleeperPlayer.delete({ where: { id: fixture.sleeperPlayerId } });
}

const VALID_INPUT = {
  name: `Integration Draft ${Date.now()}`,
  budgetPerTeam: 1000,
  rosterSize: 30,
  futurePickAuctionMode: 'packages' as const,
  targetRoster: { QB: 4, RB: 9, WR: 11, TE: 3 },
  startingLineup: [
    'QB',
    'RB',
    'RB',
    'WR',
    'WR',
    'TE',
    'FLEX',
    'FLEX',
    'FLEX',
    'SUPER_FLEX',
  ] as StartingSlot[],
  scoringSettings: {
    passYdsPerPoint: 25,
    passTD: 4,
    passInt: -2,
    rushAtt: 0,
    rushFD: 0,
    pprRB: 1,
    pprWR: 1,
    pprTE: 1,
    recFD: 0,
    rbFDBonus: 0,
    wrFDBonus: 0,
    teFDBonus: 0,
  },
  teams: [
    { handle: `first-${Date.now()}`, displayName: 'First', isMine: true },
    { handle: `second-${Date.now()}`, displayName: 'Second', isMine: false },
  ],
};

async function deleteDraftFixture(draftId: number): Promise<void> {
  await getPrisma().$transaction([
    getPrisma().draft.update({
      where: { id: draftId },
      data: { activeProjectionValueSetId: null },
    }),
    getPrisma().draftPlayerValue.deleteMany({ where: { draftId } }),
    getPrisma().draftProjectionValueSet.deleteMany({ where: { draftId } }),
    getPrisma().player.deleteMany({ where: { draftId } }),
    getPrisma().onboardingProgress.deleteMany({ where: { draftId } }),
    getPrisma().draft.update({ where: { id: draftId }, data: { ownerTeamId: null } }),
    getPrisma().team.deleteMany({ where: { draftId } }),
    getPrisma().draft.delete({ where: { id: draftId } }),
  ]);
}

describe('draft creation against PostgreSQL', () => {
  const createdDraftIds: number[] = [];
  let projectionFixture: ProjectionFixture;

  beforeAll(async () => {
    projectionFixture = await seedProjectionFixture();
  });

  afterEach(async () => {
    while (createdDraftIds.length > 0) {
      const id = createdDraftIds.pop()!;
      await deleteDraftFixture(id);
    }
  });

  afterAll(async () => {
    await deleteProjectionFixture(projectionFixture);
    await disconnectPrisma();
  });

  it('completes within the transaction timeout under injected write-path latency', async () => {
    await getPrisma().$executeRawUnsafe(`
      CREATE FUNCTION integration_slow_player_insert() RETURNS trigger AS $$
      BEGIN
        PERFORM pg_sleep(2);
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER integration_slow_player_insert
      AFTER INSERT ON "Player"
      FOR EACH STATEMENT EXECUTE FUNCTION integration_slow_player_insert();
    `);

    try {
      const start = Date.now();
      const result = await createDraft({
        ...VALID_INPUT,
        name: `Latency Test ${Date.now()}`,
      });
      const elapsedMs = Date.now() - start;

      expect(result.ok).toBe(true);
      if (result.ok) {
        createdDraftIds.push(result.data.draftId);
        expect(elapsedMs).toBeLessThan(15_000);

        const [draft, teams, playerCount] = await Promise.all([
          getPrisma().draft.findUnique({ where: { id: result.data.draftId } }),
          getPrisma().team.findMany({ where: { draftId: result.data.draftId } }),
          getPrisma().player.count({ where: { draftId: result.data.draftId } }),
        ]);
        expect(draft).not.toBeNull();
        expect(teams).toHaveLength(2);
        expect(playerCount).toBeGreaterThan(BASE_PLAYERS.length);
        if (!draft?.activeProjectionValueSetId) {
          throw new Error('Draft creation did not activate its projection value set');
        }
        await expect(
          getPrisma().draftProjectionValueSet.findUnique({
            where: { id: draft.activeProjectionValueSetId },
            select: { status: true, expectedPlayerCount: true },
          }),
        ).resolves.toEqual({ status: 'ACTIVE', expectedPlayerCount: 1 });
      }
    } finally {
      await getPrisma().$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS integration_slow_player_insert ON "Player";
        DROP FUNCTION IF EXISTS integration_slow_player_insert();
      `);
    }
  }, 20_000);

  // Relies on the OnboardingProgress insert being the transaction's last write stage, which
  // only holds for a fresh owner (ownerDraftCount === 0) — see createDraft's onboarding
  // transition logic in actions.ts. If a later write stage is ever added after that insert,
  // this trigger point would need to move with it.
  it('leaves no partial draft when the last write stage fails', async () => {
    await getPrisma().$executeRawUnsafe(`
      CREATE FUNCTION integration_fail_onboarding_insert() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced onboarding failure';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER integration_fail_onboarding_insert
      BEFORE INSERT ON "OnboardingProgress"
      FOR EACH ROW EXECUTE FUNCTION integration_fail_onboarding_insert();
    `);

    const draftName = `All Or Nothing Test ${Date.now()}`;
    try {
      await expect(createDraft({ ...VALID_INPUT, name: draftName })).rejects.toThrow(
        'forced onboarding failure',
      );

      const orphanedDraft = await getPrisma().draft.findFirst({ where: { name: draftName } });
      expect(orphanedDraft).toBeNull();
    } finally {
      await getPrisma().$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS integration_fail_onboarding_insert ON "OnboardingProgress";
        DROP FUNCTION IF EXISTS integration_fail_onboarding_insert();
      `);
    }
  }, 20_000);
});
