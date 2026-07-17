# DraftOps

A dynasty fantasy football auction startup draft tool. Built for a 12-team Superflex league on Sleeper — tracks player values, live team budgets, and completed bids across all 12 managers.

## League Context

| Setting        | Value                                  |
| -------------- | -------------------------------------- |
| Platform       | Sleeper                                |
| Format         | Dynasty (keep players year-over-year)  |
| Teams          | 12 — 30-player rosters                 |
| Scoring        | Full PPR + TE premium                  |
| QB Format      | **Superflex** — QBs are premium assets |
| Auction Budget | **$1,000 per team**                    |
| Draft Style    | Slow auction (OTC, 12-hour timer)      |

## Getting Started

**Prerequisites:** [Node.js](https://nodejs.org) 20+, [pnpm](https://pnpm.io) 11+

### 1. Create a Discord OAuth app

DraftOps uses Discord for authentication. Each developer needs their own Discord application — it's free and takes two minutes.

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) and click **New Application**
2. In your app, go to **OAuth2** and add this redirect URI:
   ```
   http://localhost:3000/api/auth/callback/discord
   ```
3. Copy your **Client ID** and generate a **Client Secret** (OAuth2 → General)

### 2. Configure environment variables

Create `.env.local` in the repo root:

```bash
AUTH_SECRET=        # any random string: openssl rand -base64 32
AUTH_DISCORD_ID=    # client ID from step 1
AUTH_DISCORD_SECRET= # client secret from step 1
```

`AUTH_SECRET` just signs JWT cookies locally — it doesn't need to match anyone else's.

### 3. Install and run

```bash
git clone <repo-url>
cd draftops
make setup   # install deps, run migrations, seed 12 teams
make dev     # start at http://localhost:3000
```

Visit any page and you'll be redirected to the Discord sign-in screen.

## Features

- **Value sheet** (`/`) — ~270 players ranked by SF position with floor / target / ceiling bid prices, position filters, search, sort, age color coding, and bid logging via modal
- **Live auction log** — log, edit, and delete bids as they happen; won players dim in the sheet; nominated players show a teal "LIVE" badge
- **Team roster tracker** (`/teams`) — expandable rows per team showing won players, spend/remaining/buying power, and delta vs. target budget per player
- **Budget pressure view** (`/budget`) — teams sorted by buying power with a visual bar; auto-refreshes every 20 seconds
- **Nomination helper** (`/nominate`) — ranks available players by rival demand score; personal watchlist sidebar persists to DB and excludes players from suggestions
- **In-auction tracking** — "Nom" button marks a player as currently up for bidding; persists to DB so state survives page refreshes; auto-clears when the bid is logged

## Dynasty Value Pipeline

The value shown as the active auction target is a draft-specific dynasty value, not a raw one-year
projection value.

1. Raw `2QBAuction` values use a $200 economy. DraftOps normalizes imported values to its explicit
   $1,000 ranking-source economy, then scales them by `draft budget / source budget` before
   applying league settings. The default $1,000 path is unchanged because its draft scale is `1`.
   Tight ends receive the legacy position-level TE-premium bump while the raw values are normalized.
2. `UserRankingSet.sourceBudget` records the economy of an uploaded ranking set, and
   `Draft.playerValueSourceBudget` captures the source economy selected when the draft is created.
   The built-in and currently imported custom rankings both use the explicit $1,000 source economy.
3. `createDraft` runs `adjustPlayerValues` to apply draft-budget scaling followed by the draft's
   starting lineup, team count, and scoring settings. This produces draft-denominated fallback
   values. PICK and PKG assets receive draft-budget scaling but bypass the league-setting
   multipliers.
4. Draft creation resolves ETR players to Sleeper IDs, applies the latest stored
   `ProjectionSource` from Postgres, and writes `DraftPlayerValue` rows inside the same
   transaction. Projections shape the market value by comparing each player's draft-scored points
   against baseline scoring and normalizing that lift against positional peers.

The persisted value fields have distinct semantics:

- `Player.baseBudget`, `baseCeiling`, and `baseFloor` preserve the source-denominated ranking values.
  They are not draft-budget-scaled and are the stable input for a deterministic backfill.
- `Player.budget`, `ceiling`, and `floor` are the draft-denominated, league-adjusted fallback values.
  A player without a current projection row uses `Player.budget` as the auction target.
- `DraftPlayerValue.fallbackAuctionValue` records that fallback for the projection source, while
  `projectionAuctionValue` stores projection/VOR context rather than the surfaced target.
- `DraftPlayerValue.activeAuctionValue` is the surfaced projection-shaped market target. It remains
  anchored to `fallbackAuctionValue`; `valueSource` records whether projection shaping or the
  fallback supplied it.

Projection source data must be imported into Postgres before creating drafts. Draft creation fails
loudly if no usable projection source exists.

To import projection data before creating drafts:

```bash
pnpm tsx prisma/apply-projection-values.ts
```

To refresh/import projection data and reapply it to an existing draft:

```bash
pnpm tsx prisma/apply-projection-values.ts --draft-id <draft-id>
```

### Existing-draft budget backfill

Use the budget-value backfill after adding source-budget metadata to existing drafts. It only plans
drafts whose configured budget differs from `Draft.playerValueSourceBudget`.

```bash
# Inspect affected drafts without writing
pnpm db:backfill-budget-values

# Snapshot, update fallback values, and reapply projections
pnpm db:backfill-budget-values -- --apply
```

Dry-run mode is the default and neither writes a snapshot nor opens a transaction. Pass
`--draft-id <id>` after `--` to limit either mode to one draft. In apply mode,
`--snapshot-dir <dir>` overrides the default `valuation-backfill-snapshots/` directory, which is
gitignored. Apply mode writes one complete timestamped JSON snapshot before the first database
transaction, then updates fallback values and reapplies the latest projection source in a separate
transaction for each draft. It does not rewrite the persisted source budget or `Player.base*`
values. Retain the snapshots outside version control until the updated fallback and active totals
have been verified.

## Make Commands

```bash
make setup          # First-time setup (install + migrate + seed)
make dev            # Start dev server
make test           # Run test suite
make check          # Full quality pass (typecheck + lint + format + test)
make db-seed        # Re-seed league teams
make db-reset       # Wipe and re-seed (destructive)
make db-studio      # Open Prisma Studio (visual DB browser)
make help           # Show all commands
```

## Tech Stack

| Layer           | Choice                                                   |
| --------------- | -------------------------------------------------------- |
| Framework       | Next.js 16 (App Router)                                  |
| Language        | TypeScript 5                                             |
| Styling         | Tailwind CSS 4 + CSS custom properties                   |
| Database        | SQLite via Prisma 7                                      |
| Package manager | pnpm 11                                                  |
| Testing         | Jest + React Testing Library                             |
| Linting         | ESLint 9 + typescript-eslint + eslint-plugin-react-hooks |
| Formatting      | Prettier                                                 |
| Pre-commit      | Husky + lint-staged                                      |

## Project Structure

```
src/
├── app/                        # Next.js App Router pages and layouts
│   ├── api/                    # API routes (nomination-data, watchlist, nominated)
│   ├── budget/                 # /budget — buying power view
│   ├── nominate/               # /nominate — nomination helper
│   └── teams/                  # /teams — team roster tracker
├── components/
│   ├── AuctionSheet/           # Main player value sheet + bid logging
│   ├── BidModal/               # Log/edit/delete bid modal
│   ├── BudgetPressure/         # Budget pressure table + auto-refresh
│   ├── NominationHelper/       # Nomination scorer + watchlist + in-auction sidebar
│   └── RosterTracker/          # Expandable team roster view
├── data/players.ts             # ~270 players with scaled bid values
├── lib/
│   ├── actions.ts              # Server actions: logBid, updateBid, deleteBid
│   ├── nominationScoring.ts    # Core nomination scoring logic
│   ├── db.ts                   # Prisma client singleton
│   └── teams.ts                # League team definitions
└── types/index.ts              # Shared TypeScript types
prisma/
├── schema.prisma               # Team + AuctionResult + PlayerWatchlist + NominatedPlayer models
├── seed.ts                     # Seeds 12 league teams
└── dev.db                      # Local SQLite database (gitignored)
```

## Roadmap

DraftOps is being generalized from a single hardcoded league into a tool anyone can deploy and use for their own draft. See [`ROADMAP.md`](./ROADMAP.md) for the full plan (Postgres migration → auth → multi-draft → configurable settings → custom rankings upload).

**Future ideas (not yet scheduled):**

- **1QB / single-QB scoring support** — values currently derive from FantasyCalc's 2QB (Superflex) column, so a 1QB league would need a different source column, not just a different multiplier. Deferred until the configurable-settings work lands.

## Contributing / Feedback

This tool is shared with the **Establish The Run dynasty Discord** for feedback. If you're testing it:

- Open an issue for bugs or confusing UX
- Use Discussions for feature ideas or questions
- PRs welcome — run `make check` before opening one
