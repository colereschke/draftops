# Workstream A Re-Harden on playerId Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-apply Workstream A's auction-data-integrity hardening (ACTIVE-draft checks, positive-price validation, transactional duplicate handling, unique-constraint backstop, unknown/already-won player rejection) on top of `origin/main`'s current state, which has independently pivoted `AuctionResult`/`Player`/`NominatedPlayer`/`PlayerWatchlist` from name-based to `playerId`-based identity while Workstream A was being built on the old name-based model.

**Architecture:** `origin/main` already has a working, tested `playerId`-based `logBid`/routes/`AuctionSheet.tsx` — but none of Workstream A's integrity fixes (no ACTIVE check, no price validation, no transaction, no duplicate protection anywhere). Rather than reconciling two independently-written full rewrites hunk-by-hunk, this plan takes `origin/main`'s version of every conflicting file as the new baseline (Task 1), then re-applies Workstream A's hardening as fresh, additive edits on top of that baseline (Tasks 2–7) — the same hardening this repo's `main` branch of Workstream A already implemented, just re-keyed on `playerId: number` instead of `player: string`.

**Tech Stack:** Next.js 16 server actions, Prisma 7 (`@prisma/adapter-pg`), Jest.

## Global Constraints

- This plan supersedes the original `docs/superpowers/plans/2026-07-14-workstream-a-auction-data-integrity.md` for everything downstream of the merge — that plan's Tasks 1–7 are already committed on this branch (commits `a095dec`..`024bf8b`) but get superseded by Task 1 of _this_ plan, which takes `origin/main`'s version of every file those commits touched.
- `origin/main`'s `Player` model no longer has a unique constraint on `(name, draftId)` — only a non-unique `@@index([name, draftId])`. Do not resurrect any lookup keyed on `name_draftId` as a Prisma compound-unique `where` clause; it no longer exists in the generated client. All player resolution must use `id`/`draftId` (via `prisma.player.findFirst`, not `findUnique`).
- `AuctionResult.playerId` is `Int?` (nullable, `onDelete: SetNull`). `NominatedPlayer`/`PlayerWatchlist` already carry the same nullable `playerId` field with `@@unique([playerId, draftId])` — mirror that exact pattern for `AuctionResult`'s new unique constraint. Postgres unique indexes treat `NULL` as distinct from other `NULL`s, so this is safe even though some legacy rows may have `playerId: null`.
- Do not modify `src/components/AuctionSheet/AuctionSheet.tsx` beyond what the merge itself brings in — `origin/main`'s version already calls `logBid`/`updateBid`/`deleteBid` with exactly the argument shapes this plan's hardened functions expect (`{ playerId, price, teamId, draftId }` for `logBid`). No further edits to that file are needed or wanted.
- Preserve `origin/main`'s existing tested behavior in the `nominated`/`watchlist` routes' player-existence check (`{ error: 'Player not found' }`, 404) exactly as-is — do not change that message or replace that check. Only _add_ the missing already-won check on top of it.
- No new runtime dependencies. Follow the existing Prisma error-handling convention: check `(e as { code?: string }).code === 'P2002'` / `'P2025'`.
- This branch's local dev Postgres DB is shared with other concurrent worktrees. Re-check for duplicate `(playerId, draftId)` `AuctionResult` rows immediately before running the new migration (Task 3) — do not assume the planning-time check still holds, since other sessions may have inserted data since.
- This branch's HEAD carries `prisma/migrations/20260714104300_unique_auction_result_player_draft/` (from the original, now-superseded Workstream A plan — it declares `CREATE UNIQUE INDEX "AuctionResult_player_draftId_key" ON "AuctionResult"("player", "draftId")`). This migration file is **not** among Task 1's 8 conflicted files (it's a different path than anything `origin/main` touches), so a plain merge silently keeps it in the tree even though the merged `schema.prisma` (from `origin/main`) no longer declares that constraint. Left in place, this causes migration-history drift: `prisma migrate dev` would try to reconcile a folder that doesn't match the schema, and — separately — the shared dev DB's `_prisma_migrations` table already has two rows with no matching folder in either tree (`20260714104300_unique_auction_result_player_draft` and a foreign `20260714140000_drop_auction_result_name_unique` written by a different concurrent session that reacted to the first one). Task 1 removes the stray migration folder; Task 3 reconciles the DB-side history before adding the new migration. Do not defer either — Task 3's `migrate dev` will not run cleanly otherwise.

---

### Task 1: Complete the merge from `origin/main`

**Files:**

- Merge conflict resolution: `prisma/schema.prisma`, `src/__tests__/actions.test.ts`, `src/__tests__/api/nominated.test.ts`, `src/__tests__/api/watchlist.test.ts`, `src/app/api/draft/[draftId]/nominated/route.ts`, `src/app/api/draft/[draftId]/watchlist/route.ts`, `src/components/AuctionSheet/AuctionSheet.tsx`, `src/lib/actions.ts`

**Interfaces:**

- Produces: a merge commit whose tree matches `origin/main` for the 8 files above (their content fully replaces this branch's versions), while keeping every other file `origin/main` doesn't touch (e.g. `src/lib/draftMutationGuard.ts`, `src/__tests__/draftMutationGuard.test.ts`) as this branch already has them. This is the baseline Tasks 2–7 build on.

- [ ] **Step 1: Start the merge**

Run: `git merge origin/main --no-edit`
Expected: fails with `CONFLICT (content)` in exactly these 8 files (confirm via `git status --short | grep '^UU'`):

```
UU prisma/schema.prisma
UU src/__tests__/actions.test.ts
UU src/__tests__/api/nominated.test.ts
UU src/__tests__/api/watchlist.test.ts
UU src/app/api/draft/[draftId]/nominated/route.ts
UU src/app/api/draft/[draftId]/watchlist/route.ts
UU src/components/AuctionSheet/AuctionSheet.tsx
UU src/lib/actions.ts
```

If the conflicted file list differs from this (more, fewer, or different files), STOP and report BLOCKED — `origin/main` may have moved further since this plan was written, and the resolution strategy below assumes exactly this set.

- [ ] **Step 2: Resolve every conflict by taking `origin/main`'s version**

Run:

```bash
git checkout --theirs \
  prisma/schema.prisma \
  src/__tests__/actions.test.ts \
  src/__tests__/api/nominated.test.ts \
  src/__tests__/api/watchlist.test.ts \
  "src/app/api/draft/[draftId]/nominated/route.ts" \
  "src/app/api/draft/[draftId]/watchlist/route.ts" \
  src/components/AuctionSheet/AuctionSheet.tsx \
  src/lib/actions.ts
git add \
  prisma/schema.prisma \
  src/__tests__/actions.test.ts \
  src/__tests__/api/nominated.test.ts \
  src/__tests__/api/watchlist.test.ts \
  "src/app/api/draft/[draftId]/nominated/route.ts" \
  "src/app/api/draft/[draftId]/watchlist/route.ts" \
  src/components/AuctionSheet/AuctionSheet.tsx \
  src/lib/actions.ts
```

This discards this branch's name-based versions of these 8 files entirely in favor of `origin/main`'s `playerId`-based versions. That is intentional — Tasks 2–7 re-apply Workstream A's hardening on top of `origin/main`'s versions from scratch.

- [ ] **Step 3: Remove the stray name-based migration this branch's original Task 1 created**

Run:

```bash
git rm -r prisma/migrations/20260714104300_unique_auction_result_player_draft
```

Expected: removes the migration folder (`migration.sql`), staged as part of the in-progress merge. This migration declared a unique constraint on `AuctionResult(player, draftId)` that the merged `schema.prisma` (from `origin/main`) no longer has — leaving the folder in place would create migration-history drift (folder present, schema doesn't match). Task 3 adds the correct `playerId`-based migration in its place. Do this now, before committing the merge, so it lands in the same commit rather than a separate follow-up.

- [ ] **Step 4: Verify no conflict markers remain, then commit the merge**

Run: `grep -rn '^<<<<<<<\|^=======$\|^>>>>>>>' --include='*.ts' --include='*.tsx' --include='*.prisma' src prisma 2>/dev/null`
Expected: no output. If any conflict markers remain, resolve them before continuing.

Run: `git status --short | grep '^UU'`
Expected: no output (all conflicts resolved).

Run: `git commit --no-edit`
Expected: creates the merge commit, including the migration removal from Step 3.

- [ ] **Step 5: Regenerate the Prisma client and confirm the merged tree compiles**

Run: `pnpm prisma generate`
Expected: completes with no errors — the merged schema now matches `origin/main`'s (playerId-based) shape.

Run: `pnpm typecheck`
Expected: this WILL show errors — `src/lib/draftMutationGuard.ts` (untouched by the merge) still references the old `playerName: string` signature and `Player.name_draftId` lookup, and nothing calls it yet from the merged `actions.ts`/routes (Task 1 took `origin/main`'s versions, which don't import it at all). Confirm the errors are confined to `src/lib/draftMutationGuard.ts` and/or `src/__tests__/draftMutationGuard.test.ts` — if errors appear anywhere else, STOP and report BLOCKED. Task 2 fixes this.

- [ ] **Step 6: Reconcile the shared dev DB's migration history**

The shared local dev Postgres DB's `_prisma_migrations` table currently has two rows with no corresponding folder in either this branch's tree (after Step 3) or `origin/main`'s: `20260714104300_unique_auction_result_player_draft` (this branch's own, just removed from the tree) and `20260714140000_drop_auction_result_name_unique` (written directly to the shared DB by a different concurrent session, never committed to any branch). Left in place, `prisma migrate dev` in Task 3 will detect these as "migration applied to the database but not found locally" and fail or prompt interactively.

Run: `psql "postgresql://draftops:draftops@localhost/draftops" -c "SELECT migration_name FROM _prisma_migrations WHERE migration_name IN ('20260714104300_unique_auction_result_player_draft', '20260714140000_drop_auction_result_name_unique');"`
Expected: 2 rows. Confirm both names match exactly before removing anything.

Run: `psql "postgresql://draftops:draftops@localhost/draftops" -c "DELETE FROM _prisma_migrations WHERE migration_name IN ('20260714104300_unique_auction_result_player_draft', '20260714140000_drop_auction_result_name_unique');"`
Expected: `DELETE 2`. This only removes bookkeeping rows for migrations that exist in no git tree — it does not undo any schema change (both migrations' actual effects — dropping the name-based unique index — are already reflected in the DB's current structure, which matches what `origin/main`'s committed migrations produce). If you are unsure whether this is safe when you reach this step, STOP and report BLOCKED rather than deleting — this touches a DB shared with other concurrent sessions.

Run: `psql "postgresql://draftops:draftops@localhost/draftops" -c "SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 3;"`
Expected: the top row is now `20260714130000_player_identity_keys` (the latest migration that exists in `origin/main`'s committed history) — no orphaned rows above it.

- [ ] **Step 7: No commit needed for this step** — the merge commit from Step 4 is the deliverable. Step 6 only touched the shared dev DB, not any tracked file. Do not commit again until Task 2.

---

### Task 2: Re-key `draftMutationGuard.ts` on `playerId`

**Files:**

- Modify: `src/lib/draftMutationGuard.ts` (full rewrite of `requireAvailablePlayer`; add `requirePlayerNotWon`)
- Modify: `src/__tests__/draftMutationGuard.test.ts` (full rewrite)

**Interfaces:**

- Consumes: `prisma.player.findFirst({ where: { id, draftId }, select: {...} })`, `prisma.auctionResult.findFirst({ where: { playerId, draftId } })` — both already used identically by `origin/main`'s current `logBid`/routes (Task 1's merge brought those call patterns in), so this task's queries match established convention exactly.
- Produces (used by Tasks 4, 6, 7):
  - `requireActiveDraft`, `requirePositiveInteger`, `isDuplicateAuctionResultError`, `DraftMutationError` — **unchanged** from this branch's existing implementation (no edits needed to these).
  - `requireAvailablePlayer(draftId: number, playerId: number): Promise<{ id: number; name: string; pos: string; nflTeam: string; sfRank: number }>` — **signature changed** from `(draftId, playerName: string)`. Throws `DraftMutationError('Player not found in draft', 404)` or `DraftMutationError('Player already has a winning bid', 409)`.
  - `requirePlayerNotWon(draftId: number, playerId: number): Promise<void>` — **new**. Throws `DraftMutationError('Player already has a winning bid', 409)` if an `AuctionResult` already exists for that `(playerId, draftId)`. Used by the routes (Tasks 6, 7), which already have their own player-existence check from `origin/main` and just need this additional check layered on.

- [ ] **Step 1: Write the failing tests**

Replace `src/__tests__/draftMutationGuard.test.ts` in full:

```ts
import {
  DraftMutationError,
  requireActiveDraft,
  requirePositiveInteger,
  requireAvailablePlayer,
  requirePlayerNotWon,
  isDuplicateAuctionResultError,
} from '@/lib/draftMutationGuard';

const mockGetDraft = jest.fn();
const mockPlayerFindFirst = jest.fn();
const mockAuctionResultFindFirst = jest.fn();

jest.mock('@/lib/draft', () => ({
  getDraft: (...args: unknown[]) => mockGetDraft(...args),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    player: {
      findFirst: (...args: unknown[]) => mockPlayerFindFirst(...args),
    },
    auctionResult: {
      findFirst: (...args: unknown[]) => mockAuctionResultFindFirst(...args),
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('requireActiveDraft', () => {
  it('returns the draft when found and ACTIVE', async () => {
    mockGetDraft.mockResolvedValue({ id: 1, status: 'ACTIVE' });
    await expect(requireActiveDraft('user-1', 1)).resolves.toEqual({ id: 1, status: 'ACTIVE' });
  });

  it('throws a 404 DraftMutationError when no draft is found', async () => {
    mockGetDraft.mockResolvedValue(null);
    await expect(requireActiveDraft('user-1', 1)).rejects.toMatchObject({
      message: 'No draft found',
      status: 404,
    });
  });

  it('throws a 409 DraftMutationError when the draft is COMPLETE', async () => {
    mockGetDraft.mockResolvedValue({ id: 1, status: 'COMPLETE' });
    await expect(requireActiveDraft('user-1', 1)).rejects.toMatchObject({
      message: 'Draft is not active',
      status: 409,
    });
  });
});

describe('requirePositiveInteger', () => {
  it('does not throw for a positive integer', () => {
    expect(() => requirePositiveInteger(1, 'price')).not.toThrow();
  });

  it.each([0, -5, 4.5, NaN])('throws a 400 DraftMutationError for %p', (value) => {
    expect(() => requirePositiveInteger(value, 'price')).toThrow(DraftMutationError);
    try {
      requirePositiveInteger(value, 'price');
    } catch (e) {
      expect((e as DraftMutationError).status).toBe(400);
      expect((e as DraftMutationError).message).toBe('price must be a positive integer');
    }
  });
});

describe('requirePlayerNotWon', () => {
  it('does not throw when no existing result is found', async () => {
    mockAuctionResultFindFirst.mockResolvedValue(null);
    await expect(requirePlayerNotWon(1, 10)).resolves.toBeUndefined();
    expect(mockAuctionResultFindFirst).toHaveBeenCalledWith({
      where: { playerId: 10, draftId: 1 },
    });
  });

  it('throws a 409 DraftMutationError when the player already has a winning bid', async () => {
    mockAuctionResultFindFirst.mockResolvedValue({ id: 9 });
    await expect(requirePlayerNotWon(1, 10)).rejects.toMatchObject({
      message: 'Player already has a winning bid',
      status: 409,
    });
  });
});

describe('requireAvailablePlayer', () => {
  it('returns the player when found and unclaimed', async () => {
    mockPlayerFindFirst.mockResolvedValue({
      id: 10,
      name: 'Josh Allen',
      pos: 'QB',
      nflTeam: 'BUF',
      sfRank: 1,
    });
    mockAuctionResultFindFirst.mockResolvedValue(null);
    await expect(requireAvailablePlayer(1, 10)).resolves.toEqual({
      id: 10,
      name: 'Josh Allen',
      pos: 'QB',
      nflTeam: 'BUF',
      sfRank: 1,
    });
    expect(mockPlayerFindFirst).toHaveBeenCalledWith({
      where: { id: 10, draftId: 1 },
      select: { id: true, name: true, pos: true, nflTeam: true, sfRank: true },
    });
    expect(mockAuctionResultFindFirst).toHaveBeenCalledWith({
      where: { playerId: 10, draftId: 1 },
    });
  });

  it('throws a 404 DraftMutationError when the player does not exist in the draft', async () => {
    mockPlayerFindFirst.mockResolvedValue(null);
    mockAuctionResultFindFirst.mockResolvedValue(null);
    await expect(requireAvailablePlayer(1, 999)).rejects.toMatchObject({
      message: 'Player not found in draft',
      status: 404,
    });
  });

  it('throws a 409 DraftMutationError when the player already has a winning bid', async () => {
    mockPlayerFindFirst.mockResolvedValue({
      id: 10,
      name: 'Josh Allen',
      pos: 'QB',
      nflTeam: 'BUF',
      sfRank: 1,
    });
    mockAuctionResultFindFirst.mockResolvedValue({ id: 9 });
    await expect(requireAvailablePlayer(1, 10)).rejects.toMatchObject({
      message: 'Player already has a winning bid',
      status: 409,
    });
  });
});

describe('isDuplicateAuctionResultError', () => {
  it('returns true for a P2002-shaped error', () => {
    expect(isDuplicateAuctionResultError({ code: 'P2002' })).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isDuplicateAuctionResultError(new Error('boom'))).toBe(false);
    expect(isDuplicateAuctionResultError({ code: 'P2025' })).toBe(false);
    expect(isDuplicateAuctionResultError(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm jest src/__tests__/draftMutationGuard.test.ts`
Expected: FAIL — `requirePlayerNotWon` doesn't exist yet, and `requireAvailablePlayer`'s current implementation takes a `playerName: string` second argument and queries `prisma.player.findUnique({ where: { name_draftId: ... } })`, which doesn't match these tests' mocks or assertions.

- [ ] **Step 3: Rewrite the module**

Replace `src/lib/draftMutationGuard.ts` in full:

```ts
import { prisma } from '@/lib/db';
import { getDraft, type DraftWithOwnerTeam } from '@/lib/draft';

export class DraftMutationError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DraftMutationError';
    this.status = status;
  }
}

export async function requireActiveDraft(
  userId: string,
  draftId: number,
): Promise<DraftWithOwnerTeam> {
  const draft = await getDraft(userId, draftId);
  if (!draft) throw new DraftMutationError('No draft found', 404);
  if (draft.status !== 'ACTIVE') throw new DraftMutationError('Draft is not active', 409);
  return draft;
}

export function requirePositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new DraftMutationError(`${field} must be a positive integer`, 400);
  }
}

export async function requirePlayerNotWon(draftId: number, playerId: number): Promise<void> {
  const existingResult = await prisma.auctionResult.findFirst({
    where: { playerId, draftId },
  });
  if (existingResult) throw new DraftMutationError('Player already has a winning bid', 409);
}

interface AvailablePlayer {
  id: number;
  name: string;
  pos: string;
  nflTeam: string;
  sfRank: number;
}

export async function requireAvailablePlayer(
  draftId: number,
  playerId: number,
): Promise<AvailablePlayer> {
  const [player, existingResult] = await Promise.all([
    prisma.player.findFirst({
      where: { id: playerId, draftId },
      select: { id: true, name: true, pos: true, nflTeam: true, sfRank: true },
    }),
    prisma.auctionResult.findFirst({ where: { playerId, draftId } }),
  ]);
  if (!player) throw new DraftMutationError('Player not found in draft', 404);
  if (existingResult) throw new DraftMutationError('Player already has a winning bid', 409);
  return player;
}

export function isDuplicateAuctionResultError(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === 'P2002';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm jest src/__tests__/draftMutationGuard.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors in `src/lib/draftMutationGuard.ts` or its test. Errors may still remain elsewhere (Tasks 4/6/7 haven't wired this module back in yet) — confirm any remaining errors are pre-existing from Task 1's Step 4 finding, not new ones introduced here.

- [ ] **Step 6: Commit**

```bash
git add src/lib/draftMutationGuard.ts src/__tests__/draftMutationGuard.test.ts
git commit -m "fix: re-key draftMutationGuard on playerId to match origin/main's player-identity model"
```

---

### Task 3: Unique constraint on `AuctionResult(playerId, draftId)`

**Files:**

- Modify: `prisma/schema.prisma:AuctionResult` model
- Create: `prisma/migrations/20260714150000_unique_auction_result_playerid_draft/migration.sql`

**Interfaces:**

- Produces: a DB-level uniqueness guarantee on `(playerId, draftId)` that Task 4 relies on to convert a race-condition double-insert into a catchable `P2002` error.

- [ ] **Step 1: Re-check for duplicate rows immediately before migrating**

Run: `psql "postgresql://draftops:draftops@localhost/draftops" -c "SELECT \"draftId\", \"playerId\", COUNT(*) FROM \"AuctionResult\" WHERE \"playerId\" IS NOT NULL GROUP BY \"draftId\", \"playerId\" HAVING COUNT(*) > 1;"`

Expected: `(0 rows)`. If any rows are returned, STOP and report BLOCKED with the output — do not delete or repair data on your own; this is a shared dev DB with other concurrent sessions writing to it.

- [ ] **Step 2: Add the constraint to the schema**

In `prisma/schema.prisma`, change the `AuctionResult` model's closing line from `@@index([playerId])` to also add the unique constraint:

```prisma
model AuctionResult {
  id        Int      @id @default(autoincrement())
  player    String
  playerId  Int?
  playerRow Player?  @relation(fields: [playerId], references: [id], onDelete: SetNull)
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

  @@unique([playerId, draftId])
}
```

(This replaces the plain `@@index([playerId])` — a unique index also serves as an index, so the separate non-unique index is redundant once the unique constraint is added.)

- [ ] **Step 3: Generate and apply the migration**

Run: `pnpm prisma migrate dev --name unique_auction_result_playerid_draft`

If the shell is non-interactive and this fails, create the migration manually:

```bash
mkdir -p prisma/migrations/20260714150000_unique_auction_result_playerid_draft
cat > prisma/migrations/20260714150000_unique_auction_result_playerid_draft/migration.sql << 'EOF'
-- CreateIndex
DROP INDEX "AuctionResult_playerId_idx";
CREATE UNIQUE INDEX "AuctionResult_playerId_draftId_key" ON "AuctionResult"("playerId", "draftId");
EOF
pnpm prisma migrate deploy
```

Expected: migration applies successfully; the resulting index name is `AuctionResult_playerId_draftId_key` (Prisma's standard `_key` naming for a two-column `@@unique`).

- [ ] **Step 4: Verify and regenerate the client**

Run: `psql "postgresql://draftops:draftops@localhost/draftops" -c "\d \"AuctionResult\""`
Expected: `Indexes:` section shows `"AuctionResult_playerId_draftId_key" UNIQUE, btree ("playerId", "draftId")` and no longer shows the old non-unique `AuctionResult_playerId_idx`.

Run: `pnpm prisma generate`
Expected: completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "db: add unique constraint on AuctionResult(playerId, draftId)"
```

---

### Task 4: Harden `logBid` — ACTIVE draft, positive price, transactional duplicate handling

**Files:**

- Modify: `src/lib/actions.ts` (imports + `logBid`)
- Modify: `src/__tests__/actions.test.ts` (`logBid` describe block + shared mocks)

**Interfaces:**

- Consumes: `requireActiveDraft`, `requirePositiveInteger`, `requireAvailablePlayer`, `isDuplicateAuctionResultError` from `src/lib/draftMutationGuard.ts` (Task 2).
- Produces: `logBid(data: { playerId: number; price: number; teamId: number; draftId: number }): Promise<void>` — same signature `origin/main` already has (no change needed in `AuctionSheet.tsx`).

- [ ] **Step 1: Update the shared test mocks and write the failing tests**

`src/__tests__/actions.test.ts` currently (after Task 1's merge) looks like this at the top:

```ts
import { logBid, updateBid, deleteBid } from '@/lib/actions';

const mockCreate = jest.fn().mockResolvedValue({});
const mockUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
const mockDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
const mockNomDeleteMany = jest.fn().mockResolvedValue({});
const mockTeamFindFirst = jest.fn();
const mockPlayerFindFirst = jest.fn();
const mockRevalidatePath = jest.fn();
const mockAuth = jest.fn();
const mockGetDraft = jest.fn();

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
    team: {
      findFirst: (...args: unknown[]) => mockTeamFindFirst(...args),
    },
    player: {
      findFirst: (...args: unknown[]) => mockPlayerFindFirst(...args),
    },
  },
}));
```

Replace this whole mock setup, the `MOCK_DRAFT`/`BID_DATA` constants, and the `logBid` describe block with:

```ts
import { logBid, updateBid, deleteBid } from '@/lib/actions';

const mockCreate = jest.fn().mockResolvedValue({});
const mockUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
const mockDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
const mockNomDeleteMany = jest.fn().mockResolvedValue({});
const mockTeamFindFirst = jest.fn();
const mockPlayerFindFirst = jest.fn();
const mockAuctionResultFindFirst = jest.fn();
const mockRevalidatePath = jest.fn();
const mockAuth = jest.fn();
const mockGetDraft = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    auctionResult: {
      create: (...args: unknown[]) => mockCreate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      findFirst: (...args: unknown[]) => mockAuctionResultFindFirst(...args),
    },
    nominatedPlayer: {
      deleteMany: (...args: unknown[]) => mockNomDeleteMany(...args),
    },
    team: {
      findFirst: (...args: unknown[]) => mockTeamFindFirst(...args),
    },
    player: {
      findFirst: (...args: unknown[]) => mockPlayerFindFirst(...args),
    },
    $transaction: (cb: (tx: unknown) => unknown) =>
      cb({
        auctionResult: { create: mockCreate },
        nominatedPlayer: { deleteMany: mockNomDeleteMany },
      }),
  },
}));

jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

jest.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

jest.mock('@/lib/draft', () => ({
  getDraft: (...args: unknown[]) => mockGetDraft(...args),
}));

const MOCK_SESSION = { user: { id: '123456789', name: 'Cole' } };
const MOCK_DRAFT = {
  id: 1,
  name: "Cole's Draft 2025",
  ownerId: '123456789',
  ownerTeamId: 7,
  ownerTeam: null,
  status: 'ACTIVE',
};
const MOCK_COMPLETE_DRAFT = { ...MOCK_DRAFT, status: 'COMPLETE' };

const MOCK_PLAYER = { id: 10, name: 'Josh Allen', pos: 'QB', nflTeam: 'BUF', sfRank: 2 };

const BID_DATA = {
  playerId: 10,
  price: 120,
  teamId: 3,
  draftId: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockGetDraft.mockResolvedValue(MOCK_DRAFT);
  mockTeamFindFirst.mockResolvedValue({ id: 3 });
  mockPlayerFindFirst.mockResolvedValue(MOCK_PLAYER);
  mockAuctionResultFindFirst.mockResolvedValue(null);
});

describe('logBid', () => {
  it('resolves the player from the database and inserts a bid using DB-derived fields', async () => {
    await logBid(BID_DATA);
    expect(mockPlayerFindFirst).toHaveBeenCalledWith({
      where: { id: 10, draftId: 1 },
      select: { id: true, name: true, pos: true, nflTeam: true, sfRank: true },
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        player: 'Josh Allen',
        playerId: 10,
        position: 'QB',
        nflTeam: 'BUF',
        price: 120,
        sfRank: 2,
        teamId: 3,
        draftId: 1,
      },
    });
  });

  it('calls revalidatePath scoped to the draft', async () => {
    await logBid(BID_DATA);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/draft/1');
  });

  it('clears nomination for the player scoped to playerId and draftId', async () => {
    await logBid(BID_DATA);
    expect(mockNomDeleteMany).toHaveBeenCalledWith({
      where: { playerId: 10, draftId: 1 },
    });
  });

  it('throws when called without a session', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(logBid(BID_DATA)).rejects.toThrow('Unauthorized');
  });

  it('throws when no draft found for user', async () => {
    mockGetDraft.mockResolvedValue(null);
    await expect(logBid(BID_DATA)).rejects.toThrow('No draft found');
  });

  it('throws when the draft is not ACTIVE', async () => {
    mockGetDraft.mockResolvedValue(MOCK_COMPLETE_DRAFT);
    await expect(logBid(BID_DATA)).rejects.toThrow('Draft is not active');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('throws when teamId does not belong to the draft', async () => {
    mockTeamFindFirst.mockResolvedValue(null);
    await expect(logBid(BID_DATA)).rejects.toThrow('Team not found in draft');
  });

  it('throws when the player does not exist in the draft', async () => {
    mockPlayerFindFirst.mockResolvedValue(null);
    await expect(logBid(BID_DATA)).rejects.toThrow('Player not found in draft');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each([0, -5, 4.5])('rejects a non-positive/non-integer price (%p)', async (price) => {
    await expect(logBid({ ...BID_DATA, price })).rejects.toThrow(
      'price must be a positive integer',
    );
    expect(mockTeamFindFirst).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('surfaces a clear conflict error on a duplicate insert and leaves nomination state unchanged', async () => {
    mockCreate.mockRejectedValueOnce({ code: 'P2002' });
    await expect(logBid(BID_DATA)).rejects.toThrow('Player already has a winning bid');
    expect(mockNomDeleteMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm jest src/__tests__/actions.test.ts -t logBid`
Expected: FAIL — the merged `logBid` (from `origin/main`) doesn't check draft status, doesn't validate price, doesn't wrap the insert in a transaction, and calls `prisma.player.findFirst` directly instead of via `requireAvailablePlayer`.

- [ ] **Step 3: Rewrite `logBid`, `updateBid`, `deleteBid` in `src/lib/actions.ts`**

At the top of `src/lib/actions.ts`, add the import (alongside the existing imports the merge brought in — do not remove `getCustomPlayerKey` or any other existing import, only add this one):

```ts
import {
  requireActiveDraft,
  requirePositiveInteger,
  requireAvailablePlayer,
} from '@/lib/draftMutationGuard';
```

Note: `isDuplicateAuctionResultError` is also needed — add it to the same import line.

Replace the `logBid`, `updateBid`, `deleteBid` functions (leave `createDraft`, `completeDraft`, and everything else in the file untouched) with:

```ts
export async function logBid(data: {
  playerId: number;
  price: number;
  teamId: number;
  draftId: number;
}): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const draft = await requireActiveDraft(session.user.id, data.draftId);
  requirePositiveInteger(data.price, 'price');

  const [team, player] = await Promise.all([
    prisma.team.findFirst({ where: { id: data.teamId, draftId: draft.id } }),
    requireAvailablePlayer(draft.id, data.playerId),
  ]);
  if (!team) throw new Error('Team not found in draft');

  await prisma.$transaction(async (tx) => {
    try {
      await tx.auctionResult.create({
        data: {
          player: player.name,
          playerId: player.id,
          position: player.pos,
          nflTeam: player.nflTeam,
          price: data.price,
          sfRank: player.sfRank,
          teamId: data.teamId,
          draftId: draft.id,
        },
      });
    } catch (e) {
      if (isDuplicateAuctionResultError(e)) {
        throw new Error('Player already has a winning bid');
      }
      throw e;
    }
    await tx.nominatedPlayer.deleteMany({
      where: { playerId: player.id, draftId: draft.id },
    });
  });

  revalidatePath(`/draft/${data.draftId}`);
}

export async function updateBid(data: {
  id: number;
  price: number;
  teamId: number;
  draftId: number;
}): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const draft = await requireActiveDraft(session.user.id, data.draftId);
  requirePositiveInteger(data.price, 'price');

  const team = await prisma.team.findFirst({ where: { id: data.teamId, draftId: draft.id } });
  if (!team) throw new Error('Team not found in draft');

  const updateResult = await prisma.auctionResult.updateMany({
    where: { id: data.id, draftId: draft.id },
    data: { price: data.price, teamId: data.teamId },
  });
  if (updateResult.count === 0) throw new Error('Bid not found');
  revalidatePath(`/draft/${data.draftId}`);
}

export async function deleteBid(data: { id: number; draftId: number }): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const draft = await requireActiveDraft(session.user.id, data.draftId);

  const deleteResult = await prisma.auctionResult.deleteMany({
    where: { id: data.id, draftId: draft.id },
  });
  if (deleteResult.count === 0) throw new Error('Bid not found');
  revalidatePath(`/draft/${data.draftId}`);
}
```

`getDraft` (the plain, non-active-checking helper) is no longer called directly by these three functions — but it IS still used elsewhere in this file if `origin/main`'s merge brought in any other caller. Check with `grep -n "getDraft" src/lib/actions.ts` before removing its import: if `logBid`/`updateBid`/`deleteBid` were the only callers, remove the now-unused `import { getDraft } from '@/lib/draft';` line; if anything else in the file still calls it, leave the import in place.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm jest src/__tests__/actions.test.ts -t logBid`
Expected: PASS for the `logBid` describe block. `updateBid`/`deleteBid` tests further down the file may still be using pre-hardening assertions from `origin/main`'s original test file — Task 5 addresses those; don't fix them here.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors in `src/lib/actions.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions.ts src/__tests__/actions.test.ts
git commit -m "fix: harden logBid with ACTIVE-draft check, price validation, and transactional duplicate handling"
```

---

### Task 5: Harden `updateBid`/`deleteBid` test coverage

**Files:**

- Modify: `src/__tests__/actions.test.ts` (`updateBid`/`deleteBid` describe blocks)

**Interfaces:**

- No new interfaces — `updateBid`/`deleteBid` were already rewritten in Task 4, Step 3. This task only brings their test coverage up to the same standard as `logBid`'s.

- [ ] **Step 1: Replace the `updateBid`/`deleteBid` describe blocks**

Find the existing `describe('updateBid', ...)` and `describe('deleteBid', ...)` blocks in `src/__tests__/actions.test.ts` (brought in by Task 1's merge from `origin/main` — they test the pre-hardening behavior) and replace them with:

```ts
describe('updateBid', () => {
  it('updates price and teamId scoped to the draft', async () => {
    await updateBid({ id: 5, price: 95, teamId: 2, draftId: 1 });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 5, draftId: 1 },
      data: { price: 95, teamId: 2 },
    });
  });

  it('calls revalidatePath scoped to the draft', async () => {
    await updateBid({ id: 5, price: 95, teamId: 2, draftId: 1 });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/draft/1');
  });

  it('throws when called without a session', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(updateBid({ id: 5, price: 95, teamId: 2, draftId: 1 })).rejects.toThrow(
      'Unauthorized',
    );
  });

  it('throws when no draft found for user', async () => {
    mockGetDraft.mockResolvedValue(null);
    await expect(updateBid({ id: 5, price: 95, teamId: 2, draftId: 1 })).rejects.toThrow(
      'No draft found',
    );
  });

  it('throws when the draft is not ACTIVE', async () => {
    mockGetDraft.mockResolvedValue(MOCK_COMPLETE_DRAFT);
    await expect(updateBid({ id: 5, price: 95, teamId: 2, draftId: 1 })).rejects.toThrow(
      'Draft is not active',
    );
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('throws when teamId does not belong to the draft', async () => {
    mockTeamFindFirst.mockResolvedValue(null);
    await expect(updateBid({ id: 5, price: 95, teamId: 2, draftId: 1 })).rejects.toThrow(
      'Team not found in draft',
    );
  });

  it.each([0, -5, 4.5])('rejects a non-positive/non-integer price (%p)', async (price) => {
    await expect(updateBid({ id: 5, price, teamId: 2, draftId: 1 })).rejects.toThrow(
      'price must be a positive integer',
    );
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

describe('deleteBid', () => {
  it('deletes the bid scoped to the draft', async () => {
    await deleteBid({ id: 7, draftId: 1 });
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: 7, draftId: 1 } });
  });

  it('calls revalidatePath scoped to the draft', async () => {
    await deleteBid({ id: 7, draftId: 1 });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/draft/1');
  });

  it('throws when called without a session', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(deleteBid({ id: 7, draftId: 1 })).rejects.toThrow('Unauthorized');
  });

  it('throws when no draft found for user', async () => {
    mockGetDraft.mockResolvedValue(null);
    await expect(deleteBid({ id: 7, draftId: 1 })).rejects.toThrow('No draft found');
  });

  it('throws when the draft is not ACTIVE', async () => {
    mockGetDraft.mockResolvedValue(MOCK_COMPLETE_DRAFT);
    await expect(deleteBid({ id: 7, draftId: 1 })).rejects.toThrow('Draft is not active');
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the full actions test file to verify it passes**

Run: `pnpm jest src/__tests__/actions.test.ts`
Expected: PASS — all of `logBid`, `updateBid`, `deleteBid`.

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/actions.test.ts
git commit -m "test: cover ACTIVE-draft and price validation for updateBid/deleteBid"
```

---

### Task 6: Reject already-won players on the `nominated` route

**Files:**

- Modify: `src/app/api/draft/[draftId]/nominated/route.ts`
- Modify: `src/__tests__/api/nominated.test.ts`

**Interfaces:**

- Consumes: `requirePlayerNotWon`, `DraftMutationError` from `src/lib/draftMutationGuard.ts` (Task 2). The route's existing player-existence check (from `origin/main`, `prisma.player.findFirst` → `{ error: 'Player not found' }`, 404) is preserved unchanged; this task adds only the missing already-won check after it.

- [ ] **Step 1: Add a failing test case**

`src/__tests__/api/nominated.test.ts` (after Task 1's merge) already has `mockPlayerFindFirst` mocked and tests for unauthenticated/no-draft/no-playerId/unknown-player/success. Add one import and one mock, and one new test case.

Change the import line from:

```ts
import { POST, DELETE } from '@/app/api/draft/[draftId]/nominated/route';
```

No change needed to that line. Add a new mock declaration alongside the existing `mockPlayerFindFirst`:

```ts
const mockAuctionResultFindFirst = jest.fn();
```

Add it to the `jest.mock('@/lib/db', ...)` factory's `prisma` object, alongside the existing `nominatedPlayer` and `player` keys:

```ts
    auctionResult: {
      findFirst: (...args: unknown[]) => mockAuctionResultFindFirst(...args),
    },
```

Add a default to `beforeEach`, alongside the existing `mockPlayerFindFirst.mockResolvedValue(...)` line:

```ts
mockAuctionResultFindFirst.mockResolvedValue(null);
```

Add this test case inside the `describe('POST /api/draft/[draftId]/nominated', ...)` block, after the existing `'returns 404 when playerId is outside the draft'` test:

```ts
it('returns 409 when the player already has a winning bid', async () => {
  mockAuctionResultFindFirst.mockResolvedValue({ id: 9 });
  const res = await POST(makeRequest({ playerId: 10 }), MOCK_PARAMS);
  expect(res.status).toBe(409);
  expect(mockUpsert).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to verify the new case fails**

Run: `pnpm jest src/__tests__/api/nominated.test.ts`
Expected: FAIL on the new `'returns 409 when the player already has a winning bid'` case — the route currently upserts unconditionally once the player is found.

- [ ] **Step 3: Add the check to the route's `POST` handler**

In `src/app/api/draft/[draftId]/nominated/route.ts`, add the import:

```ts
import { DraftMutationError, requirePlayerNotWon } from '@/lib/draftMutationGuard';
```

Then, in the `POST` handler, immediately after the existing `if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });` line and before the `prisma.nominatedPlayer.upsert(...)` call, add:

```ts
try {
  await requirePlayerNotWon(draft.id, player.id);
} catch (e) {
  if (e instanceof DraftMutationError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  throw e;
}
```

Do not modify anything else in the file — the existing player-existence check, the `DELETE` handler, and the `upsert` call all stay exactly as `origin/main` has them.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm jest src/__tests__/api/nominated.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/draft/[draftId]/nominated/route.ts" src/__tests__/api/nominated.test.ts
git commit -m "fix: reject already-won players on the nominated endpoint"
```

---

### Task 7: Reject already-won players on the `watchlist` route

**Files:**

- Modify: `src/app/api/draft/[draftId]/watchlist/route.ts`
- Modify: `src/__tests__/api/watchlist.test.ts`

**Interfaces:**

- Identical pattern to Task 6, applied to `playerWatchlist` instead of `nominatedPlayer`.

- [ ] **Step 1: Add a failing test case**

Apply the same four edits to `src/__tests__/api/watchlist.test.ts` as Task 6 applied to `nominated.test.ts`: add `const mockAuctionResultFindFirst = jest.fn();`, add `auctionResult: { findFirst: (...args: unknown[]) => mockAuctionResultFindFirst(...args) }` to the `prisma` mock, add `mockAuctionResultFindFirst.mockResolvedValue(null);` to `beforeEach`, and add this test case inside `describe('POST /api/draft/[draftId]/watchlist', ...)` after the existing `'returns 404 when playerId is outside the draft'` test:

```ts
it('returns 409 when the player already has a winning bid', async () => {
  mockAuctionResultFindFirst.mockResolvedValue({ id: 9 });
  const res = await POST(makeRequest({ playerId: 10 }), MOCK_PARAMS);
  expect(res.status).toBe(409);
  expect(mockUpsert).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to verify the new case fails**

Run: `pnpm jest src/__tests__/api/watchlist.test.ts`
Expected: FAIL on the new case.

- [ ] **Step 3: Add the check to the route's `POST` handler**

In `src/app/api/draft/[draftId]/watchlist/route.ts`, add the import:

```ts
import { DraftMutationError, requirePlayerNotWon } from '@/lib/draftMutationGuard';
```

Then, in the `POST` handler, immediately after the existing `if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });` line and before the `prisma.playerWatchlist.upsert(...)` call, add:

```ts
try {
  await requirePlayerNotWon(draft.id, player.id);
} catch (e) {
  if (e instanceof DraftMutationError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  throw e;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm jest src/__tests__/api/watchlist.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/draft/[draftId]/watchlist/route.ts" src/__tests__/api/watchlist.test.ts
git commit -m "fix: reject already-won players on the watchlist endpoint"
```

---

### Task 8: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS, with a total test count at or above the pre-merge baseline (this branch had 533 passing before the merge; `origin/main` brought in substantial new suites for onboarding and player-identity — expect the total to be noticeably higher, not lower).

- [ ] **Step 2: Typecheck, lint, and format check**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: no errors.

- [ ] **Step 3: Confirm the migration applied cleanly against the dev DB**

Run: `psql "postgresql://draftops:draftops@localhost/draftops" -c "\d \"AuctionResult\""`
Expected: output includes `"AuctionResult_playerId_draftId_key" UNIQUE CONSTRAINT` (or equivalent unique index line) and does NOT show the old non-unique `AuctionResult_playerId_idx`.

- [ ] **Step 4: Confirm no stale references to the old name-based API remain**

Run: `grep -rn "playerName: string" src/lib/draftMutationGuard.ts src/lib/actions.ts 2>/dev/null; grep -rn "name_draftId" src/lib/actions.ts "src/app/api/draft/[draftId]/nominated/route.ts" "src/app/api/draft/[draftId]/watchlist/route.ts" 2>/dev/null`
Expected: no output — confirms nothing still assumes the old `Player.name_draftId` compound-unique lookup that no longer exists in the schema.

---

## Notes for the reviewer / PR description

- This plan re-implements the same integrity guarantees as the original Workstream A plan (`docs/superpowers/plans/2026-07-14-workstream-a-auction-data-integrity.md`), re-keyed on `playerId` to match `origin/main`'s independently-landed player-identity refactor. Task 1 deliberately discards this branch's original name-based commits' file contents (though the commits remain in history) in favor of `origin/main`'s versions, then re-applies the hardening as new commits on top.
- As with the original plan, this does NOT add ACTIVE-draft gating to the `nominated`/`watchlist` routes (only to the three bid mutations), and does NOT touch completed-draft UI or client-side optimistic-rollback — those remain out of scope (Workstreams B and D).
- `origin/main`'s `nominated`/`watchlist` routes already had a player-existence check (404) before this plan touched them — that's `origin/main`'s own work (part of the player-identity refactor, not a duplicate of Workstream A). This plan only adds the missing already-won check (409) on top.
