# HARD-020 Database and Build Initialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Prisma initialization lazy and bounded, give runtime and migration connections explicit roles, remove build-time Google Font downloads, and verify each behavior.

**Architecture:** Database callers obtain a cached `PrismaClient` through `getPrisma()` only when they execute work. Pure helpers own pool and migration URL configuration so they can be tested without opening a database connection. Local WOFF2 assets replace `next/font/google`; operational documentation records external Neon/Vercel checks.

**Tech Stack:** Next.js 16.2, TypeScript 5, Prisma 7 with `@prisma/adapter-pg`, `pg`, Jest 30, PostgreSQL 16, `next/font/local`, Fontsource 5.3.0.

## Global Constraints

- Do not change Prisma models, migration SQL, transaction semantics, or application query behavior.
- Do not edit HARD-019-owned `next.config.ts`, CSP, or proxy files.
- Runtime `DATABASE_URL` is pooled in production; Vercel migrations require direct `DIRECT_URL`.
- `DATABASE_POOL_MAX` defaults to `3` and accepts only whole base-10 values from `1` through `10`.
- Pool options are `connectionTimeoutMillis: 5000`, `idleTimeoutMillis: 10000`, and a fixed `draftops-*` application name.
- Keep font assets Latin-only and checked in with source metadata, SHA-256 checksums, and SIL Open Font License files.

---

## File structure

- `src/lib/databaseConfiguration.ts` owns pure pool and migration URL configuration.
- `src/lib/db.ts` owns lazy Prisma runtime caching and clean shutdown.
- `src/__tests__/databaseConfiguration.test.ts` and `src/__tests__/db.test.ts` cover pure policy and lazy runtime behavior.
- Existing database consumers use `getPrisma()` inside executed operations.
- `src/__tests__/integration/databasePool.postgres.test.ts` proves the real pool bound.
- `src/app/fonts/` stores four WOFF2 files, source/checksum metadata, and licenses.
- `src/app/layout.tsx` consumes local fonts; `src/__tests__/localFonts.test.ts` guards the asset contract.
- `.github/workflows/ci.yml`, `.env.example`, `AGENTS.md`, and `docs/operations/database-connections.md` enforce and document deployment behavior.

### Task 1: Define and test database connection policy

**Files:**

- Create: `src/lib/databaseConfiguration.ts`
- Create: `src/__tests__/databaseConfiguration.test.ts`
- Modify: `prisma.config.ts`

**Interfaces:**

```ts
export interface DatabaseEnvironment {
  DATABASE_URL?: string;
  DATABASE_POOL_MAX?: string;
  DIRECT_URL?: string;
  NODE_ENV?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
}

export interface DatabasePoolConfiguration {
  application_name:
    'draftops-development' | 'draftops-preview' | 'draftops-production' | 'draftops-test';
  connectionString: string;
  connectionTimeoutMillis: 5000;
  idleTimeoutMillis: 10000;
  max: number;
}

export function getDatabasePoolConfiguration(
  environment: DatabaseEnvironment,
): DatabasePoolConfiguration;
export function resolveMigrationDatabaseUrl(environment: DatabaseEnvironment): string | undefined;
```

- [ ] **Step 1: Write the failing pure-policy tests**

Create `src/__tests__/databaseConfiguration.test.ts`. Use `RUNTIME_URL = 'postgresql://draftops:secret@localhost:5432/draftops'` and assert the default development result is:

```ts
expect(
  getDatabasePoolConfiguration({ DATABASE_URL: RUNTIME_URL, NODE_ENV: 'development' }),
).toEqual({
  application_name: 'draftops-development',
  connectionString: RUNTIME_URL,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
  max: 3,
});
```

Add parameterized rejections for `''`, `'0'`, `'-1'`, `'1.5'`, `'eleven'`, `'11'`, and `' 3 '` with the exact error `DATABASE_POOL_MAX must be a whole number from 1 through 10`. Assert `DIRECT_URL` wins, non-Vercel use may fall back to `DATABASE_URL`, and `{ DATABASE_URL: RUNTIME_URL, VERCEL: '1' }` throws `DIRECT_URL is required when VERCEL=1`.

- [ ] **Step 2: Verify red**

Run: `pnpm exec jest src/__tests__/databaseConfiguration.test.ts`

Expected: FAIL because `@/lib/databaseConfiguration` does not exist.

- [ ] **Step 3: Implement the pure module**

Create `src/lib/databaseConfiguration.ts`. Trim URL values; throw `DATABASE_URL is required when database access is requested` for missing/blank runtime URLs. Parse an optional maximum with `/^[1-9]\d*$/` and inclusive range 1–10. Map `NODE_ENV === 'test'` to `draftops-test`, `VERCEL_ENV === 'production'` to `draftops-production`, `VERCEL_ENV === 'preview'` to `draftops-preview`, and all remaining cases to `draftops-development`. Return `DIRECT_URL` when present; when `VERCEL === '1'` and it is absent, throw; otherwise return a trimmed `DATABASE_URL` or `undefined`.

- [ ] **Step 4: Wire Prisma CLI configuration**

Replace the datasource expression in `prisma.config.ts` with:

```ts
import { resolveMigrationDatabaseUrl } from './src/lib/databaseConfiguration';

datasource: {
  url: resolveMigrationDatabaseUrl(process.env)!,
},
```

Retain the existing `.env.local` load. The assertion satisfies Prisma’s type but does not alter the resolver’s runtime behavior.

- [ ] **Step 5: Verify green and commit**

Run: `pnpm exec jest src/__tests__/databaseConfiguration.test.ts && pnpm format:check`

Expected: PASS.

```bash
git add src/lib/databaseConfiguration.ts src/__tests__/databaseConfiguration.test.ts prisma.config.ts
git commit -m "feat: define database connection configuration"
```

### Task 2: Add the lazy Prisma runtime

**Files:**

- Modify: `src/lib/db.ts`
- Create: `src/__tests__/db.test.ts`

**Interfaces:**

```ts
export function getPrisma(): PrismaClient;
export function disconnectPrisma(): Promise<void>;
```

- [ ] **Step 1: Write failing lazy-runtime tests**

Create Node-environment `src/__tests__/db.test.ts`. Mock `pg`, `@prisma/adapter-pg`, and `@prisma/client`, then call `jest.resetModules()` before each dynamic import. With neither URL configured, importing `@/lib/db` must construct neither `Pool`, `PrismaPg`, nor `PrismaClient`; `getPrisma()` must then throw the exact missing-`DATABASE_URL` error. With a URL, two calls must return the same mock client and construct one pool/client. `disconnectPrisma()` must call `$disconnect()` once, clear the cache, and be a no-op before initialization.

- [ ] **Step 2: Verify red**

Run: `pnpm exec jest src/__tests__/db.test.ts`

Expected: FAIL because the accessors are not exported.

- [ ] **Step 3: Implement the runtime**

Refactor `src/lib/db.ts` to remove the eager `prisma` export. Store this exact cache shape on `globalThis`:

```ts
interface PrismaRuntime {
  client: PrismaClient;
}

interface PrismaGlobal {
  runtime: PrismaRuntime | undefined;
}
```

`getPrisma()` returns the cached client or obtains `getDatabasePoolConfiguration(process.env)`, creates a `Pool` from its configuration, wraps it in `new PrismaPg(pool, { disposeExternalPool: true })`, applies the existing development log policy, caches the client, and returns it. `disconnectPrisma()` clears `runtime` before awaiting `$disconnect()`.

- [ ] **Step 4: Verify green and commit**

Run: `pnpm exec jest src/__tests__/db.test.ts`

Expected: PASS.

```bash
git add src/lib/db.ts src/__tests__/db.test.ts
git commit -m "feat: lazily initialize Prisma runtime"
```

### Task 3: Migrate consumers and mocks to the explicit accessor

**Files:**

- Modify: `src/lib/actions.ts`, `src/lib/activeDraftPlayers.ts`, `src/lib/draft.ts`, `src/lib/draftMutation.ts`, `src/lib/onboarding-actions.ts`, `src/lib/onboarding.ts`, `src/lib/rankings-actions.ts`, `src/lib/sleeper-roster-actions.ts`
- Modify: every current `src/app/**` importer of `{ prisma } from '@/lib/db'`
- Modify: affected `src/__tests__/` mocks and all five existing `.postgres.test.ts` suites

**Interfaces:** Production code imports `getPrisma` and calls it inside each executed server action, route handler, cached loader, or server component. Jest mocks export `getPrisma: () => mockPrisma`. Integration cleanup uses `disconnectPrisma()`.

- [ ] **Step 1: Write one focused failing consumer test**

Change `src/__tests__/healthRoute.test.ts` to expose:

```ts
const mockPrisma = { $queryRaw: jest.fn() };
jest.mock('@/lib/db', () => ({ getPrisma: () => mockPrisma }));
```

Run: `pnpm exec jest src/__tests__/healthRoute.test.ts`

Expected: FAIL because `src/app/api/health/route.ts` still imports `prisma`.

- [ ] **Step 2: Convert the focused route**

In `src/app/api/health/route.ts`, replace the import with `getPrisma` and add `const prisma = getPrisma()` as the first statement in `GET`. Run the focused test again.

Expected: PASS.

- [ ] **Step 3: Convert every production importer**

Replace each `import { prisma } from '@/lib/db'` with `import { getPrisma } from '@/lib/db'`. Add the local declaration immediately before the first query in that operation. For React `cache` wrappers, call it inside the cached callback. Do not introduce a module-level alias; preserve all existing query expressions.

- [ ] **Step 4: Convert test doubles and integration cleanup**

Replace each mock shaped as `{ prisma: mockPrisma }` with `{ getPrisma: () => mockPrisma }`. Replace direct `prisma` imports in `src/__tests__/integration/` with function-local `getPrisma()` calls. Import and call `disconnectPrisma()` from each suite’s `afterAll` cleanup.

- [ ] **Step 5: Verify and commit**

Run: `pnpm test`

Expected: all unit tests PASS and `rg -n "import \{ prisma \} from '@/lib/db'" src` has no output.

```bash
git add src
git commit -m "refactor: access Prisma lazily at database call sites"
```

### Task 4: Prove bounded pooling against PostgreSQL

**Files:**

- Create: `src/__tests__/integration/databasePool.postgres.test.ts`

**Interfaces:** The test creates a test-only `pg.Pool` from `getDatabasePoolConfiguration` and `configureTestDatabaseUrl()`; it does not use the application singleton.

- [ ] **Step 1: Write the failing saturation test**

Create a pool with `DATABASE_POOL_MAX: '2'` and `NODE_ENV: 'test'`, start four `SELECT pg_sleep(0.1)` queries, wait 25ms, and assert:

```ts
expect(pool.totalCount).toBeLessThanOrEqual(2);
expect(pool.waitingCount).toBeGreaterThan(0);
await expect(Promise.all(queries)).resolves.toHaveLength(4);
```

Query `SELECT current_setting('application_name') AS application_name` and expect `draftops-test`. Use `runCleanupSteps` to call `pool.end()` after each test.

- [ ] **Step 2: Verify red**

Run: `pnpm test:integration -- databasePool.postgres.test.ts`

Expected: FAIL because the integration test file does not exist.

- [ ] **Step 3: Verify the existing configuration with a real pool**

Pass the configuration returned by Task 1 directly to `new Pool(...)`; its `application_name` field is
already structurally compatible with `pg.PoolConfig`. Run the focused integration command again.

Expected: PASS with no more than two connections.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/integration/databasePool.postgres.test.ts
git commit -m "test: verify bounded PostgreSQL pool behavior"
```

### Task 5: Self-host the existing font families

**Files:**

- Create: `src/app/fonts/Inter-Variable.woff2`, `src/app/fonts/JetBrainsMono-Variable.woff2`, `src/app/fonts/BarlowCondensed-SemiBold.woff2`, `src/app/fonts/BarlowCondensed-Bold.woff2`
- Create: `src/app/fonts/FONTS.md`, `src/app/fonts/LICENSE-Inter.txt`, `src/app/fonts/LICENSE-JetBrainsMono.txt`, `src/app/fonts/LICENSE-BarlowCondensed.txt`
- Modify: `src/app/layout.tsx`
- Create: `src/__tests__/localFonts.test.ts`

**Interfaces:** Preserve `--font-inter`, `--font-barlow`, and `--font-mono`; layout imports only `next/font/local`.

- [ ] **Step 1: Acquire versioned assets**

Download Fontsource 5.3.0 tarballs from:

```text
https://registry.npmjs.org/@fontsource-variable/inter/-/inter-5.3.0.tgz
https://registry.npmjs.org/@fontsource-variable/jetbrains-mono/-/jetbrains-mono-5.3.0.tgz
https://registry.npmjs.org/@fontsource/barlow-condensed/-/barlow-condensed-5.3.0.tgz
```

Copy the Latin normal variable Inter and JetBrains Mono WOFF2 files and Barlow Condensed normal 600/700 WOFF2 files into the four destination names. Copy each package license to its matching destination. Compute SHA-256 values and record package, version, URL, source/destination filenames, checksums, and licenses in `FONTS.md`. Do not retain archives or extracted directories.

- [ ] **Step 2: Write and verify the failing font test**

Create `src/__tests__/localFonts.test.ts` using `readFileSync`, `existsSync`, `createHash`, and `resolve`. Assert layout imports `next/font/local`, contains no `next/font/google`, references all four filenames, and each asset checksum equals the manifest value. Run:

`pnpm exec jest src/__tests__/localFonts.test.ts`

Expected: FAIL while layout uses Google fonts.

- [ ] **Step 3: Implement local font loading**

Replace the Google import with `localFont`. Configure Inter and JetBrains Mono from their variable WOFF2 files. Configure Barlow Condensed with:

```ts
src: [
  { path: './fonts/BarlowCondensed-SemiBold.woff2', weight: '600', style: 'normal' },
  { path: './fonts/BarlowCondensed-Bold.woff2', weight: '700', style: 'normal' },
],
```

Keep class-name composition and body font-family unchanged.

- [ ] **Step 4: Verify and commit**

Run: `pnpm exec jest src/__tests__/localFonts.test.ts && pnpm build`

Expected: PASS without a Google Font download.

```bash
git add src/app/fonts src/app/layout.tsx src/__tests__/localFonts.test.ts
git commit -m "feat: self-host application fonts"
```

### Task 6: Enforce and document deployment behavior

**Files:**

- Modify: `.github/workflows/ci.yml`, `.env.example`, `AGENTS.md`
- Create: `docs/operations/database-connections.md`
- Modify: `src/__tests__/databaseConfiguration.test.ts`

- [ ] **Step 1: Write a failing CI build assertion**

Extend `databaseConfiguration.test.ts` to read `.github/workflows/ci.yml` and assert the `build` job’s environment block has neither `DATABASE_URL` nor `DIRECT_URL`. Run its focused Jest command.

Expected: FAIL because the build job currently contains a placeholder URL.

- [ ] **Step 2: Update CI and environment documentation**

Remove only the production build job’s `DATABASE_URL`; keep PostgreSQL and E2E URLs. Add this exact environment guidance to `.env.example`:

```dotenv
# Runtime uses a pooled Neon URL in Vercel; migrations use a direct Neon URL.
DATABASE_URL=
DIRECT_URL=

# Optional per-instance pg client pool limit. Defaults to 3; valid range is 1-10.
DATABASE_POOL_MAX=
```

Create `docs/operations/database-connections.md` with the pooled/direct distinction, per-instance calculation, Vercel/Neon region check, and:

```sql
SELECT application_name, state, count(*) AS connections
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY application_name, state
ORDER BY application_name, state;
```

Also document Neon Console’s Pooler client/server connection graphs and update the matching Prisma/environment sections of `AGENTS.md`.

- [ ] **Step 3: Verify and commit**

Run: `pnpm exec jest src/__tests__/databaseConfiguration.test.ts && pnpm format:check`

Expected: PASS.

```bash
git add .github/workflows/ci.yml .env.example AGENTS.md docs/operations/database-connections.md \
  src/__tests__/databaseConfiguration.test.ts
git commit -m "docs: define database connection operations"
```

### Task 7: Verify the complete change

**Files:** No new files.

- [ ] **Step 1: Run static checks**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm format:check`

Expected: PASS.

- [ ] **Step 2: Run all automated suites**

Run: `pnpm test && pnpm test:integration`

Expected: PASS, including `databasePool.postgres.test.ts` against a disposable local `_test` database.

- [ ] **Step 3: Run the database-free build**

Run: `env -u DATABASE_URL -u DIRECT_URL pnpm build`

Expected: PASS without a Google Font fetch.

- [ ] **Step 4: Inspect scope**

Run: `git diff main...HEAD --check && git status --short`

Expected: no whitespace errors and only HARD-020 source, tests, assets, operations docs, spec, and plan changes.

- [ ] **Step 5: Record external release verification**

Before merge, record in the PR verification notes: Vercel function region, Neon compute region, confirmation they match, and peak Neon Pooler client/server connection counts from a representative concurrent action run. Local tests must not claim this external verification.

## Plan self-review

- **Spec coverage:** Tasks 1–4 implement and prove lazy Prisma construction, bounded pooling, and direct migration URLs. Task 5 makes fonts reproducible and local. Task 6 enforces CI and documents operations. Task 7 performs complete verification plus the external release gate.
- **Placeholder scan:** Each task names exact files, commands, behavior, and expected outcomes.
- **Type consistency:** `getPrisma`, `disconnectPrisma`, `getDatabasePoolConfiguration`, and `resolveMigrationDatabaseUrl` keep the same names throughout.
