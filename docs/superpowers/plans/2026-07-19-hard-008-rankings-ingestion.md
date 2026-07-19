# HARD-008 Rankings Ingestion Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely import valid CSV rankings while rejecting malformed, oversized, ambiguous, or
invalid data, and prevent invalid manual Sleeper identity assignments.

**Architecture:** Keep CSV syntax parsing in `src/lib/csv.ts` and pass optional limits only from
the rankings domain. `src/lib/rankingsImport.ts` maps CSV/parser failures to bounded user-facing
validation errors and enforces ranking-domain numeric and duplicate rules before actions touch the
database. The server action and database constraint jointly enforce manual-match ownership,
existence, position compatibility, and within-set uniqueness.

**Tech Stack:** TypeScript 5, Next.js server actions, Prisma 7/PostgreSQL, Jest.

## Global Constraints

- Use a full-document parser that accepts UTF-8 BOMs, CRLF, escaped quotes, and quoted multiline fields.
- Rankings uploads are limited to 1 MiB of UTF-8 input, 2,000 data rows, 10,000 characters per field, and 25 reported validation errors.
- Skill-player age is a finite decimal from 0 through 100; PICK rows have no age.
- Explicit ranks are finite integers from 1 through 10,000; raw `2QBAuction` values are finite numbers from 0 through 1,000,000.
- Reject duplicate normalized `(trimmed lowercase name, position)` identities and duplicate explicit ranks.
- Manual matches require an owned ranking row, an existing same-position Sleeper player, and a Sleeper ID unused by every other row in that ranking set.
- Preserve generic CSV callers without rankings upload limits; do not add a CSV dependency.
- Tests select rendered elements with `data-testid` or `id`.

---

## File Structure

| File                                                                          | Responsibility                                                                      |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/lib/csv.ts`                                                              | Parse complete CSV documents and raise typed syntax/limit errors.                   |
| `src/lib/rankingsImport.ts`                                                   | Apply rankings-specific parser limits and validate row values/duplicates.           |
| `src/lib/rankings-actions.ts`                                                 | Validate manual match targets before persisting them.                               |
| `prisma/schema.prisma`                                                        | Enforce one non-null Sleeper identity per ranking set.                              |
| `prisma/migrations/<timestamp>_harden_ranking_match_uniqueness/migration.sql` | Apply the database uniqueness constraint.                                           |
| `src/components/RankingsUpload/ResolveUnmatchedList.tsx`                      | Show only same-position manual-match candidates.                                    |
| `src/__tests__/csv.test.ts`                                                   | Characterize CSV syntax and parser-limit behavior.                                  |
| `src/__tests__/rankingsImport.test.ts`                                        | Characterize rankings-domain validation.                                            |
| `src/__tests__/rankings-actions.test.ts`                                      | Characterize secure manual-match behavior.                                          |
| `src/__tests__/ResolveUnmatchedList.test.tsx`                                 | Verify position-filtered candidate display if no existing component test covers it. |

### Task 1: Replace line-based CSV parsing with bounded document parsing

**Files:**

- Modify: `src/lib/csv.ts`
- Modify: `src/__tests__/csv.test.ts`

**Interfaces:**

- Produces `CsvParseOptions` with optional `maxBytes`, `maxRows`, and `maxFieldLength`.
- Produces `CsvParseError extends Error` with a stable, user-safe `message`.
- Changes `parseCsv(contents: string, options?: CsvParseOptions): ParsedCsv` to parse a full document.
- Retains `parseCsvLine(line: string): string[]` for its existing direct consumers and tests.

- [ ] **Step 1: Write the failing parser tests**

  Add test cases that call `parseCsv` with the exact fixtures below:

  ```ts
  it('accepts a BOM, CRLF, escaped quotes, and quoted multiline fields', () => {
    const result = parseCsv('\ufeffPlayer,Notes\r\nJosh Allen,"Line one\r\nHe said ""hello"""\r\n');
    expect(result).toEqual({
      headers: ['Player', 'Notes'],
      rows: [{ Player: 'Josh Allen', Notes: 'Line one\r\nHe said "hello"' }],
    });
  });

  it.each([
    ['an unterminated quoted field', 'Player,Notes\nJosh,"unfinished'],
    ['a UTF-8 byte cap', 'Player\nJosh', { maxBytes: 5 }],
    ['a row cap', 'Player\nJosh\nJoe', { maxRows: 1 }],
    ['a field cap', 'Player\nJoshua', { maxFieldLength: 3 }],
  ])('rejects %s', (_label, contents, options) => {
    expect(() => parseCsv(contents, options)).toThrow(CsvParseError);
  });
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `pnpm test --runInBand src/__tests__/csv.test.ts`

  Expected: FAIL because `CsvParseError` and multiline document parsing do not exist.

- [ ] **Step 3: Implement the parser state machine**

  In `src/lib/csv.ts`, add these public definitions:

  ```ts
  export interface CsvParseOptions {
    maxBytes?: number;
    maxRows?: number;
    maxFieldLength?: number;
  }

  export class CsvParseError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'CsvParseError';
    }
  }
  ```

  Implement `parseCsv` as one character loop over `contents` after removing a leading `\ufeff`.
  Track `field`, `row`, `rows`, and `inQuotes`. Inside quotes, accept `""` as one quote and retain
  CR/LF bytes; outside quotes, use comma to finish a field and LF or CRLF to finish a row. Reject
  a quote that begins inside an unquoted non-empty field, a non-delimiter character after a closing
  quote, and EOF while quoted. Apply `maxBytes` before the loop with
  `new TextEncoder().encode(contents).byteLength`, `maxFieldLength` whenever adding a
  character, and `maxRows` when completing non-header data rows. Do not append a phantom row for a
  trailing newline. Build row records from the first parsed row, filling missing trailing values
  with `''` exactly as the current implementation does. Implement `parseCsvLine` as
  `parseCsv(line).headers` so quote behavior stays shared.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run: `pnpm test --runInBand src/__tests__/csv.test.ts`

  Expected: PASS.

- [ ] **Step 5: Commit the parser unit**

  ```bash
  git add src/lib/csv.ts src/__tests__/csv.test.ts
  git commit -m "feat: parse complete CSV documents safely"
  ```

### Task 2: Enforce rankings upload limits, numeric ranges, and duplicate policy

**Files:**

- Modify: `src/lib/rankingsImport.ts`
- Modify: `src/__tests__/rankingsImport.test.ts`

**Interfaces:**

- Consumes `parseCsv(contents, options)` and `CsvParseError` from Task 1.
- Keeps `parseRankingsCsv(csvText: string): RankingsParseResult` as the upload action boundary.
- Produces only complete, valid, unique `ParsedRankingRow[]` when `ok: true`.

- [ ] **Step 1: Write failing import-validation tests**

  Add tests asserting `ok: false` and an error matching the indicated phrase for:

  ```ts
  const invalidValues = [
    ['Infinite age', 'Josh Allen,BUF,QB,Infinity,$51', /invalid Age/i],
    ['out-of-range age', 'Josh Allen,BUF,QB,101,$51', /invalid Age/i],
    ['Infinite value', 'Josh Allen,BUF,QB,30,Infinity', /invalid 2QBAuction/i],
    ['out-of-range value', 'Josh Allen,BUF,QB,30,1000001', /invalid 2QBAuction/i],
  ];
  ```

  Add an explicit-rank fixture with `1.5`, `Infinity`, `0`, and `10001`, each rejected as invalid
  `SF/TE Prem`. Add fixtures for two `Josh Allen` QB rows differing only in case/whitespace and two
  separate players both ranked `1`; expect errors matching `/duplicate player/i` and
  `/duplicate.*rank/i`. Add an upload with a 10,001-character notes value and assert its result is
  `ok: false` with an error matching `/field/i`. Add 30 rows with missing player names and assert
  the returned error array has length 26: the first 25 row errors plus
  `'Too many validation errors; showing the first 25.'`.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `pnpm test --runInBand src/__tests__/rankingsImport.test.ts`

  Expected: FAIL because infinity, out-of-range values, duplicates, and parser cap failures pass
  through the current importer.

- [ ] **Step 3: Implement bounded validation before scaling**

  Add exported constants in `src/lib/rankingsImport.ts`:

  ```ts
  export const RANKINGS_CSV_LIMITS = {
    maxBytes: 1024 * 1024,
    maxRows: 2000,
    maxFieldLength: 10000,
    maxErrors: 25,
  } as const;
  ```

  Call `parseCsv(csvText, RANKINGS_CSV_LIMITS)` in a `try` block and turn `CsvParseError` into
  `{ ok: false, errors: [error.message] }`. Replace every `Number.isNaN` check with
  `Number.isFinite`, enforce the ranges in Global Constraints, and require `Number.isInteger` for
  explicit ranks. Use `normalizeName(name)` plus `pos` as a `Set` key for player identities and a
  second `Set<number>` for explicit ranks. Add each row error through a helper that stops adding at
  `RANKINGS_CSV_LIMITS.maxErrors`; after truncating, append one final
  `'Too many validation errors; showing the first 25.'` message. Return errors before calling
  `scaleRankingValue`.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run: `pnpm test --runInBand src/__tests__/rankingsImport.test.ts`

  Expected: PASS.

- [ ] **Step 5: Commit the ranking validation unit**

  ```bash
  git add src/lib/rankingsImport.ts src/__tests__/rankingsImport.test.ts
  git commit -m "feat: validate custom ranking uploads"
  ```

### Task 3: Make manual match resolution server- and database-safe

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<generated>_harden_ranking_match_uniqueness/migration.sql`
- Modify: `src/lib/rankings-actions.ts`
- Modify: `src/__tests__/rankings-actions.test.ts`

**Interfaces:**

- Consumes a ranking row selected as `{ id, pos, rankingSetId, rankingSet: { userId } }`.
- Consumes `SleeperPlayer` selected as `{ id, pos }`.
- Produces a `resolveRankingMatch(rankingPlayerId: number, sleeperId: string): Promise<void>` that
  throws a safe validation error without writing for bad targets.
- Produces `@@unique([rankingSetId, sleeperId])` on `UserRankingPlayer`.

- [ ] **Step 1: Write failing action tests**

  Extend the Prisma mock with `sleeperPlayer.findUnique` and `userRankingPlayer.findFirst`. Add
  cases for the following exact outcomes:

  ```ts
  mockPlayerFindUnique.mockResolvedValue({
    id: 1,
    pos: 'QB',
    rankingSetId: 42,
    rankingSet: { userId: '123456789' },
  });
  mockSleeperFindUnique.mockResolvedValue(null);
  await expect(resolveRankingMatch(1, 'missing')).rejects.toThrow('Sleeper player not found');

  mockSleeperFindUnique.mockResolvedValue({ id: 'wr-1', pos: 'WR' });
  await expect(resolveRankingMatch(1, 'wr-1')).rejects.toThrow('Position mismatch');

  mockSleeperFindUnique.mockResolvedValue({ id: 'qb-1', pos: 'QB' });
  mockPlayerFindFirst.mockResolvedValue({ id: 2 });
  await expect(resolveRankingMatch(1, 'qb-1')).rejects.toThrow('already assigned');
  expect(mockPlayerUpdate).not.toHaveBeenCalled();
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `pnpm test --runInBand src/__tests__/rankings-actions.test.ts`

  Expected: FAIL because the action currently writes any supplied target ID.

- [ ] **Step 3: Add the constraint and action checks**

  In `UserRankingPlayer`, add:

  ```prisma
  @@unique([rankingSetId, sleeperId])
  ```

  Create the migration with `pnpm prisma migrate dev --name harden_ranking_match_uniqueness` and
  inspect its SQL. In `resolveRankingMatch`, select the row's `id`, `pos`, and `rankingSetId` with
  ownership; then select the Sleeper target's `id` and `pos`; then use `findFirst` with
  `{ rankingSetId, sleeperId, NOT: { id: rankingPlayerId } }`. Throw the exact messages from Step
  1 for missing targets, positions that differ, and used targets. Only then execute the existing
  update. Catch Prisma `P2002` from that update and throw `'Sleeper player is already assigned in
this ranking set'` so concurrent requests have the same safe outcome.

- [ ] **Step 4: Run focused tests and schema generation**

  Run: `pnpm prisma generate && pnpm test --runInBand src/__tests__/rankings-actions.test.ts`

  Expected: Prisma client generation succeeds and the action suite passes.

- [ ] **Step 5: Commit the matching integrity unit**

  ```bash
  git add prisma/schema.prisma prisma/migrations src/lib/rankings-actions.ts src/__tests__/rankings-actions.test.ts
  git commit -m "feat: secure manual ranking matches"
  ```

### Task 4: Align the resolution UI with server validation

**Files:**

- Modify: `src/components/RankingsUpload/ResolveUnmatchedList.tsx`
- Test: `src/__tests__/ResolveUnmatchedList.test.tsx` (create only if absent)

**Interfaces:**

- Consumes `UnmatchedRankingPlayer.pos` and `SleeperPlayerOption.pos`.
- Produces search results limited to the ranking row's position while preserving server-side
  validation as the authority.

- [ ] **Step 1: Write the failing component test**

  Render one unmatched QB with a matching QB and a same-name WR option. Type into
  `data-testid="unmatched-search-1"`, then assert the QB item is present and
  `data-testid="unmatched-result-wr-1"` is absent. Use `userEvent` and data-test IDs only.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `pnpm test --runInBand src/__tests__/ResolveUnmatchedList.test.tsx`

  Expected: FAIL because the current search filters only by normalized name.

- [ ] **Step 3: Filter results by position**

  Pass `player.pos` into the `UnmatchedRow` result calculation and change it to:

  ```ts
  return sleeperPlayers
    .filter((candidate) => candidate.pos === player.pos && candidate.normalizedName.includes(q))
    .slice(0, 8);
  ```

  Keep the action call and its existing visible fallback error unchanged.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run: `pnpm test --runInBand src/__tests__/ResolveUnmatchedList.test.tsx`

  Expected: PASS.

- [ ] **Step 5: Commit the UI alignment unit**

  ```bash
  git add src/components/RankingsUpload/ResolveUnmatchedList.tsx src/__tests__/ResolveUnmatchedList.test.tsx
  git commit -m "fix: filter ranking match candidates by position"
  ```

### Task 5: Verify the finished hardening flow

**Files:**

- Modify only files required to fix failures discovered by verification.

**Interfaces:**

- Verifies all public behavior from Tasks 1-4 with the repository quality gates.

- [ ] **Step 1: Run the affected suites together**

  Run:

  ```bash
  pnpm test --runInBand src/__tests__/csv.test.ts src/__tests__/rankingsImport.test.ts src/__tests__/rankings-actions.test.ts src/__tests__/ResolveUnmatchedList.test.tsx
  ```

  Expected: PASS with zero failed tests.

- [ ] **Step 2: Run static checks**

  Run:

  ```bash
  pnpm typecheck
  pnpm lint
  pnpm format:check
  ```

  Expected: each command exits 0.

- [ ] **Step 3: Run the full unit suite**

  Run: `pnpm test --runInBand`

  Expected: all existing and new Jest suites pass.

- [ ] **Step 4: Inspect the final diff**

  Run: `git diff main...HEAD --check && git status --short`

  Expected: no whitespace errors and no untracked/generated files outside the intended plan and
  implementation changes.

- [ ] **Step 5: Commit any verification-only fixes**

  If verification required a code fix, stage only that fix and commit it with a focused message;
  otherwise do not create an empty commit.
