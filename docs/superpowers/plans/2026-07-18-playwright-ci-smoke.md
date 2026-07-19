# Playwright CI Smoke Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Playwright smoke suite (auth boundary, bid logging, nomination, roster/budget rendering) that runs against a production build in CI, closing the last open item of HARD-012.

**Architecture:** A `globalSetup` script mints an Auth.js session JWT directly with `next-auth/jwt`'s `encode()` (same `AUTH_SECRET` the app uses) and writes it into a Playwright `storageState` cookie file — no changes to `src/auth.ts`, no test-only auth code path. A standalone `e2e/seed.ts` script creates one draft, 12 teams, and ~12 fixture players directly via Prisma (bypassing the real ETR pool, which depends on a gitignored file not present in CI). Tests run against `pnpm build && pnpm start` on port 3100, Chromium only. A new `e2e` job in `.github/workflows/ci.yml` wires a Postgres service container through migrate-deploy → seed → build → test, mirroring the existing `postgres` job's shape.

**Tech Stack:** `@playwright/test` 1.61.x, existing Prisma 7 / `@prisma/adapter-pg` stack, existing Auth.js v5 (`next-auth` 5.0.0-beta.31) JWT session strategy.

## Global Constraints

- No changes to `src/auth.ts`, `middleware.ts`, or any other production runtime code path.
- No CI-path script may depend on gitignored `data/generated/*` files (existing project rule) — the e2e fixture is hardcoded, not derived from `prisma/seed-players.ts`.
- Chromium only; this is smoke coverage, not cross-browser regression coverage.
- `pnpm build && pnpm start` (production build), not `next dev`, for the CI job — matches HARD-012's "production-shaped checks" theme.
- Single quotes, trailing commas, 2-space indent, 100-char line width (Prettier) for all new TypeScript files.
- Select DOM elements by `data-testid` in new Playwright specs, per this repo's testing convention.

---

### Task 1: Playwright scaffold, shared env helpers, and the auth-boundary smoke test

**Files:**

- Modify: `package.json` (add `@playwright/test` devDependency, `test:e2e` script)
- Create: `playwright.config.ts`
- Create: `e2e/env.ts`
- Create: `e2e/global-setup.ts`
- Create: `e2e/auth.spec.ts`
- Modify: `jest.config.ts` (exclude `e2e/` from Jest's test discovery)
- Modify: `.gitignore` (ignore Playwright's local output dirs)

**Interfaces:**

- Produces: `e2e/env.ts` exports `PORT: string`, `BASE_URL: string`, `E2E_TEST_USER_ID: string` — every later e2e file reads these instead of touching `process.env` directly.
- Produces: `e2e/global-setup.ts` default-exports a Playwright `globalSetup` function; writes `e2e/.auth/user.json`.

- [ ] **Step 1: Confirm the `@playwright/test` devDependency**

```bash
pnpm add -D @playwright/test
```

Expected: `package.json`'s `devDependencies` contains `"@playwright/test": "^1.61.x"` (already present if a prior run added it — the command is idempotent).

- [ ] **Step 2: Add the `test:e2e` script**

In `package.json`, add to `"scripts"` (alongside the existing `"test:coverage"` entry):

```json
    "test:e2e": "playwright test",
```

- [ ] **Step 3: Create `e2e/env.ts`**

```ts
export const PORT = process.env.PORT ?? '3100';
export const BASE_URL = `http://localhost:${PORT}`;
export const E2E_TEST_USER_ID = process.env.E2E_TEST_USER_ID ?? 'e2e-test-user';
```

- [ ] **Step 4: Create `e2e/global-setup.ts`**

```ts
import { encode } from 'next-auth/jwt';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BASE_URL, E2E_TEST_USER_ID } from './env';

const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');

export default async function globalSetup(): Promise<void> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET must be set so Playwright can mint a test session cookie');
  }

  const token = await encode({
    secret,
    salt: 'authjs.session-token',
    token: { sub: E2E_TEST_USER_ID },
    maxAge: 60 * 60 * 24,
  });

  const domain = new URL(BASE_URL).hostname;
  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24;

  mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  writeFileSync(
    AUTH_FILE,
    JSON.stringify({
      cookies: [
        {
          name: 'authjs.session-token',
          value: token,
          domain,
          path: '/',
          expires,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax' as const,
        },
      ],
      origins: [],
    }),
  );
}
```

This mirrors Auth.js v5's own documented pattern for programmatic test sessions: `encode({ secret, salt, token })` from `next-auth/jwt` (re-exported from `@auth/core/jwt`), where `salt` equals the cookie name. `authjs.session-token` is the non-secure (http) cookie name Auth.js uses when there's no HTTPS — correct for `http://localhost:3100`.

- [ ] **Step 5: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';
import { BASE_URL, PORT } from './e2e/env';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm start -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'unauthenticated',
      testMatch: /auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'authenticated',
      testMatch: /(bid|nominate|rosters)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: './e2e/.auth/user.json' },
    },
  ],
});
```

`workers: 1` in CI is deliberate: every authenticated spec mutates the same shared Postgres database (logs a real bid, marks a real nomination). Running spec files serially avoids cross-file write races; this is a 4-file smoke suite, so the serialization cost is negligible.

`retries: 0` (not the more common `CI ? 1 : 0`) is also deliberate: `bid.spec.ts` performs a real, non-idempotent mutation guarded by a unique constraint (`AuctionResult`'s `@@unique([draftId, playerId])`). If a retry re-ran that spec after the bid had already been persisted on attempt one, `logBid` would return `{ ok: false }` on the duplicate insert (it does not throw — see `src/lib/actions.ts`), the modal would stay open with an error, and the retry would fail for a different, more confusing reason than whatever caused the first failure. A flake here should surface as a single clear failure, not a masked/relabeled one. `trace: 'retain-on-failure'` (rather than `'on-first-retry'`, which would never fire with retries disabled) still gets a debuggable trace on any failure.

- [ ] **Step 6: Create `e2e/auth.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('unauthenticated visitor is redirected to sign-in', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in/);
});
```

- [ ] **Step 7: Exclude `e2e/` from Jest**

In `jest.config.ts`, add `'<rootDir>/e2e/'` to `testPathIgnorePatterns`:

```ts
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/.claude/',
    '<rootDir>/.claire/',
    '<rootDir>/.worktrees/',
    '<rootDir>/e2e/',
    '<rootDir>/src/__tests__/fixtures/',
    '<rootDir>/src/__tests__/integration/',
  ],
```

Jest's `testMatch` (`**/*.{spec,test}.{ts,tsx}`) would otherwise pick up `e2e/auth.spec.ts` and fail trying to run a Playwright test under `jsdom`.

- [ ] **Step 8: Ignore Playwright's local output in `.gitignore`**

Add near the existing `# testing` block:

```
/playwright-report/
/test-results/
/e2e/.auth/
```

- [ ] **Step 9: Verify the scaffold end-to-end**

```bash
pnpm exec playwright install --with-deps chromium

DATABASE_URL="postgresql://user:pass@localhost:5432/placeholder" \
AUTH_SECRET="e2e-test-secret-do-not-use-in-prod" \
AUTH_DISCORD_ID="e2e-placeholder" \
AUTH_DISCORD_SECRET="e2e-placeholder" \
AUTH_TRUST_HOST=1 \
pnpm build

DATABASE_URL="postgresql://user:pass@localhost:5432/placeholder" \
AUTH_SECRET="e2e-test-secret-do-not-use-in-prod" \
AUTH_TRUST_HOST=1 \
PORT=3100 \
pnpm test:e2e
```

Expected: `1 passed` for `auth.spec.ts` in the `unauthenticated` project. The `/sign-in` page does not touch the database (only `auth()`, a JWT decode), so the placeholder `DATABASE_URL` — identical to the one already used by the `build` job in `.github/workflows/ci.yml` — is sufficient here; no real Postgres is required for this task.

- [ ] **Step 10: Run the existing Jest suite to confirm no collision**

```bash
pnpm test --passWithNoTests
```

Expected: same pass count as before this task (no `e2e/auth.spec.ts` in the run).

- [ ] **Step 11: Lint and commit**

```bash
pnpm lint
pnpm format:check
git add package.json pnpm-lock.yaml playwright.config.ts e2e/env.ts e2e/global-setup.ts e2e/auth.spec.ts jest.config.ts .gitignore
git commit -m "test: scaffold Playwright and add the sign-in redirect smoke test"
```

No ESLint override block is needed for `e2e/**` — this was verified directly (a scratch Playwright spec file, `import { test, expect } from '@playwright/test'` plus a `test(...)` block, was run through `pnpm eslint` against this repo's actual `eslint.config.mjs` and exited 0 with no errors or warnings) rather than left as an open question. If `pnpm lint` unexpectedly flags something in this task's actual files, that means a real conflict specific to these files' content — fix it inline, don't skip linting.

---

### Task 2: Seed script and fixture data

**Files:**

- Create: `e2e/fixtures/players.ts`
- Create: `e2e/db.ts`
- Create: `e2e/fixtures/getDraftId.ts`
- Create: `e2e/seed.ts`

**Interfaces:**

- Consumes: `E2E_TEST_USER_ID` from `e2e/env.ts` (Task 1).
- Produces: `e2e/fixtures/players.ts` exports `FixturePlayer` interface, `FIXTURE_PLAYERS: FixturePlayer[]`, `BID_TARGET: FixturePlayer`, `NOMINATE_TARGET: FixturePlayer` — Tasks 3 and 4 import `BID_TARGET`/`NOMINATE_TARGET` by name so the seeded data and the specs that reference it never drift apart.
- Produces: `e2e/db.ts` exports `prisma: PrismaClient`, `closeDb(): Promise<void>` — consumed only by `e2e/seed.ts` (this task) and `e2e/fixtures/getDraftId.ts` (`prisma` only). Tasks 3-5's spec files never import `e2e/db.ts` directly or call `closeDb()` — see the note in Task 3 Step 1 for why.
- Produces: `e2e/fixtures/getDraftId.ts` exports `getSeededDraftId(): Promise<number>` — Tasks 3, 4, and 5 import this.

- [ ] **Step 1: Create `e2e/fixtures/players.ts`**

```ts
export interface FixturePlayer {
  name: string;
  nflTeam: string;
  pos: 'QB' | 'RB' | 'WR' | 'TE';
  age: number;
  sfRank: number;
  budget: number;
  ceiling: number;
  floor: number;
}

export const NOMINATE_TARGET: FixturePlayer = {
  name: 'Fixture RB Nominate Target',
  nflTeam: 'DAL',
  pos: 'RB',
  age: 25,
  sfRank: 4,
  budget: 100,
  ceiling: 115,
  floor: 87,
};

export const BID_TARGET: FixturePlayer = {
  name: 'Fixture WR Bid Target',
  nflTeam: 'MIA',
  pos: 'WR',
  age: 24,
  sfRank: 6,
  budget: 110,
  ceiling: 127,
  floor: 96,
};

export const FIXTURE_PLAYERS: FixturePlayer[] = [
  {
    name: 'Fixture QB One',
    nflTeam: 'KC',
    pos: 'QB',
    age: 27,
    sfRank: 1,
    budget: 180,
    ceiling: 207,
    floor: 157,
  },
  {
    name: 'Fixture QB Two',
    nflTeam: 'BUF',
    pos: 'QB',
    age: 29,
    sfRank: 2,
    budget: 150,
    ceiling: 173,
    floor: 131,
  },
  {
    name: 'Fixture RB One',
    nflTeam: 'SF',
    pos: 'RB',
    age: 24,
    sfRank: 3,
    budget: 120,
    ceiling: 138,
    floor: 104,
  },
  NOMINATE_TARGET,
  {
    name: 'Fixture RB Three',
    nflTeam: 'MIN',
    pos: 'RB',
    age: 26,
    sfRank: 5,
    budget: 90,
    ceiling: 104,
    floor: 78,
  },
  BID_TARGET,
  {
    name: 'Fixture WR Two',
    nflTeam: 'CIN',
    pos: 'WR',
    age: 26,
    sfRank: 7,
    budget: 95,
    ceiling: 109,
    floor: 83,
  },
  {
    name: 'Fixture WR Three',
    nflTeam: 'DET',
    pos: 'WR',
    age: 28,
    sfRank: 8,
    budget: 80,
    ceiling: 92,
    floor: 70,
  },
  {
    name: 'Fixture TE One',
    nflTeam: 'KC',
    pos: 'TE',
    age: 28,
    sfRank: 9,
    budget: 70,
    ceiling: 81,
    floor: 61,
  },
  {
    name: 'Fixture TE Two',
    nflTeam: 'SF',
    pos: 'TE',
    age: 25,
    sfRank: 10,
    budget: 55,
    ceiling: 63,
    floor: 48,
  },
  {
    name: 'Fixture WR Four',
    nflTeam: 'PHI',
    pos: 'WR',
    age: 23,
    sfRank: 11,
    budget: 60,
    ceiling: 69,
    floor: 52,
  },
  {
    name: 'Fixture RB Four',
    nflTeam: 'BAL',
    pos: 'RB',
    age: 27,
    sfRank: 12,
    budget: 50,
    ceiling: 58,
    floor: 44,
  },
];
```

- [ ] **Step 2: Create `e2e/db.ts`**

```ts
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

export async function closeDb(): Promise<void> {
  await prisma.$disconnect();
  await pool.end();
}
```

- [ ] **Step 3: Create `e2e/fixtures/getDraftId.ts`**

```ts
import { prisma } from '../db';
import { E2E_TEST_USER_ID } from '../env';

export async function getSeededDraftId(): Promise<number> {
  const draft = await prisma.draft.findFirstOrThrow({ where: { ownerId: E2E_TEST_USER_ID } });
  return draft.id;
}
```

- [ ] **Step 4: Create `e2e/seed.ts`**

```ts
import { LEAGUE_TEAMS } from '../src/lib/teams';
import { FIXTURE_PLAYERS } from './fixtures/players';
import { E2E_TEST_USER_ID } from './env';
import { prisma, closeDb } from './db';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

async function main() {
  const draft = await prisma.draft.create({
    data: {
      name: 'Playwright E2E Draft',
      ownerId: E2E_TEST_USER_ID,
    },
  });

  await prisma.team.createMany({
    data: LEAGUE_TEAMS.map((team) => ({
      handle: team.handle,
      displayName: team.displayName,
      budget: 1000,
      draftId: draft.id,
    })),
  });

  const ownerTeam = await prisma.team.findFirstOrThrow({
    where: { handle: 'coreschke', draftId: draft.id },
  });
  await prisma.draft.update({ where: { id: draft.id }, data: { ownerTeamId: ownerTeam.id } });

  await prisma.player.createMany({
    data: FIXTURE_PLAYERS.map((player) => ({
      name: player.name,
      nflTeam: player.nflTeam,
      pos: player.pos,
      age: player.age,
      sfRank: player.sfRank,
      budget: player.budget,
      ceiling: player.ceiling,
      floor: player.floor,
      baseBudget: player.budget,
      baseCeiling: player.ceiling,
      baseFloor: player.floor,
      draftId: draft.id,
    })),
  });

  console.log(`Seeded e2e draft ${draft.id} with ${FIXTURE_PLAYERS.length} players.`);
}

main()
  .then(closeDb)
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
```

- [ ] **Step 5: Verify against a scratch database**

This requires a local Postgres (per this repo's `CLAUDE.md`, a native WSL2 install — `make db-start` if not already running). Use a throwaway database so this never touches the real dev DB:

```bash
psql -h localhost -U postgres -c "CREATE DATABASE draftops_e2e_scratch;" 2>/dev/null || true

DATABASE_URL="postgresql://postgres@localhost:5432/draftops_e2e_scratch" pnpm prisma migrate deploy
DATABASE_URL="postgresql://postgres@localhost:5432/draftops_e2e_scratch" pnpm tsx e2e/seed.ts

psql -h localhost -U postgres -d draftops_e2e_scratch -tAc 'SELECT COUNT(*) FROM "Team"'
# Expected: 12
psql -h localhost -U postgres -d draftops_e2e_scratch -tAc 'SELECT COUNT(*) FROM "Player"'
# Expected: 12
psql -h localhost -U postgres -d draftops_e2e_scratch -tAc "SELECT \"ownerTeamId\" IS NOT NULL FROM \"Draft\""
# Expected: t

psql -h localhost -U postgres -c "DROP DATABASE draftops_e2e_scratch;"
```

Adjust the `psql`/`DATABASE_URL` user/auth to match your local Postgres setup — the exact connection string isn't load-bearing, only that a real database gets migrated and seeded.

- [ ] **Step 6: Lint and commit**

```bash
pnpm lint
pnpm format:check
git add e2e/fixtures/players.ts e2e/db.ts e2e/fixtures/getDraftId.ts e2e/seed.ts
git commit -m "test: add Playwright e2e seed script and fixture player data"
```

---

### Task 3: Bid-logging smoke spec

**Files:**

- Create: `e2e/bid.spec.ts`

**Interfaces:**

- Consumes: `getSeededDraftId` from `e2e/fixtures/getDraftId.ts`, `BID_TARGET` from `e2e/fixtures/players.ts` (both from Task 2).

- [ ] **Step 1: Create `e2e/bid.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { getSeededDraftId } from './fixtures/getDraftId';
import { BID_TARGET } from './fixtures/players';

test('logging a bid is reflected on the value sheet', async ({ page }) => {
  const draftId = await getSeededDraftId();
  await page.goto(`/draft/${draftId}`);

  const row = page.getByTestId(`player-row-${BID_TARGET.sfRank}`);
  await expect(row).toBeVisible();
  await row.click();

  await expect(page.getByTestId('bid-price')).toBeVisible();
  await page.getByTestId('bid-price').fill('42');
  await page.getByTestId('bid-submit').click();

  await expect(page.getByTestId('bid-price')).toHaveCount(0);
  await expect(row).toContainText('$42');
});
```

The bid modal (`src/components/BidModal/BidModal.tsx`) defaults its "Won By" team select to `teams[0]`, so this flow never needs to interact with that select — filling price and submitting is enough to exercise `logBid`. A successful submit closes the modal (`bid-price` unmounts) and the row re-renders with the claimed price via the app's own optimistic update — no page reload needed.

Deliberately no `test.afterAll(() => closeDb())` here (or in Tasks 4/5): with `workers: 1` in CI, Playwright reuses one worker process — and therefore one Node module cache — across `bid.spec.ts`, `nominate.spec.ts`, and `rosters.spec.ts`. `e2e/db.ts`'s `pool`/`prisma` are module-level singletons shared by all three files in that worker. If any one spec's `afterAll` called `pool.end()`, the _next_ spec file's `getSeededDraftId()` would run its query against an already-ended pool and fail — deterministically in CI (`workers: 1`), even though it would look fine locally where each file often lands in its own worker (`workers: undefined`) with its own pool. `closeDb()` stays reserved for `e2e/seed.ts`, a genuinely standalone one-shot process where ending the pool is safe. Leaving the pool open until the worker process exits is harmless for a four-file smoke suite.

- [ ] **Step 2: Run against the scaffold from Tasks 1-2**

Repeat Task 2 Step 5's scratch-database setup (or reuse a still-running one), then:

```bash
DATABASE_URL="postgresql://postgres@localhost:5432/draftops_e2e_scratch" \
AUTH_SECRET="e2e-test-secret-do-not-use-in-prod" \
AUTH_DISCORD_ID="e2e-placeholder" \
AUTH_DISCORD_SECRET="e2e-placeholder" \
AUTH_TRUST_HOST=1 \
pnpm build

DATABASE_URL="postgresql://postgres@localhost:5432/draftops_e2e_scratch" \
AUTH_SECRET="e2e-test-secret-do-not-use-in-prod" \
AUTH_TRUST_HOST=1 \
E2E_TEST_USER_ID="e2e-test-user" \
PORT=3100 \
pnpm exec playwright test e2e/bid.spec.ts
```

Expected: `1 passed`.

- [ ] **Step 3: Commit**

```bash
git add e2e/bid.spec.ts
git commit -m "test: add bid-logging Playwright smoke spec"
```

---

### Task 4: Nomination smoke spec

**Files:**

- Create: `e2e/nominate.spec.ts`

**Interfaces:**

- Consumes: `getSeededDraftId`, `NOMINATE_TARGET` (Task 2).

- [ ] **Step 1: Create `e2e/nominate.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { getSeededDraftId } from './fixtures/getDraftId';
import { NOMINATE_TARGET } from './fixtures/players';

test('nominating a player removes it from the rival-demand table', async ({ page }) => {
  const draftId = await getSeededDraftId();
  await page.goto(`/draft/${draftId}/nominate`);

  const nominateButton = page.getByTestId(`nominate-player-${NOMINATE_TARGET.name}`);
  await expect(nominateButton).toBeVisible();
  await nominateButton.click();

  await expect(nominateButton).toHaveCount(0);
});
```

`computeNominationScores` (`src/lib/nominationScoring.ts`) excludes currently-nominated players from its returned list, and `NominationHelper` applies that exclusion optimistically the moment the "Nominate" button is clicked — so the row (and its `nominate-player-*` button) disappearing is the correct, immediate signal of success, before the underlying `POST /api/draft/:id/nominated` call even resolves.

- [ ] **Step 2: Run it**

Same server/env setup as Task 3 Step 2, substituting the test file:

```bash
DATABASE_URL="postgresql://postgres@localhost:5432/draftops_e2e_scratch" \
AUTH_SECRET="e2e-test-secret-do-not-use-in-prod" \
AUTH_TRUST_HOST=1 \
E2E_TEST_USER_ID="e2e-test-user" \
PORT=3100 \
pnpm exec playwright test e2e/nominate.spec.ts
```

Expected: `1 passed`.

- [ ] **Step 3: Commit**

```bash
git add e2e/nominate.spec.ts
git commit -m "test: add nomination Playwright smoke spec"
```

---

### Task 5: Roster/budget rendering smoke spec

**Files:**

- Create: `e2e/rosters.spec.ts`

**Interfaces:**

- Consumes: `getSeededDraftId` (Task 2).

- [ ] **Step 1: Create `e2e/rosters.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { getSeededDraftId } from './fixtures/getDraftId';

test('teams and budget pages render seeded data', async ({ page }) => {
  const draftId = await getSeededDraftId();

  await page.goto(`/draft/${draftId}/teams`);
  await expect(page.locator('[data-testid^="dossier-card-"]')).toHaveCount(12);

  await page.goto(`/draft/${draftId}/budget`);
  await expect(page.getByTestId('threat-pos-QB')).toBeVisible();
});
```

`/teams` renders one `dossier-card-{teamId}` per team (`src/components/RosterTracker/RosterTracker.tsx`) — 12 seeded teams means exactly 12 cards at the default desktop viewport. `/budget`'s position selector (`threat-pos-{QB,RB,WR,TE}`, `src/components/BudgetPressure/ThreatBoard.tsx`) always renders all four position chips regardless of which position is currently "live," so this assertion holds no matter what other specs in this suite have nominated.

- [ ] **Step 2: Run it**

Same setup as Task 4 Step 2, substituting the test file:

```bash
DATABASE_URL="postgresql://postgres@localhost:5432/draftops_e2e_scratch" \
AUTH_SECRET="e2e-test-secret-do-not-use-in-prod" \
AUTH_TRUST_HOST=1 \
E2E_TEST_USER_ID="e2e-test-user" \
PORT=3100 \
pnpm exec playwright test e2e/rosters.spec.ts
```

Expected: `1 passed`.

- [ ] **Step 3: Run the full suite together**

```bash
DATABASE_URL="postgresql://postgres@localhost:5432/draftops_e2e_scratch" \
AUTH_SECRET="e2e-test-secret-do-not-use-in-prod" \
AUTH_DISCORD_ID="e2e-placeholder" \
AUTH_DISCORD_SECRET="e2e-placeholder" \
AUTH_TRUST_HOST=1 \
E2E_TEST_USER_ID="e2e-test-user" \
PORT=3100 \
pnpm test:e2e
```

Expected: `4 passed` (auth, bid, nominate, rosters). Then tear down the scratch database:

```bash
psql -h localhost -U postgres -c "DROP DATABASE draftops_e2e_scratch;"
```

- [ ] **Step 4: Commit**

```bash
git add e2e/rosters.spec.ts
git commit -m "test: add roster/budget rendering Playwright smoke spec"
```

---

### Task 6: Wire the `e2e` job into CI

**Files:**

- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: `e2e/seed.ts` (Task 2), `pnpm test:e2e` (Task 1).

- [ ] **Step 1: Add the `e2e` job**

Add this job to `.github/workflows/ci.yml`, after the existing `projections` job:

```yaml
e2e:
  name: Playwright smoke tests
  runs-on: ubuntu-latest

  services:
    postgres:
      image: postgres:16-alpine
      env:
        POSTGRES_USER: draftops
        POSTGRES_PASSWORD: draftops
        POSTGRES_DB: draftops_e2e
      ports:
        - 5432:5432
      options: >-
        --health-cmd pg_isready
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5

  # Placeholder Discord values, same pattern as the `build` job: needed only so
  # NextAuth's config can be evaluated, never exercised (auth is via a signed
  # test cookie minted in e2e/global-setup.ts, not real Discord OAuth).
  env:
    DATABASE_URL: postgresql://draftops:draftops@localhost:5432/draftops_e2e
    AUTH_SECRET: ci-e2e-placeholder-secret-not-a-real-credential
    AUTH_DISCORD_ID: ci-build-placeholder
    AUTH_DISCORD_SECRET: ci-build-placeholder
    AUTH_TRUST_HOST: '1'
    E2E_TEST_USER_ID: e2e-test-user
    PORT: '3100'

  steps:
    - uses: actions/checkout@v4

    - uses: ./.github/actions/setup-pnpm-node

    - name: Install Playwright browsers
      run: pnpm exec playwright install --with-deps chromium

    - name: Deploy migrations against a clean database
      run: pnpm prisma migrate deploy

    - name: Seed e2e fixture data
      run: pnpm tsx e2e/seed.ts

    - name: Build
      run: pnpm build

    - name: Run Playwright smoke suite
      run: pnpm test:e2e

    - name: Upload Playwright report
      if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report
        path: playwright-report/
        retention-days: 7
```

This mirrors the existing `postgres` job's service-container shape (same image, same health-check options) and its implicit `prisma generate` via `setup-pnpm-node`'s default `postinstall` (no `--ignore-scripts`, so no separate generate step is needed — the `postgres` job doesn't have one either), plus the existing `build` job's placeholder-Discord-env pattern. Nothing here is a novel CI pattern for this repo.

- [ ] **Step 2: Review the full file for structural correctness**

There's no YAML linter available in this environment (`actionlint`, `yamllint`, and `act` are all absent), so verification here is manual: re-read the complete `.github/workflows/ci.yml` and confirm indentation is consistent with the sibling `postgres`/`build`/`projections` jobs (2-space nesting under `jobs:`), and that the new job doesn't duplicate a step name or the `5432:5432` port mapping in a way that would conflict — it won't, since each job gets its own runner/VM.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add Playwright smoke test job (HARD-012)"
```

- [ ] **Step 4: Push and confirm the real CI run**

```bash
git push -u origin worktree-hard-012-playwright
```

Open the PR (or push to an existing one) and watch the `e2e` job in the Actions tab — this is the actual verification gate for this task, since the job's correctness (service container health, migration, seed, build, Playwright run) can only be fully confirmed by GitHub's runners.

---

### Task 7: Local dev ergonomics

**Files:**

- Modify: `Makefile`
- Modify: `README.md`

**Interfaces:**

- Consumes: `pnpm test:e2e` (Task 1), `e2e/seed.ts` (Task 2).

- [ ] **Step 1: Add a `make test-e2e` target**

In `Makefile`, add next to the existing `test-coverage` target:

```makefile
.PHONY: test-e2e
test-e2e: ## Run Playwright smoke tests (point DATABASE_URL at a disposable DB first, then `pnpm tsx e2e/seed.ts`)
	pnpm exec playwright install --with-deps chromium
	pnpm test:e2e
```

- [ ] **Step 2: Document the local e2e workflow in `README.md`**

Add a short section near the existing `make test` documentation (check `README.md` around line 139 for the current test-command listing) explaining: point `DATABASE_URL` at a disposable database (never the real dev DB), run `pnpm prisma migrate deploy` then `pnpm tsx e2e/seed.ts` against it, then `make test-e2e`. Keep it to a few lines — this mirrors the existing brevity of that section.

- [ ] **Step 3: Verify**

```bash
make help | grep test-e2e
```

Expected: the target appears with its description text.

- [ ] **Step 4: Commit**

```bash
git add Makefile README.md
git commit -m "docs: document the local Playwright e2e workflow"
```

## Acceptance criteria recap

- `pnpm test:e2e` runs all four specs locally against a manually seeded scratch Postgres database.
- CI's `e2e` job runs on every PR alongside `quality` / `build` / `postgres` / `projections`.
- An unauthenticated visit to a protected route fails CI if it doesn't redirect to `/sign-in`.
- A broken bid-logging flow fails CI.
- Jest and ESLint are both unaffected by the new `e2e/` directory (verified in Task 1).
