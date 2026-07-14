# Multi-Draft Schema + Route Scoping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Draft` model that owns all existing data, scope every DB read/write to a `draftId`, and replace the hardcoded `'coreschke'` handle with the draft's `ownerTeamId` — four incremental PRs using an expand/contract migration so the app stays functional at every merge.

**Architecture:** Expand (additive schema + no behavior change) → Backfill (stamp existing rows) → Wire (plumb `draftId` through all routes, actions, and components) → Contract (non-nullable draftId, composite uniques). Each PR merges independently. All routes are already auth-protected via JWT sessions; `session.user.id` is the Discord userId and becomes the `ownerId` on Draft.

**Tech Stack:** Next.js 16 App Router, Prisma 7 + PostgreSQL (Neon), Auth.js v5 JWT sessions, pnpm 11, Jest + React Testing Library.

## Global Constraints

- pnpm only — never npm or yarn
- After any schema change: `pnpm prisma migrate dev --name <description>`
- `make check` must pass before every commit (typecheck + lint + format + test)
- No explicit `any` — TypeScript strict mode
- Single quotes, trailing commas, 100 char line width (Prettier)
- No author attribution in commit messages

---

## File Map

**Created:**

- `prisma/scripts/backfill-draft.ts` — one-time script: create default Draft (ownerId from `OWNER_DISCORD_ID` env), stamp draftId on all rows
- `src/lib/draft.ts` — `getDraftForUser(userId)`: look up a Draft by Discord userId; no auto-claim
- `src/__tests__/lib/draft.test.ts` — unit tests for `getDraftForUser`
- `src/__tests__/scripts/backfill-draft.test.ts` — unit tests for backfill logic

**Modified (schema):**

- `prisma/schema.prisma` — 3.1: add Draft model + nullable draftId FKs; 3.4: non-nullable + composite uniques

**Modified (application):**

- `src/lib/actions.ts` — pass draftId in logBid create; scope nominatedPlayer.deleteMany; ownership-safe updateBid/deleteBid via updateMany/deleteMany with {id, draftId}
- `src/app/api/nomination-data/route.ts` — scope to draftId, return `ownerHandle`
- `src/app/api/watchlist/route.ts` — scope findMany to draftId; composite where in 3.4
- `src/app/api/nominated/route.ts` — scope findMany to draftId; composite where in 3.4
- `src/app/page.tsx` — scope queries to draftId
- `src/app/teams/page.tsx` — scope query to draftId
- `src/app/budget/page.tsx` — scope query to draftId
- `src/components/NominationHelper/NominationHelper.tsx` — remove hardcoded `MY_HANDLE`; use `data.ownerHandle`
- `prisma/seed.ts` — seed a default Draft alongside teams

**Modified (tests):**

- `src/__tests__/actions.test.ts` — verify draftId is passed through logBid
- `src/__tests__/api/nomination-data.test.ts` — verify ownerHandle in response
- `src/__tests__/api/watchlist.test.ts` — verify draftId scoping; composite where in 3.4
- `src/__tests__/api/nominated.test.ts` — same

---

## Task 1 — PR 3.1: Expand Schema

**Goal:** Add `Draft` model and nullable `draftId` FK to all four data models. No application behavior changes. All existing tests continue to pass.

**Files:**

- Modify: `prisma/schema.prisma`
- Auto-generated: `prisma/migrations/*/`

---

- [ ] **Step 1: Replace `prisma/schema.prisma` with the expanded schema**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

// A draft is the top-level container for a single auction. One owner, all data scoped here.
model Draft {
  id          Int      @id @default(autoincrement())
  name        String
  ownerId     String?  // Auth.js userId (Discord snowflake) — nullable until claimed on first sign-in
  ownerTeamId Int?     // which Team within this draft belongs to the owner; nullable until backfill
  createdAt   DateTime @default(now())

  teams            Team[]            @relation("DraftTeams")
  ownerTeam        Team?             @relation("DraftOwnerTeam", fields: [ownerTeamId], references: [id])
  auctionResults   AuctionResult[]
  watchlistEntries PlayerWatchlist[]
  nominatedPlayers NominatedPlayer[]
}

model Team {
  id          Int             @id @default(autoincrement())
  handle      String          @unique
  displayName String?
  budget      Int             @default(1000)
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  draftId     Int?
  draft       Draft?          @relation("DraftTeams", fields: [draftId], references: [id])
  results     AuctionResult[]
  ownedByDraft Draft[]        @relation("DraftOwnerTeam")
}

model AuctionResult {
  id        Int      @id @default(autoincrement())
  player    String
  position  String
  nflTeam   String
  price     Int
  sfRank    Int?
  notes     String?
  teamId    Int
  team      Team     @relation(fields: [teamId], references: [id])
  draftId   Int?
  draft     Draft?   @relation(fields: [draftId], references: [id])
  createdAt DateTime @default(now())
}

model PlayerWatchlist {
  id         Int      @id @default(autoincrement())
  playerName String   @unique
  draftId    Int?
  draft      Draft?   @relation(fields: [draftId], references: [id])
  createdAt  DateTime @default(now())
}

model NominatedPlayer {
  id         Int      @id @default(autoincrement())
  playerName String   @unique
  draftId    Int?
  draft      Draft?   @relation(fields: [draftId], references: [id])
  createdAt  DateTime @default(now())
}
```

- [ ] **Step 2: Run the migration**

```bash
pnpm prisma migrate dev --name add-draft-model-nullable-draftid
```

Expected: Prisma creates a new migration file and applies it. Output ends with `Your database is now in sync with your schema.`

- [ ] **Step 3: Run full quality gate — all existing tests must pass**

```bash
make check
```

Expected: All tests pass. TypeScript compiles clean. No lint errors. No behavior changed.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): expand — add Draft model with nullable draftId FKs on all models (3.1)"
```

---

## Task 2 — PR 3.2: Backfill

**Goal:** Write and run a one-time script that creates a single default `Draft` row and stamps `draftId` on every existing `Team`, `AuctionResult`, `PlayerWatchlist`, and `NominatedPlayer`. Also sets `ownerTeamId` to the existing `coreschke` team.

**Files:**

- Create: `prisma/scripts/backfill-draft.ts`
- Create: `src/__tests__/scripts/backfill-draft.test.ts`

---

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/scripts/backfill-draft.test.ts`:

```typescript
/**
 * @jest-environment node
 */
// Tests for the backfill-draft script's core logic (DB calls mocked).
// The actual script is in prisma/scripts/backfill-draft.ts.

const mockDraftCreate = jest.fn();
const mockTeamFindFirst = jest.fn();
const mockTeamUpdateMany = jest.fn();
const mockAuctionResultUpdateMany = jest.fn();
const mockPlayerWatchlistUpdateMany = jest.fn();
const mockNominatedPlayerUpdateMany = jest.fn();
const mockDraftUpdate = jest.fn();

const mockPrisma = {
  draft: { create: mockDraftCreate, update: mockDraftUpdate },
  team: { findFirst: mockTeamFindFirst, updateMany: mockTeamUpdateMany },
  auctionResult: { updateMany: mockAuctionResultUpdateMany },
  playerWatchlist: { updateMany: mockPlayerWatchlistUpdateMany },
  nominatedPlayer: { updateMany: mockNominatedPlayerUpdateMany },
};

// Import only the pure logic function — not the script entrypoint — to avoid running main()
import { runBackfill } from '../../../prisma/scripts/backfill-draft';

beforeEach(() => {
  jest.clearAllMocks();
  mockDraftCreate.mockResolvedValue({ id: 1 });
  mockTeamFindFirst.mockResolvedValue({ id: 7 }); // coreschke team id
  mockTeamUpdateMany.mockResolvedValue({ count: 12 });
  mockAuctionResultUpdateMany.mockResolvedValue({ count: 50 });
  mockPlayerWatchlistUpdateMany.mockResolvedValue({ count: 3 });
  mockNominatedPlayerUpdateMany.mockResolvedValue({ count: 0 });
  mockDraftUpdate.mockResolvedValue({});
});

describe('runBackfill', () => {
  it('creates a draft with the given name and ownerId from env', async () => {
    await runBackfill(mockPrisma as never, 'coreschke', 'discord-owner-999');
    expect(mockDraftCreate).toHaveBeenCalledWith({
      data: { name: "Cole's Draft 2025", ownerId: 'discord-owner-999', ownerTeamId: null },
    });
  });

  it('creates a draft with null ownerId when no ownerId provided', async () => {
    await runBackfill(mockPrisma as never, 'coreschke', null);
    expect(mockDraftCreate).toHaveBeenCalledWith({
      data: { name: "Cole's Draft 2025", ownerId: null, ownerTeamId: null },
    });
  });

  it('stamps draftId on all teams', async () => {
    await runBackfill(mockPrisma as never, 'coreschke', null);
    expect(mockTeamUpdateMany).toHaveBeenCalledWith({
      where: { draftId: null },
      data: { draftId: 1 },
    });
  });

  it('stamps draftId on all auction results', async () => {
    await runBackfill(mockPrisma as never, 'coreschke', null);
    expect(mockAuctionResultUpdateMany).toHaveBeenCalledWith({
      where: { draftId: null },
      data: { draftId: 1 },
    });
  });

  it('stamps draftId on all watchlist entries', async () => {
    await runBackfill(mockPrisma as never, 'coreschke', null);
    expect(mockPlayerWatchlistUpdateMany).toHaveBeenCalledWith({
      where: { draftId: null },
      data: { draftId: 1 },
    });
  });

  it('stamps draftId on all nominated players', async () => {
    await runBackfill(mockPrisma as never, 'coreschke', null);
    expect(mockNominatedPlayerUpdateMany).toHaveBeenCalledWith({
      where: { draftId: null },
      data: { draftId: 1 },
    });
  });

  it('sets ownerTeamId to the team with the given owner handle', async () => {
    await runBackfill(mockPrisma as never, 'coreschke', null);
    expect(mockTeamFindFirst).toHaveBeenCalledWith({ where: { handle: 'coreschke' } });
    expect(mockDraftUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { ownerTeamId: 7 },
    });
  });

  it('skips ownerTeamId if owner team not found', async () => {
    mockTeamFindFirst.mockResolvedValue(null);
    await runBackfill(mockPrisma as never, 'coreschke', null);
    expect(mockDraftUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm jest src/__tests__/scripts/backfill-draft.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../../../prisma/scripts/backfill-draft'`

- [ ] **Step 3: Create the backfill script**

Create `prisma/scripts/backfill-draft.ts`:

```typescript
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// PrismaClient type used by both the script and tests
type PrismaLike = {
  draft: {
    create: (args: {
      data: { name: string; ownerId: string | null; ownerTeamId: null };
    }) => Promise<{ id: number }>;
    update: (args: { where: { id: number }; data: { ownerTeamId: number } }) => Promise<unknown>;
  };
  team: {
    findFirst: (args: { where: { handle: string } }) => Promise<{ id: number } | null>;
    updateMany: (args: {
      where: { draftId: null };
      data: { draftId: number };
    }) => Promise<{ count: number }>;
  };
  auctionResult: {
    updateMany: (args: {
      where: { draftId: null };
      data: { draftId: number };
    }) => Promise<{ count: number }>;
  };
  playerWatchlist: {
    updateMany: (args: {
      where: { draftId: null };
      data: { draftId: number };
    }) => Promise<{ count: number }>;
  };
  nominatedPlayer: {
    updateMany: (args: {
      where: { draftId: null };
      data: { draftId: number };
    }) => Promise<{ count: number }>;
  };
};

// ownerDiscordId: the Discord userId that should own this draft. Pass null to leave unclaimed
// (use OWNER_DISCORD_ID env var at call time — find your ID via Discord's /api/users/@me or
// by checking the JWT token after first sign-in in dev logs).
export async function runBackfill(
  prisma: PrismaLike,
  ownerHandle: string,
  ownerDiscordId: string | null,
): Promise<void> {
  const draft = await prisma.draft.create({
    data: { name: "Cole's Draft 2025", ownerId: ownerDiscordId, ownerTeamId: null },
  });

  const [teamResult, arResult, wlResult, nomResult] = await Promise.all([
    prisma.team.updateMany({ where: { draftId: null }, data: { draftId: draft.id } }),
    prisma.auctionResult.updateMany({ where: { draftId: null }, data: { draftId: draft.id } }),
    prisma.playerWatchlist.updateMany({ where: { draftId: null }, data: { draftId: draft.id } }),
    prisma.nominatedPlayer.updateMany({ where: { draftId: null }, data: { draftId: draft.id } }),
  ]);

  console.log(
    `Stamped draftId=${draft.id} on: ${teamResult.count} teams, ` +
      `${arResult.count} auction results, ${wlResult.count} watchlist, ` +
      `${nomResult.count} nominated`,
  );
  if (ownerDiscordId) {
    console.log(`Set ownerId=${ownerDiscordId}`);
  } else {
    console.warn(
      `No OWNER_DISCORD_ID set — draft is unclaimed. Re-run after finding your Discord ID.`,
    );
  }

  const ownerTeam = await prisma.team.findFirst({ where: { handle: ownerHandle } });
  if (ownerTeam) {
    await prisma.draft.update({ where: { id: draft.id }, data: { ownerTeamId: ownerTeam.id } });
    console.log(`Set ownerTeamId=${ownerTeam.id} (handle: ${ownerHandle})`);
  } else {
    console.warn(`Owner team with handle "${ownerHandle}" not found — ownerTeamId left null`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  // Set OWNER_DISCORD_ID in .env.local to your Discord snowflake before running.
  // Find it at https://discord.com/developers/docs/resources/user (or check server logs
  // after first sign-in — the JWT sub claim is your Discord ID).
  const ownerDiscordId = process.env.OWNER_DISCORD_ID ?? null;

  try {
    await runBackfill(prisma as never, 'coreschke', ownerDiscordId);
    console.log('Backfill complete.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// Guard: only run when this file is the entrypoint, not when imported by tests
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm jest src/__tests__/scripts/backfill-draft.test.ts --no-coverage
```

Expected: All 6 tests pass.

- [ ] **Step 5: Add `OWNER_DISCORD_ID` to `.env.local`, then run the backfill**

Before running, find your Discord user ID. The easiest way: sign into the app in dev, then check the Next.js server logs — the JWT `sub` field printed during the `session` callback IS your Discord ID. Alternatively use Discord's developer mode (right-click your name → Copy User ID).

Add to `.env.local`:

```
OWNER_DISCORD_ID=<your-discord-snowflake-here>
```

Then run:

```bash
pnpm tsx prisma/scripts/backfill-draft.ts
```

Expected output (approximate):

```
Stamped draftId=1 on: 12 teams, N auction results, N watchlist, N nominated
Set ownerId=<your-discord-id>
Set ownerTeamId=<id> (handle: coreschke)
Backfill complete.
```

Verify in Prisma Studio (`make db-studio`) that the Draft row exists with your Discord ID as `ownerId`, and all existing rows have `draftId=1`.

- [ ] **Step 6: Run full quality gate**

```bash
make check
```

Expected: All tests pass. App still works — no routes changed yet.

- [ ] **Step 7: Commit**

```bash
git add prisma/scripts/backfill-draft.ts src/__tests__/scripts/backfill-draft.test.ts
git commit -m "feat(schema): backfill — create default Draft and stamp draftId on all existing rows (3.2)"
```

---

## Task 3 — PR 3.3: Wire Reads/Writes

**Goal:** Every DB query is scoped to `draftId`. The hardcoded `MY_HANDLE = 'coreschke'` in `NominationHelper` is replaced with `ownerHandle` returned from the API. All three mutations (`logBid`, `updateBid`, `deleteBid`) are ownership-safe. A new `getDraftForUser` utility looks up the draft by `session.user.id`; no auto-claim (ownerId is set at backfill/seed time via `OWNER_DISCORD_ID`).

**Files:**

- Create: `src/lib/draft.ts`
- Create: `src/__tests__/lib/draft.test.ts`
- Modify: `src/lib/actions.ts`
- Modify: `src/app/api/nomination-data/route.ts`
- Modify: `src/app/api/watchlist/route.ts`
- Modify: `src/app/api/nominated/route.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/teams/page.tsx`
- Modify: `src/app/budget/page.tsx`
- Modify: `src/components/NominationHelper/NominationHelper.tsx`
- Modify: `prisma/seed.ts`
- Modify: `src/__tests__/actions.test.ts`
- Modify: `src/__tests__/api/nomination-data.test.ts`
- Modify: `src/__tests__/api/watchlist.test.ts`
- Modify: `src/__tests__/api/nominated.test.ts`

---

### 3.3.A — `getDraftForUser` utility

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/lib/draft.test.ts`:

```typescript
const mockDraftFindFirst = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    draft: {
      findFirst: (...args: unknown[]) => mockDraftFindFirst(...args),
    },
  },
}));

import { getDraftForUser } from '@/lib/draft';

const OWNER_TEAM = { id: 7, handle: 'coreschke', displayName: 'Cole' };
const CLAIMED_DRAFT = {
  id: 1,
  name: "Cole's Draft 2025",
  ownerId: 'discord-123',
  ownerTeamId: 7,
  ownerTeam: OWNER_TEAM,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getDraftForUser', () => {
  it('returns draft owned by the userId', async () => {
    mockDraftFindFirst.mockResolvedValue(CLAIMED_DRAFT);
    const result = await getDraftForUser('discord-123');
    expect(mockDraftFindFirst).toHaveBeenCalledWith({
      where: { ownerId: 'discord-123' },
      include: { ownerTeam: true },
    });
    expect(result).toEqual(CLAIMED_DRAFT);
  });

  it('returns null when no draft found for userId', async () => {
    mockDraftFindFirst.mockResolvedValue(null);
    const result = await getDraftForUser('discord-123');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm jest src/__tests__/lib/draft.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/lib/draft'`

- [ ] **Step 3: Create `src/lib/draft.ts`**

```typescript
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export type DraftWithOwnerTeam = Prisma.DraftGetPayload<{ include: { ownerTeam: true } }>;

// Returns the draft owned by this Discord userId, or null if none.
// No auto-claim: ownerId must be set explicitly at backfill/seed time via OWNER_DISCORD_ID.
export async function getDraftForUser(userId: string): Promise<DraftWithOwnerTeam | null> {
  return prisma.draft.findFirst({
    where: { ownerId: userId },
    include: { ownerTeam: true },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm jest src/__tests__/lib/draft.test.ts --no-coverage
```

Expected: All 2 tests pass.

---

### 3.3.B — Update `src/lib/actions.ts`

- [ ] **Step 5: Update the test first**

Replace `src/__tests__/actions.test.ts` with:

```typescript
import { logBid, updateBid, deleteBid } from '@/lib/actions';

const mockCreate = jest.fn().mockResolvedValue({});
const mockUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
const mockDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
const mockNomDeleteMany = jest.fn().mockResolvedValue({});
const mockRevalidatePath = jest.fn();
const mockAuth = jest.fn();
const mockGetDraftForUser = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    auctionResult: {
      create: (...args: unknown[]) => mockCreate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
    nominatedPlayer: {
      deleteMany: (...args: unknown[]) => mockNomDeleteMany(...args),
    },
  },
}));

jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

jest.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

jest.mock('@/lib/draft', () => ({
  getDraftForUser: (...args: unknown[]) => mockGetDraftForUser(...args),
}));

const MOCK_SESSION = { user: { id: '123456789', name: 'Cole' } };
const MOCK_DRAFT = {
  id: 1,
  name: "Cole's Draft 2025",
  ownerId: '123456789',
  ownerTeamId: 7,
  ownerTeam: null,
};

const BID_DATA = {
  player: 'Josh Allen',
  position: 'QB',
  nflTeam: 'BUF',
  price: 120,
  sfRank: 1,
  teamId: 3,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockGetDraftForUser.mockResolvedValue(MOCK_DRAFT);
});

describe('logBid', () => {
  it('inserts a bid record with all fields including draftId', async () => {
    await logBid(BID_DATA);

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        player: 'Josh Allen',
        position: 'QB',
        nflTeam: 'BUF',
        price: 120,
        sfRank: 1,
        teamId: 3,
        draftId: 1,
      },
    });
  });

  it('calls revalidatePath after insert', async () => {
    await logBid(BID_DATA);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/');
  });

  it('clears nomination for the player scoped to the draft', async () => {
    await logBid(BID_DATA);
    expect(mockNomDeleteMany).toHaveBeenCalledWith({
      where: { playerName: 'Josh Allen', draftId: 1 },
    });
  });

  it('throws when called without a session', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(logBid(BID_DATA)).rejects.toThrow('Unauthorized');
  });

  it('throws when no draft found for user', async () => {
    mockGetDraftForUser.mockResolvedValue(null);
    await expect(logBid(BID_DATA)).rejects.toThrow('No draft found');
  });
});

describe('updateBid', () => {
  it('updates price and teamId scoped to the draft', async () => {
    await updateBid({ id: 5, price: 95, teamId: 2 });

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 5, draftId: 1 },
      data: { price: 95, teamId: 2 },
    });
  });

  it('calls revalidatePath after update', async () => {
    await updateBid({ id: 5, price: 95, teamId: 2 });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/');
  });

  it('throws when called without a session', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(updateBid({ id: 5, price: 95, teamId: 2 })).rejects.toThrow('Unauthorized');
  });

  it('throws when no draft found for user', async () => {
    mockGetDraftForUser.mockResolvedValue(null);
    await expect(updateBid({ id: 5, price: 95, teamId: 2 })).rejects.toThrow('No draft found');
  });
});

describe('deleteBid', () => {
  it('deletes the bid scoped to the draft', async () => {
    await deleteBid({ id: 7 });
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: 7, draftId: 1 } });
  });

  it('calls revalidatePath after delete', async () => {
    await deleteBid({ id: 7 });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/');
  });

  it('throws when called without a session', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(deleteBid({ id: 7 })).rejects.toThrow('Unauthorized');
  });

  it('throws when no draft found for user', async () => {
    mockGetDraftForUser.mockResolvedValue(null);
    await expect(deleteBid({ id: 7 })).rejects.toThrow('No draft found');
  });
});
```

- [ ] **Step 6: Run test to verify it fails (draftId not passed yet)**

```bash
pnpm jest src/__tests__/actions.test.ts --no-coverage
```

Expected: FAIL — `getDraftForUser not called` / `draftId not in create call` / `updateMany`/`deleteMany` not used

- [ ] **Step 7: Update `src/lib/actions.ts`**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraftForUser } from '@/lib/draft';

export async function logBid(data: {
  player: string;
  position: string;
  nflTeam: string;
  price: number;
  sfRank: number | null;
  teamId: number;
}): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const draft = await getDraftForUser(session.user.id);
  if (!draft) throw new Error('No draft found');

  await prisma.auctionResult.create({
    data: {
      player: data.player,
      position: data.position,
      nflTeam: data.nflTeam,
      price: data.price,
      sfRank: data.sfRank,
      teamId: data.teamId,
      draftId: draft.id,
    },
  });
  await prisma.nominatedPlayer.deleteMany({
    where: { playerName: data.player, draftId: draft.id },
  });
  revalidatePath('/');
}

export async function updateBid(data: {
  id: number;
  price: number;
  teamId: number;
}): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const draft = await getDraftForUser(session.user.id);
  if (!draft) throw new Error('No draft found');

  // updateMany with { id, draftId } prevents editing bids from other drafts
  await prisma.auctionResult.updateMany({
    where: { id: data.id, draftId: draft.id },
    data: { price: data.price, teamId: data.teamId },
  });
  revalidatePath('/');
}

export async function deleteBid(data: { id: number }): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const draft = await getDraftForUser(session.user.id);
  if (!draft) throw new Error('No draft found');

  // deleteMany with { id, draftId } prevents deleting bids from other drafts
  await prisma.auctionResult.deleteMany({ where: { id: data.id, draftId: draft.id } });
  revalidatePath('/');
}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
pnpm jest src/__tests__/actions.test.ts --no-coverage
```

Expected: All 13 tests pass.

---

### 3.3.C — Update API routes

- [ ] **Step 9: Update `nomination-data` test**

Replace `src/__tests__/api/nomination-data.test.ts` with:

```typescript
/**
 * @jest-environment node
 */
import { GET } from '@/app/api/nomination-data/route';

const mockAuth = jest.fn();
const mockGetDraftForUser = jest.fn();

jest.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

jest.mock('@/lib/draft', () => ({
  getDraftForUser: (...args: unknown[]) => mockGetDraftForUser(...args),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    team: { findMany: jest.fn().mockResolvedValue([]) },
    playerWatchlist: { findMany: jest.fn().mockResolvedValue([]) },
    nominatedPlayer: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

const MOCK_SESSION = { user: { id: '123456789', name: 'Cole' } };
const MOCK_DRAFT = {
  id: 1,
  name: "Cole's Draft 2025",
  ownerId: '123456789',
  ownerTeamId: 7,
  ownerTeam: { id: 7, handle: 'coreschke', displayName: 'Cole' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockGetDraftForUser.mockResolvedValue(MOCK_DRAFT);
});

describe('GET /api/nomination-data', () => {
  it('returns 401 without a session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when no draft found for user', async () => {
    mockGetDraftForUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns 200 with valid session and draft', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it('includes ownerHandle in the response', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.ownerHandle).toBe('coreschke');
  });

  it('returns null ownerHandle when ownerTeam is not set', async () => {
    mockGetDraftForUser.mockResolvedValue({ ...MOCK_DRAFT, ownerTeam: null });
    const res = await GET();
    const body = await res.json();
    expect(body.ownerHandle).toBeNull();
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

```bash
pnpm jest src/__tests__/api/nomination-data.test.ts --no-coverage
```

Expected: FAIL — 404 test fails (returns 200 now), ownerHandle not in response

- [ ] **Step 11: Update `src/app/api/nomination-data/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraftForUser } from '@/lib/draft';
import { ROSTER_SIZE } from '@/lib/teams';
import type { TeamStats, AuctionResultEntry } from '@/types';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const draft = await getDraftForUser(session.user.id);
  if (!draft) return NextResponse.json({ error: 'No draft found' }, { status: 404 });

  const teams = await prisma.team.findMany({
    where: { draftId: draft.id },
    include: { results: true },
  });

  const teamStats: TeamStats[] = teams.map((team) => {
    const spent = team.results.reduce((sum: number, r) => sum + r.price, 0);
    const remaining = team.budget - spent;
    const rosterCount = team.results.length;
    const rosterRemaining = ROSTER_SIZE - rosterCount;
    const buyingPower = remaining - rosterRemaining;
    const pkgCount = team.results.filter((r) => r.position === 'PKG').length;
    return {
      id: team.id,
      handle: team.handle,
      displayName: team.displayName,
      budget: team.budget,
      spent,
      remaining,
      rosterCount,
      rosterRemaining,
      buyingPower,
      pkgCount,
    };
  });

  const auctionResults: AuctionResultEntry[] = teams.flatMap((team) =>
    team.results.map((r) => ({
      id: r.id,
      player: r.player,
      position: r.position,
      nflTeam: r.nflTeam,
      price: r.price,
      sfRank: r.sfRank,
      teamId: team.id,
      teamHandle: team.handle,
      createdAt: r.createdAt,
    })),
  );

  const [watchlistEntries, nominatedEntries] = await Promise.all([
    prisma.playerWatchlist.findMany({
      where: { draftId: draft.id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.nominatedPlayer.findMany({
      where: { draftId: draft.id },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return NextResponse.json({
    teamStats,
    auctionResults,
    watchlist: watchlistEntries.map((e) => e.playerName),
    nominated: nominatedEntries.map((e) => e.playerName),
    ownerHandle: draft.ownerTeam?.handle ?? null,
  });
}
```

- [ ] **Step 12: Run test to verify it passes**

```bash
pnpm jest src/__tests__/api/nomination-data.test.ts --no-coverage
```

Expected: All 5 tests pass.

- [ ] **Step 13: Update watchlist route test**

Replace `src/__tests__/api/watchlist.test.ts` with:

```typescript
/**
 * @jest-environment node
 */
import { POST, DELETE } from '@/app/api/watchlist/route';
import { NextRequest } from 'next/server';

const mockAuth = jest.fn();
const mockGetDraftForUser = jest.fn();
const mockUpsert = jest.fn();
const mockDelete = jest.fn();
const mockFindMany = jest.fn();

jest.mock('@/auth', () => ({ auth: () => mockAuth() }));
jest.mock('@/lib/draft', () => ({
  getDraftForUser: (...args: unknown[]) => mockGetDraftForUser(...args),
}));
jest.mock('@/lib/db', () => ({
  prisma: {
    playerWatchlist: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

const MOCK_SESSION = { user: { id: '123456789', name: 'Cole' } };
const MOCK_DRAFT = {
  id: 1,
  name: "Cole's Draft 2025",
  ownerId: '123456789',
  ownerTeamId: 7,
  ownerTeam: null,
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/watchlist', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockGetDraftForUser.mockResolvedValue(MOCK_DRAFT);
  mockUpsert.mockResolvedValue({ playerName: 'Josh Allen', draftId: 1 });
});

describe('POST /api/watchlist', () => {
  it('returns 401 without session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ playerName: 'Josh Allen' }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when no draft found', async () => {
    mockGetDraftForUser.mockResolvedValue(null);
    const res = await POST(makeRequest({ playerName: 'Josh Allen' }));
    expect(res.status).toBe(404);
  });

  it('returns 400 without playerName', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('upserts watchlist entry scoped to draftId', async () => {
    await POST(makeRequest({ playerName: 'Josh Allen' }));
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { playerName: 'Josh Allen' },
      create: { playerName: 'Josh Allen', draftId: 1 },
      update: {},
    });
  });
});

describe('DELETE /api/watchlist', () => {
  it('returns 401 without session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(makeRequest({ playerName: 'Josh Allen' }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when no draft found', async () => {
    mockGetDraftForUser.mockResolvedValue(null);
    const res = await DELETE(makeRequest({ playerName: 'Josh Allen' }));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 14: Update nominated route test**

Replace `src/__tests__/api/nominated.test.ts` with:

```typescript
/**
 * @jest-environment node
 */
import { POST, DELETE } from '@/app/api/nominated/route';
import { NextRequest } from 'next/server';

const mockAuth = jest.fn();
const mockGetDraftForUser = jest.fn();
const mockUpsert = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/auth', () => ({ auth: () => mockAuth() }));
jest.mock('@/lib/draft', () => ({
  getDraftForUser: (...args: unknown[]) => mockGetDraftForUser(...args),
}));
jest.mock('@/lib/db', () => ({
  prisma: {
    nominatedPlayer: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
}));

const MOCK_SESSION = { user: { id: '123456789', name: 'Cole' } };
const MOCK_DRAFT = {
  id: 1,
  name: "Cole's Draft 2025",
  ownerId: '123456789',
  ownerTeamId: 7,
  ownerTeam: null,
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/nominated', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockGetDraftForUser.mockResolvedValue(MOCK_DRAFT);
  mockUpsert.mockResolvedValue({ playerName: 'Josh Allen', draftId: 1 });
});

describe('POST /api/nominated', () => {
  it('returns 401 without session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ playerName: 'Josh Allen' }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when no draft found', async () => {
    mockGetDraftForUser.mockResolvedValue(null);
    const res = await POST(makeRequest({ playerName: 'Josh Allen' }));
    expect(res.status).toBe(404);
  });

  it('upserts nominated entry scoped to draftId', async () => {
    await POST(makeRequest({ playerName: 'Josh Allen' }));
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { playerName: 'Josh Allen' },
      create: { playerName: 'Josh Allen', draftId: 1 },
      update: {},
    });
  });
});

describe('DELETE /api/nominated', () => {
  it('returns 401 without session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(makeRequest({ playerName: 'Josh Allen' }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when no draft found', async () => {
    mockGetDraftForUser.mockResolvedValue(null);
    const res = await DELETE(makeRequest({ playerName: 'Josh Allen' }));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 15: Run all new tests to verify they fail**

```bash
pnpm jest src/__tests__/api/watchlist.test.ts src/__tests__/api/nominated.test.ts --no-coverage
```

Expected: FAIL — 404 tests fail (no draft check), draftId not in create calls

- [ ] **Step 16: Update `src/app/api/watchlist/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraftForUser } from '@/lib/draft';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const draft = await getDraftForUser(session.user.id);
  if (!draft) return NextResponse.json({ error: 'No draft found' }, { status: 404 });

  const body = (await request.json()) as { playerName?: string };
  if (!body.playerName) {
    return NextResponse.json({ error: 'playerName required' }, { status: 400 });
  }
  const entry = await prisma.playerWatchlist.upsert({
    where: { playerName: body.playerName },
    create: { playerName: body.playerName, draftId: draft.id },
    update: {},
  });
  return NextResponse.json({ playerName: entry.playerName });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const draft = await getDraftForUser(session.user.id);
  if (!draft) return NextResponse.json({ error: 'No draft found' }, { status: 404 });

  const body = (await request.json()) as { playerName?: string };
  if (!body.playerName) {
    return NextResponse.json({ error: 'playerName required' }, { status: 400 });
  }
  try {
    await prisma.playerWatchlist.delete({ where: { playerName: body.playerName } });
  } catch (e) {
    if ((e as { code?: string }).code !== 'P2025') {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 17: Update `src/app/api/nominated/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraftForUser } from '@/lib/draft';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const draft = await getDraftForUser(session.user.id);
  if (!draft) return NextResponse.json({ error: 'No draft found' }, { status: 404 });

  const body = (await request.json()) as { playerName?: string };
  if (!body.playerName) {
    return NextResponse.json({ error: 'playerName required' }, { status: 400 });
  }
  const entry = await prisma.nominatedPlayer.upsert({
    where: { playerName: body.playerName },
    create: { playerName: body.playerName, draftId: draft.id },
    update: {},
  });
  return NextResponse.json({ playerName: entry.playerName });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const draft = await getDraftForUser(session.user.id);
  if (!draft) return NextResponse.json({ error: 'No draft found' }, { status: 404 });

  const body = (await request.json()) as { playerName?: string };
  if (!body.playerName) {
    return NextResponse.json({ error: 'playerName required' }, { status: 400 });
  }
  try {
    await prisma.nominatedPlayer.delete({ where: { playerName: body.playerName } });
  } catch (e) {
    if ((e as { code?: string }).code !== 'P2025') {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 18: Run route tests to verify they pass**

```bash
pnpm jest src/__tests__/api/ --no-coverage
```

Expected: All API route tests pass.

---

### 3.3.D — Update server pages

- [ ] **Step 19: Update `src/app/page.tsx`**

```typescript
import { prisma } from '@/lib/db';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import type { ClaimedBid, LeagueTeam } from '@/types';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getDraftForUser } from '@/lib/draft';

const NO_DRAFT_VIEW = (
  <div
    style={{
      background: '#0a0d14',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#e05050',
      fontFamily: 'var(--font-inter), sans-serif',
      fontSize: 14,
    }}
  >
    No draft found. Run <code style={{ marginLeft: 4, marginRight: 4 }}>make setup</code> and ensure{' '}
    <code>OWNER_DISCORD_ID</code> is set in <code>.env.local</code>.
  </div>
);

export default async function Home() {
  const session = await auth();
  if (!session) redirect('/sign-in');

  const draft = await getDraftForUser(session.user.id);
  if (!draft) return NO_DRAFT_VIEW;

  const [rawBids, teams, nominatedEntries] = await Promise.all([
    prisma.auctionResult.findMany({
      where: { draftId: draft.id },
      select: {
        id: true,
        player: true,
        position: true,
        price: true,
        teamId: true,
        team: { select: { handle: true } },
      },
    }),
    prisma.team.findMany({
      where: { draftId: draft.id },
      select: { id: true, handle: true, displayName: true },
      orderBy: { handle: 'asc' },
    }),
    prisma.nominatedPlayer.findMany({
      where: { draftId: draft.id },
      select: { playerName: true },
    }),
  ]);

  const claimedBids: ClaimedBid[] = rawBids.map((r) => ({
    id: r.id,
    player: r.player,
    position: r.position,
    price: r.price,
    teamId: r.teamId,
    teamHandle: r.team.handle,
  }));

  const leagueTeams: LeagueTeam[] = teams;
  const nominatedPlayers = nominatedEntries.map((e) => e.playerName);

  return (
    <AuctionSheet
      claimedBids={claimedBids}
      teams={leagueTeams}
      nominatedPlayers={nominatedPlayers}
    />
  );
}
```

- [ ] **Step 20: Update `src/app/teams/page.tsx`**

```typescript
import { prisma } from '@/lib/db';
import { computeTeamStats } from '@/lib/computeTeamStats';
import RosterTracker from '@/components/RosterTracker';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getDraftForUser } from '@/lib/draft';

export const dynamic = 'force-dynamic';

const NO_DRAFT_VIEW = (
  <div
    style={{
      background: '#0a0d14',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#e05050',
      fontFamily: 'var(--font-inter), sans-serif',
      fontSize: 14,
    }}
  >
    No draft found. Run <code style={{ marginLeft: 4, marginRight: 4 }}>make setup</code> and ensure{' '}
    <code>OWNER_DISCORD_ID</code> is set in <code>.env.local</code>.
  </div>
);

export default async function TeamsPage() {
  const session = await auth();
  if (!session) redirect('/sign-in');

  const draft = await getDraftForUser(session.user.id);
  if (!draft) return NO_DRAFT_VIEW;

  let rawTeams;
  try {
    rawTeams = await prisma.team.findMany({
      where: { draftId: draft.id },
      include: { results: true },
      orderBy: { handle: 'asc' },
    });
  } catch {
    return (
      <div
        style={{
          background: '#0a0d14',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#e05050',
          fontFamily: 'var(--font-inter), sans-serif',
          fontSize: 14,
        }}
      >
        Failed to load team data. Ensure the database is set up:{' '}
        <code style={{ marginLeft: 6, color: '#e8eaf0' }}>make setup</code>
      </div>
    );
  }

  return <RosterTracker teams={computeTeamStats(rawTeams)} />;
}
```

- [ ] **Step 21: Update `src/app/budget/page.tsx`**

```typescript
import { prisma } from '@/lib/db';
import { computeTeamStats } from '@/lib/budget';
import BudgetPressureView from '@/components/BudgetPressure';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getDraftForUser } from '@/lib/draft';

export const dynamic = 'force-dynamic';

const NO_DRAFT_VIEW = (
  <div
    style={{
      background: '#0a0d14',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#e05050',
      fontFamily: 'var(--font-inter), sans-serif',
      fontSize: 14,
    }}
  >
    No draft found. Run <code style={{ marginLeft: 4, marginRight: 4 }}>make setup</code> and ensure{' '}
    <code>OWNER_DISCORD_ID</code> is set in <code>.env.local</code>.
  </div>
);

export default async function BudgetPage() {
  const session = await auth();
  if (!session) redirect('/sign-in');

  const draft = await getDraftForUser(session.user.id);
  if (!draft) return NO_DRAFT_VIEW;

  const teams = await prisma.team.findMany({
    where: { draftId: draft.id },
    include: { results: true },
  });
  const teamStats = computeTeamStats(teams);
  return <BudgetPressureView teams={teamStats} />;
}
```

---

### 3.3.E — Update NominationHelper to remove hardcoded handle

- [ ] **Step 22: Update `NominationHelper.tsx` — remove hardcoded handle, add 404 handling**

In `src/components/NominationHelper/NominationHelper.tsx`:

1. Change the `NomData` interface to add `ownerHandle`:

```typescript
interface NomData {
  teamStats: TeamStats[];
  auctionResults: AuctionResultEntry[];
  watchlist: string[];
  nominated: string[];
  ownerHandle: string | null;
}
```

2. Remove the `const MY_HANDLE = 'coreschke';` line entirely.

3. In the `fetchData` function, add handling for 404 alongside the existing 401:

```typescript
async function fetchData() {
  try {
    const res = await fetch('/api/nomination-data');
    if (res.status === 401) {
      router.replace('/sign-in');
      return;
    }
    if (res.status === 404) {
      // No draft found for this user — show stale data or wait
      return;
    }
    if (res.ok) setData(await res.json());
  } catch {
    // silent — show stale data
  }
}
```

4. In the `addToWatchlist`, `removeFromWatchlist`, `nominatePlayer`, `unNominatePlayer` handlers, add `res.status === 404` alongside the existing `res.status === 401` check. Example for `addToWatchlist`:

```typescript
if (res.status === 401 || res.status === 404) {
  router.replace('/sign-in');
  return;
}
```

5. Change the `computeNominationScores` call to use `data.ownerHandle ?? ''`:

```typescript
const scored = useMemo<ScoredPlayer[]>(() => {
  if (!data) return [];
  return computeNominationScores(
    players,
    data.teamStats,
    data.auctionResults,
    data.watchlist,
    data.nominated,
    data.ownerHandle ?? '',
  );
}, [data]);
```

(The `??''` fallback means if ownerHandle is null, all teams are treated as rivals — slightly over-counts demand but doesn't crash. This is only possible if backfill failed to set ownerTeamId.)

- [ ] **Step 23: Run the full test suite to verify nothing broke**

```bash
make check
```

Expected: All tests pass, TypeScript compiles, no lint errors.

---

### 3.3.F — Update seed to create a default draft

- [ ] **Step 24: Update `prisma/seed.ts`**

```typescript
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { LEAGUE_TEAMS } from '../src/lib/teams';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding default draft...');
  let draft = await prisma.draft.findFirst({ where: { name: "Cole's Draft 2025" } });
  if (!draft) {
    draft = await prisma.draft.create({
      data: { name: "Cole's Draft 2025", ownerId: null, ownerTeamId: null },
    });
  }

  console.log('Seeding teams...');
  await Promise.all(
    LEAGUE_TEAMS.map((team) =>
      prisma.team.upsert({
        where: { handle: team.handle },
        update: {},
        create: {
          handle: team.handle,
          displayName: team.displayName,
          budget: 1000,
          draftId: draft.id,
        },
      }),
    ),
  );

  // Set ownerTeamId if not already set
  if (!draft.ownerTeamId) {
    const ownerTeam = await prisma.team.findFirst({ where: { handle: 'coreschke' } });
    if (ownerTeam) {
      await prisma.draft.update({ where: { id: draft.id }, data: { ownerTeamId: ownerTeam.id } });
    }
  }

  console.log('Done.');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
```

- [ ] **Step 25: Run full quality gate**

```bash
make check
```

Expected: All tests pass.

- [ ] **Step 26: Commit PR 3.3 (can be one commit or split by sub-section)**

```bash
git add src/lib/draft.ts src/__tests__/lib/draft.test.ts \
        src/__tests__/scripts/backfill-draft.test.ts \
        src/lib/actions.ts src/__tests__/actions.test.ts \
        src/app/api/nomination-data/route.ts src/__tests__/api/nomination-data.test.ts \
        src/app/api/watchlist/route.ts src/__tests__/api/watchlist.test.ts \
        src/app/api/nominated/route.ts src/__tests__/api/nominated.test.ts \
        src/app/page.tsx src/app/teams/page.tsx src/app/budget/page.tsx \
        src/components/NominationHelper/NominationHelper.tsx \
        prisma/seed.ts
git commit -m "feat(schema): wire — scope all DB reads/writes to draftId; replace hardcoded MY_HANDLE (3.3)"
```

---

## Task 4 — PR 3.4: Contract

**Goal:** Make `draftId` non-nullable on all models. Replace per-field `@unique` with composite `@@unique([field, draftId])` on `Team.handle`, `PlayerWatchlist.playerName`, `NominatedPlayer.playerName`. Update all upsert call sites to use the new Prisma-generated composite where keys.

**Files:**

- Modify: `prisma/schema.prisma`
- Modify: `src/app/api/watchlist/route.ts`
- Modify: `src/app/api/nominated/route.ts`
- Modify: `prisma/seed.ts`
- Modify: `src/__tests__/api/watchlist.test.ts`
- Modify: `src/__tests__/api/nominated.test.ts`

---

- [ ] **Step 1: Update `prisma/schema.prisma` — non-nullable draftId and composite uniques**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model Draft {
  id          Int      @id @default(autoincrement())
  name        String
  ownerId     String?
  ownerTeamId Int?
  createdAt   DateTime @default(now())

  teams            Team[]            @relation("DraftTeams")
  ownerTeam        Team?             @relation("DraftOwnerTeam", fields: [ownerTeamId], references: [id])
  auctionResults   AuctionResult[]
  watchlistEntries PlayerWatchlist[]
  nominatedPlayers NominatedPlayer[]
}

model Team {
  id          Int             @id @default(autoincrement())
  handle      String
  displayName String?
  budget      Int             @default(1000)
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  draftId     Int
  draft       Draft           @relation("DraftTeams", fields: [draftId], references: [id])
  results     AuctionResult[]
  ownedByDraft Draft[]        @relation("DraftOwnerTeam")

  @@unique([handle, draftId])
}

model AuctionResult {
  id        Int      @id @default(autoincrement())
  player    String
  position  String
  nflTeam   String
  price     Int
  sfRank    Int?
  notes     String?
  teamId    Int
  team      Team     @relation(fields: [teamId], references: [id])
  draftId   Int
  draft     Draft    @relation(fields: [draftId], references: [id])
  createdAt DateTime @default(now())
}

model PlayerWatchlist {
  id         Int      @id @default(autoincrement())
  playerName String
  draftId    Int
  draft      Draft    @relation(fields: [draftId], references: [id])
  createdAt  DateTime @default(now())

  @@unique([playerName, draftId])
}

model NominatedPlayer {
  id         Int      @id @default(autoincrement())
  playerName String
  draftId    Int
  draft      Draft    @relation(fields: [draftId], references: [id])
  createdAt  DateTime @default(now())

  @@unique([playerName, draftId])
}
```

- [ ] **Step 2: Run the migration**

```bash
pnpm prisma migrate dev --name contract-draftid-non-nullable-composite-uniques
```

Expected: Prisma applies the migration — drops the single-field `@unique` constraints and adds composite ones, makes draftId non-nullable. Output ends with `Your database is now in sync with your schema.`

- [ ] **Step 3: Regenerate Prisma client and run typecheck to find broken upsert call sites**

```bash
pnpm tsc --noEmit 2>&1 | grep -E "error|where"
```

Expected: TypeScript errors on the `upsert` calls in watchlist and nominated routes — the `where` clause type no longer accepts `{ playerName: string }` alone; it now expects `{ playerName_draftId: { playerName: string; draftId: number } }`. The seed's `where: { handle: string }` on Team upsert will also error.

- [ ] **Step 4: Update watchlist test to reflect new composite where**

In `src/__tests__/api/watchlist.test.ts`, update the upsert assertion:

```typescript
it('upserts watchlist entry scoped to draftId', async () => {
  await POST(makeRequest({ playerName: 'Josh Allen' }));
  expect(mockUpsert).toHaveBeenCalledWith({
    where: { playerName_draftId: { playerName: 'Josh Allen', draftId: 1 } },
    create: { playerName: 'Josh Allen', draftId: 1 },
    update: {},
  });
});
```

- [ ] **Step 5: Update nominated test to reflect new composite where**

In `src/__tests__/api/nominated.test.ts`, update the upsert assertion:

```typescript
it('upserts nominated entry scoped to draftId', async () => {
  await POST(makeRequest({ playerName: 'Josh Allen' }));
  expect(mockUpsert).toHaveBeenCalledWith({
    where: { playerName_draftId: { playerName: 'Josh Allen', draftId: 1 } },
    create: { playerName: 'Josh Allen', draftId: 1 },
    update: {},
  });
});
```

- [ ] **Step 6: Update `src/app/api/watchlist/route.ts` — composite where**

Change the upsert in the `POST` handler:

```typescript
const entry = await prisma.playerWatchlist.upsert({
  where: { playerName_draftId: { playerName: body.playerName, draftId: draft.id } },
  create: { playerName: body.playerName, draftId: draft.id },
  update: {},
});
```

Change the delete to also use the composite where (safer than just playerName in a multi-draft world):

```typescript
await prisma.playerWatchlist.delete({
  where: { playerName_draftId: { playerName: body.playerName, draftId: draft.id } },
});
```

- [ ] **Step 7: Update `src/app/api/nominated/route.ts` — composite where**

Change the upsert in the `POST` handler:

```typescript
const entry = await prisma.nominatedPlayer.upsert({
  where: { playerName_draftId: { playerName: body.playerName, draftId: draft.id } },
  create: { playerName: body.playerName, draftId: draft.id },
  update: {},
});
```

Change the delete:

```typescript
await prisma.nominatedPlayer.delete({
  where: { playerName_draftId: { playerName: body.playerName, draftId: draft.id } },
});
```

- [ ] **Step 8: Update `prisma/seed.ts` — composite where for Team upsert**

The Team upsert `where: { handle: team.handle }` must change to the composite key:

```typescript
await Promise.all(
  LEAGUE_TEAMS.map((team) =>
    prisma.team.upsert({
      where: { handle_draftId: { handle: team.handle, draftId: draft.id } },
      update: {},
      create: {
        handle: team.handle,
        displayName: team.displayName,
        budget: 1000,
        draftId: draft.id,
      },
    }),
  ),
);
```

- [ ] **Step 9: Run the full quality gate**

```bash
make check
```

Expected: All tests pass, TypeScript compiles clean, no lint errors.

- [ ] **Step 10: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ \
        src/app/api/watchlist/route.ts src/__tests__/api/watchlist.test.ts \
        src/app/api/nominated/route.ts src/__tests__/api/nominated.test.ts \
        prisma/seed.ts
git commit -m "feat(schema): contract — draftId non-nullable, composite uniques on handle/playerName (3.4)"
```

---

## Self-Review

### Spec coverage check

| Roadmap requirement                                                              | Task                        |
| -------------------------------------------------------------------------------- | --------------------------- |
| Add `Draft` model with id, name, ownerId, ownerTeamId, createdAt                 | Task 1 Step 1               |
| Add nullable draftId FK to Team, AuctionResult, PlayerWatchlist, NominatedPlayer | Task 1 Step 1               |
| Ship PR 3.1 with no behavior change — existing queries ignore new columns        | Task 1: no app code changes |
| Create default draft; stamp all existing rows                                    | Task 2                      |
| Set default draft's ownerId from OWNER_DISCORD_ID env var                        | Task 2 Step 3 (runBackfill) |
| Set default draft's ownerTeamId to coreschke's team                              | Task 2 Step 3 (runBackfill) |
| Every API route reads and passes draftId                                         | Task 3                      |
| Nomination scoring reads draft.ownerTeamId instead of hardcoded handle           | Task 3 Steps 11 + 22        |
| updateBid/deleteBid scoped to draft (no IDOR)                                    | Task 3 Step 7 (actions.ts)  |
| Seed script creates a default draft for local dev                                | Task 3 Step 24              |
| Make draftId non-nullable                                                        | Task 4 Step 1               |
| Composite unique: (handle, draftId) on Team                                      | Task 4 Step 1               |
| Composite unique: (playerName, draftId) on PlayerWatchlist + NominatedPlayer     | Task 4 Step 1               |

### Placeholder scan

No TODOs, "TBDs", or "similar to Task N" found.

### Type consistency

- `DraftWithOwnerTeam` defined in `src/lib/draft.ts` and used in routes/pages — consistent
- `getDraftForUser` returns `DraftWithOwnerTeam | null` — used correctly in all routes (null-check before use)
- Prisma composite where keys: `handle_draftId`, `playerName_draftId` — matches Prisma's generated naming convention for `@@unique([a, b])` → `a_b`
- `draft.ownerTeam?.handle ?? null` in nomination-data route — matches `ownerHandle: string | null` in NomData interface
- `prisma.auctionResult.updateMany`/`deleteMany` (not `update`/`delete`) in actions.ts — consistent with test mocks which mock `updateMany`/`deleteMany`
