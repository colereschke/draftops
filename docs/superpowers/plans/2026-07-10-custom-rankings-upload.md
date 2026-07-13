# Custom Rankings Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user upload an ETR dynasty rankings CSV once (profile-level, not per-draft), matched to Sleeper player IDs, and choose it as the player pool when creating a new draft — instead of the bundled ETR default.

**Architecture:** Three new Prisma models (`SleeperPlayer` identity table, `UserRankingSet` + `UserRankingPlayer` for the uploaded pool). A shared CSV parser and value-scaling formula are extracted so the new upload path and the existing `players.ts`/`apply-projection-values.ts` code share one implementation each. A TypeScript port of the existing Python ETR→Sleeper matcher resolves each uploaded row to a `SleeperPlayer`. A new `/rankings` page handles upload + manual match resolution. `createDraft` gains a `playerSource` option that swaps the base player array fed into the existing `adjustPlayerValues` pipeline.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Prisma 7 + Postgres, Jest + React Testing Library, `cmdk` (already a dependency) for the resolve-match search UI.

## Global Constraints

- Single quotes, trailing commas, 2-space indent, 100-char line width (Prettier) — run `pnpm lint` / `pnpm tsc --noEmit` before considering any task done.
- No explicit `any`; use `unknown` with a type guard if genuinely unknown.
- Prefer `interface` over `type` for object shapes; `type` only for unions/aliases.
- Select test elements by `data-testid`, not text/role/class.
- Typed mock data in tests — reuse types from `src/types/` rather than redefining shapes.
- No unhandled promise rejections.
- After any `prisma/schema.prisma` change: `pnpm prisma migrate dev --name <description>`.
- CSV headers locked to the real ETR export naming (`Player`, `Team`, `Position`, `Age`, `2QBAuction`, optional `SF/TE Prem`, optional `Notes`) — no flexible column mapping.
- `sfRank`: use the `SF/TE Prem` column directly if present in the header (hard error if any kept row lacks a parseable value); otherwise derive by sorting kept rows by scaled `budget` descending (stable sort — ties keep original CSV row order).
- `ceiling`/`floor` are always app-computed from `budget`, never read from the CSV.
- Keep CSV rows where `Position` ∈ `{QB, RB, WR, TE, Pick}` (mapped to `PICK`); drop everything else silently. `Age` required and numeric for QB/RB/WR/TE; may be blank only for `PICK` rows.
- No changes to `PKG_VALUES` contents, naming, or kicker→team mapping — out of scope, deferred to roadmap #8.
- No re-upload/replace flow on an already-created draft — a ranking set only seeds _new_ drafts.
- One active `UserRankingSet` per user; re-upload wipes and replaces all `UserRankingPlayer` rows for that set in one transaction.

---

## File Structure

```
prisma/
  schema.prisma                    # + SleeperPlayer, UserRankingSet, UserRankingPlayer
  sync-sleeper-players.ts          # new — syncs data/generated/normalized_sleeper_players.csv → SleeperPlayer
  apply-projection-values.ts       # modified — uses src/lib/csv.ts instead of local parser
src/
  lib/
    csv.ts                         # new — extracted CSV line/file parser
    scaleRankingValue.ts           # new — extracted budget/ceiling/floor formula
    sleeperNormalize.ts            # new — name/team normalization (TS port of normalize.py)
    sleeperMatch.ts                # new — matching logic (TS port of match_players.py)
    rankingsImport.ts              # new — CSV → validated ParsedRankingRow[] pipeline
    rankings-actions.ts            # new — 'use server': upload, resolve match, get summary
    actions.ts                     # modified — createDraft gains playerSource
  data/
    players.ts                     # modified — toPlayer() calls scaleRankingValue; + PKG_PLAYERS export
  components/
    NavBar/NavBar.tsx               # modified — "Rankings" link in profile dropdown + mobile menu
    RankingsUpload/
      RankingsUploadForm.tsx        # new — upload dropzone + summary card
      ResolveUnmatchedList.tsx      # new — cmdk search-and-pick for unmatched rows
  app/
    rankings/page.tsx               # new — server component, wires the two components above
    drafts/new/page.tsx             # modified — player-pool source selector
__tests__/ (co-located under src/__tests__/)
  csv.test.ts
  scaleRankingValue.test.ts
  players.test.ts                   # extended
  sleeperNormalize.test.ts
  sleeperMatch.test.ts
  rankingsImport.test.ts
  rankings-actions.test.ts
  createDraft.test.ts               # extended
  NavBar.test.tsx                   # extended
  RankingsUploadForm.test.tsx
  ResolveUnmatchedList.test.tsx
  drafts-new-form.test.tsx          # extended
```

---

### Task 1: Schema — `SleeperPlayer`, `UserRankingSet`, `UserRankingPlayer`

**Files:**

- Modify: `prisma/schema.prisma`

**Interfaces:**

- Produces: `SleeperPlayer { id, name, normalizedName, team, pos, age, updatedAt }`, `UserRankingSet { id, userId (unique), fileName, uploadedAt, players }`, `UserRankingPlayer { id, rankingSetId, name, team, pos, age, sfRank, budget, ceiling, floor, notes, sleeperId, matchStatus }` — all Prisma-generated client types, consumed by every later task.

- [ ] **Step 1: Add the three models to `prisma/schema.prisma`**

Append after the existing `DraftPlayerValue` model:

```prisma
model SleeperPlayer {
  id             String   @id
  name           String
  normalizedName String
  team           String
  pos            String
  age            Float?
  updatedAt      DateTime @updatedAt

  @@index([normalizedName])
}

model UserRankingSet {
  id         Int      @id @default(autoincrement())
  userId     String   @unique
  fileName   String?
  uploadedAt DateTime @default(now())
  players    UserRankingPlayer[]
}

model UserRankingPlayer {
  id           Int            @id @default(autoincrement())
  rankingSetId Int
  rankingSet   UserRankingSet @relation(fields: [rankingSetId], references: [id], onDelete: Cascade)
  name         String
  team         String
  pos          String
  age          Float?
  sfRank       Int
  budget       Int
  ceiling      Int
  floor        Int
  notes        String         @default("")
  sleeperId    String?
  matchStatus  String         @default("unmatched")

  @@index([rankingSetId])
}
```

- [ ] **Step 2: Run the migration**

Run: `pnpm prisma migrate dev --name add_custom_rankings_and_sleeper_player`
Expected: migration file created under `prisma/migrations/`, `Your database is now in sync with your schema.`

- [ ] **Step 3: Verify the Prisma client picked up the new models**

Run: `pnpm tsc --noEmit`
Expected: no errors (confirms `@prisma/client` regenerated via the `postinstall` hook during migrate).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add SleeperPlayer, UserRankingSet, UserRankingPlayer schema"
```

---

### Task 2: Extract shared CSV parser

**Files:**

- Create: `src/lib/csv.ts`
- Test: `src/__tests__/csv.test.ts`
- Modify: `prisma/apply-projection-values.ts:415-445` (remove local `parseCsv`/`parseCsvLine`, import from `@/lib/csv`, update the two call sites)

**Interfaces:**

- Produces: `parseCsv(contents: string): { headers: string[]; rows: Record<string, string>[] }`, `parseCsvLine(line: string): string[]` — consumed by Task 6 (sync script) and Task 7 (`rankingsImport.ts`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/csv.test.ts
import { parseCsv, parseCsvLine } from '@/lib/csv';

describe('parseCsvLine', () => {
  it('splits a simple comma-separated line', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCsvLine('"Chase, Ja\'Marr",CIN,WR')).toEqual(["Chase, Ja'Marr", 'CIN', 'WR']);
  });

  it('handles escaped double quotes inside a quoted field', () => {
    expect(parseCsvLine('"Say ""hi""",b')).toEqual(['Say "hi"', 'b']);
  });

  it('handles empty fields', () => {
    expect(parseCsvLine('a,,c')).toEqual(['a', '', 'c']);
  });
});

describe('parseCsv', () => {
  it('parses headers and rows into records keyed by header', () => {
    const result = parseCsv("Player,Team,Position\nJosh Allen,BUF,QB\nJa'Marr Chase,CIN,WR");
    expect(result.headers).toEqual(['Player', 'Team', 'Position']);
    expect(result.rows).toEqual([
      { Player: 'Josh Allen', Team: 'BUF', Position: 'QB' },
      { Player: "Ja'Marr Chase", Team: 'CIN', Position: 'WR' },
    ]);
  });

  it('fills missing trailing values with empty string', () => {
    const result = parseCsv('Player,Team,Notes\nJosh Allen,BUF');
    expect(result.rows).toEqual([{ Player: 'Josh Allen', Team: 'BUF', Notes: '' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test csv.test.ts`
Expected: FAIL with "Cannot find module '@/lib/csv'"

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/csv.ts
export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(contents: string): ParsedCsv {
  const [headerLine, ...lines] = contents.trim().split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  const rows = lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
  return { headers, rows };
}

export function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test csv.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Update `prisma/apply-projection-values.ts` to use the shared parser**

Remove the local `parseCsv`/`parseCsvLine` function definitions (currently around lines 415-445). Add the import near the top:

```typescript
import { parseCsv } from '@/lib/csv';
```

Update the two call sites:

```typescript
export function readEtrMatchRows(path: string): EtrMatchRow[] {
  return parseCsv(readFileSync(path, 'utf-8'))
    .rows.filter((row) => row.sleeper_id !== '')
    .map((row) => ({ name: row.etr_name, sleeperId: row.sleeper_id }));
}
```

```typescript
export function readProjectionRows(path: string, scoring: ScoringSettings): CsvProjectionRow[] {
  return parseCsv(readFileSync(path, 'utf-8')).rows.flatMap((row) => {
    // ...unchanged body...
  });
}
```

- [ ] **Step 6: Run the existing projection-apply tests to confirm no regression**

Run: `pnpm test projectionApply.test.ts`
Expected: PASS (unchanged assertions)

- [ ] **Step 7: Run full quality gate**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/lib/csv.ts src/__tests__/csv.test.ts prisma/apply-projection-values.ts
git commit -m "refactor: extract shared CSV parser into src/lib/csv.ts"
```

---

### Task 3: Extract shared value-scaling formula; split `PKG_PLAYERS`

**Files:**

- Create: `src/lib/scaleRankingValue.ts`
- Test: `src/__tests__/scaleRankingValue.test.ts`
- Modify: `src/data/players.ts` (refactor `toPlayer` logic to call `scaleRankingValue`; add `PKG_PLAYERS` export)
- Modify: `src/__tests__/players.test.ts` (regression coverage + `PKG_PLAYERS` assertion)

**Interfaces:**

- Produces: `scaleRankingValue(pos: Position, rawValue: number): { budget: number; ceiling: number; floor: number }`, `PKG_PLAYERS: Player[]` (exported from `src/data/players.ts`) — both consumed by Task 7 (`rankingsImport.ts`) and Task 12 (`createDraft`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/scaleRankingValue.test.ts
import { scaleRankingValue } from '@/lib/scaleRankingValue';

describe('scaleRankingValue', () => {
  it('scales a raw value by 5x for non-TE positions', () => {
    expect(scaleRankingValue('QB', 52)).toEqual({ budget: 260, ceiling: 299, floor: 226 });
  });

  it('applies the 1.18x TE premium on top of the 5x scale', () => {
    // raw 37 -> 185 -> TE premium round(185*1.18)=218 -> ceiling round(218*1.15)=251 -> floor max(5, round(218*0.87))=190
    expect(scaleRankingValue('TE', 37)).toEqual({ budget: 218, ceiling: 251, floor: 190 });
  });

  it('clamps budget to a minimum of 5', () => {
    expect(scaleRankingValue('QB', 0)).toEqual({ budget: 5, ceiling: 6, floor: 5 });
  });

  it('applies the same formula (no TE premium) to PICK rows', () => {
    expect(scaleRankingValue('PICK', 15)).toEqual({ budget: 75, ceiling: 86, floor: 65 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test scaleRankingValue.test.ts`
Expected: FAIL with "Cannot find module '@/lib/scaleRankingValue'"

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/scaleRankingValue.ts
import type { Position } from '@/types';

export interface ScaledRankingValue {
  budget: number;
  ceiling: number;
  floor: number;
}

const SCALE = 5;
const TE_PREMIUM = 1.18;

export function scaleRankingValue(pos: Position, rawValue: number): ScaledRankingValue {
  let budget = Math.max(5, Math.round(rawValue * SCALE));
  if (pos === 'TE') budget = Math.round(budget * TE_PREMIUM);
  const ceiling = Math.round(budget * 1.15);
  const floor = Math.max(5, Math.round(budget * 0.87));
  return { budget, ceiling, floor };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test scaleRankingValue.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Refactor `src/data/players.ts` to use it**

Find this block near the bottom of the file:

```typescript
const SCALE = 5;
const TE_PREMIUM = 1.18;
```

Delete both constants (now live in `scaleRankingValue.ts`). Add the import at the top of the file:

```typescript
import { scaleRankingValue } from '@/lib/scaleRankingValue';
```

Replace the `players` export's mapping body:

```typescript
export const players: Player[] = RAW.map(([player, team, pos, age, sfRank, val2QB, notes]) => {
  if (pos === 'PKG') {
    const v = PKG_VALUES[player];
    if (!v) throw new Error(`Unknown PKG entry "${player}" — add it to PKG_VALUES`);
    return { player, team, pos: pos as Position, age, sfRank, ...v, notes };
  }
  const scaled = scaleRankingValue(pos as Position, val2QB);
  return { player, team, pos: pos as Position, age, sfRank, ...scaled, notes };
});

export const PKG_PLAYERS: Player[] = players.filter((p) => p.pos === 'PKG');
```

- [ ] **Step 6: Extend `src/__tests__/players.test.ts` for the refactor + new export**

Add to the existing `describe('players data', ...)` block:

```typescript
import { players, PKG_PLAYERS } from '@/data/players';

// ...existing tests unchanged...

it('exports PKG_PLAYERS as a subset of players', () => {
  expect(PKG_PLAYERS.length).toBeGreaterThan(0);
  PKG_PLAYERS.forEach((p) => {
    expect(p.pos).toBe('PKG');
    expect(players).toContainEqual(p);
  });
});
```

- [ ] **Step 7: Run tests to verify the refactor produced identical output**

Run: `pnpm test players.test.ts scaleRankingValue.test.ts`
Expected: PASS — `players.test.ts`'s existing budget/ceiling/floor assertions still hold, confirming the refactor is behavior-preserving.

- [ ] **Step 8: Run full quality gate**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add src/lib/scaleRankingValue.ts src/__tests__/scaleRankingValue.test.ts src/data/players.ts src/__tests__/players.test.ts
git commit -m "refactor: extract value-scaling formula; split PKG_PLAYERS export"
```

---

### Task 4: Sleeper name/team normalization

**Files:**

- Create: `src/lib/sleeperNormalize.ts`
- Test: `src/__tests__/sleeperNormalize.test.ts`

**Interfaces:**

- Produces: `normalizeName(name: string): string`, `normalizeTeam(team: string | null | undefined): string`, `normalizePosition(position: string | null | undefined): 'QB' | 'RB' | 'WR' | 'TE' | null` — consumed by Task 5 (`sleeperMatch.ts`) and Task 6 (sync script).

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/sleeperNormalize.test.ts
import { normalizeName, normalizeTeam, normalizePosition } from '@/lib/sleeperNormalize';

describe('normalizeName', () => {
  it('lowercases and trims', () => {
    expect(normalizeName(' Josh Allen ')).toBe('josh allen');
  });

  it('strips periods, apostrophes, hyphens, and commas', () => {
    expect(normalizeName("Ja'Marr Chase")).toBe('jamarr chase');
    expect(normalizeName('D.J. Moore')).toBe('dj moore');
    expect(normalizeName('Amon-Ra St. Brown')).toBe('amonra st brown');
  });

  it('strips generational suffixes', () => {
    expect(normalizeName('Michael Pittman Jr.')).toBe('michael pittman');
    expect(normalizeName('Kenneth Walker III')).toBe('kenneth walker');
  });

  it('strips single-letter middle initials', () => {
    expect(normalizeName('Marvin Harrison Jr.')).toBe('marvin harrison');
  });

  it('strips accents', () => {
    expect(normalizeName('José Ramírez')).toBe('jose ramirez');
  });
});

describe('normalizeTeam', () => {
  it('uppercases and maps legacy abbreviations to current ones', () => {
    expect(normalizeTeam('jax')).toBe('JAX');
    expect(normalizeTeam('WFT')).toBe('WAS');
    expect(normalizeTeam('LA')).toBe('LAR');
    expect(normalizeTeam('OAK')).toBe('LV');
  });

  it('treats free-agent markers as blank', () => {
    expect(normalizeTeam('FA')).toBe('');
    expect(normalizeTeam('—')).toBe('');
    expect(normalizeTeam(null)).toBe('');
    expect(normalizeTeam(undefined)).toBe('');
  });

  it('passes through an already-current abbreviation unchanged', () => {
    expect(normalizeTeam('BUF')).toBe('BUF');
  });
});

describe('normalizePosition', () => {
  it('accepts QB/RB/WR/TE case-insensitively', () => {
    expect(normalizePosition('qb')).toBe('QB');
    expect(normalizePosition('WR')).toBe('WR');
  });

  it('returns null for unsupported positions', () => {
    expect(normalizePosition('K')).toBeNull();
    expect(normalizePosition('Pick')).toBeNull();
    expect(normalizePosition(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test sleeperNormalize.test.ts`
Expected: FAIL with "Cannot find module '@/lib/sleeperNormalize'"

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/sleeperNormalize.ts
const SUFFIX_RE = /\b(jr|sr|ii|iii|iv|v)\.?\b/gi;
const MIDDLE_INITIAL_RE = /\b[a-z]\b/gi;
const WHITESPACE_RE = /\s+/g;

const TEAM_ALIASES: Record<string, string> = {
  ARI: 'ARI',
  ARZ: 'ARI',
  ATL: 'ATL',
  BAL: 'BAL',
  BLT: 'BAL',
  BUF: 'BUF',
  CAR: 'CAR',
  CHI: 'CHI',
  CIN: 'CIN',
  CLE: 'CLE',
  CLV: 'CLE',
  DAL: 'DAL',
  DEN: 'DEN',
  DET: 'DET',
  GB: 'GB',
  HOU: 'HOU',
  HST: 'HOU',
  IND: 'IND',
  JAC: 'JAX',
  JAX: 'JAX',
  KC: 'KC',
  LA: 'LAR',
  LAC: 'LAC',
  LAR: 'LAR',
  LV: 'LV',
  OAK: 'LV',
  MIA: 'MIA',
  MIN: 'MIN',
  NE: 'NE',
  NO: 'NO',
  NYG: 'NYG',
  NYJ: 'NYJ',
  PHI: 'PHI',
  PIT: 'PIT',
  SEA: 'SEA',
  SF: 'SF',
  TB: 'TB',
  TEN: 'TEN',
  WFT: 'WAS',
  WAS: 'WAS',
  WSH: 'WAS',
};

export function normalizeName(name: string): string {
  let normalized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritical marks left by NFKD
    .toLowerCase()
    .trim()
    .replace(/\./g, '')
    .replace(/'/g, '')
    .replace(/-/g, '')
    .replace(/,/g, '');
  normalized = normalized.replace(SUFFIX_RE, '');
  normalized = normalized.replace(MIDDLE_INITIAL_RE, '');
  return normalized.replace(WHITESPACE_RE, ' ').trim();
}

export function normalizeTeam(team: string | null | undefined): string {
  if (!team) return '';
  const raw = team.trim().toUpperCase();
  if (raw === '' || raw === 'FA' || raw === '-' || raw === '—' || raw === '–') return '';
  return TEAM_ALIASES[raw] ?? raw;
}

export function normalizePosition(
  position: string | null | undefined,
): 'QB' | 'RB' | 'WR' | 'TE' | null {
  if (!position) return null;
  const normalized = position.trim().toUpperCase();
  if (normalized === 'QB' || normalized === 'RB' || normalized === 'WR' || normalized === 'TE') {
    return normalized;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test sleeperNormalize.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Run full quality gate**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/sleeperNormalize.ts src/__tests__/sleeperNormalize.test.ts
git commit -m "feat: add Sleeper name/team normalization"
```

---

### Task 5: Sleeper matching

**Files:**

- Create: `src/lib/sleeperMatch.ts`
- Test: `src/__tests__/sleeperMatch.test.ts`

**Interfaces:**

- Consumes: `normalizeName`, `normalizeTeam` from `src/lib/sleeperNormalize.ts` (Task 4).
- Produces: `SleeperPlayerRecord { id, name, normalizedName, team, pos }`, `MatchInput { name, team, pos }`, `MatchOutcome = { status: 'matched'; sleeperId: string } | { status: 'unmatched' }`, `matchToSleeper(input: MatchInput, sleeperPlayers: SleeperPlayerRecord[]): MatchOutcome` — consumed by Task 8 (`rankings-actions.ts`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/sleeperMatch.test.ts
import { matchToSleeper, type SleeperPlayerRecord } from '@/lib/sleeperMatch';

const POOL: SleeperPlayerRecord[] = [
  { id: '1', name: 'Josh Allen', normalizedName: 'josh allen', team: 'BUF', pos: 'QB' },
  { id: '2', name: 'Josh Allen', normalizedName: 'josh allen', team: 'MIN', pos: 'LB' },
  { id: '3', name: "Ja'Marr Chase", normalizedName: 'jamarr chase', team: 'CIN', pos: 'WR' },
  { id: '4', name: 'Joshua Palmer', normalizedName: 'joshua palmer', team: 'LAC', pos: 'WR' },
  { id: '5', name: 'Free Agent Guy', normalizedName: 'free agent guy', team: '', pos: 'RB' },
];

describe('matchToSleeper', () => {
  it('matches on exact normalized name + team + position', () => {
    const result = matchToSleeper({ name: 'Josh Allen', team: 'BUF', pos: 'QB' }, POOL);
    expect(result).toEqual({ status: 'matched', sleeperId: '1' });
  });

  it('falls back to name + position when team is blank', () => {
    const result = matchToSleeper({ name: 'Free Agent Guy', team: '', pos: 'RB' }, POOL);
    expect(result).toEqual({ status: 'matched', sleeperId: '5' });
  });

  it('resolves a known alias', () => {
    const result = matchToSleeper({ name: 'Josh Palmer', team: 'LAC', pos: 'WR' }, POOL);
    expect(result).toEqual({ status: 'matched', sleeperId: '4' });
  });

  it('returns unmatched when no candidate exists', () => {
    const result = matchToSleeper({ name: 'Nobody Real', team: 'BUF', pos: 'QB' }, POOL);
    expect(result).toEqual({ status: 'unmatched' });
  });

  it('returns unmatched when name+position alone is ambiguous and team does not disambiguate', () => {
    const ambiguous: SleeperPlayerRecord[] = [
      { id: '10', name: 'Sam Test', normalizedName: 'sam test', team: 'BUF', pos: 'WR' },
      { id: '11', name: 'Sam Test', normalizedName: 'sam test', team: 'MIA', pos: 'WR' },
    ];
    const result = matchToSleeper({ name: 'Sam Test', team: '', pos: 'WR' }, ambiguous);
    expect(result).toEqual({ status: 'unmatched' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test sleeperMatch.test.ts`
Expected: FAIL with "Cannot find module '@/lib/sleeperMatch'"

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/sleeperMatch.ts
import { normalizeName, normalizeTeam } from '@/lib/sleeperNormalize';

export interface SleeperPlayerRecord {
  id: string;
  name: string;
  normalizedName: string;
  team: string;
  pos: string;
}

export interface MatchInput {
  name: string;
  team: string;
  pos: string;
}

export type MatchOutcome = { status: 'matched'; sleeperId: string } | { status: 'unmatched' };

const MANUAL_ALIASES: Record<string, string> = {
  'bam knight': 'zonovan knight',
  'cameron ward': 'cam ward',
  'chigoziem okonkwo': 'chig okonkwo',
  'christopher rodriguez': 'chris rodriguez',
  'hollywood brown': 'marquise brown',
  'josh palmer': 'joshua palmer',
  'ken walker': 'kenneth walker',
  'kenneth gainwell': 'kenny gainwell',
  'nathaniel dell': 'tank dell',
  'nick singleton': 'nicholas singleton',
};

export function matchToSleeper(
  input: MatchInput,
  sleeperPlayers: SleeperPlayerRecord[],
): MatchOutcome {
  const normalizedName = normalizeName(input.name);
  const normalizedTeam = normalizeTeam(input.team);

  const byNameAndPos = sleeperPlayers.filter(
    (p) => p.normalizedName === normalizedName && p.pos === input.pos,
  );

  if (normalizedTeam) {
    const withTeam = byNameAndPos.filter((p) => p.team === normalizedTeam);
    if (withTeam.length === 1) return { status: 'matched', sleeperId: withTeam[0].id };
  }
  if (byNameAndPos.length === 1) {
    return { status: 'matched', sleeperId: byNameAndPos[0].id };
  }

  const alias = MANUAL_ALIASES[normalizedName];
  if (alias) {
    const aliasCandidates = sleeperPlayers.filter(
      (p) =>
        p.normalizedName === alias &&
        p.pos === input.pos &&
        (!normalizedTeam || p.team === normalizedTeam),
    );
    if (aliasCandidates.length === 1) {
      return { status: 'matched', sleeperId: aliasCandidates[0].id };
    }
  }

  return { status: 'unmatched' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test sleeperMatch.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Run full quality gate**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/sleeperMatch.ts src/__tests__/sleeperMatch.test.ts
git commit -m "feat: add Sleeper name/team/position matching"
```

---

### Task 6: `SleeperPlayer` sync script

**Files:**

- Create: `prisma/sync-sleeper-players.ts`

**Interfaces:**

- Consumes: `parseCsv` from `src/lib/csv.ts` (Task 2), `normalizeName` from `src/lib/sleeperNormalize.ts` (Task 4), `SleeperPlayer` Prisma model (Task 1), reads `data/generated/normalized_sleeper_players.csv` (columns: `sleeper_id, full_name, first_name, last_name, search_full_name, normalized_name, team, position, fantasy_positions, age, years_exp, active, status`).
- Produces: upserted `SleeperPlayer` rows — consumed at runtime by Task 8's matching call.

This is a one-off script (not app runtime code), following the existing pattern in `prisma/sync-players.ts` — no unit test, verified by running it against a real (or locally seeded) database.

- [ ] **Step 1: Write the script**

```typescript
// prisma/sync-sleeper-players.ts
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { parseCsv } from '../src/lib/csv';
import { normalizeName } from '../src/lib/sleeperNormalize';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SUPPORTED_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
const CSV_PATH = path.resolve(process.cwd(), 'data/generated/normalized_sleeper_players.csv');

// Upserts SleeperPlayer rows from the Python pipeline's normalized_sleeper_players.csv.
// Safe to re-run whenever that file is regenerated — keyed by Sleeper's own player id.
async function main() {
  const contents = readFileSync(CSV_PATH, 'utf-8');
  const { rows } = parseCsv(contents);
  const kept = rows.filter((row) => row.active === 'True' && SUPPORTED_POSITIONS.has(row.position));
  console.log(`Parsed ${rows.length} row(s), ${kept.length} active QB/RB/WR/TE.`);

  for (const row of kept) {
    const data = {
      name: row.full_name,
      normalizedName: normalizeName(row.full_name),
      team: row.team ?? '',
      pos: row.position,
      age: row.age ? Number(row.age) : null,
    };
    await prisma.sleeperPlayer.upsert({
      where: { id: row.sleeper_id },
      create: { id: row.sleeper_id, ...data },
      update: data,
    });
  }
  console.log(`Upserted ${kept.length} SleeperPlayer row(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run it against local dev DB**

Run: `pnpm tsx prisma/sync-sleeper-players.ts`
Expected: `Parsed 3035 row(s), 3035 active QB/RB/WR/TE.` (or similar — count depends on the current generated CSV) followed by `Upserted N SleeperPlayer row(s).`

- [ ] **Step 3: Spot-check via Prisma Studio**

Run: `make db-studio`
Expected: `SleeperPlayer` table populated; a few known names (e.g. "Josh Allen", "Ja'Marr Chase") present with correct `team`/`pos`.

- [ ] **Step 4: Run full quality gate**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add prisma/sync-sleeper-players.ts
git commit -m "feat: add SleeperPlayer sync script"
```

---

### Task 7: Rankings CSV parse/validate pipeline

**Files:**

- Create: `src/lib/rankingsImport.ts`
- Test: `src/__tests__/rankingsImport.test.ts`

**Interfaces:**

- Consumes: `parseCsv` from `src/lib/csv.ts` (Task 2), `scaleRankingValue` from `src/lib/scaleRankingValue.ts` (Task 3).
- Produces: `ParsedRankingRow { name, team, pos, age, sfRank, budget, ceiling, floor, notes }`, `RankingsParseResult = { ok: true; rows: ParsedRankingRow[] } | { ok: false; errors: string[] }`, `parseRankingsCsv(csvText: string): RankingsParseResult` — consumed by Task 8 (`rankings-actions.ts`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/rankingsImport.test.ts
import { parseRankingsCsv } from '@/lib/rankingsImport';

const HEADER = 'Player,Team,Position,Age,2QBAuction';
const HEADER_WITH_RANK = 'Player,Team,Position,Age,SF/TE Prem,2QBAuction';

describe('parseRankingsCsv', () => {
  it('rejects a file missing required columns', () => {
    const result = parseRankingsCsv('Player,Team\nJosh Allen,BUF');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/missing required column/i);
    }
  });

  it('parses valid QB/RB/WR/TE rows and derives sfRank by budget descending when SF/TE Prem is absent', () => {
    const csv = [
      HEADER,
      'Josh Allen,BUF,QB,30.1,$51',
      "Ja'Marr Chase,CIN,WR,26.3,$49",
      'Some Guy,FA,QB,25,$10',
    ].join('\n');
    const result = parseRankingsCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(3);
    const allen = result.rows.find((r) => r.name === 'Josh Allen')!;
    expect(allen).toMatchObject({ team: 'BUF', pos: 'QB', age: 30.1, sfRank: 1, budget: 255 });
    const chase = result.rows.find((r) => r.name === "Ja'Marr Chase")!;
    expect(chase.sfRank).toBe(2);
    const guy = result.rows.find((r) => r.name === 'Some Guy')!;
    expect(guy.sfRank).toBe(3);
  });

  it('uses the SF/TE Prem column directly when present', () => {
    const csv = [
      HEADER_WITH_RANK,
      'Josh Allen,BUF,QB,30.1,2,$51',
      "Ja'Marr Chase,CIN,WR,26.3,1,$49",
    ].join('\n');
    const result = parseRankingsCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.find((r) => r.name === 'Josh Allen')!.sfRank).toBe(2);
    expect(result.rows.find((r) => r.name === "Ja'Marr Chase")!.sfRank).toBe(1);
  });

  it('rejects when SF/TE Prem is present but a kept row is missing a value', () => {
    const csv = [HEADER_WITH_RANK, 'Josh Allen,BUF,QB,30.1,,$51'].join('\n');
    const result = parseRankingsCsv(csv);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/SF\/TE Prem/);
    }
  });

  it('keeps Pick rows with a null age and no matching required', () => {
    const csv = [HEADER, '2027 1st Round Draft Pick,,Pick,,$15'].join('\n');
    const result = parseRankingsCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ pos: 'PICK', age: null });
  });

  it('silently drops rows with an unsupported position', () => {
    const csv = [HEADER, 'Some Kicker,LAC,K,28,$0'].join('\n');
    const result = parseRankingsCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(0);
  });

  it('collects multiple row errors instead of aborting on the first', () => {
    const csv = [HEADER, ',BUF,QB,30,$50', 'Bad Age Guy,BUF,QB,not-a-number,$40'].join('\n');
    const result = parseRankingsCsv(csv);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(2);
    }
  });

  it('defaults Notes to empty string when the column is absent', () => {
    const csv = [HEADER, 'Josh Allen,BUF,QB,30.1,$51'].join('\n');
    const result = parseRankingsCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0].notes).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test rankingsImport.test.ts`
Expected: FAIL with "Cannot find module '@/lib/rankingsImport'"

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/rankingsImport.ts
import { parseCsv } from '@/lib/csv';
import { scaleRankingValue } from '@/lib/scaleRankingValue';
import type { Position } from '@/types';

export interface ParsedRankingRow {
  name: string;
  team: string;
  pos: Position;
  age: number | null;
  sfRank: number;
  budget: number;
  ceiling: number;
  floor: number;
  notes: string;
}

export type RankingsParseResult =
  | { ok: true; rows: ParsedRankingRow[] }
  | { ok: false; errors: string[] };

const REQUIRED_HEADERS = ['Player', 'Team', 'Position', 'Age', '2QBAuction'] as const;
const POSITION_MAP: Record<string, Position> = {
  QB: 'QB',
  RB: 'RB',
  WR: 'WR',
  TE: 'TE',
  Pick: 'PICK',
};

interface KeptRow {
  name: string;
  team: string;
  pos: Position;
  age: number | null;
  notes: string;
  rawValue: number;
  explicitRank: number | null;
}

export function parseRankingsCsv(csvText: string): RankingsParseResult {
  const { headers, rows: rawRows } = parseCsv(csvText);
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    return { ok: false, errors: [`Missing required column(s): ${missing.join(', ')}`] };
  }
  const hasExplicitRank = headers.includes('SF/TE Prem');

  const errors: string[] = [];
  const kept: KeptRow[] = [];

  rawRows.forEach((row, i) => {
    const rowNum = i + 2;
    const pos = POSITION_MAP[row.Position?.trim()];
    if (!pos) return;

    const name = row.Player?.trim();
    if (!name) {
      errors.push(`Row ${rowNum}: missing Player name`);
      return;
    }

    let age: number | null = null;
    if (pos !== 'PICK') {
      const ageRaw = row.Age?.trim();
      const parsedAge = Number(ageRaw);
      if (!ageRaw || Number.isNaN(parsedAge)) {
        errors.push(`Row ${rowNum} (${name}): invalid Age "${ageRaw ?? ''}"`);
        return;
      }
      age = parsedAge;
    }

    const valueRaw = row['2QBAuction']?.trim().replace(/^\$/, '');
    const parsedValue = Number(valueRaw);
    if (valueRaw === undefined || valueRaw === '' || Number.isNaN(parsedValue) || parsedValue < 0) {
      errors.push(`Row ${rowNum} (${name}): invalid 2QBAuction value "${row['2QBAuction'] ?? ''}"`);
      return;
    }

    let explicitRank: number | null = null;
    if (hasExplicitRank) {
      const rankRaw = row['SF/TE Prem']?.trim();
      const parsedRank = Number(rankRaw);
      if (!rankRaw || Number.isNaN(parsedRank)) {
        errors.push(`Row ${rowNum} (${name}): invalid SF/TE Prem "${rankRaw ?? ''}"`);
        return;
      }
      explicitRank = parsedRank;
    }

    kept.push({
      name,
      team: row.Team?.trim() ?? '',
      pos,
      age,
      notes: row.Notes?.trim() ?? '',
      rawValue: parsedValue,
      explicitRank,
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const scaled = kept.map((row) => ({ ...row, ...scaleRankingValue(row.pos, row.rawValue) }));

  const ranked = hasExplicitRank
    ? scaled.map((row) => ({ ...row, sfRank: row.explicitRank as number }))
    : [...scaled].sort((a, b) => b.budget - a.budget).map((row, i) => ({ ...row, sfRank: i + 1 }));

  const rows: ParsedRankingRow[] = ranked.map(
    ({ name, team, pos, age, sfRank, budget, ceiling, floor, notes }) => ({
      name,
      team,
      pos,
      age,
      sfRank,
      budget,
      ceiling,
      floor,
      notes,
    }),
  );

  return { ok: true, rows };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test rankingsImport.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Run full quality gate**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/rankingsImport.ts src/__tests__/rankingsImport.test.ts
git commit -m "feat: add rankings CSV parse/validate pipeline"
```

---

### Task 8: Rankings server actions

**Files:**

- Create: `src/lib/rankings-actions.ts`
- Test: `src/__tests__/rankings-actions.test.ts`

**Interfaces:**

- Consumes: `parseRankingsCsv` (Task 7), `matchToSleeper` + `SleeperPlayerRecord` (Task 5), `prisma` from `@/lib/db`, `auth` from `@/auth`.
- Produces: `RankingSummary { fileName, uploadedAt, totalCount, matchedCount, unmatchedCount }`, `getRankingSummary(): Promise<RankingSummary | null>`, `UploadResult = { ok: true } | { ok: false; errors: string[] }`, `uploadRankingsCsv(fileName: string, csvText: string): Promise<UploadResult>`, `resolveRankingMatch(rankingPlayerId: number, sleeperId: string): Promise<void>` — consumed by Task 9, Task 10, and Task 13.

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/rankings-actions.test.ts
import { getRankingSummary, uploadRankingsCsv, resolveRankingMatch } from '@/lib/rankings-actions';

const mockAuth = jest.fn();
const mockFindUnique = jest.fn();
const mockSleeperFindMany = jest.fn();
const mockTransaction = jest.fn();
const mockRevalidatePath = jest.fn();
const mockPlayerFindUnique = jest.fn();
const mockPlayerUpdate = jest.fn();

const mockTxUpsert = jest.fn();
const mockTxDeleteMany = jest.fn();
const mockTxCreateMany = jest.fn();

jest.mock('@/auth', () => ({ auth: () => mockAuth() }));
jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));
jest.mock('@/lib/db', () => ({
  prisma: {
    userRankingSet: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    sleeperPlayer: {
      findMany: (...args: unknown[]) => mockSleeperFindMany(...args),
    },
    userRankingPlayer: {
      findUnique: (...args: unknown[]) => mockPlayerFindUnique(...args),
      update: (...args: unknown[]) => mockPlayerUpdate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const MOCK_SESSION = { user: { id: '123456789', name: 'Cole' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockSleeperFindMany.mockResolvedValue([
    { id: 's1', name: 'Josh Allen', normalizedName: 'josh allen', team: 'BUF', pos: 'QB' },
  ]);
  mockTransaction.mockImplementation((callback) =>
    callback({
      userRankingSet: { upsert: mockTxUpsert },
      userRankingPlayer: { deleteMany: mockTxDeleteMany, createMany: mockTxCreateMany },
    }),
  );
  mockTxUpsert.mockResolvedValue({ id: 42 });
});

const VALID_CSV = ['Player,Team,Position,Age,2QBAuction', 'Josh Allen,BUF,QB,30.1,$51'].join('\n');

describe('getRankingSummary', () => {
  it('returns null when no session', async () => {
    mockAuth.mockResolvedValue(null);
    expect(await getRankingSummary()).toBeNull();
  });

  it('returns null when the user has no ranking set', async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await getRankingSummary()).toBeNull();
  });

  it('summarizes matched/unmatched counts', async () => {
    mockFindUnique.mockResolvedValue({
      fileName: 'my_rankings.csv',
      uploadedAt: new Date('2026-07-01'),
      players: [
        { matchStatus: 'matched' },
        { matchStatus: 'manual' },
        { matchStatus: 'unmatched' },
      ],
    });
    const summary = await getRankingSummary();
    expect(summary).toEqual({
      fileName: 'my_rankings.csv',
      uploadedAt: new Date('2026-07-01'),
      totalCount: 3,
      matchedCount: 2,
      unmatchedCount: 1,
    });
  });
});

describe('uploadRankingsCsv', () => {
  it('throws when called without a session', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(uploadRankingsCsv('rankings.csv', VALID_CSV)).rejects.toThrow('Unauthorized');
  });

  it('returns parse errors without persisting', async () => {
    const result = await uploadRankingsCsv('bad.csv', 'Player,Team\nJosh Allen,BUF');
    expect(result).toEqual({ ok: false, errors: expect.any(Array) });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('replaces the existing set and persists matched rows', async () => {
    const result = await uploadRankingsCsv('rankings.csv', VALID_CSV);
    expect(result).toEqual({ ok: true });
    expect(mockTxUpsert).toHaveBeenCalledWith({
      where: { userId: '123456789' },
      create: expect.objectContaining({ userId: '123456789', fileName: 'rankings.csv' }),
      update: expect.objectContaining({ fileName: 'rankings.csv' }),
    });
    expect(mockTxDeleteMany).toHaveBeenCalledWith({ where: { rankingSetId: 42 } });
    expect(mockTxCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          rankingSetId: 42,
          name: 'Josh Allen',
          sleeperId: 's1',
          matchStatus: 'matched',
        }),
      ],
    });
  });

  it('marks Pick rows as n_a without attempting a match', async () => {
    const csv = [
      'Player,Team,Position,Age,2QBAuction',
      '2027 1st Round Draft Pick,,Pick,,$15',
    ].join('\n');
    await uploadRankingsCsv('rankings.csv', csv);
    expect(mockTxCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ pos: 'PICK', sleeperId: null, matchStatus: 'n_a' })],
    });
  });
});

describe('resolveRankingMatch', () => {
  it('throws when the ranking player does not belong to the session user', async () => {
    mockPlayerFindUnique.mockResolvedValue({ rankingSet: { userId: 'someone-else' } });
    await expect(resolveRankingMatch(1, 's99')).rejects.toThrow('Not found');
  });

  it('updates sleeperId and matchStatus to manual', async () => {
    mockPlayerFindUnique.mockResolvedValue({ rankingSet: { userId: '123456789' } });
    await resolveRankingMatch(1, 's99');
    expect(mockPlayerUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { sleeperId: 's99', matchStatus: 'manual' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test rankings-actions.test.ts`
Expected: FAIL with "Cannot find module '@/lib/rankings-actions'"

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/rankings-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { parseRankingsCsv } from '@/lib/rankingsImport';
import { matchToSleeper } from '@/lib/sleeperMatch';

export interface RankingSummary {
  fileName: string | null;
  uploadedAt: Date;
  totalCount: number;
  matchedCount: number;
  unmatchedCount: number;
}

export async function getRankingSummary(): Promise<RankingSummary | null> {
  const session = await auth();
  if (!session) return null;

  const set = await prisma.userRankingSet.findUnique({
    where: { userId: session.user.id },
    select: { fileName: true, uploadedAt: true, players: { select: { matchStatus: true } } },
  });
  if (!set) return null;

  return {
    fileName: set.fileName,
    uploadedAt: set.uploadedAt,
    totalCount: set.players.length,
    matchedCount: set.players.filter(
      (p) => p.matchStatus === 'matched' || p.matchStatus === 'manual',
    ).length,
    unmatchedCount: set.players.filter((p) => p.matchStatus === 'unmatched').length,
  };
}

export type UploadResult = { ok: true } | { ok: false; errors: string[] };

export async function uploadRankingsCsv(fileName: string, csvText: string): Promise<UploadResult> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const parsed = parseRankingsCsv(csvText);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const sleeperPlayers = await prisma.sleeperPlayer.findMany({
    select: { id: true, name: true, normalizedName: true, team: true, pos: true },
  });

  const matchedRows = parsed.rows.map((row) => {
    if (row.pos === 'PICK') {
      return { ...row, sleeperId: null as string | null, matchStatus: 'n_a' };
    }
    const outcome = matchToSleeper(
      { name: row.name, team: row.team, pos: row.pos },
      sleeperPlayers,
    );
    return outcome.status === 'matched'
      ? { ...row, sleeperId: outcome.sleeperId as string | null, matchStatus: 'matched' }
      : { ...row, sleeperId: null as string | null, matchStatus: 'unmatched' };
  });

  await prisma.$transaction(async (tx) => {
    const set = await tx.userRankingSet.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, fileName, uploadedAt: new Date() },
      update: { fileName, uploadedAt: new Date() },
    });
    await tx.userRankingPlayer.deleteMany({ where: { rankingSetId: set.id } });
    await tx.userRankingPlayer.createMany({
      data: matchedRows.map((row) => ({
        rankingSetId: set.id,
        name: row.name,
        team: row.team,
        pos: row.pos,
        age: row.age,
        sfRank: row.sfRank,
        budget: row.budget,
        ceiling: row.ceiling,
        floor: row.floor,
        notes: row.notes,
        sleeperId: row.sleeperId,
        matchStatus: row.matchStatus,
      })),
    });
  });

  revalidatePath('/rankings');
  revalidatePath('/drafts/new');
  return { ok: true };
}

export async function resolveRankingMatch(
  rankingPlayerId: number,
  sleeperId: string,
): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const player = await prisma.userRankingPlayer.findUnique({
    where: { id: rankingPlayerId },
    select: { rankingSet: { select: { userId: true } } },
  });
  if (!player || player.rankingSet.userId !== session.user.id) throw new Error('Not found');

  await prisma.userRankingPlayer.update({
    where: { id: rankingPlayerId },
    data: { sleeperId, matchStatus: 'manual' },
  });
  revalidatePath('/rankings');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test rankings-actions.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Run full quality gate**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/rankings-actions.ts src/__tests__/rankings-actions.test.ts
git commit -m "feat: add rankings upload/resolve/summary server actions"
```

---

### Task 9: `/rankings` page + upload form

**Files:**

- Create: `src/app/rankings/page.tsx`
- Create: `src/components/RankingsUpload/RankingsUploadForm.tsx`
- Test: `src/__tests__/RankingsUploadForm.test.tsx`

**Interfaces:**

- Consumes: `uploadRankingsCsv` from `src/lib/rankings-actions.ts` (Task 8); `prisma`, `auth`.
- Produces: `RankingSummaryView { fileName, uploadedAt, totalCount, matchedCount, unmatchedCount }` (string-serialized `uploadedAt` for the client boundary), `RankingsUploadForm({ summary }: { summary: RankingSummaryView | null })` — consumed by Task 13's `getRankingSummary()` shape reference (same fields, reused independently) and rendered by `src/app/rankings/page.tsx`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/RankingsUploadForm.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RankingsUploadForm from '@/components/RankingsUpload/RankingsUploadForm';

const mockUpload = jest.fn();
jest.mock('@/lib/rankings-actions', () => ({
  uploadRankingsCsv: (...args: unknown[]) => mockUpload(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

function makeFile(contents: string, name = 'rankings.csv') {
  return new File([contents], name, { type: 'text/csv' });
}

describe('RankingsUploadForm', () => {
  it('shows upload prompt with no existing summary', () => {
    render(<RankingsUploadForm summary={null} />);
    expect(screen.getByTestId('rankings-upload-button')).toHaveTextContent('Upload CSV');
  });

  it('shows the summary card when a ranking set exists', () => {
    render(
      <RankingsUploadForm
        summary={{
          fileName: 'my_rankings.csv',
          uploadedAt: '2026-07-01T00:00:00.000Z',
          totalCount: 267,
          matchedCount: 260,
          unmatchedCount: 7,
        }}
      />,
    );
    expect(screen.getByTestId('rankings-summary')).toHaveTextContent('267');
    expect(screen.getByTestId('rankings-upload-button')).toHaveTextContent('Re-upload CSV');
  });

  it('uploads the selected file and shows no errors on success', async () => {
    mockUpload.mockResolvedValue({ ok: true });
    render(<RankingsUploadForm summary={null} />);
    const input = screen.getByTestId('rankings-upload-button').querySelector('input')!;
    const user = userEvent.setup();

    await user.upload(input, makeFile('Player,Team,Position,Age,2QBAuction\nJosh Allen,BUF,QB,30.1,$51'));

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledWith(
        'rankings.csv',
        'Player,Team,Position,Age,2QBAuction\nJosh Allen,BUF,QB,30.1,$51',
      );
    });
    expect(screen.queryByTestId('rankings-upload-errors')).not.toBeInTheDocument();
  });

  it('displays returned errors without throwing', async () => {
    mockUpload.mockResolvedValue({ ok: false, errors: ['Missing required column(s): Age'] });
    render(<RankingsUploadForm summary={null} />);
    const input = screen.getByTestId('rankings-upload-button').querySelector('input')!;
    const user = userEvent.setup();

    await user.upload(input, makeFile('Player,Team\nJosh Allen,BUF'));

    expect(await screen.findByTestId('rankings-upload-errors')).toHaveTextContent(
      'Missing required column(s): Age',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test RankingsUploadForm.test.tsx`
Expected: FAIL with "Cannot find module '@/components/RankingsUpload/RankingsUploadForm'"

- [ ] **Step 3: Write `RankingsUploadForm`**

```typescript
// src/components/RankingsUpload/RankingsUploadForm.tsx
'use client';

import { useRef, useState, useTransition } from 'react';
import { uploadRankingsCsv } from '@/lib/rankings-actions';

export interface RankingSummaryView {
  fileName: string | null;
  uploadedAt: string;
  totalCount: number;
  matchedCount: number;
  unmatchedCount: number;
}

interface RankingsUploadFormProps {
  summary: RankingSummaryView | null;
}

export default function RankingsUploadForm({ summary }: RankingsUploadFormProps) {
  const [errors, setErrors] = useState<string[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrors(null);
    startTransition(async () => {
      const text = await file.text();
      const result = await uploadRankingsCsv(file.name, text);
      if (!result.ok) {
        setErrors(result.errors);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    });
  }

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderRadius: '6px',
        padding: '1.25rem',
        marginBottom: '1.5rem',
      }}
    >
      {summary ? (
        <div data-testid="rankings-summary">
          <p style={{ margin: 0, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {summary.totalCount} players · uploaded {new Date(summary.uploadedAt).toLocaleDateString()}
            {summary.fileName ? ` from ${summary.fileName}` : ''}
          </p>
          <p
            style={{
              margin: '0.25rem 0 0',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
              fontSize: '0.8rem',
            }}
          >
            {summary.matchedCount} matched to Sleeper · {summary.unmatchedCount} unmatched
          </p>
        </div>
      ) : (
        <p
          style={{
            margin: '0 0 0.75rem',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-barlow)',
            fontSize: '0.875rem',
          }}
        >
          Upload an ETR dynasty rankings export (CSV) to use your own player pool at draft creation.
          Required columns: Player, Team, Position, Age, 2QBAuction.
        </p>
      )}

      <label
        data-testid="rankings-upload-button"
        style={{
          display: 'inline-block',
          marginTop: '0.75rem',
          background: isPending ? 'var(--text-secondary)' : 'var(--pos-te)',
          color: '#fff',
          borderRadius: '4px',
          padding: '0.4rem 1rem',
          fontFamily: 'var(--font-barlow)',
          fontSize: '0.875rem',
          cursor: isPending ? 'not-allowed' : 'pointer',
        }}
      >
        {isPending ? 'Uploading…' : summary ? 'Re-upload CSV' : 'Upload CSV'}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelected}
          disabled={isPending}
          style={{ display: 'none' }}
        />
      </label>

      {errors && (
        <ul
          data-testid="rankings-upload-errors"
          style={{
            color: '#e05050',
            fontFamily: 'var(--font-barlow)',
            fontSize: '0.8rem',
            marginTop: '0.5rem',
          }}
        >
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test RankingsUploadForm.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Write `src/app/rankings/page.tsx`**

```typescript
// src/app/rankings/page.tsx
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import RankingsUploadForm from '@/components/RankingsUpload/RankingsUploadForm';
import ResolveUnmatchedList from '@/components/RankingsUpload/ResolveUnmatchedList';

export default async function RankingsPage() {
  const session = await auth();
  if (!session) redirect('/sign-in');

  const rankingSet = await prisma.userRankingSet.findUnique({
    where: { userId: session.user.id },
    include: { players: true },
  });

  const unmatched = rankingSet?.players.filter((p) => p.matchStatus === 'unmatched') ?? [];
  const sleeperPlayers =
    unmatched.length > 0
      ? await prisma.sleeperPlayer.findMany({
          select: { id: true, name: true, team: true, pos: true },
          orderBy: { name: 'asc' },
        })
      : [];

  return (
    <main style={{ padding: '2rem', maxWidth: '720px', margin: '0 auto' }}>
      <h1
        style={{
          fontFamily: 'var(--font-barlow)',
          fontSize: '1.5rem',
          color: 'var(--text-primary)',
          marginBottom: '1.5rem',
        }}
      >
        Custom Rankings
      </h1>
      <RankingsUploadForm
        summary={
          rankingSet
            ? {
                fileName: rankingSet.fileName,
                uploadedAt: rankingSet.uploadedAt.toISOString(),
                totalCount: rankingSet.players.length,
                matchedCount: rankingSet.players.filter(
                  (p) => p.matchStatus === 'matched' || p.matchStatus === 'manual',
                ).length,
                unmatchedCount: unmatched.length,
              }
            : null
        }
      />
      {unmatched.length > 0 && (
        <ResolveUnmatchedList
          unmatchedPlayers={unmatched.map((p) => ({ id: p.id, name: p.name, team: p.team, pos: p.pos }))}
          sleeperPlayers={sleeperPlayers}
        />
      )}
    </main>
  );
}
```

Note: `ResolveUnmatchedList` doesn't exist yet — that's Task 10. This file won't type-check until Task 10 lands; that's expected since both tasks touch the same page and Task 10 immediately follows.

- [ ] **Step 6: Commit**

```bash
git add src/app/rankings/page.tsx src/components/RankingsUpload/RankingsUploadForm.tsx src/__tests__/RankingsUploadForm.test.tsx
git commit -m "feat: add /rankings page with CSV upload"
```

---

### Task 10: Resolve-unmatched UI

**Files:**

- Create: `src/components/RankingsUpload/ResolveUnmatchedList.tsx`
- Test: `src/__tests__/ResolveUnmatchedList.test.tsx`

**Interfaces:**

- Consumes: `resolveRankingMatch` from `src/lib/rankings-actions.ts` (Task 8); `Command`, `CommandInput`, `CommandList`, `CommandItem` from `@/components/ui/command`.
- Produces: `UnmatchedRankingPlayer { id, name, team, pos }`, `SleeperPlayerOption { id, name, team, pos }`, `ResolveUnmatchedList({ unmatchedPlayers, sleeperPlayers })` — rendered by `src/app/rankings/page.tsx` (Task 9).

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/ResolveUnmatchedList.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResolveUnmatchedList from '@/components/RankingsUpload/ResolveUnmatchedList';

const mockResolve = jest.fn();
jest.mock('@/lib/rankings-actions', () => ({
  resolveRankingMatch: (...args: unknown[]) => mockResolve(...args),
}));

const UNMATCHED = [{ id: 1, name: 'J. Allen', team: 'BUF', pos: 'QB' }];
const SLEEPER_OPTIONS = [
  { id: 's1', name: 'Josh Allen', team: 'BUF', pos: 'QB' },
  { id: 's2', name: 'Josh Jacobs', team: 'GB', pos: 'RB' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockResolve.mockResolvedValue(undefined);
});

describe('ResolveUnmatchedList', () => {
  it('renders each unmatched row', () => {
    render(<ResolveUnmatchedList unmatchedPlayers={UNMATCHED} sleeperPlayers={SLEEPER_OPTIONS} />);
    expect(screen.getByTestId('unmatched-row-1')).toHaveTextContent('J. Allen');
  });

  it('filters Sleeper options as the user types and resolves on selection', async () => {
    const user = userEvent.setup();
    render(<ResolveUnmatchedList unmatchedPlayers={UNMATCHED} sleeperPlayers={SLEEPER_OPTIONS} />);

    await user.type(screen.getByTestId('unmatched-search-1'), 'Josh Al');
    const match = await screen.findByText(/Josh Allen/);
    await user.click(match);

    await waitFor(() => {
      expect(mockResolve).toHaveBeenCalledWith(1, 's1');
    });
  });

  it('removes a row from the list once resolved', async () => {
    const user = userEvent.setup();
    render(<ResolveUnmatchedList unmatchedPlayers={UNMATCHED} sleeperPlayers={SLEEPER_OPTIONS} />);

    await user.type(screen.getByTestId('unmatched-search-1'), 'Josh Al');
    await user.click(await screen.findByText(/Josh Allen/));

    await waitFor(() => {
      expect(screen.queryByTestId('unmatched-row-1')).not.toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test ResolveUnmatchedList.test.tsx`
Expected: FAIL with "Cannot find module '@/components/RankingsUpload/ResolveUnmatchedList'"

- [ ] **Step 3: Write the implementation**

```typescript
// src/components/RankingsUpload/ResolveUnmatchedList.tsx
'use client';

import { useMemo, useState, useTransition } from 'react';
import { Command, CommandInput, CommandList, CommandItem } from '@/components/ui/command';
import { resolveRankingMatch } from '@/lib/rankings-actions';

export interface UnmatchedRankingPlayer {
  id: number;
  name: string;
  team: string;
  pos: string;
}

export interface SleeperPlayerOption {
  id: string;
  name: string;
  team: string;
  pos: string;
}

interface ResolveUnmatchedListProps {
  unmatchedPlayers: UnmatchedRankingPlayer[];
  sleeperPlayers: SleeperPlayerOption[];
}

export default function ResolveUnmatchedList({
  unmatchedPlayers,
  sleeperPlayers,
}: ResolveUnmatchedListProps) {
  const [resolvedIds, setResolvedIds] = useState<Set<number>>(new Set());
  const remaining = unmatchedPlayers.filter((p) => !resolvedIds.has(p.id));

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: '6px', padding: '1.25rem' }}>
      <div
        style={{
          fontFamily: 'var(--font-barlow)',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          marginBottom: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Resolve unmatched ({remaining.length})
      </div>
      {remaining.map((player) => (
        <UnmatchedRow
          key={player.id}
          player={player}
          sleeperPlayers={sleeperPlayers}
          onResolved={() => setResolvedIds((prev) => new Set(prev).add(player.id))}
        />
      ))}
    </div>
  );
}

function UnmatchedRow({
  player,
  sleeperPlayers,
  onResolved,
}: {
  player: UnmatchedRankingPlayer;
  sleeperPlayers: SleeperPlayerOption[];
  onResolved: () => void;
}) {
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();

  const results = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return sleeperPlayers.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [search, sleeperPlayers]);

  function pick(sleeperId: string) {
    startTransition(async () => {
      await resolveRankingMatch(player.id, sleeperId);
      onResolved();
    });
  }

  return (
    <div
      data-testid={`unmatched-row-${player.id}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        marginBottom: '0.75rem',
        paddingBottom: '0.75rem',
        borderBottom: '1px solid #2a2f3e',
      }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontSize: '0.875rem' }}>
        {player.name} · {player.team} · {player.pos}
      </span>
      <Command shouldFilter={false}>
        <CommandInput
          data-testid={`unmatched-search-${player.id}`}
          placeholder="Search Sleeper players…"
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          {results.map((r) => (
            <CommandItem key={r.id} onSelect={() => pick(r.id)} disabled={isPending}>
              {r.name} · {r.team || 'FA'} · {r.pos}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test ResolveUnmatchedList.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Run full quality gate (rankings page now type-checks end to end)**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/components/RankingsUpload/ResolveUnmatchedList.tsx src/__tests__/ResolveUnmatchedList.test.tsx
git commit -m "feat: add resolve-unmatched search UI"
```

---

### Task 11: NavBar link to `/rankings`

**Files:**

- Modify: `src/components/NavBar/NavBar.tsx`
- Modify: `src/__tests__/NavBar.test.tsx`

**Interfaces:**

- No new exports — purely a UI addition inside the existing `NavBar` component.

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/NavBar.test.tsx`:

```typescript
it('links to /rankings from the account dropdown', async () => {
  const user = userEvent.setup();
  render(<NavBar session={MOCK_SESSION} />);

  await user.click(screen.getByRole('button', { name: /cole/i }));

  await waitFor(() => {
    expect(screen.getByRole('menuitem', { name: /rankings/i })).toHaveAttribute(
      'href',
      '/rankings',
    );
  });
});

it('links to /rankings from the mobile hamburger menu', async () => {
  const user = userEvent.setup();
  render(<NavBar session={MOCK_SESSION} />);

  await user.click(screen.getByRole('button', { name: /open menu/i }));

  const menu = await screen.findByRole('menu');
  expect(within(menu).getByRole('menuitem', { name: /rankings/i })).toHaveAttribute(
    'href',
    '/rankings',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test NavBar.test.tsx`
Expected: FAIL — no element with role `menuitem` named `/rankings/i`

- [ ] **Step 3: Add the link**

In `src/components/NavBar/NavBar.tsx`, add `import Link from 'next/link';` at the top. In the desktop `DropdownMenuContent` (before the sign-out `<form>`):

```tsx
<DropdownMenuItem
  render={<Link href="/rankings" />}
  className="font-label text-label-sm w-full font-bold tracking-wide uppercase"
>
  Rankings
</DropdownMenuItem>
<DropdownMenuSeparator />
```

And in the mobile `DropdownMenuContent`, right after the Feedback item and before the `{session && (...)}` block:

```tsx
{
  session && (
    <DropdownMenuItem
      render={<Link href="/rankings" />}
      className="font-label text-label-sm font-bold tracking-wide uppercase"
    >
      Rankings
    </DropdownMenuItem>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test NavBar.test.tsx`
Expected: PASS (all NavBar tests, including the 2 new ones)

- [ ] **Step 5: Run full quality gate**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/components/NavBar/NavBar.tsx src/__tests__/NavBar.test.tsx
git commit -m "feat: link to /rankings from the profile menu"
```

---

### Task 12: `createDraft` — `playerSource` wiring

**Files:**

- Modify: `src/lib/actions.ts`
- Modify: `src/__tests__/createDraft.test.ts`

**Interfaces:**

- Consumes: `PKG_PLAYERS` from `src/data/players.ts` (Task 3); `UserRankingSet`/`UserRankingPlayer` Prisma models (Task 1).
- Produces: `createDraft` gains an optional `playerSource?: 'etr' | 'custom'` field on its input object (defaults to ETR behavior when omitted, matching existing callers).

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/createDraft.test.ts`. First extend the transaction mock setup (in the existing `beforeEach`, add a mock for `userRankingSet.findUnique`):

```typescript
const mockTxUserRankingSetFindUnique = jest.fn();

// inside beforeEach, extend the mockTransaction.mockImplementation callback object:
mockTransaction.mockImplementation((callback) =>
  callback({
    draft: { create: mockTxDraftCreate, update: mockTxDraftUpdate },
    team: { create: mockTxTeamCreate },
    player: { createMany: mockTxPlayerCreateMany },
    userRankingSet: { findUnique: mockTxUserRankingSetFindUnique },
  }),
);
```

Then add new tests:

```typescript
describe('createDraft with playerSource: custom', () => {
  it('throws when the user has no custom ranking set', async () => {
    mockTxUserRankingSetFindUnique.mockResolvedValue(null);
    await expect(createDraft({ ...VALID_INPUT, playerSource: 'custom' })).rejects.toThrow(
      'No custom ranking set found',
    );
  });

  it('seeds from the custom ranking set plus PKG_PLAYERS', async () => {
    mockTxUserRankingSetFindUnique.mockResolvedValue({
      id: 7,
      players: [
        {
          name: 'Custom Guy',
          team: 'BUF',
          pos: 'QB',
          age: 25,
          sfRank: 1,
          budget: 200,
          ceiling: 230,
          floor: 174,
          notes: '',
          sleeperId: 's1',
        },
      ],
    });
    await createDraft({ ...VALID_INPUT, playerSource: 'custom' });
    const created = mockTxPlayerCreateMany.mock.calls[0][0].data as { name: string }[];
    expect(created.some((p) => p.name === 'Custom Guy')).toBe(true);
    expect(created.some((p) => p.name === PKG_PLAYERS[0].player)).toBe(true);
  });
});
```

`src/__tests__/createDraft.test.ts` already has `import { players as BASE_PLAYERS } from '@/data/players';` at the top — replace that line with:

```typescript
import { players as BASE_PLAYERS, PKG_PLAYERS } from '@/data/players';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test createDraft.test.ts`
Expected: FAIL — `playerSource` unrecognized / `mockTxUserRankingSetFindUnique` never called

- [ ] **Step 3: Update `createDraft` in `src/lib/actions.ts`**

Add the import:

```typescript
import { players as BASE_PLAYERS, PKG_PLAYERS } from '@/data/players';
```

Update the function signature and body:

```typescript
export async function createDraft(data: {
  name: string;
  budgetPerTeam: number;
  rosterSize: number;
  targetRoster: Partial<Record<Position, number>>;
  startingLineup: StartingSlot[];
  scoringSettings: ScoringSettings;
  teams: TeamInput[];
  playerSource?: 'etr' | 'custom';
}): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  // ...existing handle/team validation unchanged...

  const draftId = await prisma.$transaction(async (tx) => {
    // ...existing draft.create / team.create / draft.update unchanged...

    let basePlayers = BASE_PLAYERS;
    if (data.playerSource === 'custom') {
      const rankingSet = await tx.userRankingSet.findUnique({
        where: { userId: session.user.id },
        include: { players: true },
      });
      if (!rankingSet) throw new Error('No custom ranking set found');
      basePlayers = [
        ...rankingSet.players.map((p) => ({
          player: p.name,
          team: p.team,
          pos: p.pos as Position,
          age: p.age,
          sfRank: p.sfRank,
          budget: p.budget,
          ceiling: p.ceiling,
          floor: p.floor,
          notes: p.notes,
          sleeperId: p.sleeperId,
        })),
        ...PKG_PLAYERS,
      ];
    }

    const valued = adjustPlayerValues(basePlayers, {
      startingLineup: data.startingLineup,
      scoringSettings: data.scoringSettings,
      teamCount: data.teams.length,
    });

    await tx.player.createMany({
      data: valued.map((p) => ({
        name: p.player,
        nflTeam: p.team,
        pos: p.pos,
        age: p.age,
        sfRank: p.sfRank,
        budget: p.budget,
        ceiling: p.ceiling,
        floor: p.floor,
        baseBudget: p.baseBudget,
        baseCeiling: p.baseCeiling,
        baseFloor: p.baseFloor,
        sleeperId: p.sleeperId ?? null,
        notes: p.notes,
        draftId: draft.id,
      })),
    });

    return draft.id;
  });

  redirect(`/draft/${draftId}`);
}
```

(Only the `basePlayers`/`playerSource` branch and the `sleeperId: p.sleeperId ?? null` line are new — the rest of the function body is unchanged from its current form.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test createDraft.test.ts`
Expected: PASS (all existing tests + 2 new ones)

- [ ] **Step 5: Run full quality gate**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions.ts src/__tests__/createDraft.test.ts
git commit -m "feat: createDraft supports seeding from a custom ranking set"
```

---

### Task 13: `/drafts/new` — player-pool source selector

**Files:**

- Modify: `src/app/drafts/new/page.tsx`
- Modify: `src/__tests__/drafts-new-form.test.tsx`

**Interfaces:**

- Consumes: `getRankingSummary` from `src/lib/rankings-actions.ts` (Task 8), `createDraft`'s new `playerSource` field (Task 12).

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/drafts-new-form.test.tsx`. First add the mock near the existing `jest.mock('@/lib/sleeper-actions', ...)` block:

```typescript
const mockGetRankingSummary = jest.fn();
jest.mock('@/lib/rankings-actions', () => ({
  getRankingSummary: (...args: unknown[]) => mockGetRankingSummary(...args),
}));
```

Set a default in the existing top-level setup (wherever `mockImportFromSleeper` is reset) so unrelated tests aren't affected:

```typescript
beforeEach(() => {
  mockGetRankingSummary.mockResolvedValue(null);
});
```

Then add new tests:

```typescript
describe('player pool source', () => {
  it('does not show a source selector when the user has no custom ranking set', async () => {
    mockGetRankingSummary.mockResolvedValue(null);
    render(<NewDraftPage />);
    await waitFor(() => {
      expect(mockGetRankingSummary).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('player-source-custom')).not.toBeInTheDocument();
  });

  it('shows a source selector when a custom ranking set exists, defaulting to ETR', async () => {
    mockGetRankingSummary.mockResolvedValue({
      fileName: 'my_rankings.csv',
      uploadedAt: new Date('2026-07-01T00:00:00.000Z'),
      totalCount: 267,
      matchedCount: 260,
      unmatchedCount: 7,
    });
    render(<NewDraftPage />);

    expect(await screen.findByTestId('player-source-custom')).toBeInTheDocument();
    expect(screen.getByTestId('player-source-etr')).toBeChecked();
  });

  it('passes playerSource: custom to createDraft when selected', async () => {
    mockGetRankingSummary.mockResolvedValue({
      fileName: 'my_rankings.csv',
      uploadedAt: new Date('2026-07-01T00:00:00.000Z'),
      totalCount: 267,
      matchedCount: 260,
      unmatchedCount: 7,
    });
    const user = userEvent.setup();
    render(<NewDraftPage />);

    await user.click(await screen.findByTestId('player-source-custom'));
    fireEvent.change(screen.getByTestId('draft-name-input'), { target: { value: 'Test Draft' } });
    fireEvent.submit(screen.getByTestId('new-draft-form'));

    await waitFor(() => {
      expect(createDraft).toHaveBeenCalledWith(expect.objectContaining({ playerSource: 'custom' }));
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test drafts-new-form.test.tsx`
Expected: FAIL — `getByTestId('player-source-custom')` not found / `getRankingSummary` never called

- [ ] **Step 3: Update `src/app/drafts/new/page.tsx`**

Add the import:

```typescript
import { getRankingSummary, type RankingSummary } from '@/lib/rankings-actions';
```

Add state and a fetch-on-mount effect (near the other `useState` declarations, after `scoringSettings`):

```typescript
const [rankingSummary, setRankingSummary] = useState<RankingSummary | null>(null);
const [playerSource, setPlayerSource] = useState<'etr' | 'custom'>('etr');

useEffect(() => {
  getRankingSummary().then(setRankingSummary);
}, []);
```

Add `useEffect` to the React import at the top: `import { useEffect, useState, useTransition } from 'react';`

Include `playerSource` in the `createDraft` call inside `handleSubmit`:

```typescript
await createDraft({
  name: name.trim(),
  budgetPerTeam: budget,
  rosterSize,
  targetRoster,
  startingLineup,
  scoringSettings,
  teams,
  playerSource,
});
```

Add the selector UI — insert this block right after the "Draft Settings" card and before "Roster Settings" (only rendered when `rankingSummary` is non-null):

```tsx
{
  rankingSummary && (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderRadius: '6px',
        padding: '1.25rem',
        marginBottom: '1rem',
      }}
    >
      <div style={sectionHeaderStyle}>Player Pool</div>
      <label
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}
      >
        <input
          data-testid="player-source-etr"
          type="radio"
          name="playerSource"
          checked={playerSource === 'etr'}
          onChange={() => setPlayerSource('etr')}
        />
        <span style={labelStyle}>ETR Default</span>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <input
          data-testid="player-source-custom"
          type="radio"
          name="playerSource"
          checked={playerSource === 'custom'}
          onChange={() => setPlayerSource('custom')}
        />
        <span style={labelStyle}>
          My Custom Rankings ({rankingSummary.totalCount} players, uploaded{' '}
          {rankingSummary.uploadedAt.toLocaleDateString()})
        </span>
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test drafts-new-form.test.tsx`
Expected: PASS (all existing tests + 3 new ones)

- [ ] **Step 5: Run full quality gate and full test suite**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test`
Expected: no errors, all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/app/drafts/new/page.tsx src/__tests__/drafts-new-form.test.tsx
git commit -m "feat: add player-pool source selector to draft creation"
```

---

## Post-Plan Manual Verification

Not automatable in CI — do these once after Task 13 lands, before considering the feature done:

1. Run `pnpm tsx prisma/sync-sleeper-players.ts` against local dev DB (Task 6 already did this, re-run if the CSV changed).
2. `make dev`, sign in, visit `/rankings`, upload `existing_project_docs/auction-tool/src/Dynasty_Rankings.csv` — confirm the summary shows ~326 kept rows (334 total minus non-QB/RB/WR/TE/Pick rows) with a high match rate.
3. Resolve at least one unmatched row through the search UI, confirm it disappears from the list and persists after a page reload.
4. Go to `/drafts/new`, confirm the "Player Pool" selector appears, select "My Custom Rankings", create a draft, confirm the value sheet shows the uploaded rankings' values (not ETR defaults).
5. Kill any dev server started during verification.
