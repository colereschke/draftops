# HARD-020 Database and Build Initialization Design

## Goal

Make application imports safe when database configuration is absent, bound the PostgreSQL client
pool used by each application instance, and remove Google Font downloads from production builds.

## Scope

- Replace the eager `prisma` export with an explicit `getPrisma(): PrismaClient` accessor and update
  database consumers without changing their queries or transaction semantics.
- Defer creation of the `pg` pool, Prisma adapter, and Prisma client until request or script code
  calls `getPrisma()`.
- Validate and document bounded pool configuration: a small runtime maximum, connection timeout,
  idle timeout, and a stable application name.
- Use `DATABASE_URL` for the pooled runtime endpoint and `DIRECT_URL` for Prisma CLI migrations.
- Bundle the existing Inter, Barlow Condensed, and JetBrains Mono font files in the repository and
  load them through `next/font/local`.
- Add focused unit tests and operator documentation, including region alignment and connection
  monitoring guidance.

## Non-goals

- Changing Prisma models, migrations, database transaction behavior, or application queries.
- Changing HARD-019's response headers, CSP, or proxy migration.
- Automatically detecting a Neon endpoint or changing a production Vercel/Neon region.

## Architecture

`src/lib/db.ts` exposes an explicit `getPrisma(): PrismaClient` accessor rather than a JavaScript
`Proxy`. Importing the module does not read `DATABASE_URL` or construct a network client. The first
call to `getPrisma()` validates configuration, creates one `PrismaClient` backed by one `pg.Pool`,
and caches both on `globalThis`. A companion `disconnectPrisma(): Promise<void>` closes the client
and clears the cached runtime for integration tests and scripts. It is safe to call when no runtime
has been created. Application request paths never disconnect the shared runtime.

Every application database consumer calls `getPrisma()` inside its request handler, server action,
server component, or exported operation rather than at module scope. This avoids a facade whose
property access, method binding, inspection symbols, or test mocking could accidentally initialize
Prisma. Existing Prisma queries and transactions remain unchanged after obtaining the client.

The pool derives its settings from a pure, unit-tested configuration function. `DATABASE_POOL_MAX`
is optional and defaults to `3` connections per application instance. When supplied, it must be a
base-10 integer from `1` through `10`; blank, fractional, non-numeric, zero, negative, and larger
values fail on the first `getPrisma()` call with a configuration error. The pool uses
`connectionTimeoutMillis: 5000`, `idleTimeoutMillis: 10000`, and an `application_name` selected from
the fixed values `draftops-production`, `draftops-preview`, `draftops-development`, or
`draftops-test`. No user-controlled string is copied into the application name.

The maximum is intentionally per application instance, not a deployment-wide guarantee. Up to
`live application instances × DATABASE_POOL_MAX` client connections can reach Neon PgBouncer.
Production `DATABASE_URL` therefore uses Neon's pooled hostname, while the small local pool limits
connections created by each warm Vercel instance.

`prisma.config.ts` continues to load `.env.local`, but resolves migration configuration from
`DIRECT_URL` first. Local and CI PostgreSQL workflows may fall back to `DATABASE_URL` when
`DIRECT_URL` is absent. A Vercel build (`VERCEL=1`) fails configuration with a clear message when
`DIRECT_URL` is missing, preventing `prisma migrate deploy` from silently using the pooled runtime
URL. Production and preview Vercel environments both supply a pooled `DATABASE_URL` and a direct
`DIRECT_URL`; migrations use the latter because Neon pooling is transaction mode.

Fonts move to tracked, Latin-subset WOFF2 assets beneath `src/app/fonts/` and retain the current CSS
variable names and effective weights: variable Inter for body text, Barlow Condensed weights 600
and 700 for display text, and variable JetBrains Mono for numbers. The repository records the exact
upstream release, source URL, SHA-256 checksum, and applicable SIL Open Font License alongside the
assets. `src/app/layout.tsx` uses `next/font/local` exclusively. This makes `next build` independent
of Google Fonts availability and compatible with HARD-019's planned `font-src 'self' data:` CSP.

## Errors and verification

Focused unit tests import `src/lib/db.ts` with both database URL variables absent and assert that no
pool or Prisma client is created. Additional tests cover singleton reuse, explicit disconnect,
missing `DATABASE_URL`, every invalid `DATABASE_POOL_MAX` class, the default and overridden maximum,
timeouts, fixed application names, and Vercel migration URL enforcement.

The CI production-build job removes its placeholder `DATABASE_URL` and runs `pnpm build` with
neither database URL present. A local-font regression test verifies that `layout.tsx` no longer
imports `next/font/google`, that every declared WOFF2 file is tracked, and that the recorded
checksums match. The production build provides the integration proof for `next/font/local`.

A real-PostgreSQL integration test creates a pool with `max: 2`, starts more than two concurrent
blocking queries, and observes that `pool.totalCount` never exceeds two while queued operations
eventually complete. It also verifies the configured `application_name` through PostgreSQL and
closes the test pool in cleanup. The normal suite, typecheck, lint, format check, production build,
and complete real-Postgres integration suite must remain clean.

The operations guide distinguishes the pooled runtime URL from the direct migration URL, explains
the per-instance connection calculation, and provides the exact Neon `pg_stat_activity` query and
console graphs used for observation. Before integration, the PR verification record must include
the configured Vercel function region, the Neon compute region, confirmation that they match, and
the observed peak pooler client/server connection counts from a representative concurrency run.
