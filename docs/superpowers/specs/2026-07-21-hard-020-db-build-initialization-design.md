# HARD-020 Database and Build Initialization Design

## Goal

Make application imports safe when database configuration is absent, bound the PostgreSQL client
pool used by each application instance, and remove Google Font downloads from production builds.

## Scope

- Keep the existing `prisma` import contract so application call sites do not need a broad rewrite.
- Defer creation of the `pg` pool, Prisma adapter, and Prisma client until code first uses Prisma.
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

`src/lib/db.ts` exposes a typed lazy Prisma facade and an explicit `getPrisma()` accessor. Importing
the module does not read `DATABASE_URL` or construct a network client. The first database operation
creates one `PrismaClient` backed by a `pg.Pool`, caches it on `globalThis`, and throws a clear
configuration error only if runtime code actually needs an absent URL.

The pool derives its settings from validated environment values. `DATABASE_POOL_MAX` is optional,
defaults to three connections per application instance, and is constrained to a safe range. The
pool uses a five-second connection timeout, ten-second idle timeout, and an environment-qualified
`application_name` for Neon observability. These choices bound local client connections while Neon
PgBouncer handles cross-instance serverless concurrency.

`prisma.config.ts` continues to load `.env.local`, but resolves migration configuration from
`DIRECT_URL` first and then `DATABASE_URL` for local development. Production operators supply a
pooled `DATABASE_URL` and a direct `DIRECT_URL`; migrations must use the direct URL because Neon
pooling is transaction mode.

Fonts move to tracked WOFF2 assets beneath `src/app/fonts/` and retain the current CSS variable
names and weights. This makes `next build` independent of Google Fonts availability and compatible
with HARD-019's planned `font-src 'self' data:` CSP.

## Errors and verification

Module imports and static build analysis succeed with no database URL. The first attempted Prisma
use reports a clear missing-configuration error. Unit tests cover lazy initialization and the pool
configuration parser. A production build verifies the local fonts; the normal suite, typecheck,
lint, format check, and real-Postgres integration suite verify regressions. The operations guide
gives concrete pre-deployment region checks and Neon pool-monitoring queries instead of claiming
that repository code can verify account configuration.
