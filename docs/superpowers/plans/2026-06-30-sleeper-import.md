# Sleeper League Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Sleeper league import widget to the draft creation form that pre-fills settings from two public Sleeper API calls.

**Architecture:** A new `src/lib/sleeper.ts` module holds all Sleeper types, fetch functions, and the pure `mapSleeperLeague` function; a `'use server'` file wraps it in a server action; the existing `'use client'` `drafts/new/page.tsx` calls the action and hydrates its state. The mapping function is pure and exported separately so it can be unit-tested without mocking fetch or server infrastructure.

**Tech Stack:** Next.js 16 App Router, TypeScript 5 strict, React `useTransition`, Jest + React Testing Library, pnpm 11.

## Global Constraints

- pnpm only — no npm or yarn
- `@/*` maps to `src/*` (alias configured in tsconfig)
- No explicit `any` — use typed interfaces; cast with `as` only when the shape is validated
- Single quotes, trailing commas, 2-space indent, 100 char line width (Prettier enforced by pre-commit hook)
- Prefer `interface` over `type` for object shapes; `type` for unions and aliases
- Select by `data-testid` in tests — never by role+name, visible text, or CSS class
- Typed mock data in tests — annotate fixtures with the real source type
- No unused vars — ESLint will error
- Pre-commit hook: `pnpm lint-staged` + `pnpm tsc --noEmit` — do not skip with `--no-verify`
- Run tests with: `pnpm test -- --testPathPattern=<file> --no-coverage`
- Full quality gate: `pnpm check` (typecheck + lint + format + test)

---

## File Map

| File                                     | Action | Purpose                                            |
| ---------------------------------------- | ------ | -------------------------------------------------- |
| `src/lib/sleeper.ts`                     | Create | Sleeper types, fetch functions, `mapSleeperLeague` |
| `src/lib/sleeper-actions.ts`             | Create | `'use server'` wrapper: `importFromSleeper`        |
| `src/__tests__/sleeper-import.test.ts`   | Create | Unit tests for `mapSleeperLeague`                  |
| `src/__tests__/sleeper-actions.test.ts`  | Create | Tests for `importFromSleeper` error handling       |
| `src/app/drafts/new/page.tsx`            | Modify | Convert selects → number inputs; add import banner |
| `src/__tests__/drafts-new-form.test.tsx` | Modify | Update 2 stale tests; add import banner tests      |

---

### Task 1: Sleeper lib — types, fetch functions, and mapping logic

**Files:**

- Create: `src/lib/sleeper.ts`
- Create: `src/__tests__/sleeper-import.test.ts`

**Interfaces:**

- Consumes: `StartingSlot`, `ScoringSettings` from `@/types`
- Produces:

  ```typescript
  // src/lib/sleeper.ts exports:
  interface SleeperLeague {
    total_rosters: number;
    roster_positions: string[];
    scoring_settings: Record<string, number>;
  }
  interface SleeperUser {
    user_id: string;
    display_name: string; // Sleeper's public username (e.g. "coreschke") — no separate user_name field
    metadata?: { team_name?: string };
  }
  interface SleeperImportResult {
    teamCount: number;
    rosterSize: number;
    startingLineup: StartingSlot[];
    scoringSettings: ScoringSettings;
    teams: Array<{ handle: string; displayName: string }>;
    ownerIndex: number | null;
  }
  function fetchSleeperLeague(leagueId: string): Promise<SleeperLeague>; // throws 'NOT_FOUND' on 404
  function fetchSleeperLeagueUsers(leagueId: string): Promise<SleeperUser[]>;
  function mapSleeperLeague(
    league: SleeperLeague,
    users: SleeperUser[],
    ownerUsername?: string,
  ): SleeperImportResult;
  ```

  Task 2 imports all three functions and the types.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/sleeper-import.test.ts`:

```typescript
import { mapSleeperLeague } from '@/lib/sleeper';
import type { SleeperLeague, SleeperUser, SleeperImportResult } from '@/lib/sleeper';

// Verified against real payload: league 1360707683916734464
const FULL_LEAGUE: SleeperLeague = {
  total_rosters: 12,
  roster_positions: [
    'QB',
    'RB',
    'WR',
    'WR',
    'TE',
    'FLEX',
    'SUPER_FLEX',
    'BN',
    'BN',
    'BN',
    'IR',
    'K',
  ],
  scoring_settings: {
    pass_yd: 0.04,
    pass_td: 4,
    pass_int: -2,
    rec: 1,
    // bonus_rec_rb absent (= 0) — Sleeper omits 0-value fields
    bonus_rec_wr: 0,
    bonus_rec_te: 0.5,
    rec_fd: 0,
    // bonus_fd_rb, bonus_fd_wr absent (= 0)
    bonus_fd_te: 0.25,
    rush_att: 0,
    rush_fd: 0,
  },
};

const MINIMAL_LEAGUE: SleeperLeague = {
  total_rosters: 2,
  roster_positions: ['QB', 'SUPER_FLEX', 'BN'],
  scoring_settings: { pass_yd: 0.04, pass_td: 4, pass_int: -2, rec: 1 },
};

// display_name IS the Sleeper username — no separate user_name field in /users response
const MOCK_USERS: SleeperUser[] = [
  { user_id: '1', display_name: 'coreschke', metadata: { team_name: "Cole's Team" } },
  { user_id: '2', display_name: 'rival' },
];

describe('mapSleeperLeague — teamCount and rosterSize', () => {
  it('maps total_rosters to teamCount', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.teamCount).toBe(12);
  });

  it('counts ALL roster_positions including BN/IR/K for rosterSize', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.rosterSize).toBe(12); // 7 starters + BN×3 + IR + K
  });
});

describe('mapSleeperLeague — startingLineup', () => {
  it('excludes BN, IR, and K from startingLineup', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.startingLineup).not.toContain('BN');
    expect(result.startingLineup).not.toContain('IR');
    expect(result.startingLineup).not.toContain('K');
  });

  it('includes QB, RB, WR, TE, FLEX, SUPER_FLEX in startingLineup', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.startingLineup).toEqual(['QB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'SUPER_FLEX']);
  });

  it('skips unrecognized slot types (IDP, etc.) silently', () => {
    const league = {
      ...MINIMAL_LEAGUE,
      roster_positions: ['QB', 'DL', 'LB', 'SUPER_FLEX', 'BN'],
    };
    const result = mapSleeperLeague(league, []);
    expect(result.startingLineup).toEqual(['QB', 'SUPER_FLEX']);
  });
});

describe('mapSleeperLeague — scoring settings', () => {
  it('inverts pass_yd (pts/yd) to passYdsPerPoint (yds/pt)', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.scoringSettings.passYdsPerPoint).toBe(25); // 1 / 0.04 = 25
  });

  it('defaults passYdsPerPoint to 25 when pass_yd is 0', () => {
    const league = {
      ...MINIMAL_LEAGUE,
      scoring_settings: { ...MINIMAL_LEAGUE.scoring_settings, pass_yd: 0 },
    };
    const result = mapSleeperLeague(league, []);
    expect(result.scoringSettings.passYdsPerPoint).toBe(25);
  });

  it('maps pass_td directly to passTD', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.scoringSettings.passTD).toBe(4);
  });

  it('maps pass_int directly to passInt (already negative)', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.scoringSettings.passInt).toBe(-2);
  });

  it('computes pprTE as rec + bonus_rec_te', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.scoringSettings.pprTE).toBeCloseTo(1.5); // rec=1 + bonus_rec_te=0.5
  });

  it('computes pprRB as rec + bonus_rec_rb (0 bonus = just rec)', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.scoringSettings.pprRB).toBe(1); // rec=1 + bonus_rec_rb=0
  });

  it('maps bonus_fd_te to teFDBonus', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.scoringSettings.teFDBonus).toBe(0.25);
  });

  it('defaults missing scoring_settings fields to 0', () => {
    // MINIMAL_LEAGUE has no rush_att, rush_fd, bonus_* fields
    const result = mapSleeperLeague(MINIMAL_LEAGUE, []);
    expect(result.scoringSettings.rushAtt).toBe(0);
    expect(result.scoringSettings.rushFD).toBe(0);
    expect(result.scoringSettings.recFD).toBe(0);
    expect(result.scoringSettings.rbFDBonus).toBe(0);
    expect(result.scoringSettings.teFDBonus).toBe(0);
  });
});

describe('mapSleeperLeague — teams', () => {
  it('maps display_name to handle', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.teams[0].handle).toBe('coreschke');
    expect(result.teams[1].handle).toBe('rival');
  });

  it('prefers metadata.team_name over display_name for displayName', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.teams[0].displayName).toBe("Cole's Team");
  });

  it('falls back to display_name when metadata.team_name is absent', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.teams[1].displayName).toBe('rival');
  });
});

describe('mapSleeperLeague — teams truncated to teamCount', () => {
  it('truncates teams to total_rosters when users outnumber rosters (co-owner scenario)', () => {
    // Real league 1360707683916734464 has 13 users for 12 rosters (one pair of co-owners)
    const thirteenUsers: SleeperUser[] = [
      ...MOCK_USERS,
      ...Array.from({ length: 11 }, (_, i) => ({ user_id: `${i + 3}`, display_name: `extra${i}` })),
    ];
    const result = mapSleeperLeague(FULL_LEAGUE, thirteenUsers);
    expect(result.teams).toHaveLength(12);
    expect(result.teamCount).toBe(12);
  });
});

describe('mapSleeperLeague — ownerIndex', () => {
  it('returns correct ownerIndex when display_name matches (case-insensitive)', () => {
    // 'CoreSchke' should match display_name 'coreschke' case-insensitively
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS, 'CoreSchke');
    expect(result.ownerIndex).toBe(0);
  });

  it('returns ownerIndex null when username does not match any team', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS, 'unknown-user');
    expect(result.ownerIndex).toBeNull();
  });

  it('returns ownerIndex null when ownerUsername is not provided', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.ownerIndex).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- --testPathPattern=sleeper-import --no-coverage
```

Expected: multiple FAIL — `Cannot find module '@/lib/sleeper'`

- [ ] **Step 3: Implement `src/lib/sleeper.ts`**

```typescript
import type { StartingSlot, ScoringSettings } from '@/types';

export interface SleeperLeague {
  total_rosters: number;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
}

export interface SleeperUser {
  user_id: string;
  display_name: string; // Sleeper's public username — no separate user_name field in /users response
  metadata?: { team_name?: string };
}

export interface SleeperImportResult {
  teamCount: number;
  rosterSize: number;
  startingLineup: StartingSlot[];
  scoringSettings: ScoringSettings;
  teams: Array<{ handle: string; displayName: string }>;
  ownerIndex: number | null;
}

const SLEEPER_BASE = 'https://api.sleeper.app/v1';

const VALID_SLOTS = new Set(['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX']);

export async function fetchSleeperLeague(leagueId: string): Promise<SleeperLeague> {
  const res = await fetch(`${SLEEPER_BASE}/league/${leagueId}`);
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error(`SLEEPER_ERROR:${res.status}`);
  const data: unknown = await res.json();
  if (!data || typeof data !== 'object' || !('total_rosters' in data)) {
    throw new Error('NOT_FOUND');
  }
  return data as SleeperLeague;
}

export async function fetchSleeperLeagueUsers(leagueId: string): Promise<SleeperUser[]> {
  const res = await fetch(`${SLEEPER_BASE}/league/${leagueId}/users`);
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error(`SLEEPER_ERROR:${res.status}`);
  return res.json() as Promise<SleeperUser[]>;
}

export function mapSleeperLeague(
  league: SleeperLeague,
  users: SleeperUser[],
  ownerUsername?: string,
): SleeperImportResult {
  const s = league.scoring_settings;
  const rec = s.rec ?? 0;
  const passYd = s.pass_yd ?? 0;

  const scoringSettings: ScoringSettings = {
    passYdsPerPoint: passYd === 0 ? 25 : Math.round(1 / passYd),
    passTD: s.pass_td ?? 4,
    passInt: s.pass_int ?? -2,
    rushAtt: s.rush_att ?? 0,
    rushFD: s.rush_fd ?? 0,
    pprRB: rec + (s.bonus_rec_rb ?? 0),
    pprWR: rec + (s.bonus_rec_wr ?? 0),
    pprTE: rec + (s.bonus_rec_te ?? 0),
    recFD: s.rec_fd ?? 0,
    rbFDBonus: s.bonus_fd_rb ?? 0,
    wrFDBonus: s.bonus_fd_wr ?? 0,
    teFDBonus: s.bonus_fd_te ?? 0,
  };

  const startingLineup = league.roster_positions
    .filter((pos) => VALID_SLOTS.has(pos))
    .map((pos) => pos as StartingSlot);

  // Sleeper leagues can have co-owners (extra users sharing a roster), so truncate to total_rosters
  const capped = users.slice(0, league.total_rosters);

  const teams = capped.map((u) => ({
    handle: u.display_name,
    displayName: u.metadata?.team_name || u.display_name,
  }));

  let ownerIndex: number | null = null;
  if (ownerUsername) {
    const lower = ownerUsername.toLowerCase();
    const idx = capped.findIndex((u) => u.display_name.toLowerCase() === lower);
    if (idx !== -1) ownerIndex = idx;
  }

  return {
    teamCount: league.total_rosters,
    rosterSize: league.roster_positions.length,
    startingLineup,
    scoringSettings,
    teams,
    ownerIndex,
  };
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
pnpm test -- --testPathPattern=sleeper-import --no-coverage
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sleeper.ts src/__tests__/sleeper-import.test.ts
git commit -m "feat: add Sleeper fetch module and mapSleeperLeague"
```

---

### Task 2: Server action — `importFromSleeper`

**Files:**

- Create: `src/lib/sleeper-actions.ts`
- Create: `src/__tests__/sleeper-actions.test.ts`

**Interfaces:**

- Consumes: `fetchSleeperLeague`, `fetchSleeperLeagueUsers`, `mapSleeperLeague`, `SleeperImportResult` from `@/lib/sleeper` (Task 1)
- Produces:

  ```typescript
  // src/lib/sleeper-actions.ts exports:
  type ImportResponse = { ok: true; data: SleeperImportResult } | { ok: false; error: string };
  async function importFromSleeper(
    leagueId: string,
    ownerUsername?: string,
  ): Promise<ImportResponse>;
  ```

  Task 4 (page.tsx) imports `importFromSleeper` and `SleeperImportResult`.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/sleeper-actions.test.ts`:

```typescript
import { importFromSleeper } from '@/lib/sleeper-actions';
import type { SleeperLeague, SleeperUser } from '@/lib/sleeper';

const mockFetchLeague = jest.fn();
const mockFetchUsers = jest.fn();

jest.mock('@/lib/sleeper', () => {
  const actual = jest.requireActual('@/lib/sleeper') as typeof import('@/lib/sleeper');
  return {
    ...actual,
    fetchSleeperLeague: (...args: unknown[]) => mockFetchLeague(...args),
    fetchSleeperLeagueUsers: (...args: unknown[]) => mockFetchUsers(...args),
  };
});

const MOCK_LEAGUE: SleeperLeague = {
  total_rosters: 2,
  roster_positions: ['QB', 'SUPER_FLEX', 'BN'],
  scoring_settings: { pass_yd: 0.04, pass_td: 4, pass_int: -2, rec: 1 },
};

const MOCK_USERS: SleeperUser[] = [
  { user_id: '1', display_name: 'coreschke' },
  { user_id: '2', display_name: 'rival' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchLeague.mockResolvedValue(MOCK_LEAGUE);
  mockFetchUsers.mockResolvedValue(MOCK_USERS);
});

describe('importFromSleeper', () => {
  it('calls fetchSleeperLeague and fetchSleeperLeagueUsers with the provided leagueId', async () => {
    await importFromSleeper('1360707683916734464');
    expect(mockFetchLeague).toHaveBeenCalledWith('1360707683916734464');
    expect(mockFetchUsers).toHaveBeenCalledWith('1360707683916734464');
  });

  it('returns ok:true with mapped data on success', async () => {
    const result = await importFromSleeper('1360707683916734464');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.teamCount).toBe(2);
      expect(result.data.startingLineup).toEqual(['QB', 'SUPER_FLEX']);
    }
  });

  it('returns league-not-found error when fetchSleeperLeague throws NOT_FOUND', async () => {
    mockFetchLeague.mockRejectedValue(new Error('NOT_FOUND'));
    const result = await importFromSleeper('bad-id');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/league not found/i);
    }
  });

  it('returns generic error on unexpected failure', async () => {
    mockFetchLeague.mockRejectedValue(new Error('Network error'));
    const result = await importFromSleeper('valid-id');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/couldn't reach sleeper/i);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- --testPathPattern=sleeper-actions --no-coverage
```

Expected: FAIL — `Cannot find module '@/lib/sleeper-actions'`

- [ ] **Step 3: Implement `src/lib/sleeper-actions.ts`**

```typescript
'use server';

import { fetchSleeperLeague, fetchSleeperLeagueUsers, mapSleeperLeague } from '@/lib/sleeper';
import type { SleeperImportResult } from '@/lib/sleeper';

type ImportResponse = { ok: true; data: SleeperImportResult } | { ok: false; error: string };

export async function importFromSleeper(
  leagueId: string,
  ownerUsername?: string,
): Promise<ImportResponse> {
  try {
    const [league, users] = await Promise.all([
      fetchSleeperLeague(leagueId),
      fetchSleeperLeagueUsers(leagueId),
    ]);
    const data = mapSleeperLeague(league, users, ownerUsername);
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      return { ok: false, error: 'League not found. Check your Sleeper league ID.' };
    }
    return { ok: false, error: "Couldn't reach Sleeper — try again." };
  }
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
pnpm test -- --testPathPattern=sleeper-actions --no-coverage
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sleeper-actions.ts src/__tests__/sleeper-actions.test.ts
git commit -m "feat: add importFromSleeper server action"
```

---

### Task 3: Convert `passTD` and PPR selects to number inputs

This removes the select constraints that would require lossy clamping of imported Sleeper values. Two controls in `src/app/drafts/new/page.tsx` change from `<select>` to `<input type="number">`. Two existing tests must be updated to match.

**Files:**

- Modify: `src/app/drafts/new/page.tsx`
- Modify: `src/__tests__/drafts-new-form.test.tsx`

**Interfaces:**

- Consumes: nothing new
- Produces: `passTD`, `pprRB`, `pprWR`, `pprTE` form fields are now `<input type="number">` elements with `data-testid` attributes unchanged

- [ ] **Step 1: Update the two stale tests first**

In `src/__tests__/drafts-new-form.test.tsx`, find and replace these two tests inside the `'NewDraftPage — scoring settings'` describe block:

```typescript
// REPLACE this test:
it('renders passing TD select with default 4', () => {
  render(<NewDraftPage />);
  const select = screen.getByTestId<HTMLSelectElement>('scoring-passTD');
  expect(select.value).toBe('4');
});

// WITH this:
it('renders passing TD input with default 4', () => {
  render(<NewDraftPage />);
  const input = screen.getByTestId<HTMLInputElement>('scoring-passTD');
  expect(input.value).toBe('4');
});
```

```typescript
// REPLACE this test:
it('renders all PPR selects defaulting to 1', () => {
  render(<NewDraftPage />);
  expect(screen.getByTestId<HTMLSelectElement>('scoring-pprRB').value).toBe('1');
  expect(screen.getByTestId<HTMLSelectElement>('scoring-pprWR').value).toBe('1');
  expect(screen.getByTestId<HTMLSelectElement>('scoring-pprTE').value).toBe('1');
});

// WITH this:
it('renders all PPR inputs defaulting to 1', () => {
  render(<NewDraftPage />);
  expect(screen.getByTestId<HTMLInputElement>('scoring-pprRB').value).toBe('1');
  expect(screen.getByTestId<HTMLInputElement>('scoring-pprWR').value).toBe('1');
  expect(screen.getByTestId<HTMLInputElement>('scoring-pprTE').value).toBe('1');
});
```

- [ ] **Step 2: Run the test suite to confirm these two tests now fail**

```bash
pnpm test -- --testPathPattern=drafts-new-form --no-coverage
```

Expected: 2 FAIL (the two updated tests), rest pass

- [ ] **Step 3: Update `passTD` in `src/app/drafts/new/page.tsx`**

Find the `passTD` block in the Passing section (the `<select>` with options 4 and 6) and replace it:

```tsx
// REPLACE:
<select
  data-testid="scoring-passTD"
  value={scoringSettings.passTD}
  onChange={(e) => updateScoring('passTD', parseFloat(e.target.value))}
  style={inputStyle}
>
  <option value={4}>4</option>
  <option value={6}>6</option>
</select>

// WITH:
<input
  data-testid="scoring-passTD"
  type="number"
  min={0}
  step={1}
  value={scoringSettings.passTD}
  onChange={(e) => { const v = parseFloat(e.target.value); updateScoring('passTD', Number.isNaN(v) ? 4 : v); }}
  style={inputStyle}
/>
```

- [ ] **Step 4: Update PPR controls in `src/app/drafts/new/page.tsx`**

Find the Reception (PPR) section. It renders selects via a `.map()` over an array of `{ pos, key, opts }`. Replace the entire Reception section:

```tsx
{
  /* Reception (PPR) */
}
<div style={{ marginBottom: '0.875rem' }}>
  <div style={subSectionStyle}>Reception (PPR)</div>
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
    {(
      [
        { pos: 'RB', key: 'pprRB' },
        { pos: 'WR', key: 'pprWR' },
        { pos: 'TE', key: 'pprTE' },
      ] as const
    ).map(({ pos, key }) => (
      <label key={pos} style={labelStyle}>
        {pos}
        <input
          data-testid={`scoring-${key}`}
          type="number"
          min={0}
          step={0.5}
          value={scoringSettings[key]}
          onChange={(e) => updateScoring(key, parseFloat(e.target.value) || 0)}
          style={inputStyle}
        />
      </label>
    ))}
  </div>
</div>;
```

- [ ] **Step 5: Run tests — all should pass**

```bash
pnpm test -- --testPathPattern=drafts-new-form --no-coverage
```

Expected: all PASS

- [ ] **Step 6: Typecheck**

```bash
pnpm tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/app/drafts/new/page.tsx src/__tests__/drafts-new-form.test.tsx
git commit -m "feat: convert passTD and PPR selects to number inputs"
```

---

### Task 4: Import banner UI

Add the Sleeper import widget to `drafts/new/page.tsx` and tests for the new behavior.

**Files:**

- Modify: `src/app/drafts/new/page.tsx`
- Modify: `src/__tests__/drafts-new-form.test.tsx`

**Interfaces:**

- Consumes: `importFromSleeper`, `SleeperImportResult` from `@/lib/sleeper-actions` (Task 2)

- [ ] **Step 1: Write the failing tests**

Add these to `src/__tests__/drafts-new-form.test.tsx`. Add the mock and import at the top of the file (alongside the existing `createDraft` mock):

```typescript
import type { SleeperImportResult } from '@/lib/sleeper';
import { DEFAULT_SCORING_SETTINGS } from '@/types';

const mockImportFromSleeper = jest.fn();

jest.mock('@/lib/sleeper-actions', () => ({
  importFromSleeper: (...args: unknown[]) => mockImportFromSleeper(...args),
}));

const MOCK_IMPORT_RESULT: SleeperImportResult = {
  teamCount: 12,
  rosterSize: 30,
  startingLineup: [
    'QB',
    'RB',
    'WR',
    'WR',
    'TE',
    'FLEX',
    'SUPER_FLEX',
    'FLEX',
    'FLEX',
    'SUPER_FLEX',
  ],
  scoringSettings: { ...DEFAULT_SCORING_SETTINGS },
  teams: Array.from({ length: 12 }, (_, i) => ({
    handle: `team-${i + 1}`,
    displayName: `Team ${i + 1}`,
  })),
  ownerIndex: 0,
};
```

Then add a new describe block at the end of the file:

```typescript
describe('NewDraftPage — Sleeper import banner', () => {
  beforeEach(() => {
    mockImportFromSleeper.mockResolvedValue({ ok: true, data: MOCK_IMPORT_RESULT });
  });

  it('renders the league ID input and username input', () => {
    render(<NewDraftPage />);
    expect(screen.getByTestId('sleeper-league-id')).toBeInTheDocument();
    expect(screen.getByTestId('sleeper-owner-username')).toBeInTheDocument();
  });

  it('import button is disabled when league ID is empty', () => {
    render(<NewDraftPage />);
    expect(screen.getByTestId<HTMLButtonElement>('sleeper-import-button').disabled).toBe(true);
  });

  it('import button is enabled after typing a league ID', () => {
    render(<NewDraftPage />);
    fireEvent.change(screen.getByTestId('sleeper-league-id'), {
      target: { value: '1360707683916734464' },
    });
    expect(screen.getByTestId<HTMLButtonElement>('sleeper-import-button').disabled).toBe(false);
  });

  it('calls importFromSleeper with entered league ID on button click', async () => {
    render(<NewDraftPage />);
    fireEvent.change(screen.getByTestId('sleeper-league-id'), {
      target: { value: '1360707683916734464' },
    });
    fireEvent.click(screen.getByTestId('sleeper-import-button'));
    await waitFor(() => expect(mockImportFromSleeper).toHaveBeenCalledWith(
      '1360707683916734464',
      undefined,
    ));
  });

  it('shows confirm message after successful import', async () => {
    render(<NewDraftPage />);
    fireEvent.change(screen.getByTestId('sleeper-league-id'), {
      target: { value: '1360707683916734464' },
    });
    fireEvent.click(screen.getByTestId('sleeper-import-button'));
    await waitFor(() =>
      expect(screen.getByTestId('sleeper-import-confirm')).toBeInTheDocument(),
    );
  });

  it('shows username warning when ownerIndex is null and username was entered', async () => {
    mockImportFromSleeper.mockResolvedValueOnce({
      ok: true,
      data: { ...MOCK_IMPORT_RESULT, ownerIndex: null },
    });
    render(<NewDraftPage />);
    fireEvent.change(screen.getByTestId('sleeper-league-id'), {
      target: { value: '1360707683916734464' },
    });
    fireEvent.change(screen.getByTestId('sleeper-owner-username'), {
      target: { value: 'coreschke' },
    });
    fireEvent.click(screen.getByTestId('sleeper-import-button'));
    await waitFor(() =>
      expect(screen.getByTestId('sleeper-import-warning')).toBeInTheDocument(),
    );
  });

  it('shows error message when importFromSleeper returns ok:false', async () => {
    mockImportFromSleeper.mockResolvedValueOnce({
      ok: false,
      error: 'League not found. Check your Sleeper league ID.',
    });
    render(<NewDraftPage />);
    fireEvent.change(screen.getByTestId('sleeper-league-id'), {
      target: { value: 'bad-id' },
    });
    fireEvent.click(screen.getByTestId('sleeper-import-button'));
    await waitFor(() =>
      expect(screen.getByTestId('sleeper-import-error')).toBeInTheDocument(),
    );
  });
});
```

Also add `waitFor` to the import at the top of the test file:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
```

- [ ] **Step 2: Run tests to confirm the new tests fail**

```bash
pnpm test -- --testPathPattern=drafts-new-form --no-coverage
```

Expected: 7 new FAIL (the new import banner tests), existing tests still pass

- [ ] **Step 3: Add state, imports, and handler to `src/app/drafts/new/page.tsx`**

At the top of the file, add to the existing imports:

```typescript
import { importFromSleeper } from '@/lib/sleeper-actions';
import type { SleeperImportResult } from '@/lib/sleeper';
```

Inside `NewDraftPage`, add after the existing `useTransition` call:

```typescript
const [isImporting, startImportTransition] = useTransition();
const [leagueId, setLeagueId] = useState('');
const [ownerUsername, setOwnerUsername] = useState('');

type ImportState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success'; confirm: string; warning: string | null };

const [importState, setImportState] = useState<ImportState>({ status: 'idle' });
```

Add the handler function inside the component (after the existing handlers):

```typescript
function handleImport() {
  if (!leagueId.trim()) return;
  setImportState({ status: 'idle' });
  const trimmedUsername = ownerUsername.trim();
  startImportTransition(async () => {
    const result = await importFromSleeper(leagueId.trim(), trimmedUsername || undefined);
    if (!result.ok) {
      setImportState({ status: 'error', message: result.error });
      return;
    }
    const { data } = result;
    setTeamCount(data.teamCount);
    setRosterSize(data.rosterSize);
    setStartingLineup(data.startingLineup);
    setScoringSettings(data.scoringSettings);
    setTeams(
      data.teams.map((t, i) => ({
        handle: t.handle,
        displayName: t.displayName,
        isMine: data.ownerIndex !== null ? i === data.ownerIndex : i === 0,
      })),
    );
    const warning =
      trimmedUsername && data.ownerIndex === null
        ? `Couldn't match '${trimmedUsername}' to a team in this league — select yours manually.`
        : null;
    setImportState({
      status: 'success',
      confirm: `Imported from Sleeper · ${data.teamCount} teams · ${data.startingLineup.length} starting slots`,
      warning,
    });
  });
}
```

Note: for cleaner file organization, place `ImportState` above the `NewDraftPage` function rather than inside it:

```typescript
type ImportState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success'; confirm: string; warning: string | null };

export default function NewDraftPage() {
  // ...
}
```

- [ ] **Step 4: Add the import banner card to the JSX**

In the `return` block of `NewDraftPage`, insert this card as the first child inside `<main>`, before the `<form>` element:

```tsx
{
  /* --- Import from Sleeper --- */
}
<div
  style={{
    background: 'var(--bg-surface)',
    borderRadius: '6px',
    padding: '1.25rem',
    marginBottom: '1.5rem',
  }}
>
  <div style={sectionHeaderStyle}>Import from Sleeper</div>
  <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
    <label style={{ ...labelStyle, flex: 1 }}>
      League ID
      <input
        data-testid="sleeper-league-id"
        type="text"
        value={leagueId}
        onChange={(e) => setLeagueId(e.target.value)}
        placeholder="e.g. 1360707683916734464"
        style={inputStyle}
      />
    </label>
    <label style={{ ...labelStyle, flex: 1 }}>
      Your Sleeper username (optional)
      <input
        data-testid="sleeper-owner-username"
        type="text"
        value={ownerUsername}
        onChange={(e) => setOwnerUsername(e.target.value)}
        placeholder="e.g. coreschke"
        style={inputStyle}
      />
    </label>
  </div>
  <button
    type="button"
    data-testid="sleeper-import-button"
    onClick={handleImport}
    disabled={isImporting || !leagueId.trim()}
    style={{
      background: isImporting ? 'var(--text-secondary)' : 'var(--pos-te)',
      color: '#fff',
      border: 'none',
      borderRadius: '4px',
      padding: '0.4rem 1rem',
      fontFamily: 'var(--font-barlow)',
      fontSize: '0.875rem',
      cursor: isImporting || !leagueId.trim() ? 'not-allowed' : 'pointer',
    }}
  >
    {isImporting ? 'Importing…' : 'Import'}
  </button>
  {importState.status === 'error' && (
    <p
      data-testid="sleeper-import-error"
      style={{
        color: '#e05050',
        fontFamily: 'var(--font-barlow)',
        fontSize: '0.8rem',
        marginTop: '0.5rem',
        marginBottom: 0,
      }}
    >
      {importState.message}
    </p>
  )}
  {importState.status === 'success' && (
    <>
      <p
        data-testid="sleeper-import-confirm"
        style={{
          color: 'var(--pos-rb)',
          fontFamily: 'var(--font-barlow)',
          fontSize: '0.8rem',
          marginTop: '0.5rem',
          marginBottom: 0,
        }}
      >
        {importState.confirm}
      </p>
      {importState.warning && (
        <p
          data-testid="sleeper-import-warning"
          style={{
            color: 'var(--age-aging)',
            fontFamily: 'var(--font-barlow)',
            fontSize: '0.8rem',
            marginTop: '0.25rem',
            marginBottom: 0,
          }}
        >
          {importState.warning}
        </p>
      )}
    </>
  )}
</div>;
```

- [ ] **Step 5: Run all tests**

```bash
pnpm test -- --testPathPattern=drafts-new-form --no-coverage
```

Expected: all PASS (including the 7 new import banner tests)

- [ ] **Step 6: Run full quality gate**

```bash
pnpm check
```

Expected: typecheck, lint, format, and tests all pass

- [ ] **Step 7: Commit**

```bash
git add src/app/drafts/new/page.tsx src/__tests__/drafts-new-form.test.tsx
git commit -m "feat: add Sleeper league import banner to draft creation form"
```
