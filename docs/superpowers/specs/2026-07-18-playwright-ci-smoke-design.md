# Playwright CI smoke coverage (HARD-012, remaining scope)

## Problem

HARD-012 (`docs/draftops-audit-workstreams.md`) shipped production-shaped CI checks in PR #59:
build, migration deploy, real-Postgres integration tests, and Python projection checks. The one
piece still open is item 5 of that ticket's implementation direction: "Add Playwright smoke
coverage with a test-auth mechanism." Accessibility scans and scheduled advisory scans (items 6-7)
are out of scope here — this spec covers only the browser smoke suite.

Every route except `/sign-in` is gated by Auth.js middleware behind Discord OAuth, and there is no
Credentials provider. Without a way to get an authenticated session, Playwright can't exercise any
real page.

## Test-auth mechanism

Auth.js v5 (JWT session strategy) decodes the session cookie via `encode`/`decode` from
`@auth/core/jwt`, keyed by `AUTH_SECRET` and a `salt` equal to the cookie name
(`authjs.session-token` for non-secure/http contexts, which is what `localhost` uses).

A Playwright `globalSetup` builds a JWT payload directly — `{ sub: E2E_TEST_USER_ID }` — and calls
`encode({ secret: process.env.AUTH_SECRET, salt: 'authjs.session-token', token })`, then writes the
result into a Playwright `storageState` file (`e2e/.auth/user.json`) as the `authjs.session-token`
cookie. Authenticated specs run with `test.use({ storageState: 'e2e/.auth/user.json' })`; the one
unauthenticated spec (sign-in redirect) runs with no storage state.

This never touches `src/auth.ts` or any production code path — the app cannot distinguish an
injected cookie from a real Discord-issued session. No test-only provider, no env-gated auth
bypass in application code.

## Fixture data

`prisma/seed-players.ts` (the existing Player-seeding script) reads a gitignored
`data/generated/etr_sleeper_matches.csv`, which won't exist in CI — and per existing project
convention, no CI-path script may depend on `data/generated/*` (see "no runtime deps on generated
data"). So this suite gets its own minimal, hardcoded fixture instead of the real ETR pool.

`e2e/seed.ts` (standalone script, run directly against the CI Postgres service, not through the
app):

- Creates one `Draft` with `ownerId: E2E_TEST_USER_ID`.
- Seeds 12 `Team` rows from the existing `LEAGUE_TEAMS` (`src/lib/teams.ts`) — no reason to
  duplicate that list — and sets `Draft.ownerTeamId` to the team whose handle matches the owner
  (mirrors `prisma/seed.ts`'s existing pattern).
- Seeds ~12-16 `Player` rows across QB/RB/WR/TE from a new `e2e/fixtures/players.ts` — enough
  spread for the value sheet, bid modal, nomination scoring, and roster views to render
  meaningfully. Values are plausible but arbitrary; this fixture is not meant to mirror real ETR
  data.

Always run against a freshly migrated, empty database in CI — no upsert/idempotency handling
needed.

## CI integration

New `e2e` job in `.github/workflows/ci.yml`, structured like the existing `postgres` job:

- `postgres:16-alpine` service container, own database name (e.g. `draftops_e2e`) to stay isolated
  from the `postgres` job's `draftops_test`.
- Env: `DATABASE_URL` pointing at that service; `AUTH_SECRET` (fixed CI value, shared by the
  Playwright process and the built app); placeholder `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET`
  (needed only so `next build` can evaluate the NextAuth config; never exercised);
  `E2E_TEST_USER_ID`.
- Steps: checkout → `setup-pnpm-node` → `pnpm prisma generate` →
  `pnpm exec playwright install --with-deps chromium` → `pnpm prisma migrate deploy` →
  `pnpm tsx e2e/seed.ts` → `pnpm build` → `pnpm test:e2e`.
- Playwright's `webServer` config runs `pnpm start` (the production build) against the seeded
  database — this job validates the production bundle, not `next dev`, consistent with HARD-012's
  "production-shaped checks" theme.
- On failure, upload the `playwright-report/` directory as a build artifact for debugging.
- Chromium only. This is smoke coverage, not cross-browser regression coverage; multi-browser can
  be added later if a real Safari/Firefox-specific bug shows up.

## Test suite

All specs live under `e2e/`, smoke-level (one happy path each, not exhaustive):

- `e2e/auth.spec.ts` — unauthenticated visit to `/` redirects to `/sign-in`.
- `e2e/bid.spec.ts` — authenticated: load `/`, open the bid modal for a fixture player, log a bid,
  confirm it's reflected (price/roster state updates on the sheet).
- `e2e/nominate.spec.ts` — authenticated: mark a fixture player nominated from `/nominate`, confirm
  the "LIVE" badge / nominated-sidebar state appears.
- `e2e/rosters.spec.ts` — authenticated: `/teams` and `/budget` load and render seeded team/player
  data without error.

## File layout & local dev

- `playwright.config.ts` at repo root (`testDir: './e2e'`, `globalSetup`, `webServer`, chromium
  project + one unauthenticated project for the redirect test).
- `package.json`: add `@playwright/test` devDependency; `"test:e2e": "playwright test"` script.
- `Makefile`: `make test-e2e` target, named consistently with `make test` / `make test-integration`.
- `jest.config.ts`: add `<rootDir>/e2e/` to `testPathIgnorePatterns` so Jest's broad
  `**/*.{spec,test}.{ts,tsx}` glob never picks up Playwright spec files.
- `eslint.config.mjs`: confirm Playwright spec files lint cleanly under the existing Next config
  (Node-context TS files, similar to `prisma/*.ts`); add an override block only if a real conflict
  shows up during implementation.

## Acceptance criteria

- `pnpm test:e2e` runs locally against a manually seeded local Postgres (documented in this repo's
  README/Makefile help text).
- CI's `e2e` job runs on every PR alongside the existing `quality` / `build` / `postgres` /
  `projections` jobs, using minimal permissions and the workflow's existing concurrency
  cancellation group.
- A broken auth boundary (protected route reachable without a session) fails CI.
- A broken core mutation (bid logging) fails CI.
- Jest and ESLint are unaffected by the new `e2e/` directory.
