import { z } from 'zod';
import type { ScoringSettings, StartingSlot } from '@/types';

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 32;
export const MAX_BUDGET = 1_000_000;
export const MAX_ROSTER_SIZE = 100;
export const MAX_HANDLE_LENGTH = 40;
export const MAX_DISPLAY_NAME_LENGTH = 60;
export const MAX_DRAFT_NAME_LENGTH = 100;
export const MAX_SLEEPER_ROSTER_ID = 1_000_000;
export const MIN_SLEEPER_LEAGUE_ID_LENGTH = 5;
export const MAX_SLEEPER_LEAGUE_ID_LENGTH = 25;

const STARTING_SLOTS = [
  'QB',
  'RB',
  'WR',
  'TE',
  'FLEX',
  'SUPER_FLEX',
] as const satisfies readonly StartingSlot[];

// Compile-time exhaustiveness check: STARTING_SLOTS must contain exactly the members of the
// StartingSlot union in src/types/index.ts — no more, no fewer. The `satisfies` clause above
// only rejects extra/bogus entries; this checks the reverse direction (a missing variant) by
// asserting the union of array elements is *equal to* (not just assignable from) StartingSlot.
type AssertExactUnion<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function assertUnionMatches<T extends true>(_check?: T): void {}
assertUnionMatches<AssertExactUnion<(typeof STARTING_SLOTS)[number], StartingSlot>>();

const SCORING_BONUS_RANGE = { min: -20, max: 20 } as const;
const PPR_RANGE = { min: 0, max: 5 } as const;

const scoringSettingsSchema = z.object({
  passYdsPerPoint: z.number().finite().gt(0).lte(200),
  passTD: z.number().finite().min(SCORING_BONUS_RANGE.min).max(SCORING_BONUS_RANGE.max),
  passInt: z.number().finite().min(SCORING_BONUS_RANGE.min).max(SCORING_BONUS_RANGE.max),
  rushAtt: z.number().finite().min(SCORING_BONUS_RANGE.min).max(SCORING_BONUS_RANGE.max),
  rushFD: z.number().finite().min(SCORING_BONUS_RANGE.min).max(SCORING_BONUS_RANGE.max),
  pprRB: z.number().finite().min(PPR_RANGE.min).max(PPR_RANGE.max),
  pprWR: z.number().finite().min(PPR_RANGE.min).max(PPR_RANGE.max),
  pprTE: z.number().finite().min(PPR_RANGE.min).max(PPR_RANGE.max),
  recFD: z.number().finite().min(SCORING_BONUS_RANGE.min).max(SCORING_BONUS_RANGE.max),
  rbFDBonus: z.number().finite().min(SCORING_BONUS_RANGE.min).max(SCORING_BONUS_RANGE.max),
  wrFDBonus: z.number().finite().min(SCORING_BONUS_RANGE.min).max(SCORING_BONUS_RANGE.max),
  teFDBonus: z.number().finite().min(SCORING_BONUS_RANGE.min).max(SCORING_BONUS_RANGE.max),
}) satisfies z.ZodType<ScoringSettings>;

const targetRosterSchema = z
  .object({
    QB: z.number().int().min(0).max(MAX_ROSTER_SIZE).optional(),
    RB: z.number().int().min(0).max(MAX_ROSTER_SIZE).optional(),
    WR: z.number().int().min(0).max(MAX_ROSTER_SIZE).optional(),
    TE: z.number().int().min(0).max(MAX_ROSTER_SIZE).optional(),
  })
  .strict();

const teamInputSchema = z.object({
  handle: z.string().trim().min(1).max(MAX_HANDLE_LENGTH),
  displayName: z.string().trim().max(MAX_DISPLAY_NAME_LENGTH),
  isMine: z.boolean(),
  sleeperRosterId: z.number().int().positive().max(MAX_SLEEPER_ROSTER_ID).optional(),
});

export const draftInputSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_DRAFT_NAME_LENGTH),
    budgetPerTeam: z.number().int().positive().max(MAX_BUDGET),
    rosterSize: z.number().int().positive().max(MAX_ROSTER_SIZE),
    futurePickAuctionMode: z.enum(['packages', 'individual', 'none']),
    targetRoster: targetRosterSchema,
    startingLineup: z.array(z.enum(STARTING_SLOTS)).min(1),
    scoringSettings: scoringSettingsSchema,
    teams: z.array(teamInputSchema).min(MIN_TEAMS).max(MAX_TEAMS),
    playerSource: z.enum(['etr', 'custom']).optional(),
    sleeperLeagueId: z
      .string()
      .regex(/^\d+$/)
      .min(MIN_SLEEPER_LEAGUE_ID_LENGTH)
      .max(MAX_SLEEPER_LEAGUE_ID_LENGTH)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.startingLineup.length > value.rosterSize) {
      ctx.addIssue({
        code: 'custom',
        path: ['startingLineup'],
        message: 'Starting lineup cannot be longer than the roster size.',
      });
    }
    if (!value.startingLineup.some((slot) => slot === 'QB' || slot === 'SUPER_FLEX')) {
      ctx.addIssue({
        code: 'custom',
        path: ['startingLineup'],
        message: 'Starting lineup must include at least one QB or SUPER_FLEX slot.',
      });
    }

    const mineCount = value.teams.filter((team) => team.isMine).length;
    if (mineCount !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['teams'],
        message:
          mineCount === 0
            ? 'One team must be marked as mine.'
            : 'Only one team can be marked as mine.',
      });
    }

    const lowerHandles = value.teams.map((team) => team.handle.toLowerCase());
    if (new Set(lowerHandles).size !== lowerHandles.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['teams'],
        message: 'Team handles must be unique.',
      });
    }

    const rosterIds = value.teams
      .map((team) => team.sleeperRosterId)
      .filter((id): id is number => id !== undefined);
    if (new Set(rosterIds).size !== rosterIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['teams'],
        message: 'Sleeper roster IDs must be unique among submitted teams.',
      });
    }
  });

export type DraftInput = z.infer<typeof draftInputSchema>;
