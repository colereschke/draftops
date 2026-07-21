# HARD-011 Bid History, Export, and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bid changes reconstructable, let owners restore an unclaimed deleted bid for 30 minutes, and provide owner-authorized exports and recovery operations.

**Architecture:** Retain deleted `AuctionResult` rows as history and replace the full unique claim with a PostgreSQL active-only unique index. The existing locked draft mutation boundary writes append-only audit events and completion snapshots atomically. A small owner-facing history panel and no-store export routes consume dedicated serialization helpers; every normal roster/auction read filters active bids.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Prisma 7/PostgreSQL, Jest/RTL, PostgreSQL integration tests, Tailwind CSS 4.

## Global Constraints

- Recovery is owner-authorized, only while the draft is `ACTIVE`, and only for 30 minutes after deletion.
- A deleted player is immediately available; a replacement bid permanently supersedes the old deleted bid.
- The authoritative expiry clock is PostgreSQL transaction time, never the browser clock.
- Audit records are append-only and exports order them by `(occurredAt, id)`.
- CSV includes active bids only and neutralizes spreadsheet formulas in text fields; JSON includes active bids, audit events, and a completion snapshot.
- Every normal consumer of `AuctionResult` filters `deletedAt: null`; history/export are intentional exceptions.
- Add failing tests before production code, use the existing draft advisory lock, and run real PostgreSQL coverage for the partial-index and transactional cases.

---

### Task 1: Persist active-only claims, immutable audit events, and completion snapshots

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260719120000_hard_011_bid_history/migration.sql`
- Create: `src/__tests__/integration/bidHistoryMigration.postgres.test.ts`

**Interfaces:**

- Produces Prisma models `BidAuditEvent` and `DraftCompletionSnapshot`, enum `BidAuditEventType`, and `AuctionResult.deletedAt`, `supersededAt`, `updatedAt`.
- Produces PostgreSQL index `AuctionResult_active_draft_player_key` on active claims only.

- [ ] **Step 1: Write the failing migration integration test**

```ts
it('allows one deleted and one active claim for the same draft player', async () => {
  const {
    rows: [oldBid],
  } = await client.query<{ id: number }>(
    'INSERT INTO "AuctionResult" ("player", "playerId", "position", "nflTeam", "price", "teamId", "draftId") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    ['Josh Allen', playerId, 'QB', 'BUF', 120, firstTeamId, draftId],
  );
  await client.query('UPDATE "AuctionResult" SET "deletedAt" = now() WHERE id = $1', [oldBid.id]);
  await expect(
    client.query(
      'INSERT INTO "AuctionResult" ("player", "playerId", "position", "nflTeam", "price", "teamId", "draftId") VALUES ($1, $2, $3, $4, $5, $6, $7)',
      ['Josh Allen', playerId, 'QB', 'BUF', 150, secondTeamId, draftId],
    ),
  ).resolves.toBeDefined();
});
```

- [ ] **Step 2: Run the migration test to verify it fails**

Run: `pnpm test:integration -- bidHistoryMigration.postgres.test.ts`
Expected: FAIL because `deletedAt` and the active-only unique index do not exist.

- [ ] **Step 3: Add the schema and SQL migration**

```prisma
enum BidAuditEventType { CREATE UPDATE DELETE RESTORE SUPERSEDE }
model BidAuditEvent { id Int @id @default(autoincrement()); draftId Int; bidId Int; actorId String; type BidAuditEventType; before Json?; after Json?; occurredAt DateTime @default(now()); draft Draft @relation(fields: [draftId], references: [id]); bid AuctionResult @relation(fields: [bidId], references: [id], onDelete: Restrict); @@index([draftId, occurredAt, id]); @@index([bidId]) }
model DraftCompletionSnapshot { id Int @id @default(autoincrement()); draftId Int @unique; capturedAt DateTime @default(now()); schemaVersion Int; payload Json; draft Draft @relation(fields: [draftId], references: [id], onDelete: Restrict) }
```

Add `updatedAt DateTime @updatedAt`, `deletedAt DateTime?`, `supersededAt DateTime?`, and relations to `AuctionResult`; add audit/snapshot relations to `Draft`. In SQL, drop `AuctionResult_draftId_playerId_key`, create `UNIQUE INDEX "AuctionResult_active_draft_player_key" ON "AuctionResult" ("draftId", "playerId") WHERE "deletedAt" IS NULL`, and add the history indexes. Generate Prisma client.

- [ ] **Step 4: Run migration and integration tests**

Run: `pnpm prisma migrate dev --name hard_011_bid_history && pnpm test:integration -- bidHistoryMigration.postgres.test.ts`
Expected: PASS; two historical rows may share a player but two active rows cannot.

- [ ] **Step 5: Commit**

```bash
git add prisma src/__tests__/integration/bidHistoryMigration.postgres.test.ts
git commit -m "feat: persist bid history records"
```

### Task 2: Add typed bid snapshots and atomic audit writes

**Files:**

- Create: `src/lib/bidAudit.ts`
- Create: `src/__tests__/bidAudit.test.ts`
- Modify: `src/lib/draftMutation.ts`

**Interfaces:**

- Produces `BidSnapshot`, `toBidSnapshot(bid)`, and `createBidAuditEvent(tx, input)`.
- Extends `DraftMutationCode` with `BID_NOT_DELETED`, `BID_SUPERSEDED`, and `RESTORE_WINDOW_EXPIRED`.

- [ ] **Step 1: Write failing serializer tests**

```ts
expect(toBidSnapshot(BID)).toEqual({
  id: 12,
  draftId: 4,
  playerId: 10,
  player: 'Josh Allen',
  position: 'QB',
  nflTeam: 'BUF',
  price: 120,
  teamId: 7,
  sfRank: 1,
  notes: null,
  deletedAt: null,
  supersededAt: null,
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test src/__tests__/bidAudit.test.ts`
Expected: FAIL because `@/lib/bidAudit` does not exist.

- [ ] **Step 3: Implement the focused audit helper**

```ts
export interface BidAuditInput {
  draftId: number;
  bidId: number;
  actorId: string;
  type: BidAuditEventType;
  before: BidSnapshot | null;
  after: BidSnapshot | null;
}
export async function createBidAuditEvent(
  tx: Prisma.TransactionClient,
  input: BidAuditInput,
): Promise<void> {
  await tx.bidAuditEvent.create({
    data: {
      draftId: input.draftId,
      bidId: input.bidId,
      actorId: input.actorId,
      type: input.type,
      before: input.before ?? Prisma.JsonNull,
      after: input.after ?? Prisma.JsonNull,
    },
  });
}
```

Use snapshots containing the stable bid fields above. Do not expose update/delete functions for audit rows.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test src/__tests__/bidAudit.test.ts src/__tests__/draftMutation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bidAudit.ts src/lib/draftMutation.ts src/__tests__/bidAudit.test.ts
git commit -m "feat: add typed bid audit events"
```

### Task 3: Make bid create/update/delete/restore auditable and recoverable

**Files:**

- Modify: `src/lib/bidMutation.ts`
- Modify: `src/lib/actions.ts`
- Modify: `src/__tests__/bidMutation.test.ts`
- Modify: `src/__tests__/actions.test.ts`

**Interfaces:**

- Produces `restoreBidRecord({ userId, draftId, bidId }): Promise<DraftMutationResult<{ bidId: number }>>` and `restoreBid({ id, draftId }): Promise<DraftMutationResult<{ bidId: number }>>` server action.
- `createBidRecord` filters active claims and supersedes a matching restorable deleted bid before creating the replacement.

- [ ] **Step 1: Add failing mutation tests**

```ts
it('soft deletes and audits a bid', async () => {
  await expect(deleteBidRecord({ userId: 'owner-1', draftId: 4, bidId: 12 })).resolves.toEqual({
    ok: true,
    data: null,
  });
  expect(mockAuctionUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ data: { deletedAt: expect.any(Date) } }),
  );
  expect(mockAuditCreate).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ type: 'DELETE' }) }),
  );
});
it('rejects restore after the database 30-minute boundary', async () =>
  expect(result).toEqual({ ok: false, code: 'RESTORE_WINDOW_EXPIRED' }));
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test src/__tests__/bidMutation.test.ts src/__tests__/actions.test.ts`
Expected: FAIL because delete physically removes rows and restore is absent.

- [ ] **Step 3: Implement all four event paths under the existing lock**

Use `where: { draftId, playerId, deletedAt: null }` for active-claim checks and legality queries. Create the bid, then its `CREATE` event, then remove the nomination in one transaction. Update active bids only and emit `UPDATE`. Delete via `update` with `deletedAt: new Date()` and emit `DELETE`. On replacement creation, update matching deleted unsuperseded rows with `supersededAt: new Date()` and emit `SUPERSEDE` before inserting the new bid. Restore uses `SELECT transaction_timestamp()` through `tx.$queryRaw`, rejects an expired/superseded/non-deleted result, re-runs `assertBidLegalInTransaction`, clears `deletedAt`, and emits `RESTORE`.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test src/__tests__/bidMutation.test.ts src/__tests__/actions.test.ts`
Expected: PASS, including audit failure propagation so the outer transaction rolls back.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bidMutation.ts src/lib/actions.ts src/__tests__/bidMutation.test.ts src/__tests__/actions.test.ts
git commit -m "feat: add auditable bid recovery"
```

### Task 4: Snapshot completion atomically and filter inactive bids everywhere

**Files:**

- Modify: `src/lib/draftMutation.ts`
- Modify: `src/lib/sleeper-roster-actions.ts`
- Modify: `src/app/draft/[draftId]/page.tsx`
- Modify: `src/app/draft/[draftId]/teams/page.tsx`
- Modify: `src/app/draft/[draftId]/budget/page.tsx`
- Modify: `src/app/draft/[draftId]/nominate/page.tsx`
- Modify: `src/app/api/draft/[draftId]/nomination-data/route.ts`
- Modify: `src/app/api/draft/[draftId]/watchlist/route.ts`
- Modify: `src/app/api/draft/[draftId]/nominated/route.ts`
- Modify: `src/__tests__/draftMutation.test.ts`

**Interfaces:**

- Completion creates `DraftCompletionSnapshot { schemaVersion: 1, payload }` before status changes.
- All ordinary result queries use `deletedAt: null`.

- [ ] **Step 1: Write failing completion/read tests**

```ts
it('rolls back completion when snapshot creation fails', async () => {
  mockSnapshotCreate.mockRejectedValue(new Error('snapshot failed'));
  await expect(completeOwnedDraft('owner-1', 4)).rejects.toThrow('snapshot failed');
  expect(mockDraftUpdate).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test src/__tests__/draftMutation.test.ts`
Expected: FAIL because completion currently only changes status.

- [ ] **Step 3: Implement snapshot and active filters**

Build the snapshot from the locked draft plus `tx.auctionResult.findMany({ where: { draftId, deletedAt: null }, orderBy: { id: 'asc' } })`, then `tx.draftCompletionSnapshot.create` before `tx.draft.update`. Add `where: { deletedAt: null }` to direct result queries and `include: { results: { where: { deletedAt: null } } }` to nested team queries, including Sleeper conflict/look-up paths.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test src/__tests__/draftMutation.test.ts src/__tests__/sleeper-roster-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib src/app src/__tests__/draftMutation.test.ts
git commit -m "feat: snapshot completions and hide deleted bids"
```

### Task 5: Add owner-authorized JSON and CSV exports

**Files:**

- Create: `src/lib/draftExport.ts`
- Create: `src/app/api/draft/[draftId]/export/json/route.ts`
- Create: `src/app/api/draft/[draftId]/export/csv/route.ts`
- Create: `src/__tests__/draftExport.test.ts`
- Create: `src/__tests__/api/draftExport.route.test.ts`

**Interfaces:**

- Produces `serializeDraftExport(input): DraftExport` and `serializeDraftCsv(bids): string`.
- Both routes require `auth()` plus `getDraft()`, set `Cache-Control: no-store`, and return `Content-Disposition: attachment`.

- [ ] **Step 1: Write failing export tests**

```ts
expect(serializeDraftCsv([{ player: '=SUM(A1)', ...BID }])).toContain("'=SUM(A1)");
expect(exported.auditEvents.map((event) => event.id)).toEqual([3, 8]);
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test src/__tests__/draftExport.test.ts src/__tests__/api/draftExport.route.test.ts`
Expected: FAIL because serializers and routes do not exist.

- [ ] **Step 3: Implement serializers and routes**

Prefix CSV cells beginning `=`, `+`, `-`, or `@` with `'`, quote commas/quotes/newlines, and emit columns `Player,Position,NFL Team,Price,Team,Logged At,Updated At`. Fetch active bids for CSV; JSON fetches active bids, all audit events ordered `{ occurredAt: 'asc' }, { id: 'asc' }`, and the snapshot. Use ISO timestamps and filename `draft-<id>-<YYYY-MM-DD>.<json|csv>`.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test src/__tests__/draftExport.test.ts src/__tests__/api/draftExport.route.test.ts`
Expected: PASS; unauthorized is 401 and non-owner is 404.

- [ ] **Step 5: Commit**

```bash
git add src/lib/draftExport.ts src/app/api/draft/[draftId]/export src/__tests__/draftExport.test.ts src/__tests__/api/draftExport.route.test.ts
git commit -m "feat: export draft history"
```

### Task 6: Surface exports and bounded bid recovery in the draft UI

**Files:**

- Create: `src/components/BidHistory/BidHistoryPanel.tsx`
- Create: `src/components/BidHistory/index.ts`
- Modify: `src/app/draft/[draftId]/page.tsx`
- Modify: `src/components/AuctionSheet/AuctionSheet.tsx`
- Modify: `src/__tests__/BidHistoryPanel.test.tsx`
- Modify: `src/__tests__/AuctionSheet.claimed.test.tsx`

**Interfaces:**

- `BidHistoryPanel({ deletedBids, draftId, isReadOnly })` renders restore controls and export links.
- Deleted-bid data carries `id`, `player`, `price`, `teamHandle`, `deletedAt`, `supersededAt`.

- [ ] **Step 1: Write failing component tests**

```tsx
render(<BidHistoryPanel deletedBids={[DELETED_BID]} draftId={4} isReadOnly={false} />);
expect(screen.getByTestId('restore-bid-12')).toBeInTheDocument();
expect(screen.getByTestId('deleted-bid-expired-13')).toHaveTextContent('Recovery window expired');
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test src/__tests__/BidHistoryPanel.test.tsx src/__tests__/AuctionSheet.claimed.test.tsx`
Expected: FAIL because the panel and restore control do not exist.

- [ ] **Step 3: Implement the panel and action wiring**

Fetch deleted results deliberately in the draft page and pass them to the panel. Show server-derived expiry messaging, a live presentation-only countdown, a restore button only for unsuperseded active-draft entries within 30 minutes, and status text for expired/superseded entries. Invoke `restoreBid`, refresh after every result, and map the new typed errors in `AuctionSheet`. Add JSON/CSV links with `data-testid="draft-export-json"` and `data-testid="draft-export-csv"`.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test src/__tests__/BidHistoryPanel.test.tsx src/__tests__/AuctionSheet.claimed.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/BidHistory src/app/draft/[draftId]/page.tsx src/components/AuctionSheet src/__tests__/BidHistoryPanel.test.tsx src/__tests__/AuctionSheet.claimed.test.tsx
git commit -m "feat: add bid recovery controls"
```

### Task 7: Prove concurrency and document operator recovery

**Files:**

- Create: `src/__tests__/integration/bidRecovery.postgres.test.ts`
- Create: `docs/operations/bid-recovery.md`

**Interfaces:**

- The integration test uses two independent PostgreSQL clients and the migrated schema.
- The runbook documents export, 30-minute restore, completion snapshot, audit deployment boundary, Neon PITR, and restore drill.

- [ ] **Step 1: Write failing PostgreSQL concurrency tests**

```ts
it('allows a replacement after deletion but rejects restoration after supersession', async () => {
  await deleteBid(firstClient, oldBidId);
  await createBid(secondClient, playerId);
  await expect(restoreBid(firstClient, oldBidId)).resolves.toMatchObject({
    code: 'BID_SUPERSEDED',
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test:integration -- bidRecovery.postgres.test.ts`
Expected: FAIL until Tasks 1–4 are complete; if it passes immediately, correct the fixture/assertion.

- [ ] **Step 3: Complete the recovery runbook and integration coverage**

Cover partial-index enforcement, delete-versus-new-claim, restore-versus-completion, audit insert rollback, and completion snapshot rollback. In the runbook, include exact export URLs, the restore eligibility rule, a Neon PITR drill checklist, validation queries for draft status/active bid count/audit count, and the instruction never to overwrite production before validating a restored branch.

- [ ] **Step 4: Run the full verification gate**

Run: `pnpm test:integration -- bidRecovery.postgres.test.ts && make check`
Expected: all targeted PostgreSQL tests and the full typecheck/lint/format/unit gate PASS.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/integration/bidRecovery.postgres.test.ts docs/operations/bid-recovery.md
git commit -m "test: verify bid recovery operations"
```
