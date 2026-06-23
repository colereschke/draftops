# DraftOps — Claude Context

Fantasy football dynasty auction draft tool built for a 12-team Superflex Sleeper league. The owner (Cole, handle: `coreschke`) is using this during a live slow auction and plans to share it with the Establish The Run dynasty Discord for feedback.

## Quick Commands

```bash
make setup       # First-time: install + migrate + seed
make dev         # Dev server at http://localhost:3000
make check       # Full quality gate: typecheck + lint + format + test
make test        # Jest only
make db-studio   # Visual DB browser (Prisma Studio)
make db-reset    # Wipe DB and re-seed (destructive)
```

## Tech Stack

- **Next.js 16** with App Router, `src/` directory, `@/*` import alias
- **TypeScript 5** — strict mode, no explicit `any` warnings
- **Tailwind CSS 4** — used for layout utilities; dynamic/computed styles (position colors, age colors) stay as inline styles
- **Prisma 7** with SQLite — see Prisma v7 notes below
- **pnpm 11** — do not use npm or yarn
- **Jest + React Testing Library** — tests in `src/__tests__/` or co-located `*.test.ts`
- **ESLint 9** flat config + Prettier — pre-commit hook enforces both via Husky + lint-staged

## Project Structure

```
src/
├── app/
│   ├── globals.css         # CSS custom properties (design tokens)
│   ├── layout.tsx          # Font setup: Barlow Condensed, Inter, JetBrains Mono
│   └── page.tsx            # Root page → renders <AuctionSheet />
├── components/
│   └── AuctionSheet/
│       ├── AuctionSheet.tsx  # 'use client' — all interactive UI lives here
│       └── index.ts
├── data/
│   └── players.ts          # ~270 players, fully processed (budget/ceiling/floor)
├── lib/
│   ├── db.ts               # Prisma singleton (required for Next.js dev hot reload)
│   └── teams.ts            # LEAGUE_TEAMS array + ROSTER_SIZE = 30
└── types/
    └── index.ts            # Player, Position, TeamStats, AuctionResultEntry
prisma/
├── schema.prisma           # Team + AuctionResult models
├── seed.ts                 # Upserts all 12 teams (idempotent)
└── dev.db                  # Local SQLite DB (gitignored)
prisma.config.ts            # Prisma v7 config (replaces datasource url in schema)
existing_project_docs/      # Original reference files — do not delete
```

## Database Schema

Two models. `Team` tracks 12 managers and their $1,000 budgets. `AuctionResult` logs each completed bid.

Remaining budget and roster count are **derived at query time** (not stored):

- `spent = SUM(results.price)` for a team
- `remaining = budget - spent`
- `rosterCount = COUNT(results)` for a team
- `buyingPower = remaining - (ROSTER_SIZE - rosterCount)` — classic auction math

## Design System

Defined as CSS custom properties in `src/app/globals.css`. Key values:

```
--bg-base: #0a0d14       background
--bg-surface: #141824    cards, header
--text-primary: #e8eaf0

Position accents:
--pos-qb: #4f83e8   --pos-rb: #4caf6e   --pos-wr: #e8a030
--pos-te: #c060d0   --pos-pick: #40b0b0  --pos-pkg: #f0c040

Age colors:
--age-young: #4caf6e (≤24)  --age-prime: #e8eaf0 (25–27)
--age-aging: #e8a030 (28–30) --age-old: #e05050 (31+)
```

Fonts: `var(--font-barlow)` (Barlow Condensed 700) for headers/labels, `var(--font-inter)` for body, `var(--font-mono)` (JetBrains Mono) for all numbers and dollar values.

Signature design element: 3px left border on each player row in their position accent color.

## Player Data & Valuation

Values come from `src/data/players.ts`. All processing is done at build time — the exported `players` array is ready to use.

Key logic:

- Source: `2QBAuction` column from the FantasyCalc CSV (Superflex format, $200 budget)
- Scale: `× 5` to convert to $1,000 budget
- TE premium: `× 1.18` on all TE values (extra PPR + first down scoring)
- 2027 pick package: hardcoded to `budget=109, ceiling=131, floor=75` (SF speculative premium)
- 2028 pick package: hardcoded to `budget=72, ceiling=86, floor=50`
- `ceiling = round(budget × 1.15)`, `floor = max(5, round(budget × 0.87))`

## League-Specific Rules

- **12 teams**, $1,000 budget, 30-man rosters
- **Kicker = pick package**: Winning a kicker bid nets you that team's entire 2027 1st+2nd+3rd picks. Cole's picks = Matt Gay.
- **2028 picks NOT in startup pool**
- Scoring: Full PPR + TE premium (+1 PPR, +0.25 first down for TEs), Superflex

## Prisma v7 Notes

Prisma 7 changed how SQLite connections are configured:

- `datasource` block in `schema.prisma` no longer takes a `url` field
- Connection config lives in `prisma.config.ts` (root-level)
- Requires the `@prisma/adapter-better-sqlite3` adapter in the PrismaClient constructor
- The `db.ts` singleton passes the adapter explicitly — do not instantiate PrismaClient without it

After any schema change: `pnpm prisma migrate dev --name <description>`
After pulling changes with new migrations: `pnpm prisma migrate dev` (applies pending)

## Code Quality Rules

- Single quotes, trailing commas, 2-space indent, 100 char line width (Prettier)
- No unused vars (ESLint errors), no explicit `any` (ESLint warns)
- Pre-commit hook runs `pnpm lint-staged` + `pnpm tsc --noEmit` — do not skip with `--no-verify`
- CI runs typecheck + lint + format check + tests on every PR

## What's Built vs. What's Next

**Built:**

- Value sheet with full player list, filters, search, sort, budget tracker

**Planned (not yet built):**

- Team roster tracker (who each team has won, spend per team, roster count)
- Live auction log (log a completed bid → auto-updates team budgets)
- Budget pressure view (`remaining - remaining_spots` = buying power per team)
- Nomination helper (who to nominate to burn rival budgets)

The DB schema is already designed to support all of these via `Team` and `AuctionResult`.

## Long-Term Vision

DraftOps is intended to be a generalizable auction draft tool — not hardcoded to this one league. Future direction:

- Create/manage multiple drafts
- Upload custom rankings (e.g., FantasyCalc CSV) per draft
- Configure scoring settings, league size, roster size, budget
- Support any number of teams (not just 12)

Design decisions (e.g., dropdowns over quick-pick grids for team selection) should account for this scalability.
## Global Rules

**Read before touching.** Before making any change in the repo, read the repo's `CLAUDE.md`. It contains the stack, layout, conventions, and repo-specific constraints that take precedence over general intuition.

**Don't commit trivial superpowers docs.** Design specs and implementation plans generated during a superpowers workflow should only be committed when the work is non-trivial enough that future-you would want to understand why a design decision was made. For simple, self-evident work, clean up generated spec/plan files at the end of the workflow ΓÇö don't commit them.

**Keep PRs clean.** Don't let extraneous files (scratch notes, generated docs, debug artifacts, unrelated changes) into PRs. This can be overridden if explicitly requested, but the default is a clean diff that contains only what the PR describes.

**No author attribution in commits.** Do not add `Co-Authored-By`, `Author:`, or any other authorship lines to commit messages.

**Don't be a sycophant!** The last thing I want in development is a yes man. If you agree with me on something that's fine, but please please think critically about my choices in development and if you have questions or concerns bring them up and challenge me if need be.
